"""End-to-end smoke test — synthetic snapshot through the full pipeline.

Invoke from pytest via test_smoke.py OR from CLI with:
  python3 -m scripts.dashboard.smoke_test
"""
from datetime import date
from pathlib import Path
from typing import Any, Dict

from scripts.dashboard.role_views import build_role_payloads
from scripts.dashboard.render import render_dashboard


def _synthetic_snapshot() -> Dict[str, Any]:
    return {
        "generated_at": "2026-04-27 23:00",
        "week_range": "Apr 21 - Apr 27",
        "projects": [
            {
                "name": "Phonebot 2.0",
                "traffic_light": "yellow",
                "percent_complete": 33.3,
                "days_remaining": 98,
                "total_project_duration": 120,
                "days_of_work_required": 65,
                "forecast_launch": "Aug 14, 2026",
                "devs": [
                    {
                        "email": "faizan@phonebot.com.au", "name": "Faizan",
                        "merit_total": 84.5, "traffic_light": "green",
                        "summary": "Shipped R0-09, R0-10, email redesign. Audit confirms all three.",
                        "off_project_hours": 3,
                        "off_project_entries": ["legacy hack, 3h"],
                        "commits": [
                            {"sha": "abc1234", "message": "R0-09 HMAC token", "audited": True},
                            {"sha": "def5678", "message": "R0-10 throttle", "audited": True},
                        ],
                        "signals": {"output": 75, "quality": 90, "reliability": 85,
                                    "handoff": 80, "initiative": 50, "unblock": 25},
                    },
                    {
                        "email": "moazzam@phonebot.com.au", "name": "Moazzam",
                        "merit_total": 72.0, "traffic_light": "yellow",
                        "summary": "Closed 2 items this week. Output on pace.",
                        "off_project_hours": 0,
                        "off_project_entries": [],
                        "commits": [],
                        "signals": {"output": 60, "quality": 75, "reliability": 70,
                                    "handoff": 75, "initiative": 25, "unblock": 0},
                    },
                    {
                        "email": "faisal@phonebot.com.au", "name": "Faisal",
                        "merit_total": 68.0, "traffic_light": "yellow",
                        "summary": "Worked on SEO migration prep.",
                        "off_project_hours": 2, "off_project_entries": [], "commits": [],
                        "signals": {"output": 55, "quality": 70, "reliability": 65,
                                    "handoff": 70, "initiative": 30, "unblock": 0},
                    },
                    {
                        "email": "usama@phonebot.com.au", "name": "Usama",
                        "merit_total": 62.0, "traffic_light": "red",
                        "summary": "Quiet week. Only 1 small commit.",
                        "off_project_hours": 1, "off_project_entries": [], "commits": [],
                        "signals": {"output": 40, "quality": 65, "reliability": 55,
                                    "handoff": 60, "initiative": 25, "unblock": 0},
                    },
                ],
                "qa_bugs": [
                    {"severity": "HIGH", "summary": "Double-click duplicate orders",
                     "owner": "Faizan", "status": "open", "days_since": 2},
                ],
                "qa_audits": [
                    {"title": "Checkout parity audit",
                     "summary": "2.0 missing guest-express checkout", "days_since": 4},
                ],
                "feature_requests": [
                    {"title": "Notify me button",
                     "description": "Add on sold-out pages", "urgency": "medium",
                     "target_dev": "Faizan"},
                ],
                "blockers": {
                    "fahad": [{"item": "R0-06 secret rotation", "days": 4}],
                    "faizan_team": [],
                    "external": [{"item": "Apple Sign-In key", "days": "pre-launch"}],
                },
            },
        ],
        "team_off_project_hours": 6,
        "top_performer": {"role_label": "Dev", "summary": "Closed R0-09 + R0-10 this week."},
        "stuck_prs": [
            {"repo": "pb-backend", "pr_id": 42, "days_stuck": 3, "waiting_on": "Faizan"},
        ],
        "disagreements": [],
        "imran_actions": [
            {"date": "Tue Apr 21", "description": "Chased R0-06 rotation"},
        ],
        "ceo_only_callouts": ["Consider pushing the Aug 14 forecast back"],
    }


def _sample_users() -> Dict[str, Any]:
    return {
        "dev": ["faizan@phonebot.com.au", "moazzam@phonebot.com.au",
                "faisal@phonebot.com.au", "usama@phonebot.com.au"],
        "ceo": ["fahad@phonebot.com.au"],
        "pm": ["imran@phonebot.com.au"],
        "qa": ["qa@phonebot.com.au"],
        "qa_auditor": ["mustafa@phonebot.com.au"],
    }


def run_smoke_test(output_dir: Path) -> Dict[str, Any]:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    snapshot = _synthetic_snapshot()
    users = _sample_users()
    payloads = build_role_payloads(snapshot, users)

    written: Dict[str, Any] = {}
    for role in ("ceo", "pm", "qa", "qa_auditor"):
        path = output_dir / f"weekly-dashboard-{role}.html"
        render_dashboard(payloads[role], path)
        written[role] = str(path)

    written["dev"] = {}
    for email, payload in payloads["dev"].items():
        safe = email.replace("@", "_at_").replace(".", "_")
        path = output_dir / f"weekly-dashboard-dev-{safe}.html"
        render_dashboard(payload, path)
        written["dev"][email] = str(path)

    return {"htmls": written, "snapshot": snapshot}


if __name__ == "__main__":
    out = Path("./output")
    result = run_smoke_test(out)
    print(f"Generated {4 + len(result['htmls']['dev'])} HTML files in {out.resolve()}:")
    for role, path_or_dict in result["htmls"].items():
        if isinstance(path_or_dict, dict):
            for email, p in path_or_dict.items():
                print(f"  dev ({email}): {p}")
        else:
            print(f"  {role}: {path_or_dict}")
