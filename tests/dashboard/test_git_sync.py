"""Tests for scripts/dashboard/git_sync.py against real local git repos."""
import json
import os
import subprocess
from datetime import datetime, timedelta
from pathlib import Path

import pytest

from scripts.dashboard import git_sync
from scripts.dashboard.git_sync import run_sync


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _git(path: Path, *args, env=None, check=True):
    """Run a git command inside `path`. Returns CompletedProcess."""
    full_env = os.environ.copy()
    if env:
        full_env.update(env)
    return subprocess.run(
        ["git", "-C", str(path), *args],
        check=check, capture_output=True, text=True, env=full_env,
    )


def make_repo(path: Path, commits):
    """Create a git repo at `path` with the given commits.

    Each item in `commits` can be either:
      - a string (commit message, default author, now)
      - a dict with keys: msg, author_name, author_email, date (ISO string)
    """
    path.mkdir(parents=True, exist_ok=True)
    # Avoid relying on the user's global init.defaultBranch.
    subprocess.run(
        ["git", "init", "-b", "main", str(path)],
        check=True, capture_output=True,
    )
    _git(path, "config", "user.email", "default@example.com")
    _git(path, "config", "user.name", "Default Author")
    _git(path, "config", "commit.gpgsign", "false")

    for i, item in enumerate(commits):
        if isinstance(item, str):
            msg = item
            author_name = "Default Author"
            author_email = "default@example.com"
            date_iso = None
        else:
            msg = item["msg"]
            author_name = item.get("author_name", "Default Author")
            author_email = item.get("author_email", "default@example.com")
            date_iso = item.get("date")

        f = path / f"file{i}.txt"
        f.write_text(f"content {i}\n")
        _git(path, "add", ".")
        env = {
            "GIT_AUTHOR_NAME": author_name,
            "GIT_AUTHOR_EMAIL": author_email,
            "GIT_COMMITTER_NAME": author_name,
            "GIT_COMMITTER_EMAIL": author_email,
        }
        if date_iso:
            env["GIT_AUTHOR_DATE"] = date_iso
            env["GIT_COMMITTER_DATE"] = date_iso
        _git(path, "commit", "-m", msg, env=env)


def write_config(config_path: Path, projects):
    """Write a minimal dashboard config yaml.

    `projects` is a list of (name, [repo_paths]) tuples.
    """
    lines = [
        "output_html_dir: ./output",
        "fahad_email: fahad@example.com",
        "domain: example.com",
        "projects:",
    ]
    for name, repos in projects:
        lines.append(f'  - name: "{name}"')
        lines.append('    deadline: "2026-12-31"')
        repo_list = ", ".join(str(r) for r in repos)
        lines.append(f"    repos: [{repo_list}]")
    config_path.write_text("\n".join(lines) + "\n")


# ---------------------------------------------------------------------------
# tests
# ---------------------------------------------------------------------------

def test_sync_single_repo_happy_path(tmp_path):
    repo = tmp_path / "repo-alpha"
    yesterday = (datetime.now() - timedelta(hours=6)).strftime("%Y-%m-%dT%H:%M:%S")
    today = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
    make_repo(repo, [
        {"msg": "first commit", "author_name": "Alice",
         "author_email": "alice@example.com", "date": yesterday},
        {"msg": "second commit", "author_name": "Bob",
         "author_email": "bob@example.com", "date": today},
    ])

    config_path = tmp_path / "cfg.yaml"
    write_config(config_path, [("Alpha Project", [repo])])

    out_dir = tmp_path / "out"
    report = run_sync(config_path, out_dir, since_days=2)

    # overall shape
    assert report["exit_code"] == 0
    assert report["total_commits"] == 2
    assert report["total_failures"] == 0
    assert len(report["projects"]) == 1
    assert report["projects"][0]["project_name"] == "Alpha Project"

    # per-project JSON
    today_str = datetime.now().strftime("%Y-%m-%d")
    project_json = out_dir / f"{today_str}-alpha-project.json"
    assert project_json.exists()
    data = json.loads(project_json.read_text())
    assert len(data["commits"]) == 2
    emails = sorted(c["author_email"] for c in data["commits"])
    assert emails == ["alice@example.com", "bob@example.com"]
    assert data["project_name"] == "Alpha Project"
    assert data["repos_synced"] == [str(repo)]
    assert data["repos_failed"] == []

    # _sync-report.json shape
    sync_report_path = out_dir / "_sync-report.json"
    assert sync_report_path.exists()
    sync_report = json.loads(sync_report_path.read_text())
    assert sync_report["total_commits"] == 2
    assert sync_report["exit_code"] == 0
    assert "run_at" in sync_report
    assert "since" in sync_report
    assert "today" in sync_report
    assert sync_report["projects"][0]["commits_found"] == 2


