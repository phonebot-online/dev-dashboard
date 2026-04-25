"""Build per-role filtered data dicts from a full week snapshot.

Visibility matrix (spec section 2):
  dev        -> dev, qa, qa_auditor
  qa         -> dev, qa, qa_auditor
  qa_auditor -> dev, qa, qa_auditor
  pm         -> pm, dev, qa, qa_auditor
  ceo        -> ceo, pm, dev, qa, qa_auditor
"""
from copy import deepcopy
from typing import Any, Dict, List, Optional


VISIBILITY: Dict[str, List[str]] = {
    "dev":        ["dev", "qa", "qa_auditor"],
    "qa":         ["dev", "qa", "qa_auditor"],
    "qa_auditor": ["dev", "qa", "qa_auditor"],
    "pm":         ["pm", "dev", "qa", "qa_auditor"],
    "ceo":        ["ceo", "pm", "dev", "qa", "qa_auditor"],
}


def build_role_payloads(full_snapshot: Dict[str, Any],
                        user_emails_by_role: Dict[str, List[str]]) -> Dict[str, Any]:
    """Returns a dict keyed by role -> payload for that role.

    For the dev role, each dev gets an individual payload keyed by their email.
    """
    payloads: Dict[str, Any] = {}
    for role in ("ceo", "pm", "qa", "qa_auditor"):
        payloads[role] = _build_payload(full_snapshot, role, filter_dev_email=None)

    payloads["dev"] = {}
    for dev_email in user_emails_by_role.get("dev", []):
        payloads["dev"][dev_email] = _build_payload(full_snapshot, "dev", filter_dev_email=dev_email)

    return payloads


def _build_payload(full: Dict[str, Any], role: str,
                   filter_dev_email: Optional[str]) -> Dict[str, Any]:
    payload = deepcopy(full)
    payload["role"] = role
    payload["visible_tabs"] = VISIBILITY[role]

    if role == "dev" and filter_dev_email:
        for proj in payload.get("projects", []):
            proj["devs"] = [d for d in proj.get("devs", []) if d.get("email") == filter_dev_email]

    if role in ("qa", "qa_auditor"):
        for proj in payload.get("projects", []):
            proj["percent_complete"] = None

    if role != "ceo":
        payload.pop("ceo_only_callouts", None)

    return payload
