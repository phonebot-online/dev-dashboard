"""Read the shared uploads repo into a structured bundle.

Only reads .md and .txt files. Missing folders return empty dicts (no error).
"""
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict


_TEXT_EXTS = {".md", ".txt"}


@dataclass
class UploadsBundle:
    fahad: Dict[str, str] = field(default_factory=dict)
    pm: Dict[str, str] = field(default_factory=dict)
    devs: Dict[str, Dict[str, str]] = field(default_factory=dict)
    qa: Dict[str, Dict[str, str]] = field(default_factory=dict)
    qa_audits: Dict[str, Dict[str, str]] = field(default_factory=dict)
    feature_requests: Dict[str, Dict[str, str]] = field(default_factory=dict)


def _read_files(folder: Path) -> Dict[str, str]:
    if not folder.is_dir():
        return {}
    return {
        f.name: f.read_text(errors="replace")
        for f in folder.iterdir()
        if f.is_file() and f.suffix.lower() in _TEXT_EXTS
    }


def _read_grouped(root: Path) -> Dict[str, Dict[str, str]]:
    if not root.is_dir():
        return {}
    out: Dict[str, Dict[str, str]] = {}
    for sub in root.iterdir():
        if sub.is_dir():
            out[sub.name] = _read_files(sub)
    return out


def read_uploads(repo_path: Path) -> UploadsBundle:
    repo_path = Path(repo_path)
    if not repo_path.is_dir():
        return UploadsBundle()
    return UploadsBundle(
        fahad=_read_files(repo_path / "fahad-uploads"),
        pm=_read_files(repo_path / "pm-uploads"),
        devs=_read_grouped(repo_path / "dev-uploads"),
        qa=_read_grouped(repo_path / "qa-findings"),
        qa_audits=_read_grouped(repo_path / "qa-audits"),
        feature_requests=_read_grouped(repo_path / "feature-requests"),
    )
