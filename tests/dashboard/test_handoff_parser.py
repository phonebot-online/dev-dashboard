from pathlib import Path
from datetime import date
from scripts.dashboard.handoff_parser import parse_handoff_file, HandoffEntry

FIXTURES = Path(__file__).parent / "fixtures"


def test_parses_two_entries():
    entries = parse_handoff_file(FIXTURES / "sample_handoff.md")
    assert len(entries) == 2


def test_latest_entry_fields():
    entries = parse_handoff_file(FIXTURES / "sample_handoff.md")
    latest = entries[0]
    assert latest.date == date(2026, 4, 25)
    assert latest.author == "Faizan"
    assert "R0-07 env sweep" in latest.closed
    assert "P0-13 payment validation" in latest.closed
    assert "P0-15 Zip webhook handler" in latest.in_progress
    assert "waiting on Fahad" in latest.open
    assert "legacy phonebot.com.au hack" in latest.off_project
    assert latest.off_project_hours == 3.0


def test_older_entry_no_off_project():
    entries = parse_handoff_file(FIXTURES / "sample_handoff.md")
    older = entries[1]
    assert older.off_project == ""
    assert older.off_project_hours == 0.0
    assert older.closed == []
