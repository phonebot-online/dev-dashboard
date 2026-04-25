import pytest
from pathlib import Path
from scripts.dashboard.config import (
    load_dashboard_config, load_users, DashboardConfig, User, ConfigError
)

FIXTURES = Path(__file__).parent / "fixtures"


def test_dashboard_config_loads():
    cfg = load_dashboard_config(FIXTURES / "valid_dashboard_config.yaml")
    assert isinstance(cfg, DashboardConfig)
    assert len(cfg.projects) == 2
    assert cfg.projects[0].name == "Phonebot 2.0"
    assert cfg.projects[0].deadline == "2026-07-30"
    assert cfg.projects[0].kickoff_date == "2026-04-01"
    assert cfg.fahad_email == "fahad@phonebot.com.au"
    assert cfg.domain == "devdash.phonebot.co.uk"


def test_users_yaml_loads():
    users = load_users(FIXTURES / "valid_users.yaml")
    assert len(users) == 8
    assert {u.role for u in users} == {"ceo", "pm", "dev", "qa_auditor", "qa"}
    assert sum(1 for u in users if u.role == "dev") == 4


def test_missing_dashboard_config_raises():
    with pytest.raises(FileNotFoundError):
        load_dashboard_config(FIXTURES / "nope.yaml")


def test_missing_users_raises():
    with pytest.raises(FileNotFoundError):
        load_users(FIXTURES / "nope.yaml")


def test_invalid_role_raises(tmp_path):
    bad = tmp_path / "bad.yaml"
    bad.write_text("users:\n  - {email: x@y.com, role: totally_invalid}\n")
    with pytest.raises(ConfigError):
        load_users(bad)


def test_dashboard_config_missing_name_raises(tmp_path):
    bad = tmp_path / "bad.yaml"
    bad.write_text("projects:\n  - {deadline: 2026-01-01}\n")
    with pytest.raises(ConfigError):
        load_dashboard_config(bad)
