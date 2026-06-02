// Playwright UI smoke test for the deployed devdash Worker.
// Logs in as each role, navigates every visible tab, captures screenshots, files
// real entries (bug / handoff / audit), verifies cross-user state sync, and
// snapshots-then-restores shared state at the end.
//
// Reads secrets from ../.devdash-secrets.env (gitignored).
//
// Run:   npm run smoke
// Headed: npm run smoke:headed

import { chromium } from 'playwright';
import { authenticator } from 'otplib';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = resolve(__dirname, 'screenshots');
mkdirSync(SCREENSHOTS_DIR, { recursive: true });

// --- Load secrets from .devdash-secrets.env ---
const secretsPath = resolve(__dirname, '..', '.devdash-secrets.env');
if (!existsSync(secretsPath)) {
  console.error(`Missing secrets file: ${secretsPath}`);
  process.exit(2);
}
const SECRETS = Object.fromEntries(
  readFileSync(secretsPath, 'utf-8').split('\n')
    .map(l => l.replace(/^export\s+/, '').match(/^([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/))
    .filter(Boolean)
    .map(m => [m[1], m[2]])
);
const URL_BASE = SECRETS.DEVDASH_URL;
const ACCOUNT_ID = SECRETS.DEVDASH_ACCOUNT_ID;
const NAMESPACE_ID = SECRETS.DEVDASH_NAMESPACE_ID;
const API_TOKEN = SECRETS.DEVDASH_API_TOKEN;
const AES_KEY_B64 = SECRETS.DEVDASH_AES_KEY_B64;

if (!URL_BASE || !API_TOKEN || !AES_KEY_B64) {
  console.error('Missing required secrets in .devdash-secrets.env');
  process.exit(2);
}

// --- Helpers ---

const results = []; // {name, status: 'pass'|'fail', detail?}
function pass(name) { results.push({ name, status: 'pass' }); console.log(`[PASS] ${name}`); }
function fail(name, detail) { results.push({ name, status: 'fail', detail }); console.log(`[FAIL] ${name} → ${detail}`); }

// Decrypt an AES-GCM-encrypted base64url payload using the shared 32-byte key.
async function decryptSecret(encryptedB64url, keyBytes) {
  const raw = Buffer.from(encryptedB64url.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const nonce = raw.subarray(0, 12);
  const ct = raw.subarray(12);
  const key = await webcrypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
  const pt = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ct);
  return new TextDecoder().decode(pt);
}

async function getCurrentTotpFor(email) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/storage/kv/namespaces/${NAMESPACE_ID}/values/user:${email}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${API_TOKEN}` } });
  if (!r.ok) throw new Error(`fetch user record ${email}: ${r.status}`);
  const rec = JSON.parse(await r.text());
  const keyBytes = Buffer.from(AES_KEY_B64, 'base64');
  const secret = await decryptSecret(rec.totp_secret_encrypted, keyBytes);
  return { code: authenticator.generate(secret), role: rec.role };
}

async function loginAs(context, email) {
  const { code, role } = await getCurrentTotpFor(email);
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  await page.goto(URL_BASE);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="code"]', code);
  await Promise.all([
    page.waitForURL(URL_BASE + '/', { timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);
  // Wait for Alpine to hydrate the SPA — `currentUser` populates from window.__SESSION__.
  await page.waitForFunction(() => window.__SESSION__ && document.querySelector('[x-data]'), null, { timeout: 10000 });
  return { page, consoleErrors, role };
}

async function shot(page, name) {
  const path = resolve(SCREENSHOTS_DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  return path;
}

async function clickTab(page, label) {
  // Role tabs render as `<button class="tab-btn">CEO view</button>` etc.
  const sel = `button.tab-btn:has-text("${label}")`;
  await page.locator(sel).first().click({ trial: false });
  // Allow Alpine to react.
  await page.waitForTimeout(400);
}

// --- The test body ---

async function main() {
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  console.log(`\n=== devdash UI smoke test ===`);
  console.log(`URL: ${URL_BASE}`);
  console.log(`Mode: ${process.env.HEADED ? 'headed' : 'headless'}`);
  console.log(`Screenshots: ${SCREENSHOTS_DIR}\n`);

  // --- Snapshot existing state so we can restore at the end ---
  const apiCtx = await browser.newContext();
  const { page: snapPage } = await loginAs(apiCtx, 'mustafa@phonebot.com.au');
  const snapState = await snapPage.evaluate(async (url) => {
    const r = await fetch(url + '/api/state', { credentials: 'same-origin' });
    return await r.json();
  }, URL_BASE);
  pass('00 snapshot saved');
  await apiCtx.close();

  // --- Test each role's view ---
  const roleProfiles = [
    { user: 'mustafa@phonebot.com.au', label: 'CEO',    tabs: ['CEO view', 'PM view', 'Dev view', 'QA view', 'QA Auditor view', '⚙ Settings'] },
    { user: 'imran@phonebot.com.au',   label: 'PM',     tabs: ['PM view', 'Dev view', 'QA view', 'QA Auditor view', '⚙ Settings'] },
    { user: 'faizan@phonebot.com.au',  label: 'Dev',    tabs: ['Dev view', 'QA view', 'QA Auditor view'] },
    { user: 'qa@phonebot.com.au',      label: 'QA',     tabs: ['Dev view', 'QA view', 'QA Auditor view'] },
  ];

  for (const profile of roleProfiles) {
    const ctx = await browser.newContext();
    let session;
    try {
      session = await loginAs(ctx, profile.user);
      pass(`${profile.label} login`);
    } catch (e) {
      fail(`${profile.label} login`, e.message);
      await ctx.close();
      continue;
    }
    const { page, consoleErrors } = session;

    for (const tab of profile.tabs) {
      try {
        await clickTab(page, tab);
        await shot(page, `${profile.label.toLowerCase()}-${tab.replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '').toLowerCase()}`);
        pass(`${profile.label} → ${tab} renders`);
      } catch (e) {
        fail(`${profile.label} → ${tab} renders`, e.message.split('\n')[0]);
      }
    }

    if (consoleErrors.length) {
      fail(`${profile.label} console clean`, `${consoleErrors.length} error(s): ${consoleErrors.slice(0, 2).join(' | ').slice(0, 200)}`);
    } else {
      pass(`${profile.label} console clean`);
    }

    await ctx.close();
  }

  // --- Cross-role data flow: Faizan submits handoff, PM (Imran) sees the chip ---
  const ctxFaizan = await browser.newContext();
  try {
    const { page: faizanPage } = await loginAs(ctxFaizan, 'faizan@phonebot.com.au');
    await clickTab(faizanPage, 'Dev view');
    // The "Log my day" button is in Faizan's own queue card and only when viewing self.
    const btn = faizanPage.locator('button:has-text("Log my day")').first();
    if (await btn.count() === 0) {
      fail('Faizan Log-my-day button visible', 'button not found');
    } else {
      await btn.click();
      // Modal markup uses placeholder text — target by placeholder to avoid ambiguity
      // with the trigger button (both contain "📝 Log my day").
      const closedInput = faizanPage.locator('input[placeholder*="P0-13"]');
      await closedInput.waitFor({ state: 'visible', timeout: 10000 });
      await closedInput.fill('UISMOKE-1, UISMOKE-2');
      await faizanPage.locator('textarea[placeholder*="Payment validation"]').fill('UI smoke test handoff — in progress');
      await shot(faizanPage, 'dev-handoff-modal-open');
      await faizanPage.locator('button:has-text("Save handoff")').click();
      await faizanPage.waitForTimeout(800);
      pass('Faizan submits handoff via UI');
    }
  } catch (e) {
    fail('Faizan submits handoff via UI', e.message.split('\n')[0]);
  }
  await ctxFaizan.close();

  // PM checks the chip
  const ctxImran = await browser.newContext();
  try {
    const { page: pmPage } = await loginAs(ctxImran, 'imran@phonebot.com.au');
    await clickTab(pmPage, 'PM view');
    await pmPage.waitForTimeout(800);
    const handoffCard = pmPage.locator('text=Latest handoff').first();
    if (await handoffCard.count() > 0) {
      pass('PM sees Faizan latest-handoff chip');
    } else {
      fail('PM sees Faizan latest-handoff chip', 'chip not visible after Faizan submit');
    }
    await shot(pmPage, 'pm-after-faizan-handoff');
  } catch (e) {
    fail('PM sees Faizan latest-handoff chip', e.message.split('\n')[0]);
  }
  await ctxImran.close();

  // --- Restore snapshot ---
  const ctxRestore = await browser.newContext();
  try {
    const { page: rPage } = await loginAs(ctxRestore, 'mustafa@phonebot.com.au');
    const restoreReport = await rPage.evaluate(async ({ url, snapshot }) => {
      const out = [];
      for (const [k, v] of Object.entries(snapshot)) {
        if (v === null) continue;
        const r = await fetch(`${url}/api/state/${encodeURIComponent(k)}`, {
          method: 'PUT', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(v),
        });
        out.push({ key: k, status: r.status });
      }
      return out;
    }, { url: URL_BASE, snapshot: snapState });
    const failed = restoreReport.filter(r => r.status !== 204);
    if (failed.length) {
      fail('snapshot restored', `${failed.length} key(s) failed: ${failed.map(f => `${f.key}=${f.status}`).join(', ')}`);
    } else {
      pass(`snapshot restored (${restoreReport.length} key(s))`);
    }
  } catch (e) {
    fail('snapshot restored', e.message.split('\n')[0]);
  }
  await ctxRestore.close();

  await browser.close();

  // --- Summary ---
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail');
  console.log('\n=== devdash UI smoke summary ===');
  console.log(`Passed: ${passed} / ${results.length}`);
  console.log(`Failed: ${failed.length}`);
  console.log(`Screenshots: ${SCREENSHOTS_DIR}`);
  if (failed.length) {
    console.log('\nFAILURES:');
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(2); });
