import type { KVNamespace } from '@cloudflare/workers-types';

const SESSION_TTL_SECONDS = 86400; // 24 hours

export interface SessionData {
  email: string;
  role: string;
  created_at: number;
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function createSession(kv: KVNamespace, email: string, role: string): Promise<string> {
  const token = randomToken();
  const payload: SessionData = { email, role, created_at: Date.now() };
  await kv.put(`session:${token}`, JSON.stringify(payload), {
    expirationTtl: SESSION_TTL_SECONDS,
  });
  return token;
}

export async function getSession(kv: KVNamespace, token: string): Promise<SessionData | null> {
  const raw = await kv.get(`session:${token}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
}

export async function deleteSession(kv: KVNamespace, token: string): Promise<void> {
  await kv.delete(`session:${token}`);
}

export function sessionCookieHeader(token: string): string {
  return `devdash_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearCookieHeader(): string {
  return `devdash_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

export function readSessionCookie(req: Request): string | null {
  const cookies = req.headers.get('Cookie') || '';
  const m = cookies.match(/devdash_session=([a-f0-9]+)/);
  return m ? m[1] : null;
}
