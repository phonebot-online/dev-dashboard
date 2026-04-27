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
 *
 * L16 FIX — validate expected length + attach context on decrypt failure so operator can
 * identify WHICH user's secret is corrupt (not just "Cannot decrypt credential").
 */
export async function decryptSecret(encrypted: string, keyB64: string, userEmail?: string): Promise<string> {
  // Decode key (standard base64)
  const keyBytes = Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0));
  if (keyBytes.length !== 32) {
    throw new Error(`TOTP_ENCRYPTION_KEY must decode to 32 bytes; got ${keyBytes.length}`);
  }

  // Decode encrypted payload (base64url → base64)
  const b64 = encrypted.replace(/-/g, '+').replace(/_/g, '/');
  // L16 FIX — correct padding: pad with (4 - len%4) % 4 chars. Old formula could over-pad.
  const padLen = (4 - (b64.length % 4)) % 4;
  const padded = b64 + '==='.slice(0, padLen);
  let raw: Uint8Array;
  try {
    raw = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  } catch (e) {
    const hint = userEmail ? ` (user: ${userEmail})` : '';
    throw new Error(`TOTP secret is not valid base64url${hint}: ${(e as Error).message}`);
  }

  // Minimum viable: 12-byte nonce + 16-byte GCM tag = 28 bytes
  if (raw.length < 28) {
    const hint = userEmail ? ` (user: ${userEmail})` : '';
    throw new Error(`TOTP secret truncated (need >=28 bytes, got ${raw.length})${hint} — re-provision this user's QR code.`);
  }

  const nonce = raw.slice(0, 12);
  const ct = raw.slice(12);

  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt'],
  );
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, cryptoKey, ct);
    return new TextDecoder().decode(pt);
  } catch (e) {
    const hint = userEmail ? ` (user: ${userEmail})` : '';
    throw new Error(`AES-GCM decrypt failed${hint} — KEY MISMATCH or corrupt KV entry. Rotate TOTP_ENCRYPTION_KEY or re-provision this user.`);
  }
}
