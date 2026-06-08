import type { Env } from './index';
import { verifyTotp, decryptSecret } from './totp';
import {
  createSession, getSession, deleteSession,
  sessionCookieHeader, clearCookieHeader, readSessionCookie,
} from './session';
import { getAllState, putCollection, clearAllState, isCollection } from './state';
import { verifySignature, parsePushEvent, mergeCommits, canonicaliseEmail, CanonicalCommit } from './bitbucket';
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
  // Both webhook URLs call the same unified handler.
  if ((url.pathname === '/bitbucket/webhook' || url.pathname === '/api/bitbucket-hook') && req.method === 'POST') {
    return handleBitbucketPush(req, env);
  }
  if (url.pathname === '/live' && req.method === 'GET') {
    return handleLiveFeed(req, env);
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

  if (url.pathname === '/api/pm-agent' && req.method === 'POST') {
    return handlePmAgent(req, env, session);
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

// Unified Bitbucket push handler — serves both /api/bitbucket-hook and /bitbucket/webhook.
// Accepts BITBUCKET_WEBHOOK_SECRET (primary) or WEBHOOK_SECRET (legacy alias).
// Writes to state:commits (dashboard compass/per-dev) AND events:list (/live page).
async function handleBitbucketPush(req: Request, env: Env): Promise<Response> {
  const secret = env.BITBUCKET_WEBHOOK_SECRET || env.WEBHOOK_SECRET;
  if (!secret) {
    return jsonError(503, 'webhook secret not configured — set BITBUCKET_WEBHOOK_SECRET via wrangler secret put');
  }

  const body = await req.text();
  const sig = req.headers.get('X-Hub-Signature') || req.headers.get('x-hub-signature') || '';
  if (!await verifyHmacSha256(secret, body, sig)) {
    return jsonError(401, 'invalid signature');
  }

  let payload: any;
  try { payload = JSON.parse(body); } catch { return jsonError(400, 'invalid JSON'); }

  // ── 1. Write to state:commits (feeds dashboard compass + per-dev sections) ──
  const cfgRaw = await env.DASHBOARD_KV.get('state:config');
  const cfg = cfgRaw ? safeJson(cfgRaw) : {};
  const repoToProject: Record<string, string> = {};
  for (const p of (cfg as any)?.projects || []) {
    for (const r of (p?.repos || [])) {
      const slug = String(r).replace(/^\//, '').trim();
      if (slug) repoToProject[slug] = p.name;
    }
  }
  // Email alias map — collapses multiple git identities for one person into a
  // single canonical email. Read from config.email_aliases (editable, no redeploy).
  const emailAliases = ((cfg as any)?.email_aliases || {}) as Record<string, string>;
  const incoming = parsePushEvent(payload, repoToProject, emailAliases);
  let totalCommits = 0;
  if (incoming.length > 0) {
    const existingRaw = await env.DASHBOARD_KV.get('state:commits');
    const existing = (existingRaw ? safeJson(existingRaw) : []) as CanonicalCommit[];
    const mergedCommits = mergeCommits(existing, incoming);
    await env.DASHBOARD_KV.put('state:commits', JSON.stringify(mergedCommits));
    totalCommits = mergedCommits.length;
  }

  // ── 2. Write to events:list (feeds /live activity page) ──
  const repoName: string = payload?.repository?.full_name || payload?.repository?.name || 'unknown';
  const changes: any[] = payload?.push?.changes || [];
  const receivedAt = new Date().toISOString();
  const newEvents: LiveEvent[] = [];
  for (const ch of changes) {
    const branch: string = ch?.new?.name || ch?.old?.name || 'unknown';
    for (const c of (ch?.commits || [])) {
      newEvents.push({
        sha: String(c?.hash || '').slice(0, 12),
        author_name: String(c?.author?.user?.display_name || c?.author?.raw || 'unknown'),
        author_email: canonicaliseEmail(extractEmail(String(c?.author?.raw || '')), emailAliases),
        message: String(c?.message || '').split('\n')[0].slice(0, 240),
        branch,
        repo: repoName,
        timestamp: String(c?.date || receivedAt),
        received_at: receivedAt,
      });
    }
  }
  if (newEvents.length > 0) {
    const rawEvents = await env.DASHBOARD_KV.get(EVENTS_KEY);
    let existingEvents: LiveEvent[] = [];
    if (rawEvents) { try { existingEvents = JSON.parse(rawEvents); } catch {} }
    const seen = new Set<string>();
    const mergedEvents: LiveEvent[] = [];
    for (const e of [...newEvents, ...existingEvents]) {
      if (seen.has(e.sha)) continue;
      seen.add(e.sha);
      mergedEvents.push(e);
      if (mergedEvents.length >= EVENTS_MAX) break;
    }
    await env.DASHBOARD_KV.put(EVENTS_KEY, JSON.stringify(mergedEvents));
  }

  return Response.json({ ok: true, accepted: incoming.length, events: newEvents.length, total: totalCommits });
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

// ============================================================================
// Bitbucket webhook + Live activity feed
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

function extractEmail(raw: string): string {
  const m = raw.match(/<([^>]+)>/);
  return m ? m[1].toLowerCase() : '';
}

async function handleLiveFeed(req: Request, env: Env): Promise<Response> {
  const token = readSessionCookie(req);
  if (!token) return loginHtml();
  const session = await getSession(env.DASHBOARD_KV, token);
  if (!session) return loginHtml();

  // Read from state:commits — same source as the main dashboard. This way
  // /live shows commits regardless of whether they arrived via webhook or
  // were backfilled from local clones. CanonicalCommit shape has the same
  // fields the renderer needs (sha, author_email, message, branch, repo,
  // timestamp), so cast through LiveEvent for the existing renderer.
  let events: LiveEvent[] = [];
  const raw = await env.DASHBOARD_KV.get('state:commits');
  if (raw) {
    try {
      const commits = JSON.parse(raw) as Array<{
        sha?: string; author_email?: string; author_name?: string;
        message?: string; branch?: string; repo?: string; timestamp?: string;
      }>;
      events = commits.slice(0, 100).map(c => ({
        sha: (c.sha || '').slice(0, 12),
        author_email: c.author_email || '',
        author_name: c.author_name || '',
        message: (c.message || '').split('\n')[0].slice(0, 240),
        branch: c.branch || '',
        repo: c.repo || '',
        timestamp: c.timestamp || '',
        received_at: c.timestamp || '',
      }));
    } catch { events = []; }
  }

  return new Response(renderLiveFeedHtml(events, session.email), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c] as string));
}

function renderLiveFeedHtml(events: LiveEvent[], email: string): string {
  const rows = events.length === 0
    ? `<tr><td colspan="5" class="empty">No commits yet. Push a commit or run the backfill script to populate this feed.</td></tr>`
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
    <h1>Live activity</h1>
    <div class="sub">Recent commits from all configured repos. Showing ${events.length} entries.</div>
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
<p class="meta">Events arrive via Bitbucket webhook, signed with HMAC-SHA256. The main dashboard runs independently and shows the same commits under each developer's section.</p>
</body>
</html>`;
}

// ============================================================================
// PM Agent — commit-aware Q&A for QA Auditor / PM / CEO.
//
// Provider config is read from state:config.system (same fields the SPA's
// "Generate Insights" uses): ai_provider, ai_endpoint, ai_api_key, ai_model.
// One Settings → AI panel drives both features; switching provider via the
// dashboard takes effect on the next request, no redeploy/secret rotation.
// ============================================================================

interface PmAgentRequest {
  prompt: string;
  devEmail?: string;
  project?: string;
}

async function handlePmAgent(
  req: Request,
  env: Env,
  session: { email: string; role: string },
): Promise<Response> {
  // Role gate is preserved exactly as before — devs and QA cannot ask the agent.
  if (!['pm', 'ceo', 'qa_auditor'].includes(session.role)) {
    return jsonError(403, 'insufficient role');
  }

  let body: PmAgentRequest;
  try { body = await req.json() as PmAgentRequest; } catch {
    return jsonError(400, 'invalid JSON');
  }
  const { prompt, devEmail, project } = body;
  if (!prompt?.trim()) return jsonError(400, 'prompt is required');

  const [rawCommits, rawConfig] = await Promise.all([
    env.DASHBOARD_KV.get('state:commits'),
    env.DASHBOARD_KV.get('state:config'),
  ]);

  let commits: CanonicalCommit[] = [];
  if (rawCommits) { try { commits = JSON.parse(rawCommits); } catch {} }

  let config: {
    users?: Array<{ displayName: string; email: string; role: string }>;
    projects?: Array<{ name: string; deadline?: string }>;
    system?: {
      ai_provider?: string;
      ai_endpoint?: string;
      ai_api_key?: string;
      ai_model?: string;
    };
  } = {};
  if (rawConfig) { try { config = JSON.parse(rawConfig); } catch {} }

  const sys = config.system || {};
  const provider = sys.ai_provider;
  if (!provider || provider === 'none') {
    return jsonError(503, 'AI provider not configured — pick one in Settings → AI');
  }
  if (provider !== 'anthropic' && provider !== 'openai' && provider !== 'custom') {
    return jsonError(503, `unknown AI provider: ${provider}`);
  }
  if (provider !== 'custom' && !sys.ai_api_key) {
    return jsonError(503, 'AI API key missing — add one in Settings → AI');
  }
  if (provider === 'custom' && !sys.ai_endpoint) {
    return jsonError(503, 'Custom AI endpoint missing — add one in Settings → AI');
  }

  let filtered = commits;
  if (devEmail) filtered = filtered.filter(c => c.author_email === devEmail);
  if (project) filtered = filtered.filter(c => c.project === project);

  const limited = filtered.slice(0, 300);

  const commitLines = limited.length > 0
    ? limited.map(c =>
        `[${c.timestamp.slice(0, 10)}] ${c.author_name} (${c.author_email}) · ${c.project || 'unknown'} · ${c.message}${c.audited ? ' ✓audited' : ''}`
      ).join('\n')
    : '(no commits found for this filter)';

  const userList = (config.users || [])
    .map(u => `${u.displayName} <${u.email}> — ${u.role}`)
    .join('\n');

  const projectList = (config.projects || [])
    .map(p => `${p.name}${p.deadline ? ' (deadline: ' + p.deadline + ')' : ''}`)
    .join('\n');

  const systemPrompt = `You are a Project Manager AI agent for the Phonebot software team. You analyse git commit messages to assess feature and deliverable completion.

When asked about a feature, module, or deliverable:
1. Scan the commit messages for evidence of that work being done
2. Give a clear verdict: ✅ Complete · ⚠️ Partially complete · ❌ Not started · ❓ Unclear
3. Quote the 2–4 most relevant commit messages as evidence
4. State what appears to be missing or incomplete if applicable
5. Keep the response concise — this is displayed inline in a dashboard

Team:
${userList || 'not available'}

Projects:
${projectList || 'not available'}`;

  const filterNote = [
    devEmail ? `developer: ${devEmail}` : '',
    project ? `project: ${project}` : '',
  ].filter(Boolean).join(', ');

  const userMessage = `${filterNote ? `Commits filtered to ${filterNote}.\n\n` : ''}Commit history (${limited.length} commits):\n${commitLines}\n\n---\n\nQuestion: ${prompt}`;

  // Build the upstream request. Mirrors generateAIInsights() in devdash.html:
  //   - anthropic → /v1/messages, x-api-key header, system + messages[user]
  //   - openai    → /v1/chat/completions, Bearer header, messages[system,user]
  //   - custom    → user-supplied URL (full path, e.g. .../chat/completions),
  //                 Bearer header (optional), messages[system,user]; z.ai hosts
  //                 also receive {thinking:{type:'disabled'}} so glm-4.6 routes
  //                 to message.content instead of reasoning_content.
  const aiEndpoint = provider === 'anthropic' ? 'https://api.anthropic.com/v1/messages'
    : provider === 'openai' ? 'https://api.openai.com/v1/chat/completions'
    : sys.ai_endpoint as string;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  let aiBody: string;

  if (provider === 'anthropic') {
    headers['x-api-key'] = sys.ai_api_key as string;
    headers['anthropic-version'] = '2023-06-01';
    aiBody = JSON.stringify({
      model: sys.ai_model || 'claude-sonnet-4-5',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });
  } else {
    // openai or custom (any OpenAI-compatible /chat/completions endpoint)
    if (sys.ai_api_key) headers['Authorization'] = `Bearer ${sys.ai_api_key}`;
    const reqBody: Record<string, unknown> = {
      model: sys.ai_model || (provider === 'openai' ? 'gpt-4o-mini' : 'glm-4.6'),
      max_tokens: 1024,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    };
    if (provider === 'custom' && /\.z\.ai(?:\/|$)/.test(aiEndpoint)) {
      reqBody.thinking = { type: 'disabled' };
    }
    aiBody = JSON.stringify(reqBody);
  }

  // try/catch wraps the upstream call so a network failure (DNS, TLS, timeout)
  // returns clean JSON instead of bubbling up as an uncaught exception, which
  // would surface as Cloudflare's generic 502 HTML page and break the SPA's
  // `await res.json()` with "Network error — could not reach the agent."
  let aiRes: Response;
  try {
    aiRes = await fetch(aiEndpoint, { method: 'POST', headers, body: aiBody });
  } catch (e) {
    console.error(`${provider} fetch threw:`, e instanceof Error ? e.message : String(e));
    return jsonError(502, 'AI service unreachable');
  }

  if (!aiRes.ok) {
    let errText = '';
    try { errText = await aiRes.text(); } catch {}
    console.error(`${provider} API ${aiRes.status}:`, errText.slice(0, 500));
    return jsonError(502, `AI service error (${aiRes.status})`);
  }

  let data: any;
  try { data = await aiRes.json(); } catch (e) {
    console.error(`${provider} response not JSON:`, e instanceof Error ? e.message : String(e));
    return jsonError(502, 'AI service returned invalid response');
  }

  let answer = '';
  if (provider === 'anthropic') {
    answer = data.content?.[0]?.text ?? '';
  } else {
    const msg = data.choices?.[0]?.message;
    answer = msg?.content || '';
    // z.ai glm-4.6 occasionally returns the answer in reasoning_content even
    // with thinking disabled. Surface that as a labelled degraded fallback.
    if (!answer && msg?.reasoning_content) {
      answer = `[no final answer returned; showing degraded reasoning]\n\n${msg.reasoning_content}`;
    }
  }

  return Response.json({ answer, commitCount: limited.length });
}
