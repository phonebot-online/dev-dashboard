"""Match a git commit to an open item via weighted signals.

Signals, priority order:
  1. Ticket ID in commit message (0.95 confidence if match).
  2. Daily handoff CLOSED line (0.80).
  3. Branch name (0.60).

Combined confidence >= 0.8: auto-match.
0.5 <= Combined < 0.8: auto-match, flag for PM review.
< 0.5: "unmatched work", surface in review queue.
"""
import re
from dataclasses import dataclass
from typing import List, Optional
from scripts.dashboard.git_reader import Commit


@dataclass
class MatchResult:
    matched_item: Optional[str]
    confidence: float
    signals: List[str]


def _find_id(text: str, items: List[str]) -> Optional[str]:
    for it in items:
        if re.search(rf"\b{re.escape(it)}\b", text):
            return it
    return None


def match_commit_to_items(commit: Commit, open_items: List[str],
                          handoff_closed: List[str], branch_name: str = "") -> MatchResult:
    signals: List[str] = []
    conf = 0.0
    matched: Optional[str] = None

    # Signal 1: ticket ID in commit message
    t = _find_id(commit.message, open_items)
    if t:
        matched = t
        conf = max(conf, 0.95)
        signals.append(f"message:{t}")

    # Signal 2: daily handoff CLOSED entries
    if matched is None:
        for line in handoff_closed:
            t2 = _find_id(line, open_items)
            if t2:
                matched = t2
                conf = max(conf, 0.80)
                signals.append(f"handoff:{t2}")
                break
    else:
        for line in handoff_closed:
            if re.search(rf"\b{re.escape(matched)}\b", line):
                conf = min(1.0, conf + 0.05)
                signals.append(f"handoff-corroborates:{matched}")
                break

    # Signal 3: branch name
    if branch_name:
        b = _find_id(branch_name, open_items)
        if b:
            if matched is None:
                matched = b
                conf = max(conf, 0.60)
            elif matched == b:
                conf = min(1.0, conf + 0.05)
            signals.append(f"branch:{b}")

    return MatchResult(matched_item=matched, confidence=conf, signals=signals)
