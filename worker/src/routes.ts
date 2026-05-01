import type { Env } from './index';
import { verifyTotp, decryptSecret } from './totp';
import {
  createSession, getSession, deleteSession,
  sessionCookieHeader, clearCookieHeader, readSessionCookie,
} from './session';
import { getAllState, putCollection, clearAllState, isCollection } from './state';
import { verifySignature, parsePushEvent, mergeCommits, CanonicalCommit } from './bitbucket';
// @ts-ignore — bundled as text by wrangler [[rules]] type=Text
import devdashHtml from '../../devdash.html';

interface UserRecord {
  role: string;
  totp_secret_encrypted: string;
}

function escapeForScript(s: string): string {
  return s.replace(/</g, '\\u003c').replace(/-->/g, '--\\u003e');
}

function renderSpa(email: string, role: string): string {
  const session = JSON.stringify({ email, role });
  const tag = `<script>window.__SESSION__ = ${escapeForScript(session)};</script>`;
  if (devdashHtml.includes('<!--SESSION_INJECT-->')) {
    return devdashHtml.replace('<!--SESSION_INJECT-->', tag);
  }
  // Fallback if placeholder is missing — inject just before </head>
  return devdashHtml.replace('</head>', `${tag}\n</head>`);
}

const LOGIN_FORM = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Phonebot — Dev Dashboard</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, system-ui, sans-serif; background: #0e0e12; color: #e6e6e6;
         min-height: 100vh; display: flex; align-items: center; justify-content: center; }
  .box { background: #15151c; border: 1px solid #2a2a35; border-radius: 12px;
         padding: 32px; width: 100%; max-width: 380px; }
  .brand { font-size: 11px; color: #ffaa00; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 6px; font-weight: 600; }
  h1 { font-size: 22px; color: #fff; margin-bottom: 6px; }
  p.sub { color: #888; font-size: 13px; margin-bottom: 20px; line-height: 1.5; }
  label { display: block; color: #aaa; font-size: 12px; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 1px; }
  input { width: 100%; padding: 10px 12px; background: #0e0e12; border: 1px solid #2a2a35;
          color: #fff; font-size: 14px; font-family: inherit; border-radius: 6px; margin-bottom: 14px; }
  input:focus { outline: none; border-color: #ffaa00; }
  button { width: 100%; padding: 11px; background: #ffaa00; color: #0e0e12; border: 0;
           font-size: 14px; font-weight: 600; border-radius: 6px; cursor: pointer; font-family: inherit; }
  button:hover { background: #ffbb33; }
  .err { color: #f87171; font-size: 12px; margin-bottom: 12px; }
  .footer { color: #555; font-size: 11px; margin-top: 18px; text-align: center; }
</style>
</head>
<body>
<form class="box" method="post" action="/login">
  <div class="brand">Phonebot</div>
  <h1>Dev Dashboard</h1>
  <p class="sub">Team-only. Sign in with your <strong>@phonebot.com.au</strong> email and the 6-digit code from Google Authenticator.</p>
  __ERROR__
  <label for="email">Email</label>
  <input type="email" name="email" id="email" required autocomplete="email" placeholder="you@phonebot.com.au">
  <label for="code">Authenticator code</label>
  <input type="text" name="code" id="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autocomplete="one-time-code" placeholder="123456">
  <button type="submit">Sign in</button>
  <div class="footer">Trouble signing in? Ask Fahad to re-issue your QR.</div>
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

  // Bitbucket webhook — runs BEFORE the session check (Bitbucket has no cookie).
  // Authenticated by HMAC-SHA256 signature on the request body.
  if (url.pathname === '/api/bitbucket-hook' && req.method === 'POST') {
    return handleBitbucketWebhook(req, env);
  }

  // All other routes require a valid session.
  const token = readSessionCookie(req);
  if (!token) {
    return url.pathname.startsWith('/api/')
      ? jsonError(401, 'unauthenticated')
      : loginHtml();
  }
  const session = await getSession(env.DASHBOARD_KV, token);
  if (!session) {
    return url.pathname.startsWith('/api/')
      ? jsonError(401, 'session expired')
      : loginHtml();
  }

  // Shared-state API.
  if (url.pathname === '/api/state' && req.method === 'GET') {
    const state = await getAllState(env.DASHBOARD_KV);
    return Response.json(state, { headers: { 'Cache-Control': 'no-store' } });
  }
  if (url.pathname === '/api/state/_wipe' && req.method === 'POST') {
    await clearAllState(env.DASHBOARD_KV);
    return new Response(null, { status: 204 });
  }
  if (url.pathname.startsWith('/api/state/')) {
    const key = decodeURIComponent(url.pathname.slice('/api/state/'.length));
    if (!isCollection(key)) {
      return jsonError(400, `unknown collection: ${key}`);
    }
    if (req.method === 'PUT') {
      let value: unknown;
      try { value = await req.json(); } catch { return jsonError(400, 'invalid JSON body'); }
      await putCollection(env.DASHBOARD_KV, key, value);
      return new Response(null, { status: 204 });
    }
    return jsonError(405, 'method not allowed');
  }

  // Default: serve the SPA with the authenticated session injected.
  return new Response(renderSpa(session.email, session.role), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function jsonError(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

async function handleBitbucketWebhook(req: Request, env: Env): Promise<Response> {
  const sig = req.headers.get('X-Hub-Signature') || req.headers.get('x-hub-signature') || '';
  const body = await req.text();
  if (!await verifySignature(body, sig, env.BITBUCKET_WEBHOOK_SECRET)) {
    return jsonError(401, 'invalid signature');
  }
  let payload: unknown;
  try { payload = JSON.parse(body); } catch { return jsonError(400, 'invalid JSON'); }

  // Resolve repo full_name -> project name from the live config in KV.
  const cfgRaw = await env.DASHBOARD_KV.get('state:config');
  const cfg = cfgRaw ? safeJson(cfgRaw) : {};
  const repoToProject: Record<string, string> = {};
  for (const p of (cfg as any)?.projects || []) {
    for (const r of (p?.repos || [])) {
      const slug = String(r).replace(/^\//, '').trim();
      if (slug) repoToProject[slug] = p.name;
    }
  }

  const incoming = parsePushEvent(payload, repoToProject);
  if (!incoming.length) {
    // Tag-only push, branch delete, force-push with no new commits, etc.
    return new Response(null, { status: 204 });
  }

  const existingRaw = await env.DASHBOARD_KV.get('state:commits');
  const existing = (existingRaw ? safeJson(existingRaw) : []) as CanonicalCommit[];
  const merged = mergeCommits(existing, incoming);
  await env.DASHBOARD_KV.put('state:commits', JSON.stringify(merged));

  return Response.json({ accepted: incoming.length, total: merged.length });
}

function safeJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
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
