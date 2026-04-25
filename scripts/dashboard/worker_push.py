"""Push per-role HTML + user records + alert snapshot to Cloudflare Worker KV.

Uses Cloudflare REST API (v4). Requires:
  - account_id (Cloudflare account ID — find in CF dashboard URL or `wrangler whoami`)
  - namespace_id (of the DASHBOARD_KV namespace — returned from `wrangler kv:namespace create`)
  - api_token (CF dashboard -> My Profile -> API Tokens; needs "Workers KV Storage: Edit" scope)

The AES encryption key stays local — it's a wrangler secret set with
`wrangler secret put TOTP_ENCRYPTION_KEY`, not passed through here.
"""
import json
from typing import Any, Dict
import requests


CF_API = "https://api.cloudflare.com/client/v4"


def _kv_put(account_id: str, namespace_id: str, api_token: str,
            key: str, value: str) -> None:
    url = f"{CF_API}/accounts/{account_id}/storage/kv/namespaces/{namespace_id}/values/{key}"
    headers = {"Authorization": f"Bearer {api_token}"}
    # Value is raw string bytes, not JSON-wrapped at this layer.
    r = requests.put(url, headers=headers, data=value.encode("utf-8"))
    r.raise_for_status()


def push_payloads(account_id: str, namespace_id: str, api_token: str,
                  payloads: Dict[str, str]) -> None:
    """Upload HTML payloads to KV. `payloads` is {kv_key: html_content}.

    Typical keys:
      dashboard:latest:ceo
      dashboard:latest:pm
      dashboard:latest:qa
      dashboard:latest:qa_auditor
      dashboard:latest:dev:<email>
    """
    for key, value in payloads.items():
        _kv_put(account_id, namespace_id, api_token, key, value)


def push_user_records(account_id: str, namespace_id: str, api_token: str,
                      records: Dict[str, Dict[str, str]]) -> None:
    """Upload user records used for login validation by the Worker.

    `records` is {email: {role, totp_secret_encrypted}}.
    Stored in KV as JSON strings at key `user:<email>`.
    """
    for email, rec in records.items():
        _kv_put(account_id, namespace_id, api_token, f"user:{email}", json.dumps(rec))


def push_alerts(account_id: str, namespace_id: str, api_token: str,
                snapshot: Dict[str, Any]) -> None:
    """Upload the daily alert snapshot to `alerts:latest` KV key.

    Snapshot shape expected by the Worker's scheduled handler (Task 16):
      {
        "generated_at": "...",
        "stuck_prs": [...],
        "high_qa_bugs": [...],
        "disagreements": [...],
      }
    """
    _kv_put(account_id, namespace_id, api_token, "alerts:latest", json.dumps(snapshot))
