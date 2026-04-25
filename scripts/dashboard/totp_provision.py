"""Provision TOTP secrets + QR codes for Google Authenticator.

AES-GCM encryption is deliberate: the Cloudflare Worker (Web Crypto API)
will decrypt these secrets at login time. Both Python's cryptography lib
and JS Web Crypto implement AES-GCM compatibly. Do NOT switch to Fernet
(Python-only) or any proprietary scheme.

Wire format of encrypted secret: base64url(nonce || ciphertext_with_tag).
Nonce is 12 bytes (AES-GCM standard).
"""
import base64
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import pyotp
import qrcode
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


@dataclass
class ProvisionedUser:
    email: str
    secret: str
    qr_path: Path
    otpauth_url: str


def provision_user(email: str, issuer: str, qr_dir: Path) -> ProvisionedUser:
    secret = pyotp.random_base32()
    otpauth_url = pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name=issuer)

    qr_dir = Path(qr_dir)
    qr_dir.mkdir(parents=True, exist_ok=True)
    safe_name = email.replace("@", "_at_").replace(".", "_")
    qr_path = qr_dir / f"{safe_name}.png"
    qrcode.make(otpauth_url).save(qr_path)

    return ProvisionedUser(email=email, secret=secret, qr_path=qr_path, otpauth_url=otpauth_url)


def encrypt_secret(secret: str, key: bytes) -> str:
    """Encrypt a TOTP secret so the Worker can decrypt it via Web Crypto AES-GCM.

    `key` MUST be 32 bytes (AES-256).
    Returns base64url-encoded (nonce + ciphertext+tag).
    """
    if len(key) != 32:
        raise ValueError("key must be 32 bytes")
    nonce = os.urandom(12)
    ct = AESGCM(key).encrypt(nonce, secret.encode("utf-8"), None)
    return base64.urlsafe_b64encode(nonce + ct).decode("ascii")


def decrypt_secret(encrypted: str, key: bytes) -> str:
    if len(key) != 32:
        raise ValueError("key must be 32 bytes")
    raw = base64.urlsafe_b64decode(encrypted.encode("ascii"))
    nonce, ct = raw[:12], raw[12:]
    return AESGCM(key).decrypt(nonce, ct, None).decode("utf-8")
