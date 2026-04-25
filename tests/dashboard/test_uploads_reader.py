from pathlib import Path
import pytest
from scripts.dashboard.uploads_reader import read_uploads, UploadsBundle


@pytest.fixture
def uploads_repo(tmp_path):
    repo = tmp_path / "dev-dashboard-inputs"
    for sub in [
        "fahad-uploads", "pm-uploads",
        "dev-uploads/Faizan", "dev-uploads/Moazzam",
        "qa-findings/Phonebot-2.0", "qa-audits/Phonebot-2.0",
        "feature-requests/Phonebot-2.0",
    ]:
        (repo / sub).mkdir(parents=True)
    (repo / "fahad-uploads/priorities.md").write_text("# Priorities\n- Ship\n")
    (repo / "pm-uploads/assessment.md").write_text("60% done\n")
    (repo / "dev-uploads/Faizan/hack.md").write_text("legacy hack 3h\n")
    (repo / "qa-findings/Phonebot-2.0/bugs.md").write_text("BUG: x. HIGH.\n")
    (repo / "qa-audits/Phonebot-2.0/parity.md").write_text("PARITY: missing guest checkout.\n")
    (repo / "feature-requests/Phonebot-2.0/notify-me.md").write_text("Add notify-me button\n")
    return repo


def test_reads_all_six_slots(uploads_repo):
    b = read_uploads(uploads_repo)
    assert "priorities.md" in b.fahad
    assert "assessment.md" in b.pm
    assert "Faizan" in b.devs
    assert "hack.md" in b.devs["Faizan"]
    assert "Phonebot-2.0" in b.qa
    assert "bugs.md" in b.qa["Phonebot-2.0"]
    assert "Phonebot-2.0" in b.qa_audits
    assert "parity.md" in b.qa_audits["Phonebot-2.0"]
    assert "Phonebot-2.0" in b.feature_requests
    assert "notify-me.md" in b.feature_requests["Phonebot-2.0"]


def test_content_preserved(uploads_repo):
    b = read_uploads(uploads_repo)
    assert "Priorities" in b.fahad["priorities.md"]
    assert "HIGH" in b.qa["Phonebot-2.0"]["bugs.md"]
    assert "PARITY" in b.qa_audits["Phonebot-2.0"]["parity.md"]
    assert "notify-me" in b.feature_requests["Phonebot-2.0"]["notify-me.md"]


def test_missing_repo_returns_empty(tmp_path):
    b = read_uploads(tmp_path / "nothere")
    assert b.fahad == {}
    assert b.devs == {}
    assert b.qa == {}
    assert b.qa_audits == {}
    assert b.feature_requests == {}


def test_ignores_binary(uploads_repo):
    (uploads_repo / "fahad-uploads/photo.jpg").write_bytes(b"binary")
    b = read_uploads(uploads_repo)
    assert "photo.jpg" not in b.fahad
