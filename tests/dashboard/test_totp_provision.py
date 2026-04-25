import os
import re
from pathlib import Path
import pytest
from scripts.dashboard.totp_provision import (
    provision_user, ProvisionedUser, encrypt_secret, decrypt_secret,
)


def test_provision_returns_secret_and_qr(tmp_path):
    result = provision_user(email="fahad@phonebot.com.au", issuer="devdash", qr_dir=tmp_path)
    assert isinstance(result, ProvisionedUser)
    assert re.match(r"^[A-Z2-7]+=*$", result.secret)
    assert len(result.secret) >= 16
    assert result.qr_path.exists()
    assert result.qr_path.suffix == ".png"
    assert "devdash" in result.otpauth_url
    assert "fahad%40phonebot.com.au" in result.otpauth_url or "fahad@phonebot.com.au" in result.otpauth_url


def test_encryption_roundtrip():
    key = os.urandom(32)
    encrypted = encrypt_secret("JBSWY3DPEHPK3PXP", key)
    assert encrypted != "JBSWY3DPEHPK3PXP"
    # base64urlsafe, no padding issues
    assert re.match(r"^[A-Za-z0-9_-]+=*$", encrypted)
    assert decrypt_secret(encrypted, key) == "JBSWY3DPEHPK3PXP"


def test_encryption_wrong_key_fails():
    key1 = os.urandom(32)
    key2 = os.urandom(32)
    encrypted = encrypt_secret("TESTSECRETXYZ", key1)
    with pytest.raises(Exception):
        decrypt_secret(encrypted, key2)


def test_each_provision_gets_unique_secret(tmp_path):
    a = provision_user(email="a@x.com", issuer="devdash", qr_dir=tmp_path)
    b = provision_user(email="b@x.com", issuer="devdash", qr_dir=tmp_path)
    assert a.secret != b.secret
    assert a.qr_path != b.qr_path
