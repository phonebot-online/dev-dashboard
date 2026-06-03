// Local staging seed for the devdash Worker.
//
// Runs entirely against wrangler's LOCAL (Miniflare) KV — no Cloudflare
// account, login, or API token required. It:
//   1. Ensures worker/.dev.vars exists with a local TOTP_ENCRYPTION_KEY.
//   2. Plants test `user:<email>` records with real AES-GCM-encrypted TOTP
//      secrets (same wire format the Worker decrypts at login).
//   3. Seeds synthetic state:* collections + alerts:latest so the dashboard
//      renders with data.
//   4. Prints a working 6-digit login code for each test user.
//
// Usage:
//   node scripts/seed-local.mjs            # seed KV + print codes
//   node scripts/seed-local.mjs --code-only # just reprint fresh codes
//
// The encryption mirrors scripts/dashboard/totp_provision.py:encrypt_secret
// and worker/src/totp.ts:decryptSecret — base64url(nonce[12] || ct+tag),
// AES-256-GCM. Keep them in sync if either changes.

import { webcrypto as crypto } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { authenticator } from 'otplib';

authenticator.options = { step: 30, digits: 6, window: 1 };

const WORKER_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEV_VARS = join(WORKER_DIR, '.dev.vars');
const USERS_FILE = join(WORKER_DIR, '.staging-users.json'); // gitignored — plaintext local TOTP secrets
const PERSIST = '.wrangler/state';

const CODE_ONLY = process.argv.includes('--code-only');

// ── Test users (email → role). Covers every role view. ───────────────────────
const USERS = [
  { email: 'mustafa@phonebot.com.au', role: 'qa_auditor', displayName: 'Mustafa Khan' },
  { email: 'fahad@phonebot.com.au',   role: 'ceo',        displayName: 'Fahad' },
  { email: 'pm@phonebot.com.au',      role: 'pm',         displayName: 'PM' },
  { email: 'faisal@phonebot.com.au',  role: 'dev',        displayName: 'Faisal' },
];

