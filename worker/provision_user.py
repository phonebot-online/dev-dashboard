"""Provision a TOTP user (or renew an existing one) for the devdash dashboard.

Generates a fresh TOTP secret, writes a QR code PNG, AES-GCM encrypts the
secret with the master key, and pushes the encrypted record to Cloudflare KV
via the wrangler CLI. The deployed worker reads this record at login time to
verify the user's 6-digit code.

Re-running this for an existing email rotates the user's secret — their old
Google Authenticator entry stops working immediately and they must scan the
new QR.

Usage:
  python provision_user.py --email new.dev@phonebot.com.au --role dev
  python provision_user.py --email muazzam@phonebot.com.au --role dev   # renew

Roles: ceo | pm | dev | qa | qa_auditor

Setup (one-time):
  - Ensure ../.master-key.txt or ../../demo-deploy/.master-key.txt exists
    (the AES-256 key matching the worker's TOTP_ENCRYPTION_KEY secret).
  - pip install -r ../requirements.txt
  - npx wrangler login  (so wrangler kv commands work)
"""
from __future__ import annotations

import argparse
import base64
import json
import subprocess
import sys
import tempfile
from pathlib import Path

# Allow `from scripts.dashboard.totp_provision import ...` to resolve.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scripts.dashboard.totp_provision import provision_user, encrypt_secret


# Worker's KV namespace id (mirrors worker/wrangler.toml). If you change the
# wrangler.toml KV id, update this too.
KV_NAMESPACE_ID = "1956e0c3186d4f7c8b264891c4ea0c82"


def _find_master_key() -> Path:
    """Search common locations for .master-key.txt. Returns the first hit."""
    here = Path(__file__).resolve().parent
    candidates = [
        here / ".master-key.txt",                       # worker/.master-key.txt
        here.parent / ".master-key.txt",                # dev-dashboard/.master-key.txt
        here.parent.parent / "demo-deploy" / ".master-key.txt",  # sibling demo-deploy
    ]
    for p in candidates:
        if p.exists():
            return p
    raise FileNotFoundError(
        "No .master-key.txt found in any expected location:\n  "
        + "\n  ".join(str(p) for p in candidates)
        + "\n\nGenerate one with: python -c \"import os,base64;print(base64.b64encode(os.urandom(32)).decode())\""
        + "\nthen save the output to one of those paths AND `wrangler secret put TOTP_ENCRYPTION_KEY`."
    )


def _wrangler_kv_put_string(key: str, value: str) -> None:
    """Push a string value to KV via wrangler (writing through a temp file
    so we don't have to escape JSON for the shell)."""
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
        f.write(value)
        tmp_path = Path(f.name)
    try:
        # shell=True so Windows can resolve wrangler.cmd; harmless on POSIX.
        # Positional KEY argument MUST come before flags or wrangler 3.114+
        # rejects with "Not enough non-option arguments". Drop --remote: it's
        # the default for put and is unrecognised in some wrangler versions.
        cmd = (
            f'npx wrangler kv key put '
            f'"{key}" --path="{tmp_path}" '
            f'--namespace-id={KV_NAMESPACE_ID}'
        )
        result = subprocess.run(
            cmd, capture_output=True, text=True, shell=True,
            encoding="utf-8", errors="replace",
            cwd=str(Path(__file__).resolve().parent),
        )
        if result.returncode != 0:
            raise SystemExit(
                f"wrangler kv key put failed for {key}:\n{result.stderr}"
            )
    finally:
        try:
            tmp_path.unlink()
        except Exception:
            pass


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Provision or renew a TOTP user for the devdash dashboard."
    )
    parser.add_argument("--email", required=True,
                        help="User's email (e.g. dev@phonebot.com.au)")
    parser.add_argument("--role", required=True,
                        choices=("ceo", "pm", "dev", "qa", "qa_auditor"),
                        help="User's role on the dashboard")
    parser.add_argument("--issuer", default="devdash-pm-demo",
                        help="Label shown in Google Authenticator (default: devdash-pm-demo)")
    parser.add_argument("--qr-dir", default="qrcodes",
                        help="Directory for generated QR PNGs (default: ./qrcodes)")
    args = parser.parse_args()

    master_key_path = _find_master_key()
    master_b64 = master_key_path.read_text().strip()
    master_key = base64.b64decode(master_b64)
    if len(master_key) != 32:
        print(f"ERROR: master key must be 32 bytes, got {len(master_key)}", file=sys.stderr)
        return 2

    here = Path(__file__).resolve().parent
    user = provision_user(args.email, args.issuer, here / args.qr_dir)
    encrypted = encrypt_secret(user.secret, master_key)
    record = {"role": args.role, "totp_secret_encrypted": encrypted}

    _wrangler_kv_put_string(f"user:{args.email}", json.dumps(record))

    print()
    print("=" * 64)
    print(f"USER PROVISIONED: {args.email} ({args.role})")
    print("=" * 64)
    print(f"  Master key      : {master_key_path}")
    print(f"  QR code (PNG)   : {user.qr_path}")
    print(f"  otpauth URL     : {user.otpauth_url}")
    print(f"  KV key written  : user:{args.email}")
    print(f"  KV namespace    : {KV_NAMESPACE_ID}")
    print()
    print("  NEXT STEPS:")
    print(f"  1. Open the PNG and have the user scan it with Google Authenticator.")
    print(f"  2. If renewing, ask them to DELETE the old 'devdash-pm-demo:{args.email}'")
    print(f"     entry from their app first.")
    print(f"  3. Their 6-digit code rotates every 30 seconds; valid for ~90s.")
    print(f"  4. Send the PNG via a secure channel (1Password / Signal), NOT")
    print(f"     plain email or Slack — the QR contains the TOTP secret in cleartext.")
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
