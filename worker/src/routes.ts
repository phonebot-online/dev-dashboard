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
