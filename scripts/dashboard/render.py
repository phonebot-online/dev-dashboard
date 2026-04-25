"""Render a dashboard HTML file from a per-role data dict."""
from pathlib import Path
from typing import Any, Dict

from jinja2 import Environment, FileSystemLoader, select_autoescape


_TEMPLATE_DIR = Path(__file__).parent / "templates"


def render_dashboard(data: Dict[str, Any], output_path: Path) -> None:
    env = Environment(
        loader=FileSystemLoader(str(_TEMPLATE_DIR)),
        autoescape=select_autoescape(["html"]),
    )
    template = env.get_template("dashboard.html.j2")
    Path(output_path).write_text(template.render(**data), encoding="utf-8")
