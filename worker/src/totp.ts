import { authenticator } from 'otplib';

// Standard TOTP: 30-second step, 6 digits, 1-step tolerance window.
authenticator.options = { step: 30, digits: 6, window: 1 };

export function verifyTotp(code: string, secret: string): boolean {
  return authenticator.check(code, secret);
}

/**
 * Decrypt an AES-GCM secret produced by Python's totp_provision.encrypt_secret.
 *
 * `encrypted` is base64url(nonce || ciphertext_with_tag). Nonce is 12 bytes.
 * `keyB64` is standard-base64 of the 32-byte AES-256 key.
 */
export async function decryptSecret(encrypted: string, keyB64: string): Promise<string> {
  // Decode key (standard base64)
  const keyBytes = Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0));
  if (keyBytes.length !== 32) {
    throw new Error(`TOTP_ENCRYPTION_KEY must decode to 32 bytes; got ${keyBytes.length}`);
  }

  // Decode encrypted payload (base64url → base64)
  const b64 = encrypted.replace(/-/g, '+').replace(/_/g, '/');
  // Pad to multiple of 4 for atob
  const padded = b64 + '==='.slice((b64.length + 3) % 4);
  const raw = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));

  const nonce = raw.slice(0, 12);
  const ct = raw.slice(12);

  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt'],
  );
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, cryptoKey, ct);
  return new TextDecoder().decode(pt);
}
