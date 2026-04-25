from pathlib import Path
from scripts.dashboard.render import render_dashboard


def _sample(role, visible_tabs, pct=33.3):
    return {
        "role": role,
        "visible_tabs": visible_tabs,
        "generated_at": "2026-04-27 23:00",
        "week_range": "Apr 21 - Apr 27",
        "projects": [
            {
                "name": "Phonebot 2.0",
                "traffic_light": "yellow",
                "percent_complete": pct,
                "days_remaining": 98,
                "total_project_duration": 120,
                "days_of_work_required": 65,
                "forecast_launch": "Aug 14, 2026",
                "devs": [],
                "qa_bugs": [],
                "qa_audits": [],
                "feature_requests": [],
                "blockers": {},
            }
        ],
        "team_off_project_hours": 12,
        "top_performer": {"role_label": "Dev", "summary": "Shipped 3 items"},
        "stuck_prs": [],
        "disagreements": [],
        "imran_actions": [],
    }


def test_renders_html(tmp_path):
    out = tmp_path / "out.html"
    render_dashboard(_sample("ceo", ["ceo", "pm", "dev", "qa", "qa_auditor"]), out)
    html = out.read_text()
    assert "<html" in html.lower()
    assert "Phonebot 2.0" in html
    assert "98" in html
    assert "Aug 14, 2026" in html


def test_ceo_sees_all_tabs(tmp_path):
    out = tmp_path / "out.html"
    render_dashboard(_sample("ceo", ["ceo", "pm", "dev", "qa", "qa_auditor"]), out)
    html = out.read_text()
    for tab in ["ceo", "pm", "dev", "qa", "qa_auditor"]:
        assert f'data-tab="{tab}"' in html


def test_dev_hides_ceo_and_pm_tabs(tmp_path):
    out = tmp_path / "out.html"
    render_dashboard(_sample("dev", ["dev", "qa", "qa_auditor"]), out)
    html = out.read_text()
    assert 'data-tab="dev"' in html
    assert 'data-tab="qa"' in html
    assert 'data-tab="qa_auditor"' in html
    assert 'data-tab="ceo"' not in html
    assert 'data-tab="pm"' not in html


def test_qa_does_not_show_percent_complete(tmp_path):
    out = tmp_path / "out.html"
    data = _sample("qa", ["dev", "qa", "qa_auditor"], pct=None)
    render_dashboard(data, out)
    html = out.read_text()
    # percent value should not appear visually for QA/QA Auditor
    assert "33.3" not in html
    assert "percent_complete" not in html


def test_project_subtabs_present(tmp_path):
    out = tmp_path / "out.html"
    data = _sample("ceo", ["ceo", "pm", "dev", "qa", "qa_auditor"])
    # two projects
    data["projects"].append(dict(data["projects"][0]))
    data["projects"][1]["name"] = "Phonebot HQ"
    render_dashboard(data, out)
    html = out.read_text()
    assert "All Projects" in html
    assert "Phonebot 2.0" in html
    assert "Phonebot HQ" in html
