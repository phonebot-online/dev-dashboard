"""Read commits from a git repo using `git log`."""
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import List


@dataclass
class Commit:
    sha: str
    author_name: str
    author_email: str
    timestamp: str
    message: str
    files_changed: List[str] = field(default_factory=list)


_FIELD = "<<<FIELD>>>"
_END = "<<<END>>>"
_RECORD = "<<<RECORD>>>"


def read_commits_since(repo_path: Path, since_iso_date: str) -> List[Commit]:
    repo_path = Path(repo_path)
    if not repo_path.exists():
        raise FileNotFoundError(f"Repo does not exist: {repo_path}")
    if not (repo_path / ".git").exists():
        raise FileNotFoundError(f"Not a git repo: {repo_path}")

    # Use a clear record separator at the start of each commit so we can split
    # safely even when messages / filenames contain newlines.
    fmt = _RECORD + _FIELD.join(["%H", "%an", "%ae", "%aI", "%B"]) + _END
    # L02 FIX — add timeout so one hung / huge / LFS-prompt repo doesn't wedge the whole sync.
    result = subprocess.run(
        ["git", "log", f"--since={since_iso_date}", f"--pretty=format:{fmt}", "--name-only"],
        cwd=repo_path, capture_output=True, text=True, check=True, timeout=60, encoding="utf-8",
    )

    commits: List[Commit] = []

    # Each record is everything between two _RECORD markers (the first chunk
    # before the first _RECORD is always empty).
    for raw in result.stdout.split(_RECORD):
        if not raw.strip() or _END not in raw:
            continue
        header_part, _, files_part = raw.partition(_END)
        parts = header_part.split(_FIELD)
        if len(parts) < 5:
            continue
        sha, author_name, author_email, timestamp, message = parts[:5]
        files = [line.strip() for line in files_part.split("\n") if line.strip()]
        commits.append(Commit(
            sha=sha,
            author_name=author_name,
            author_email=author_email,
            timestamp=timestamp,
            message=message.strip(),
            files_changed=files,
        ))

    return commits
