"""Backfill state:commits from local git clones.

Walks each configured local clone with `git log --since=14.days.ago --all`,
converts to CanonicalCommit shape, merges with existing state:commits
(preserving anything the webhook already wrote), and updates state:config
so all repos are mapped to the project.

Run:  python backfill_clones.py
"""
import json
import re
import subprocess
import sys
from pathlib import Path
from datetime import datetime, timedelta, timezone

import yaml


WORKER_DIR = Path(__file__).resolve().parent
DEMO_DEPLOY = WORKER_DIR.parent.parent / "demo-deploy"

# Local clone path -> Bitbucket "workspace/slug" full_name. The full_name is what
# the webhook stores in CanonicalCommit.repo, so use that for project-mapping
# parity with state:config.projects[].repos.
REPOS = [
    (DEMO_DEPLOY / "phonebot-backend",  "kuztech/phonebot-backend"),
    (DEMO_DEPLOY / "phonebot-frontend", "kuztech/phonebot-frontend"),
    (DEMO_DEPLOY / "phonebot",          "kuztech/phonebot"),
    (DEMO_DEPLOY / "opsflow",           "kuztech/opsflow"),
]

DAYS_BACK = 14
SINCE = (datetime.now(timezone.utc) - timedelta(days=DAYS_BACK)).strftime("%Y-%m-%d")

# Custom git log format with literal record + field separators so multi-line
# commit messages don't break parsing.
RECORD = "<<<COMMIT>>>"
FIELD = "<<<FIELD>>>"
FMT = RECORD + FIELD.join(["%H", "%ae", "%an", "%aI", "%s"])


def wrangler_get(key: str) -> str:
    r = subprocess.run(
        ["npx", "wrangler", "kv", "key", "get", "--binding=DASHBOARD_KV", "--text", key],
        cwd=WORKER_DIR, capture_output=True, text=True, shell=True,
        encoding="utf-8", errors="replace",
    )
    return r.stdout if r.returncode == 0 else ""


def wrangler_put(key: str, value: str) -> None:
    tmp = WORKER_DIR / f".tmp-{re.sub(r'[^a-z0-9]', '_', key.lower())}.json"
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


def read_clone_commits(clone_path: Path, full_name: str) -> list[dict]:
    """Walk one local clone with git log; return list of CanonicalCommit-shaped dicts."""
    if not (clone_path / ".git").exists():
        print(f"[skip] {clone_path} — not a git repo", file=sys.stderr)
        return []

    out = subprocess.run(
        ["git", "log", "--all", f"--since={SINCE}", f"--pretty=format:{FMT}"],
        cwd=clone_path, capture_output=True, text=True,
        encoding="utf-8", errors="replace", timeout=60,
    )
    if out.returncode != 0:
        print(f"[fail] {clone_path}: git log failed", file=sys.stderr)
        return []

    commits = []
    for raw in out.stdout.split(RECORD):
        if not raw.strip():
            continue
        parts = raw.split(FIELD)
        if len(parts) < 5:
            continue
        sha, email, name, ts, subject = parts[:5]
        commits.append({
            "sha": sha.strip(),
            "message": subject.strip(),
            "author_name": name.strip(),
            "author_email": email.lower().strip(),
            "timestamp": ts.strip(),
            "project": "",  # filled in below from repo->project map
            "repo": full_name,
            "branch": "",   # git log --all flattens branches; webhook will set this for live commits
            "audited": False,
        })
    return commits


def display_name_for(email: str) -> str:
    local = email.split("@", 1)[0]
    parts = local.replace(".", " ").replace("_", " ").split()
    return " ".join(p.capitalize() for p in parts)


def main():
    # 1. Read every clone.
    all_clone_commits = []
    seen_emails = set()
    for clone_path, full_name in REPOS:
        clone_commits = read_clone_commits(clone_path, full_name)
        print(f"  {full_name}: {len(clone_commits)} commits")
        all_clone_commits.extend(clone_commits)
        for c in clone_commits:
            if c["author_email"]:
                seen_emails.add(c["author_email"])

    print(f"\ntotal from clones: {len(all_clone_commits)} commits, "
          f"{len(seen_emails)} unique authors")
    print(f"  authors: {sorted(seen_emails)}")

    # 2. Read existing state:config and update repos + users.
    cfg_raw = wrangler_get("state:config")
    cfg = json.loads(cfg_raw) if cfg_raw.strip() else {"users": [], "projects": []}

    repos_in_use = [r[1] for r in REPOS]

    # Update single existing project to include all 4 repos. If no project, create one.
    if cfg.get("projects"):
        cfg["projects"][0]["repos"] = repos_in_use
    else:
        cfg["projects"] = [{
            "id": "pb2",
            "name": "Phonebot 2.0",
            "owner_email": "imran@phonebot.com.au",
            "contributor_emails": [],
            "kickoff": "2026-04-01",
            "deadline": "2026-07-30",
            "status": "active",
            "sync_cadence": "daily",
            "repos": repos_in_use,
            "traffic_light": "yellow",
            "percent_complete": 25,
            "days_remaining": 88,
            "days_of_work_required": 100,
            "forecast_launch": "2026-08-15",
            "summary": "Backend + frontend rewrite of the legacy phonebot stack.",
            "scope_in": "", "scope_out": "",
            "phases": [], "readiness": [], "risks": [], "links": [],
        }]

    # Ensure config.users includes every commit author so dev cards show up.
    existing_emails = {u["email"] for u in cfg.get("users", [])}
    for email in seen_emails:
        if email not in existing_emails:
            cfg.setdefault("users", []).append({
                "email": email,
                "displayName": display_name_for(email),
                "role": "dev",
                "hours_per_week": 40,
                "status": "active",
            })
    print(f"\nstate:config.users now has {len(cfg['users'])} entries")

    # 3. Build repo->project mapping (matches worker logic).
    repo_to_project = {}
    for p in cfg["projects"]:
        for r in p["repos"]:
            slug = r.lstrip("/")
            if slug:
                repo_to_project[slug] = p["name"]

    # 4. Set the project name on every clone-derived commit.
    for c in all_clone_commits:
        c["project"] = repo_to_project.get(c["repo"], "")

    # 5. Read existing state:commits, merge by SHA (existing wins — those came
    #    from the webhook with branch info).
    existing_raw = wrangler_get("state:commits")
    existing = json.loads(existing_raw) if existing_raw.strip() else []
    print(f"\nexisting state:commits: {len(existing)} entries")

    by_sha = {c["sha"]: c for c in existing}
    added = 0
    for c in all_clone_commits:
        if c["sha"] in by_sha:
            continue
        by_sha[c["sha"]] = c
        added += 1

    merged = sorted(by_sha.values(), key=lambda c: c.get("timestamp", ""), reverse=True)[:500]
    print(f"  added {added} new commits from clones, total now {len(merged)} (cap 500)")

    # 6. Write back.
    print()
    wrangler_put("state:config", json.dumps(cfg))
    wrangler_put("state:commits", json.dumps(merged))

    print("\n== done ==")
    print(f"backfilled {added} historical commits across {len(REPOS)} repos")
    print("Refresh the dashboard to see them under each developer.")


if __name__ == "__main__":
    main()