// ── .dev.vars helpers ─────────────────────────────────────────────────────────
function parseDevVars(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const m = line.replace(/^export\s+/, '').match(/^([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function ensureDevVars() {
  let vars = existsSync(DEV_VARS) ? parseDevVars(readFileSync(DEV_VARS, 'utf-8')) : {};
  let changed = false;
  if (!vars.TOTP_ENCRYPTION_KEY) {
    vars.TOTP_ENCRYPTION_KEY = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
    changed = true;
  }
  if (!vars.BITBUCKET_WEBHOOK_SECRET) {
    vars.BITBUCKET_WEBHOOK_SECRET = 'local-staging-webhook-secret';
    changed = true;
  }
  if (vars.KIMI_API_KEY === undefined) {
    // Empty by default → PM Agent returns a clear 503 until you paste a key.
    vars.KIMI_API_KEY = '';
    changed = true;
  }
  if (changed || !existsSync(DEV_VARS)) {
    const body =
      `# Local-only secrets for \`wrangler dev\`. Gitignored — never commit.\n` +
      `# Regenerated/extended by scripts/seed-local.mjs.\n` +
      `TOTP_ENCRYPTION_KEY="${vars.TOTP_ENCRYPTION_KEY}"\n` +
      `BITBUCKET_WEBHOOK_SECRET="${vars.BITBUCKET_WEBHOOK_SECRET}"\n` +
      `# Paste the Moonshot (Kimi) key here to exercise the PM Agent locally:\n` +
      `KIMI_API_KEY="${vars.KIMI_API_KEY}"\n` +
      `# Optional overrides (defaults: https://api.moonshot.ai/v1 , moonshot-v1-32k):\n` +
      `# KIMI_BASE_URL="https://api.moonshot.cn/v1"\n` +
      `# KIMI_MODEL="moonshot-v1-32k"\n`;
    writeFileSync(DEV_VARS, body);
    if (!CODE_ONLY) console.log(`• wrote ${DEV_VARS.replace(WORKER_DIR + '/', '')}`);
  }
  return vars;
}

// ── AES-256-GCM encrypt → base64url(nonce || ct+tag) ──────────────────────────
async function encryptSecret(secret, keyB64) {
  const keyBytes = Buffer.from(keyB64, 'base64');
  if (keyBytes.length !== 32) throw new Error(`TOTP_ENCRYPTION_KEY must be 32 bytes; got ${keyBytes.length}`);
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt']);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, new TextEncoder().encode(secret));
  return Buffer.concat([Buffer.from(nonce), Buffer.from(ct)]).toString('base64url');
}

// ── Local KV write via wrangler (no network/auth in --local mode) ─────────────
function kvPut(key, value) {
  const dir = mkdtempSync(join(tmpdir(), 'devdash-seed-'));
  const tmp = join(dir, 'v.json');
  writeFileSync(tmp, value);
  execFileSync(
    'npx',
    ['--no-install', 'wrangler', 'kv', 'key', 'put', key, '--path', tmp,
     '--binding', 'DASHBOARD_KV', '--local', '--persist-to', PERSIST],
    { cwd: WORKER_DIR, stdio: ['ignore', 'ignore', 'inherit'] },
  );
  unlinkSync(tmp);
}

// ── Synthetic dashboard data ──────────────────────────────────────────────────
function daysAgo(n) {
  const d = new Date('2026-05-30T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString();
}

function buildState() {
  const config = {
    users: USERS.map(u => ({ displayName: u.displayName, email: u.email, role: u.role })),
    projects: [
      { name: 'Checkout Revamp', deadline: '2026-06-15', repos: ['phonebot-online/checkout'] },
      { name: 'Dev Dashboard',   deadline: '2026-06-30', repos: ['phonebot-online/dev-dashboard'] },
    ],
  };

  const commit = (over) => ({
    sha: Math.random().toString(16).slice(2, 9),
    branch: 'main', audited: false, ...over,
  });

  const commits = [
    commit({ message: 'R0-09 HMAC webhook token validation', author_name: 'Faisal', author_email: 'faisal@phonebot.com.au', project: 'Dev Dashboard', repo: 'phonebot-online/dev-dashboard', timestamp: daysAgo(1), audited: true }),
    commit({ message: 'R0-10 rate-limit on /login', author_name: 'Faisal', author_email: 'faisal@phonebot.com.au', project: 'Dev Dashboard', repo: 'phonebot-online/dev-dashboard', timestamp: daysAgo(2), audited: true }),
    commit({ message: 'checkout: fix tax rounding on AED orders', author_name: 'Faisal', author_email: 'faisal@phonebot.com.au', project: 'Checkout Revamp', repo: 'phonebot-online/checkout', timestamp: daysAgo(3) }),
    commit({ message: 'checkout: add Apple Pay sheet', author_name: 'Faisal', author_email: 'faisal@phonebot.com.au', project: 'Checkout Revamp', repo: 'phonebot-online/checkout', timestamp: daysAgo(5) }),
  ];

  const bugs = [
    { title: 'Apple Pay sheet dismisses on rotation', severity: 'high', status: 'open', project: 'Checkout Revamp', reporter: 'mustafa@phonebot.com.au' },
    { title: 'Login throttle counts failed + success', severity: 'medium', status: 'open', project: 'Dev Dashboard', reporter: 'mustafa@phonebot.com.au' },
  ];
  const auditFindings = [
    { title: 'R0-09 HMAC: constant-time compare confirmed', severity: 'info', status: 'resolved', project: 'Dev Dashboard', commit: commits[0].sha },
  ];
  const featureRequests = [
    { title: 'CSV export of weekly merit', status: 'requested', project: 'Dev Dashboard', requester: 'fahad@phonebot.com.au' },
  ];

  return { config, commits, bugs, auditFindings, featureRequests };
}

function buildAlerts(state) {
  return {
    generated_at: new Date().toISOString(),
    stuck_prs: [{ repo: 'phonebot-online/checkout', branch: 'apple-pay', age_days: 4 }],
    high_qa_bugs: state.bugs.filter(b => b.severity === 'high'),
    disagreements: [],
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
const vars = ensureDevVars();

if (CODE_ONLY) {
  if (!existsSync(USERS_FILE)) {
    console.error('No .staging-users.json yet — run `npm run staging:seed` first.');
    process.exit(1);
  }
  const seeded = JSON.parse(readFileSync(USERS_FILE, 'utf-8'));
  printCodes(seeded);
  process.exit(0);
}

const state = buildState();
const seededUsers = [];

console.log('Seeding local KV (wrangler --local) …');

// user:<email> records
for (const u of USERS) {
  const secret = authenticator.generateSecret();
  const enc = await encryptSecret(secret, vars.TOTP_ENCRYPTION_KEY);
  kvPut(`user:${u.email}`, JSON.stringify({ role: u.role, totp_secret_encrypted: enc }));
  seededUsers.push({ email: u.email, role: u.role, secret });
}

// state:* collections + alerts
for (const [coll, value] of Object.entries(state)) {
  kvPut(`state:${coll}`, JSON.stringify(value));
}
kvPut('alerts:latest', JSON.stringify(buildAlerts(state)));

writeFileSync(USERS_FILE, JSON.stringify(seededUsers, null, 2));

console.log(`\n✓ Seeded ${USERS.length} users + ${Object.keys(state).length} state collections + alerts:latest`);
printCodes(seededUsers);

function printCodes(users) {
  console.log('\n  Log in at http://localhost:8787 with:');
  for (const u of users) {
    console.log(`    ${u.email.padEnd(28)} (${u.role.padEnd(10)}) code: ${authenticator.generate(u.secret)}`);
  }
  console.log('\n  Codes rotate every 30s — reprint fresh ones with: npm run staging:code\n');
}