def test_sync_missing_repo_records_failure_but_continues(tmp_path):
    real_repo = tmp_path / "real-repo"
    make_repo(real_repo, ["a real commit"])
    missing_repo = tmp_path / "does-not-exist"

    config_path = tmp_path / "cfg.yaml"
    write_config(config_path, [
        ("Real", [real_repo]),
        ("Ghost", [missing_repo]),
    ])

    out_dir = tmp_path / "out"
    report = run_sync(config_path, out_dir, since_days=1)

    # exit code must be non-zero because one repo failed
    assert report["exit_code"] == 1
    assert report["total_failures"] == 1

    # real repo's JSON was written with its commit
    today_str = datetime.now().strftime("%Y-%m-%d")
    real_json = out_dir / f"{today_str}-real.json"
    assert real_json.exists()
    real_data = json.loads(real_json.read_text())
    assert len(real_data["commits"]) == 1
    assert real_data["repos_failed"] == []

    # ghost repo's JSON exists too (empty commits, one failure recorded)
    ghost_json = out_dir / f"{today_str}-ghost.json"
    assert ghost_json.exists()
    ghost_data = json.loads(ghost_json.read_text())
    assert ghost_data["commits"] == []
    assert len(ghost_data["repos_failed"]) == 1
    assert ghost_data["repos_failed"][0]["error_type"] == "missing_repo"

    # overall failure list includes project name
    failures = report["failures"]
    assert len(failures) == 1
    assert failures[0]["project"] == "Ghost"
    assert failures[0]["error_type"] == "missing_repo"


def test_sync_idempotent_same_commits_twice(tmp_path):
    repo = tmp_path / "repo-idem"
    make_repo(repo, ["only commit"])

    config_path = tmp_path / "cfg.yaml"
    write_config(config_path, [("Idem", [repo])])

    out_dir = tmp_path / "out"
    r1 = run_sync(config_path, out_dir, since_days=1)
    today_str = datetime.now().strftime("%Y-%m-%d")
    project_json = out_dir / f"{today_str}-idem.json"
    data1 = json.loads(project_json.read_text())
    shas1 = sorted(c["sha"] for c in data1["commits"])

    # Run again — should overwrite, same commits.
    r2 = run_sync(config_path, out_dir, since_days=1)
    data2 = json.loads(project_json.read_text())
    shas2 = sorted(c["sha"] for c in data2["commits"])

    assert shas1 == shas2
    assert r1["total_commits"] == r2["total_commits"] == 1


def test_sync_deduplicates_commits_across_repos(tmp_path):
    # Create one real repo, then clone it so the same SHAs live in two places.
    src = tmp_path / "upstream"
    make_repo(src, ["shared commit one", "shared commit two"])
    mirror = tmp_path / "mirror"
    subprocess.run(
        ["git", "clone", str(src), str(mirror)],
        check=True, capture_output=True,
    )

    config_path = tmp_path / "cfg.yaml"
    # Both paths belong to the same project so dedup happens within it.
    write_config(config_path, [("Dedup", [src, mirror])])

    out_dir = tmp_path / "out"
    report = run_sync(config_path, out_dir, since_days=1)

    today_str = datetime.now().strftime("%Y-%m-%d")
    data = json.loads((out_dir / f"{today_str}-dedup.json").read_text())
    # Despite being seen via two repos, each SHA appears once.
    shas = [c["sha"] for c in data["commits"]]
    assert len(shas) == len(set(shas)) == 2
    assert report["total_commits"] == 2
    assert len(data["repos_synced"]) == 2


def test_sync_respects_since_days(tmp_path):
    repo = tmp_path / "repo-window"
    # 3 commits across 3 days: 3 days ago, 1 day ago, now.
    d3 = (datetime.now() - timedelta(days=3)).strftime("%Y-%m-%dT12:00:00")
    d1 = (datetime.now() - timedelta(days=1, hours=2)).strftime("%Y-%m-%dT12:00:00")
    d0 = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
    make_repo(repo, [
        {"msg": "three days ago", "date": d3},
        {"msg": "yesterday", "date": d1},
        {"msg": "today", "date": d0},
    ])

    config_path = tmp_path / "cfg.yaml"
    write_config(config_path, [("Window", [repo])])
    today_str = datetime.now().strftime("%Y-%m-%d")
    project_json_name = f"{today_str}-window.json"

    # since_days=1 -> cutoff is yesterday 00:00 -> yesterday + today (2 commits).
    out_narrow = tmp_path / "out-narrow"
    run_sync(config_path, out_narrow, since_days=1)
    narrow = json.loads((out_narrow / project_json_name).read_text())
    narrow_msgs = sorted(c["message"] for c in narrow["commits"])
    assert narrow_msgs == ["today", "yesterday"]

    # since_days=7 -> all three commits.
    out_wide = tmp_path / "out-wide"
    run_sync(config_path, out_wide, since_days=7)
    wide = json.loads((out_wide / project_json_name).read_text())
    wide_msgs = sorted(c["message"] for c in wide["commits"])
    assert wide_msgs == ["three days ago", "today", "yesterday"]
