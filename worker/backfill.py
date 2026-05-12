"""One-shot backfill: convert events:list -> state:commits and seed state:config.

Goal: make recent commits (last few days) show up under each developer's section
in the main dashboard. Current state:
  - events:list is populated by /bitbucket/webhook (visible on /live)
  - state:commits is empty (read by main dashboard via /api/state)
  - state:config is empty (no project / user mapping)

This script:
  1. Reads events:list from KV
  2. Reads ../users.yaml for the team roster
  3. Builds canonical commits matching worker/src/bitbucket.ts CanonicalCommit shape
  4. Builds a starter state:config with:
     - users: union of users.yaml entries + commit-author emails not yet covered
     - projects: a single "Phonebot 2.0" project listing every repo seen in events
  5. Writes state:commits and state:config to KV via wrangler

Run:  python backfill.py
"""
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import yaml


WORKER_DIR = Path(__file__).resolve().parent
USERS_YAML = WORKER_DIR.parent / "users.yaml"


def wrangler_get(key: str) -> str:
    """Read a KV key as text. Returns empty string if missing."""
    r = subprocess.run(
        ["npx", "wrangler", "kv", "key", "get", "--binding=DASHBOARD_KV", "--text", key],
        cwd=WORKER_DIR, capture_output=True, text=True, shell=True, encoding="utf-8",
        errors="replace",
    )
    if r.returncode != 0:
        return ""
    return r.stdout


def wrangler_put(key: str, value: str) -> None:
    """Write a KV key. Uses stdin via a temp file to avoid arg-length limits."""
    tmp = WORKER_DIR / f".tmp-{key.replace(':', '_').replace('/', '_')}.json"
    tmp.write_text(value, encoding="utf-8")
    try:
        r = subprocess.run(
            ["npx", "wrangler", "kv", "key", "put",
             "--binding=DASHBOARD_KV", "--path", str(tmp), key],
            cwd=WORKER_DIR, capture_output=True, text=True, shell=True,
            encoding="utf-8", errors="replace",
        )
        if r.returncode != 0:
            print(f"ERROR writing {key}:", r.stderr, file=sys.stderr)
            sys.exit(1)
        print(f"[ok] put {key} ({len(value)} bytes)")
    finally:
        if tmp.exists():
            tmp.unlink()


def display_name_for(email: str) -> str:
    """Best-effort display name from email local-part."""
    local = email.split("@", 1)[0]
    parts = local.replace(".", " ").replace("_", " ").split()
    return " ".join(p.capitalize() for p in parts)


def main():
    print("== reading events:list ==")
    events_raw = wrangler_get("events:list")
    if not events_raw.strip():
        print("events:list is empty — nothing to backfill", file=sys.stderr)
        sys.exit(1)
    events = json.loads(events_raw)
    print(f"  {len(events)} events")

    unique_repos = sorted({e["repo"] for e in events if e.get("repo")})
    unique_emails = sorted({e["author_email"] for e in events if e.get("author_email")})
    print(f"  repos: {unique_repos}")
    print(f"  commit authors: {unique_emails}")

    print("\n== reading users.yaml ==")
    users_data = yaml.safe_load(USERS_YAML.read_text(encoding="utf-8"))
    yaml_users = users_data.get("users", [])
    yaml_emails = {u["email"] for u in yaml_users}
    print(f"  {len(yaml_users)} users in yaml")

    # Build state:config.users — yaml entries + any commit author email not covered.
    config_users = []
    for u in yaml_users:
        email = u["email"]
        config_users.append({
            "email": email,
            "displayName": display_name_for(email),
            "role": u["role"],
            "hours_per_week": 40,
            "status": "active",
        })
    for email in unique_emails:
        if email in yaml_emails:
            continue
        config_users.append({
            "email": email,
            "displayName": display_name_for(email),
            "role": "dev",
            "hours_per_week": 40,
            "status": "active",
        })
    print(f"  config.users will have {len(config_users)} entries")

    # Build state:config.projects — one project covering every repo seen.
    config_projects = [{
        "id": "pb2",
        "name": "Phonebot 2.0",
        "owner_email": "imran@phonebot.com.au",
        "contributor_emails": [],
        "kickoff": "2026-04-01",
        "deadline": "2026-07-30",
        "status": "active",
        "sync_cadence": "daily",
        "repos": unique_repos,
        "traffic_light": "yellow",
        "percent_complete": 25,
        "days_remaining": 88,
        "days_of_work_required": 100,
        "forecast_launch": "2026-08-15",
        "summary": "Backend + frontend rewrite of the legacy phonebot stack.",
        "scope_in": "",
        "scope_out": "",
        "phases": [],
        "readiness": [],
        "risks": [],
        "links": [],
    }]

    state_config = {
        "users": config_users,
        "projects": config_projects,
    }

    # Repo -> project map (same logic as worker/src/routes.ts)
    repo_to_project = {}
    for p in config_projects:
        for r in p["repos"]:
            slug = r.lstrip("/")
            if slug:
                repo_to_project[slug] = p["name"]

    # Convert events to CanonicalCommit shape (matches worker/src/bitbucket.ts)
    commits = []
    seen_shas = set()
    for e in events:
        sha = e.get("sha", "").strip()
        if not sha or sha in seen_shas:
            continue
        seen_shas.add(sha)
        commits.append({
            "sha": sha,
            "message": e.get("message", "").strip(),
            "author_name": e.get("author_name", "").strip() or "",
            "author_email": (e.get("author_email") or "").lower().strip(),
            "timestamp": e.get("timestamp", ""),
            "project": repo_to_project.get(e.get("repo", ""), ""),
            "repo": e.get("repo", ""),
            "branch": e.get("branch", ""),
            "audited": False,
        })

    # Sort newest first; cap at 500 to match the worker
    commits.sort(key=lambda c: c.get("timestamp", ""), reverse=True)
    commits = commits[:500]
    print(f"\n  built {len(commits)} canonical commits")

    print("\n== writing state:config ==")
    wrangler_put("state:config", json.dumps(state_config))

    print("\n== writing state:commits ==")
    wrangler_put("state:commits", json.dumps(commits))

    print("\n== done ==")
    print(f"backfill complete at {datetime.now(timezone.utc).isoformat()}")
    print("Visit /live to see events; log in at / and check the developer sections")
    print("for the same commits.")


if __name__ == "__main__":
    main()
