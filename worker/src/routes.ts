import type { Env } from './index';
import { verifyTotp, decryptSecret } from './totp';
import {
  createSession, getSession, deleteSession,
  sessionCookieHeader, clearCookieHeader, readSessionCookie,
} from './session';

interface UserRecord {
  role: string;
  totp_secret_encrypted: string;
}

const LOGIN_FORM = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>devdash - login</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, system-ui, sans-serif; background: #0e0e12; color: #e6e6e6;
         min-height: 100vh; display: flex; align-items: center; justify-content: center; }
  .box { background: #15151c; border: 1px solid #2a2a35; border-radius: 12px;
         padding: 32px; width: 100%; max-width: 360px; }
  h1 { font-size: 20px; color: #fff; margin-bottom: 8px; }
  p.sub { color: #888; font-size: 13px; margin-bottom: 20px; }
  label { display: block; color: #aaa; font-size: 12px; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 1px; }
  input { width: 100%; padding: 10px 12px; background: #0e0e12; border: 1px solid #2a2a35;
          color: #fff; font-size: 14px; font-family: inherit; border-radius: 6px; margin-bottom: 14px; }
  input:focus { outline: none; border-color: #ffaa00; }
  button { width: 100%; padding: 11px; background: #ffaa00; color: #0e0e12; border: 0;
           font-size: 14px; font-weight: 600; border-radius: 6px; cursor: pointer; font-family: inherit; }
  button:hover { background: #ffbb33; }
  .err { color: #f87171; font-size: 12px; margin-bottom: 12px; }
</style>
</head>
<body>
<form class="box" method="post" action="/login">
  <h1>devdash</h1>
  <p class="sub">Enter your email and 6-digit code from Google Authenticator.</p>
  __ERROR__
  <label for="email">Email</label>
  <input type="email" name="email" id="email" required autocomplete="email">
  <label for="code">Authenticator code</label>
  <input type="text" name="code" id="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autocomplete="one-time-code">
  <button type="submit">Log in</button>
</form>
</body>
</html>`;

function loginHtml(error?: string): Response {
  const body = LOGIN_FORM.replace(
    '__ERROR__',
    error ? `<div class="err">${error}</div>` : '',
  );
  return new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export async function handleRequest(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);

  if (url.pathname === '/login' && req.method === 'POST') {
    return handleLogin(req, env);
  }
  if (url.pathname === '/logout') {
    return handleLogout(req, env);
  }
  if (url.pathname === '/bitbucket/webhook' && req.method === 'POST') {
    return handleBitbucketWebhook(req, env);
  }
  if (url.pathname === '/live' && req.method === 'GET') {
    return handleLiveFeed(req, env);
  }

  // Default: GET / — serve dashboard if session valid, else login form
  const token = readSessionCookie(req);
  if (!token) {
    return loginHtml();
  }
  const session = await getSession(env.DASHBOARD_KV, token);
  if (!session) {
    return loginHtml();
  }

  // Fetch the role-appropriate HTML payload from KV
  const dashKey = session.role === 'dev'
    ? `dashboard:latest:dev:${session.email}`
    : `dashboard:latest:${session.role}`;
  const html = await env.DASHBOARD_KV.get(dashKey);
  if (!html) {
    return new Response(
      `<!DOCTYPE html><html><body style="background:#0e0e12;color:#e6e6e6;font-family:system-ui;padding:40px">
<h2>Dashboard not yet generated for your role.</h2>
<p>Fahad runs the weekly audit on Sunday nights. Your first view will be available after the next run.</p>
<p><a href="/logout" style="color:#ffaa00">Log out</a></p>
</body></html>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

async function handleLogin(req: Request, env: Env): Promise<Response> {
  const form = await req.formData();
  const email = String(form.get('email') || '').toLowerCase().trim();
  const code = String(form.get('code') || '').trim();

  if (!email || !code) {
    return loginHtml('Email and code are both required.');
  }

  const userRaw = await env.DASHBOARD_KV.get(`user:${email}`);
  if (!userRaw) {
    return loginHtml('Login failed.');
  }

  let user: UserRecord;
  try {
    user = JSON.parse(userRaw) as UserRecord;
  } catch {
    return loginHtml('User record corrupted. Contact admin.');
  }

  let secret: string;
  try {
    secret = await decryptSecret(user.totp_secret_encrypted, env.TOTP_ENCRYPTION_KEY);
  } catch {
    return loginHtml('Cannot decrypt credential. Contact admin.');
  }

  if (!verifyTotp(code, secret)) {
    return loginHtml('Login failed.');
  }

  const token = await createSession(env.DASHBOARD_KV, email, user.role);
  return new Response(null, {
    status: 302,
    headers: {
      'Location': '/',
      'Set-Cookie': sessionCookieHeader(token),
    },
  });
}

async function handleLogout(req: Request, env: Env): Promise<Response> {
  const token = readSessionCookie(req);
  if (token) {
    await deleteSession(env.DASHBOARD_KV, token);
  }
  return new Response(null, {
    status: 302,
    headers: {
      'Location': '/',
      'Set-Cookie': clearCookieHeader(),
    },
  });
}

// ============================================================================
// Bitbucket webhook + Live activity feed
// Additive feature. Disabled when WEBHOOK_SECRET is unset.
// Mode (LIVE_FEED_MODE): "clone" (default, rejects webhooks), "webhook", "both".
// ============================================================================

interface LiveEvent {
  sha: string;
  author_name: string;
  author_email: string;
  message: string;
  branch: string;
  repo: string;
  timestamp: string;
  received_at: string;
}

const EVENTS_KEY = 'events:list';
const EVENTS_MAX = 100;

function liveFeedEnabled(env: Env): boolean {
  const mode = (env.LIVE_FEED_MODE || 'clone').toLowerCase();
  return mode === 'webhook' || mode === 'both';
}

async function verifyHmacSha256(secret: string, body: string, header: string): Promise<boolean> {
  // Bitbucket sends `X-Hub-Signature: sha256=<hex>`
  if (!header || !header.startsWith('sha256=')) return false;
  const expectedHex = header.slice(7);
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  const actualHex = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  if (actualHex.length !== expectedHex.length) return false;
  let diff = 0;
  for (let i = 0; i < actualHex.length; i++) {
    diff |= actualHex.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  }
  return diff === 0;
}

async function handleBitbucketWebhook(req: Request, env: Env): Promise<Response> {
  if (!liveFeedEnabled(env) || !env.WEBHOOK_SECRET) {
    return new Response('Not Found', { status: 404 });
  }

  const body = await req.text();
  const sig = req.headers.get('X-Hub-Signature') || '';
  const ok = await verifyHmacSha256(env.WEBHOOK_SECRET, body, sig);
  if (!ok) {
    return new Response('Bad signature', { status: 401 });
  }

  let payload: any;
  try { payload = JSON.parse(body); } catch { return new Response('Bad JSON', { status: 400 }); }

  // Bitbucket "repo:push" payload shape: payload.push.changes[].commits[]
  const repoName: string = payload?.repository?.full_name || payload?.repository?.name || 'unknown';
  const changes: any[] = payload?.push?.changes || [];
  const newEvents: LiveEvent[] = [];
  const receivedAt = new Date().toISOString();

  for (const ch of changes) {
    const branch: string = ch?.new?.name || ch?.old?.name || 'unknown';
    const commits: any[] = ch?.commits || [];
    for (const c of commits) {
      newEvents.push({
        sha: String(c?.hash || '').slice(0, 12),
        author_name: String(c?.author?.user?.display_name || c?.author?.raw || 'unknown'),
        author_email: extractEmail(String(c?.author?.raw || '')),
        message: String(c?.message || '').split('\n')[0].slice(0, 240),
        branch,
        repo: repoName,
        timestamp: String(c?.date || receivedAt),
        received_at: receivedAt,
      });
    }
  }

  if (newEvents.length === 0) {
    return new Response(JSON.stringify({ ok: true, stored: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Append to rolling window in KV. Read-modify-write is acceptable here:
  // webhook arrival rate is low (one push at a time), KV eventual consistency
  // is fine for an activity feed.
  let existing: LiveEvent[] = [];
  const raw = await env.DASHBOARD_KV.get(EVENTS_KEY);
  if (raw) {
    try { existing = JSON.parse(raw) as LiveEvent[]; } catch { existing = []; }
  }
  // Newest first, dedupe by sha
  const seen = new Set<string>();
  const merged: LiveEvent[] = [];
  for (const e of [...newEvents, ...existing]) {
    if (seen.has(e.sha)) continue;
    seen.add(e.sha);
    merged.push(e);
    if (merged.length >= EVENTS_MAX) break;
  }
  await env.DASHBOARD_KV.put(EVENTS_KEY, JSON.stringify(merged));

  return new Response(JSON.stringify({ ok: true, stored: newEvents.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

function extractEmail(raw: string): string {
  const m = raw.match(/<([^>]+)>/);
  return m ? m[1].toLowerCase() : '';
}

async function handleLiveFeed(req: Request, env: Env): Promise<Response> {
  if (!liveFeedEnabled(env)) {
    return new Response('Not Found', { status: 404 });
  }
  const token = readSessionCookie(req);
  if (!token) return loginHtml();
  const session = await getSession(env.DASHBOARD_KV, token);
  if (!session) return loginHtml();

  let events: LiveEvent[] = [];
  const raw = await env.DASHBOARD_KV.get(EVENTS_KEY);
  if (raw) {
    try { events = JSON.parse(raw) as LiveEvent[]; } catch { events = []; }
  }

  return new Response(renderLiveFeedHtml(events, session.email, env), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c] as string));
}

function renderLiveFeedHtml(events: LiveEvent[], email: string, env: Env): string {
  const mode = (env.LIVE_FEED_MODE || 'clone').toLowerCase();
  const rows = events.length === 0
    ? `<tr><td colspan="5" class="empty">No webhook events yet. Push a commit to a configured Bitbucket repo to populate this feed.</td></tr>`
    : events.map(e => `
      <tr>
        <td class="ts">${escapeHtml(e.timestamp.slice(0, 19).replace('T', ' '))}</td>
        <td class="repo">${escapeHtml(e.repo)}</td>
        <td class="branch">${escapeHtml(e.branch)}</td>
        <td class="author">${escapeHtml(e.author_email || e.author_name)}</td>
        <td class="msg"><code>${escapeHtml(e.sha)}</code> ${escapeHtml(e.message)}</td>
      </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>devdash · live activity</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, system-ui, sans-serif; background: #0e0e12; color: #e6e6e6;
         padding: 24px; max-width: 1200px; margin: 0 auto; line-height: 1.5; }
  header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px; }
  h1 { font-size: 20px; color: #fff; }
  .sub { color: #888; font-size: 12px; margin-top: 4px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px;
           background: #2a2a35; color: #ffaa00; margin-left: 8px; text-transform: uppercase; letter-spacing: 1px; }
  nav a { color: #ffaa00; text-decoration: none; font-size: 13px; margin-left: 16px; }
  nav a:hover { text-decoration: underline; }
  table { width: 100%; border-collapse: collapse; background: #15151c; border: 1px solid #2a2a35; border-radius: 8px; overflow: hidden; }
  th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #2a2a35; font-size: 13px; vertical-align: top; }
  th { background: #1a1a22; color: #aaa; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; }
  tr:last-child td { border-bottom: 0; }
  td.ts { color: #888; white-space: nowrap; font-variant-numeric: tabular-nums; }
  td.repo { color: #ccc; white-space: nowrap; }
  td.branch { color: #4ade80; white-space: nowrap; font-family: ui-monospace, monospace; font-size: 12px; }
  td.author { color: #aaa; white-space: nowrap; }
  td.msg { color: #e6e6e6; }
  td.msg code { background: #0e0e12; border: 1px solid #2a2a35; padding: 1px 6px; border-radius: 3px;
                font-family: ui-monospace, monospace; font-size: 11px; color: #ffaa00; margin-right: 6px; }
  td.empty { text-align: center; color: #666; padding: 32px; font-style: italic; }
  .meta { color: #666; font-size: 12px; margin-top: 14px; }
</style>
</head>
<body>
<header>
  <div>
    <h1>Live activity <span class="badge">mode: ${escapeHtml(mode)}</span></h1>
    <div class="sub">Real-time push events from Bitbucket. Last ${events.length} of ${EVENTS_MAX} max.</div>
  </div>
  <nav>
    <a href="/">Audit dashboard</a>
    <a href="/logout">Log out (${escapeHtml(email)})</a>
  </nav>
</header>
<table>
  <thead><tr><th>Time</th><th>Repo</th><th>Branch</th><th>Author</th><th>Commit</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<p class="meta">Events arrive via Bitbucket webhook, signed with HMAC-SHA256. Clone-based audit on the main dashboard runs independently — divergence between this feed and the audit is itself a forge signal.</p>
</body>
</html>`;
}
