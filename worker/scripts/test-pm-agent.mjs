// Drives the local staging worker end-to-end: TOTP login → load SPA → PM Agent.
// Run after `npm run staging:seed` while `wrangler dev` is up on :8787.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { authenticator } from 'otplib';

authenticator.options = { step: 30, digits: 6, window: 1 };

const WORKER_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE || 'http://localhost:8787';

const users = JSON.parse(readFileSync(join(WORKER_DIR, '.staging-users.json'), 'utf-8'));
const me = users.find(u => u.email === 'mustafa@phonebot.com.au') || users[0];
const code = authenticator.generate(me.secret);

console.log(`\n1. Login as ${me.email} (${me.role}) with code ${code}`);
const login = await fetch(`${BASE}/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ email: me.email, code }).toString(),
  redirect: 'manual',
});
const setCookie = login.headers.get('set-cookie');
console.log(`   → ${login.status} ${login.headers.get('location') ? '→ ' + login.headers.get('location') : ''}  ${setCookie ? 'session cookie set ✓' : 'NO COOKIE ✗'}`);
if (!setCookie) process.exit(1);
const cookie = setCookie.split(';')[0];

console.log(`\n2. Load dashboard SPA`);
const home = await fetch(`${BASE}/`, { headers: { Cookie: cookie } });
const html = await home.text();
console.log(`   → ${home.status}  ${html.length} bytes  contains "PM AGENT": ${html.includes('PM AGENT')}`);

console.log(`\n3. Ask the PM Agent (this is the migrated Moonshot/Kimi call)`);
const pm = await fetch(`${BASE}/api/pm-agent`, {
  method: 'POST',
  headers: { Cookie: cookie, 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt: 'Did Faisal finish the HMAC webhook token work? Answer in one line.' }),
});
const body = await pm.text();
console.log(`   → HTTP ${pm.status}`);
console.log(`   body: ${body.slice(0, 800)}`);

if (pm.status === 200) {
  console.log('\n✅ Kimi answered through the migrated worker — migration + key verified.');
} else if (body.includes('KIMI_API_KEY')) {
  console.log('\nℹ️  Auth + migrated endpoint wired correctly. Last step needs a real KIMI_API_KEY in worker/.dev.vars.');
} else if (pm.status === 502) {
  console.log('\n⚠️  Reached Moonshot but the call failed — likely bad key, wrong portal (.ai vs .cn), or model name.');
}
