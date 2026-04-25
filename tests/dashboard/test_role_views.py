"""Tests for per-role payload assembly with visibility matrix."""
from scripts.dashboard.role_views import build_role_payloads, VISIBILITY


def _sample_snapshot():
    return {
        "generated_at": "2026-04-27",
        "week_range": "Apr 21-27",
        "projects": [
            {
                "name": "Phonebot 2.0",
                "percent_complete": 33.3,
                "devs": [
                    {"email": "faizan@phonebot.com.au", "name": "Faizan", "merit_total": 84},
                    {"email": "moazzam@phonebot.com.au", "name": "Moazzam", "merit_total": 72},
                ],
                "qa_bugs": [], "qa_audits": [], "feature_requests": [],
            }
        ],
        "top_performer": {"role_label": "Dev", "summary": "..."},
        "team_off_project_hours": 10,
        "stuck_prs": [], "disagreements": [], "imran_actions": [],
        "ceo_only_callouts": ["some secret info"],
    }


def _users():
    return {
        "dev": ["faizan@phonebot.com.au", "moazzam@phonebot.com.au"],
        "ceo": ["fahad@phonebot.com.au"],
        "pm": ["imran@phonebot.com.au"],
        "qa": ["qa@phonebot.com.au"],
        "qa_auditor": ["mustafa@phonebot.com.au"],
    }


def test_ceo_sees_all_tabs():
    payloads = build_role_payloads(_sample_snapshot(), _users())
    assert payloads["ceo"]["visible_tabs"] == ["ceo", "pm", "dev", "qa", "qa_auditor"]


def test_pm_sees_four_tabs():
    payloads = build_role_payloads(_sample_snapshot(), _users())
    assert payloads["pm"]["visible_tabs"] == ["pm", "dev", "qa", "qa_auditor"]


def test_dev_sees_three_tabs():
    payloads = build_role_payloads(_sample_snapshot(), _users())
    for dev_email in _users()["dev"]:
        assert payloads["dev"][dev_email]["visible_tabs"] == ["dev", "qa", "qa_auditor"]


def test_dev_payload_filtered_to_own_devs_only():
    payloads = build_role_payloads(_sample_snapshot(), _users())
    faizan = payloads["dev"]["faizan@phonebot.com.au"]
    assert len(faizan["projects"][0]["devs"]) == 1
    assert faizan["projects"][0]["devs"][0]["email"] == "faizan@phonebot.com.au"


def test_qa_percent_complete_nulled():
    payloads = build_role_payloads(_sample_snapshot(), _users())
    assert payloads["qa"]["projects"][0]["percent_complete"] is None
    assert payloads["qa_auditor"]["projects"][0]["percent_complete"] is None


def test_ceo_callouts_stripped_from_non_ceo():
    payloads = build_role_payloads(_sample_snapshot(), _users())
    assert "ceo_only_callouts" not in payloads["pm"]
    assert "ceo_only_callouts" not in payloads["dev"]["faizan@phonebot.com.au"]
    assert "ceo_only_callouts" not in payloads["qa"]
    assert "ceo_only_callouts" in payloads["ceo"]
