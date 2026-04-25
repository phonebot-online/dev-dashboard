"""Config loaders for the dev dashboard."""
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional
import yaml


VALID_ROLES = {"ceo", "pm", "dev", "qa", "qa_auditor"}


class ConfigError(ValueError):
    pass


@dataclass
class Project:
    name: str
    deadline: str
    kickoff_date: str = ""
    repos: List[str] = field(default_factory=list)
    scope_docs: List[str] = field(default_factory=list)
    items_source: Optional[str] = None
    devs: List[str] = field(default_factory=list)


@dataclass
class DashboardConfig:
    projects: List[Project]
    output_html_dir: str = "./output"
    uploads_repo_path: str = ""
    fahad_email: str = ""
    domain: str = ""


@dataclass
class User:
    email: str
    role: str


def load_dashboard_config(path: Path) -> DashboardConfig:
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Config not found: {path}")
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ConfigError("Config root must be a mapping")
    projects_raw = raw.get("projects", [])
    if not isinstance(projects_raw, list):
        raise ConfigError("'projects' must be a list")
    projects = []
    for i, p in enumerate(projects_raw):
        if not isinstance(p, dict):
            raise ConfigError(f"Project {i} must be a dict")
        if "name" not in p:
            raise ConfigError(f"Project {i} missing 'name'")
        if "deadline" not in p:
            raise ConfigError(f"Project {p.get('name', i)} missing 'deadline'")
        projects.append(Project(
            name=p["name"], deadline=p["deadline"],
            kickoff_date=p.get("kickoff_date", ""),
            repos=p.get("repos", []),
            scope_docs=p.get("scope_docs", []),
            items_source=p.get("items_source"),
            devs=p.get("devs", []),
        ))
    return DashboardConfig(
        projects=projects,
        output_html_dir=raw.get("output_html_dir", "./output"),
        uploads_repo_path=raw.get("uploads_repo_path", ""),
        fahad_email=raw.get("fahad_email", ""),
        domain=raw.get("domain", ""),
    )


def load_users(path: Path) -> List[User]:
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Users file not found: {path}")
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ConfigError("Users root must be a mapping")
    users_raw = raw.get("users", [])
    if not isinstance(users_raw, list):
        raise ConfigError("'users' must be a list")
    out = []
    for i, u in enumerate(users_raw):
        if not isinstance(u, dict):
            raise ConfigError(f"User {i} must be a dict")
        if "email" not in u:
            raise ConfigError(f"User {i} missing 'email'")
        if "role" not in u:
            raise ConfigError(f"User {u['email']} missing 'role'")
        if u["role"] not in VALID_ROLES:
            raise ConfigError(f"User {u['email']} has invalid role '{u['role']}'")
        out.append(User(email=u["email"], role=u["role"]))
    return out
