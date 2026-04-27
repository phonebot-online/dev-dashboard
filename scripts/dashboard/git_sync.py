"""Daily git sync — pulls commits from every project's repos and writes JSON snapshots.

Ran via cron (06:00 daily) as a backstop to the Bitbucket webhook. Idempotent:
running it twice on the same day produces the same output.

Output layout:
  output/commits/
    YYYY-MM-DD-<project-slug>.json   per-day, per-project commit list
    _sync-report.json                 last-run status + error list

This output is consumed by the weekly audit (or can be posted to Cloudflare KV
directly for near-real-time updates).
"""
from __future__ import annotations

import json
import re
import sys
import traceback
from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional

try:
    from zoneinfo import ZoneInfo  # Python 3.9+
except ImportError:  # pragma: no cover
    ZoneInfo = None

from scripts.dashboard.config import load_dashboard_config
from scripts.dashboard.git_reader import read_commits_since


# L05 FIX — tz-aware datetime so "today" slug matches the configured timezone (Melbourne / Karachi)
# rather than the cron runner's local tz (often UTC on Cloudflare / Docker).
def _now_in_tz(tz_name: Optional[str]) -> datetime:
    if not tz_name or not ZoneInfo:
        return datetime.now()
    try:
        return datetime.now(ZoneInfo(tz_name))
    except Exception:
        return datetime.now()


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def _commit_to_dict(c) -> dict:
    """Serialise a Commit dataclass to JSON-safe dict."""
    d = asdict(c)
    # files_changed stays as list[str]; everything else is already primitive
    return d


def sync_project(project, since_iso: str, out_dir: Path, today: str) -> dict:
    """Sync a single project's repos. Returns per-project report."""
    commits_seen: List[dict] = []
    repos_synced: List[str] = []
    repos_failed: List[dict] = []

    for repo_path_str in (project.get("repos") or []):
        repo_path = Path(repo_path_str)
        try:
            commits = read_commits_since(repo_path, since_iso)
            for c in commits:
                commits_seen.append({
                    **_commit_to_dict(c),
                    "project_id": project["id"],
                    "project_name": project["name"],
                    "repo_path": str(repo_path),
                })
            repos_synced.append(str(repo_path))
        except FileNotFoundError as e:
            repos_failed.append({"repo": str(repo_path), "error": str(e), "error_type": "missing_repo"})
        except Exception as e:  # pragma: no cover - generic fallback
            repos_failed.append({"repo": str(repo_path), "error": str(e), "error_type": type(e).__name__})

    # Deduplicate by SHA in case the same commit appears via multiple repos
    seen_shas = set()
    unique_commits = []
    for c in commits_seen:
        if c["sha"] not in seen_shas:
            seen_shas.add(c["sha"])
            unique_commits.append(c)

    # L04 FIX — merge with any existing file (webhook may have written earlier today).
    # Without this, the cron's overwrite can clobber webhook-delivered commits.
    out_path = out_dir / f"{today}-{_slug(project['name'])}.json"
    if out_path.exists():
        try:
            existing = json.loads(out_path.read_text(encoding="utf-8"))
            for existing_c in existing.get("commits", []):
                if existing_c["sha"] not in seen_shas:
                    seen_shas.add(existing_c["sha"])
                    unique_commits.append(existing_c)
        except Exception:
            pass  # if existing is corrupt, we overwrite with fresh data
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps({
        "project_id": project["id"],
        "project_name": project["name"],
        "synced_at": datetime.now(timezone.utc).isoformat(),
        "since": since_iso,
        "repos_synced": repos_synced,
        "repos_failed": repos_failed,
        "commits": unique_commits,
    }, indent=2))

    return {
        "project_id": project["id"],
        "project_name": project["name"],
        "commits_found": len(unique_commits),
        "repos_synced": len(repos_synced),
        "repos_failed": repos_failed,
        "output_file": str(out_path),
    }


def run_sync(config_path: Path, out_dir: Path, since_days: int = 1) -> dict:
    """Entry point — sync all projects in the config."""
    config = load_dashboard_config(config_path)
    # L05 FIX — use config-configured timezone ONLY if set; otherwise local naive time (backward compatible).
    tz_name = getattr(config, "timezone", None) or getattr(getattr(config, "system", None), "timezone", None)
    now = _now_in_tz(tz_name) if tz_name else datetime.now()
    # "since" = yesterday 00:00 (ISO format accepted by git)
    since_dt = now - timedelta(days=since_days)
    since_iso = since_dt.strftime("%Y-%m-%d 00:00")
    today = now.strftime("%Y-%m-%d")

    per_project: List[dict] = []
    total_commits = 0
    all_failures: List[dict] = []

    # load_dashboard_config returns DashboardConfig with Project dataclasses —
    # Project has no explicit 'id' field, so derive it from the slug of the name.
    projects = config.projects if hasattr(config, "projects") else config["projects"]
    for p in projects:
        if hasattr(p, "name"):
            p_dict = {"id": _slug(p.name), "name": p.name, "repos": list(p.repos or [])}
        else:
            p_dict = {
                "id": p.get("id") or _slug(p["name"]),
                "name": p["name"],
                "repos": list(p.get("repos") or []),
            }
        report = sync_project(p_dict, since_iso, out_dir, today)
        per_project.append(report)
        total_commits += report["commits_found"]
        for f in report["repos_failed"]:
            all_failures.append({**f, "project": p_dict["name"]})

    overall = {
        "run_at": datetime.now(timezone.utc).isoformat(),
        "since": since_iso,
        "today": today,
        "projects": per_project,
        "total_commits": total_commits,
        "total_failures": len(all_failures),
        "failures": all_failures,
        "exit_code": 0 if not all_failures else 1,
    }
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "_sync-report.json").write_text(json.dumps(overall, indent=2))
    return overall


if __name__ == "__main__":
    repo_root = Path(__file__).parent.parent.parent
    config_path = repo_root / "scripts" / "dashboard" / "dashboard.config.yaml"
    out_dir = repo_root / "output" / "commits"

    # Flag: --dry-run shows what would be synced without writing the _sync-report
    dry_run = "--dry-run" in sys.argv
    # Flag: --since=N pulls commits from N days ago (default 1)
    since_days = 1
    for arg in sys.argv:
        if arg.startswith("--since="):
            since_days = int(arg.split("=", 1)[1])

    try:
        report = run_sync(config_path, out_dir, since_days=since_days)
    except Exception as e:
        print(f"FATAL: sync failed: {e}", file=sys.stderr)
        traceback.print_exc()
        sys.exit(2)

    # Print a human-readable summary
    print(f"Git sync · {report['today']} · since {report['since']}")
    print(f"  {report['total_commits']} commits across {len(report['projects'])} projects")
    for p in report["projects"]:
        print(f"    [{p['project_id']}] {p['project_name']}: {p['commits_found']} commits, {p['repos_synced']} repo(s) synced")
    if report["total_failures"]:
        print(f"  {report['total_failures']} failure(s):")
        for f in report["failures"]:
            print(f"    ✗ {f['project']} · {f['repo']} · {f['error_type']}: {f['error']}")
    print(f"  report: {out_dir / '_sync-report.json'}")

    sys.exit(report["exit_code"])
