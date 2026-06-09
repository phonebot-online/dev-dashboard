// Staging test for the Phonebot 2.0 scope loader.
// Drives the LOCAL wrangler-dev worker end-to-end: TOTP login -> apply the same
// upsert the browser loader does -> read back and assert. No Cloudflare account.
//
//   1) in worker/:  npx wrangler dev --persist-to .wrangler/state   (background)
//   2) node ../scope/phonebot-2.0/test-staging-load.mjs
import { readFileSync } from 'node:fs';
import { authenticator } from '../../worker/node_modules/otplib/index.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

authenticator.options = { step: 30, digits: 6, window: 1 };
const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE || 'http://localhost:8787';
const payload = JSON.parse(readFileSync(join(HERE, 'scope-payload.json'), 'utf-8'));
const users = JSON.parse(readFileSync(join(HERE, '../../worker/.staging-users.json'), 'utf-8'));
const me = users.find(u => u.email === 'mustafa@phonebot.com.au') || users[0];

const fail = (m) => { console.error('✗ FAIL:', m); process.exit(1); };
const ok = (m) => console.log('✓', m);

// 1. TOTP login -> session cookie
const code = authenticator.generate(me.secret);
const loginRes = await fetch(`${BASE}/login`, {
  method: 'POST', redirect: 'manual',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ email: me.email, code }),
});
const setCookie = loginRes.headers.get('set-cookie');
if (!setCookie || ![301,302,303].includes(loginRes.status)) fail(`login failed (status ${loginRes.status})`);
const cookie = setCookie.split(';')[0];
ok(`logged in as ${me.email} (${me.role})`);

const api = (path, opts={}) => fetch(`${BASE}${path}`, { ...opts, headers: { ...(opts.headers||{}), Cookie: cookie } });

// 2. GET current state, apply the SAME upsert as load-into-devdash.js
const st = await (await api('/api/state')).json();
if (!st.config || typeof st.config !== 'object') fail('no config in state');
if (!Array.isArray(st.config.projects)) st.config.projects = [];
let proj = st.config.projects.find(p => p.name === payload.project);
const created = !proj;
if (!proj) { proj = { id:'p'+Date.now(), name:payload.project, repos:[], scope_in:'', readiness:[], phases:[], links:[], risks:[] }; st.config.projects.push(proj); }
proj.scope_in = payload.scope_in;
const lc = Array.isArray(st.launchChecklist) ? st.launchChecklist : [];
const seen = new Set(lc.map(i => i.title));
const add = payload.cards.filter(c => !seen.has(c.title));
const merged = [...lc, ...add];

await api('/api/state/config', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(st.config) });
await api('/api/state/launchChecklist', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(merged) });
ok(`wrote config (${created?'created':'updated'} "${payload.project}") + launchChecklist (+${add.length} cards)`);

// 3. read back and assert it persisted in KV
const after = await (await api('/api/state')).json();
const p2 = (after.config.projects||[]).find(p => p.name === payload.project);
if (!p2) fail('project missing after write');
if (!p2.scope_in || p2.scope_in.length !== payload.scope_in.length) fail(`scope_in not persisted (got ${p2.scope_in?.length||0} chars)`);
ok(`scope_in persisted: ${p2.scope_in.length} chars`);
const lcAfter = after.launchChecklist || [];
const loaded = lcAfter.filter(i => String(i.id).startsWith('8100') || i.priority === 'P0');
if (loaded.length < payload.cards.length) fail(`expected >=${payload.cards.length} P0 cards, found ${loaded.length}`);
ok(`roadmap cards persisted: ${loaded.length} P0 items on launchChecklist`);
// idempotency: re-run the dedupe and confirm 0 new
const seen2 = new Set(lcAfter.map(i => i.title));
const dupes = payload.cards.filter(c => !seen2.has(c.title)).length;
if (dupes !== 0) fail(`idempotency broken: ${dupes} cards would be re-added`);
ok('idempotent: re-running adds 0 duplicates');

console.log('\n✅ STAGING TEST PASSED — loader writes scope_in + P0 roadmap cards to KV and they read back.');
