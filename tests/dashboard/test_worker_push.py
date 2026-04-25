"""Tests for worker_push — mocks HTTP so no real Cloudflare calls happen."""
from unittest.mock import MagicMock, patch
import pytest
from scripts.dashboard.worker_push import push_payloads, push_user_records, push_alerts


@patch("scripts.dashboard.worker_push.requests.put")
def test_push_payloads_puts_each_key(mock_put):
    mock_put.return_value = MagicMock(status_code=200, ok=True)
    push_payloads(
        account_id="acc_test",
        namespace_id="ns_test",
        api_token="tok_test",
        payloads={
            "dashboard:latest:ceo": "<html>ceo</html>",
            "dashboard:latest:dev:faizan@phonebot.com.au": "<html>dev</html>",
        },
    )
    assert mock_put.call_count == 2
    first_call = mock_put.call_args_list[0]
    url = first_call[0][0]
    assert "acc_test" in url
    assert "ns_test" in url
    assert first_call[1]["headers"]["Authorization"] == "Bearer tok_test"


@patch("scripts.dashboard.worker_push.requests.put")
def test_push_payloads_raises_on_http_error(mock_put):
    resp = MagicMock(status_code=401, ok=False)
    resp.raise_for_status.side_effect = Exception("401 Unauthorized")
    mock_put.return_value = resp
    with pytest.raises(Exception):
        push_payloads(
            account_id="acc", namespace_id="ns", api_token="bad",
            payloads={"k": "v"},
        )


@patch("scripts.dashboard.worker_push.requests.put")
def test_push_user_records_json_encoded(mock_put):
    mock_put.return_value = MagicMock(status_code=200, ok=True)
    push_user_records(
        account_id="a", namespace_id="n", api_token="t",
        records={
            "fahad@phonebot.com.au": {"role": "ceo", "totp_secret_encrypted": "xyz"},
        },
    )
    assert mock_put.call_count == 1
    body = mock_put.call_args[1]["data"]
    # body should be a JSON string
    import json
    parsed = json.loads(body)
    assert parsed["role"] == "ceo"
    assert parsed["totp_secret_encrypted"] == "xyz"


@patch("scripts.dashboard.worker_push.requests.put")
def test_push_alerts_writes_single_key(mock_put):
    mock_put.return_value = MagicMock(status_code=200, ok=True)
    snapshot = {
        "generated_at": "2026-04-27T23:00:00Z",
        "stuck_prs": [],
        "high_qa_bugs": [],
        "disagreements": [],
    }
    push_alerts(account_id="a", namespace_id="n", api_token="t", snapshot=snapshot)
    assert mock_put.call_count == 1
    url = mock_put.call_args[0][0]
    assert "alerts:latest" in url or "alerts%3Alatest" in url
