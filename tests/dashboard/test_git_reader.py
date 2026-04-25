import subprocess
from pathlib import Path
from datetime import datetime, timedelta
import pytest

from scripts.dashboard.git_reader import read_commits_since, Commit


@pytest.fixture
def tiny_repo(tmp_path):
    repo = tmp_path / "tinyrepo"
    repo.mkdir()
    subprocess.run(["git", "init"], cwd=repo, check=True, capture_output=True)
    subprocess.run(["git", "config", "user.email", "faizan@example.com"], cwd=repo, check=True)
    subprocess.run(["git", "config", "user.name", "Faizan"], cwd=repo, check=True)
    (repo / "file.txt").write_text("hello")
    subprocess.run(["git", "add", "."], cwd=repo, check=True)
    subprocess.run(["git", "commit", "-m", "R0-07: add file"], cwd=repo, check=True, capture_output=True)
    return repo


def test_reads_recent_commit(tiny_repo):
    since = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    commits = read_commits_since(tiny_repo, since)
    assert len(commits) == 1
    c = commits[0]
    assert c.author_email == "faizan@example.com"
    assert "R0-07" in c.message
    assert "file.txt" in c.files_changed


def test_future_window_is_empty(tiny_repo):
    future = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
    assert read_commits_since(tiny_repo, future) == []


def test_nonexistent_repo_raises(tmp_path):
    with pytest.raises(FileNotFoundError):
        read_commits_since(tmp_path / "nothere", "2025-01-01")
