"""Parse daily-handoff.md into structured entries.

Expected format:
  ## YYYY-MM-DD HH:MM — Author / context
  CLOSED: a, b, c (or "none")
  IN PROGRESS: text (or "none")
  OPEN: text (or "none")
  OFF-PROJECT: text with optional "(~Nh)"
"""
import re
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import List, Optional


@dataclass
class HandoffEntry:
    date: date
    author: str
    closed: List[str] = field(default_factory=list)
    in_progress: str = ""
    open: str = ""
    off_project: str = ""
    off_project_hours: float = 0.0


_HEADER = re.compile(r"^##\s+(\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}\s+[—-]\s+([^/\n]+?)(?:\s*/.*)?$")
_HOURS = re.compile(r"~\s*([\d.]+)\s*h", re.IGNORECASE)


def parse_handoff_file(path: Path) -> List[HandoffEntry]:
    lines = Path(path).read_text(encoding="utf-8").splitlines()
    entries: List[HandoffEntry] = []
    cur: Optional[HandoffEntry] = None
    section: Optional[str] = None
    buf: List[str] = []

    def flush():
        nonlocal section, buf
        if cur is None or section is None:
            return
        content = " ".join(buf).strip()
        if content.lower() == "none":
            content = ""
        if section == "CLOSED":
            cur.closed = [x.strip() for x in content.split(",") if x.strip()] if content else []
        elif section == "IN PROGRESS":
            cur.in_progress = content
        elif section == "OPEN":
            cur.open = content
        elif section == "OFF-PROJECT":
            cur.off_project = content
            m = _HOURS.search(content)
            if m:
                cur.off_project_hours = float(m.group(1))
        buf = []
        section = None

    for line in lines:
        m = _HEADER.match(line.strip())
        if m:
            if cur is not None:
                flush()
                entries.append(cur)
            cur = HandoffEntry(date=date.fromisoformat(m.group(1)), author=m.group(2).strip())
            section = None
            continue
        if cur is None:
            continue
        stripped = line.strip()
        matched = False
        for label in ("CLOSED:", "IN PROGRESS:", "OPEN:", "OFF-PROJECT:"):
            if stripped.upper().startswith(label):
                flush()
                section = label.rstrip(":")
                buf = [stripped[len(label):].strip()]
                matched = True
                break
        if not matched and section is not None and stripped:
            buf.append(stripped)

    if cur is not None:
        flush()
        entries.append(cur)

    entries.sort(key=lambda e: e.date, reverse=True)
    return entries
