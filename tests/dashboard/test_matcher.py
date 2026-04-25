from scripts.dashboard.git_reader import Commit
from scripts.dashboard.matcher import match_commit_to_items, MatchResult


def _c(msg, files=None):
    return Commit(sha="a"*40, author_name="Faizan", author_email="f@x.com",
                  timestamp="2026-04-25T10:00:00Z", message=msg,
                  files_changed=files or [])


def test_ticket_id_high_confidence():
    r = match_commit_to_items(_c("R0-07: sweep env"), ["R0-07", "P0-13"], handoff_closed=[], branch_name="")
    assert r.matched_item == "R0-07"
    assert r.confidence >= 0.9


def test_handoff_medium_high():
    r = match_commit_to_items(_c("refactor", files=["x.php"]), ["R0-07"], handoff_closed=["R0-07"], branch_name="")
    assert r.matched_item == "R0-07"
    assert r.confidence >= 0.7


def test_branch_medium():
    r = match_commit_to_items(_c("progress"), ["R0-07"], handoff_closed=[], branch_name="bugfix/R0-07-env")
    assert r.matched_item == "R0-07"
    assert 0.5 <= r.confidence < 0.9


def test_no_match():
    r = match_commit_to_items(_c("misc", files=["other.py"]), ["R0-07"], handoff_closed=[], branch_name="main")
    assert r.matched_item is None
    assert r.confidence < 0.5
