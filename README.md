# Dev Dashboard

A Claude Code slash command (`/weekly-audit`) + Cloudflare Worker that produces a per-role weekly HTML dashboard of dev activity across multiple projects, protected by Google Authenticator TOTP login.

**5 roles:** CEO, PM, Dev, QA, QA Auditor.
**8 users** in the initial roster (`users.yaml`).
**Cost:** $0 new subscriptions. Runs on existing Claude Max + existing Cloudflare free tier.

## What this is NOT

Read this before anything else so you know what you're looking at:

- **NOT a ticket system.** Items live wherever they already live. The dashboard reads, it does not own.
- **NOT a replacement for Phonebot HQ.** HQ is Faizan's separate Next.js + Postgres build for company-wide ops. This dashboard is dev-team only.
- **NOT a real-time tool.** Weekly refresh, plus a daily email for urgent items.
- **NOT deployed yet.** Phase E (Cloudflare Worker) is coded but not deployed. Follow the deployment checklist below.

---

## Architecture

- **Python helpers** (`scripts/dashboard/`) — deterministic work: parse configs, read git log, parse handoff MDs, score merit, compute forecasts, render HTML via Jinja2.
- **Claude Code slash commands** (`.claude/commands/`) — orchestration prompts for Claude to follow. `/weekly-audit` is the main one; `/quarterly-review`, `/add-feature-request`, `/log-offproject`, `/upload-to-dashboard` are helpers.
- **Cloudflare Worker** (`worker/`) — TOTP login + session cookies + role-routed HTML delivery at `https://devdash.phonebot.co.uk/`. Daily email cron via MailChannels.
- **Shared Bitbucket repo** (`dev-dashboard-inputs`) — upload folders for each role to drop context files.

## File layout

```
dev dashboard/
├── .claude/commands/           # Slash commands (Claude Code)
│   ├── weekly-audit.md         # Main weekly run
│   ├── quarterly-review.md     # 13-week performance reviews
│   ├── add-feature-request.md
│   ├── log-offproject.md
│   └── upload-to-dashboard.md
├── scripts/dashboard/          # Python helpers (TDD-covered)
│   ├── config.py               # YAML loaders
│   ├── git_reader.py
│   ├── handoff_parser.py
│   ├── uploads_reader.py
│   ├── matcher.py
│   ├── merit.py
│   ├── forecast.py
│   ├── render.py
│   ├── role_views.py           # visibility matrix filtering
│   ├── totp_provision.py       # AES-GCM encrypted secrets + QR codes
│   ├── worker_push.py          # pushes HTML+users+alerts to CF KV
│   ├── smoke_test.py           # end-to-end synthetic run
│   └── templates/
│       ├── dashboard.html.j2
│       └── quarterly-review.html.j2
├── worker/                     # Cloudflare Worker (TypeScript)
│   ├── wrangler.toml
│   ├── package.json
│   └── src/
│       ├── index.ts
│       ├── routes.ts           # / GET, /login POST, /logout
│       ├── session.ts
│       ├── totp.ts             # AES-GCM decrypt + otplib verify
│       └── email.ts            # MailChannels daily alerts
├── tests/dashboard/            # pytest suite (53 tests)
├── dashboard.config.yaml       # projects + repos + deadlines
├── users.yaml                  # 8 users, email -> role
├── requirements.txt            # Python deps
├── 2026-04-23-dev-dashboard-design.md   # the spec
├── 2026-04-23-dev-dashboard-plan.md     # the 21-task build plan
└── dev-dashboard-wireframe.html         # original visual sketch
```

---

## Prerequisites

### Installed on your Mac
- **Python 3.9+** (3.9.6 confirmed working)
- **git** (already installed)
- **Node.js + npm** (for wrangler)
- **Cloudflare account** with `phonebot.co.uk` DNS zone already added
- **Google Authenticator** on each team member's phone

### Python packages (already installed via `pip install --user`)
```
pyyaml>=6.0
jinja2>=3.1
pytest>=7.4
pyotp>=2.9
qrcode[pil]>=7.4
cryptography>=42.0
requests>=2.31
```

### Not yet installed — run these before deploy
```bash
npm install -g wrangler
```

---

## First-time deployment checklist

**Do these once. In order. Everything is tested locally first — no surprises.**

### 1. Run the full test suite
```bash
cd "/Users/adminadmin/Downloads/phonebot revamp/dev dashboard"
python3 -m pytest tests/dashboard/ -v
```
Expected: **53 passed**.

### 2. Run the local smoke test (generates HTML with synthetic data)
```bash
python3 -m scripts.dashboard.smoke_test
```
Expected: 8 HTML files written to `./output/`. Open `output/weekly-dashboard-ceo.html` in a browser, confirm tabs + metrics render correctly.

### 3. Install wrangler and authenticate
```bash
npm install -g wrangler
wrangler login            # opens browser, log into your Cloudflare account
wrangler whoami           # confirms which account is active
```

### 4. Create the KV namespace
```bash
cd "/Users/adminadmin/Downloads/phonebot revamp/dev dashboard/worker"
wrangler kv:namespace create DASHBOARD_KV
```
Copy the returned `id` and paste it into `worker/wrangler.toml` where it says `<FILL_AFTER_KV_CREATE>`.

### 5. Generate the AES encryption key + set it as a Worker secret
```bash
# 32 random bytes, base64-encoded
KEY=$(python3 -c "import os, base64; print(base64.b64encode(os.urandom(32)).decode())")
echo "Save this key locally (outside git) — you'll need it for Python-side provisioning too:"
echo "$KEY"
# Then push to Cloudflare as a secret:
echo "$KEY" | wrangler secret put TOTP_ENCRYPTION_KEY
```
**Important: save `$KEY` somewhere safe (password manager).** Python's `totp_provision.encrypt_secret` needs the same 32 bytes to produce encrypted secrets the Worker can decrypt.

### 6. Install Worker dependencies + deploy
```bash
cd "/Users/adminadmin/Downloads/phonebot revamp/dev dashboard/worker"
npm install
wrangler deploy
```
Expected: deployment success + URL printed. Should be `https://devdash.phonebot.co.uk` (or a `workers.dev` subdomain if DNS isn't configured yet).

### 7. DNS — point `devdash.phonebot.co.uk` at the Worker
In Cloudflare dashboard, under the `phonebot.co.uk` zone: add a DNS record (type A, name `devdash`, content `192.0.2.1` is fine — Worker route overrides it) and ensure "proxy status" is on (orange cloud). The Worker route in `wrangler.toml` handles the rest.

### 8. Smoke-test the live Worker
```bash
curl https://devdash.phonebot.co.uk/
```
Expected: HTML of the login form.

### 9. Provision each of the 8 users (TOTP QR codes)
```bash
cd "/Users/adminadmin/Downloads/phonebot revamp/dev dashboard"
python3 -c "
import base64, json, os
from pathlib import Path
from scripts.dashboard.totp_provision import provision_user, encrypt_secret
from scripts.dashboard.config import load_users
from scripts.dashboard.worker_push import push_user_records

# Substitute your values:
ACCOUNT_ID = '<your Cloudflare account ID>'
NAMESPACE_ID = '<the DASHBOARD_KV namespace id>'
API_TOKEN = '<CF API token with Workers KV Edit scope>'
KEY_B64 = '<the 32-byte base64 key you saved in step 5>'
KEY = base64.b64decode(KEY_B64)

users = load_users(Path('users.yaml'))
qr_dir = Path('provisioning-qr-codes')
records = {}
for u in users:
    p = provision_user(email=u.email, issuer='devdash', qr_dir=qr_dir)
    records[u.email] = {
        'role': u.role,
        'totp_secret_encrypted': encrypt_secret(p.secret, KEY),
    }
    print(f'{u.email} -> QR saved at {p.qr_path}')

push_user_records(ACCOUNT_ID, NAMESPACE_ID, API_TOKEN, records)
print('Records pushed to KV.')
"
```
Distribute each QR code privately (Signal, WhatsApp, printout — NOT public) to the respective team member. They install Google Authenticator, scan the QR, and get rolling 6-digit codes.

### 10. Run your first weekly audit
```bash
# In Claude Code, from the workspace:
/weekly-audit
```
Claude will walk through pulling commits, auditing, generating per-role HTML, and pushing to the Worker KV. Takes 5–10 minutes.

### 11. Team members log in
Each person opens `https://devdash.phonebot.co.uk/`, types their email + current 6-digit code. First login sets a 24-hour cookie. They see their role-appropriate dashboard.

---

## Regular operation

### Sunday night (Fahad, weekly)
```bash
# In Claude Code
/weekly-audit
```
Wait 5–10 minutes. Done. The team sees fresh data Monday morning.

### Any time (team members)
- **Dev pulled off-project?** Run `/log-offproject` or append an `OFF-PROJECT:` line to their `daily-handoff.md` entry.
- **QA finds a bug?** Upload the bug markdown to `dev-dashboard-inputs/qa-findings/<project>/<date>-bugs.md` (via Bitbucket web UI, git commit, or `/upload-to-dashboard`).
- **QA Auditor does a parity audit?** Upload to `dev-dashboard-inputs/qa-audits/<project>/<date>-<topic>.md`.
- **CEO or PM wants a new feature?** Run `/add-feature-request`.

### Every 13 weeks (Fahad, quarterly)
```bash
/quarterly-review
```
Generates one-page HTML per dev. Fahad reads, edits, delivers. Basis for bonus / raise / promotion decisions.

---

## The `dev-dashboard-inputs` Bitbucket repo

Create this repo once (or reuse an existing one) with this folder structure:

```
dev-dashboard-inputs/
├── fahad-uploads/              # Fahad drops files here
├── pm-uploads/                 # Imran drops files here
├── dev-uploads/
│   ├── Faizan/
│   ├── Moazzam/
│   ├── Faisal/
│   └── Usama/
├── qa-findings/
│   └── Phonebot-2.0/           # + one folder per project
├── qa-audits/
│   └── Phonebot-2.0/
└── feature-requests/
    └── Phonebot-2.0/
```

Update `dashboard.config.yaml` → `uploads_repo_path` to point at wherever you clone this repo locally. Every team member needs Bitbucket access (read + write) to the repo.

---

## Cost accounting

- **Cloudflare Workers free tier:** 100,000 requests/day. Team of 8 × ~5 logins/week × 3 requests = ~120/week. **0.01% of quota.**
- **Cloudflare KV free tier:** 100k reads/day, 1k writes/day. We use a handful. **Free.**
- **MailChannels:** free via Cloudflare Workers integration. **Free.**
- **Claude Max $100/5x subscription:** existing. Weekly audit uses ~3% of monthly quota. Daily email cron negligible. **No new spend.**

Total new recurring cost: **$0/month.**

---

## Troubleshooting

### `/weekly-audit` fails with a git error
Check `dashboard.config.yaml` — does each project's `repos` list point to real git repos on your Mac? Run `git log` in each path to confirm.

### Team member can't log in
1. Confirm their email in `users.yaml` matches exactly what they type.
2. Confirm their QR was scanned into Google Authenticator (not Authy or another app — otplib defaults match Google Authenticator).
3. Time sync: TOTP codes rotate every 30 seconds. If their phone clock is off by more than ~30s, codes won't validate. Ask them to enable auto-time-sync.
4. Check the Cloudflare Worker logs in the dashboard — look for decrypt errors or KV misses.

### Daily alert email not arriving
1. Check `[triggers] crons` in `wrangler.toml` is set to fire.
2. Check Cloudflare Worker logs around 13:00 UTC.
3. Check that the `/weekly-audit` script pushed `alerts:latest` to KV — it's the trigger input.
4. MailChannels occasionally blocks sender domains — sender is `devdash@devdash.phonebot.co.uk` which should be fine under the `phonebot.co.uk` zone.

### Tests fail after a dependency update
```bash
python3 -m pip install --user --upgrade -r requirements.txt
python3 -m pytest tests/dashboard/ -v
```
If anything broke, git log for this file will show what changed; revert the specific package.

---

## Known open decisions (not blockers)

- Whether to wire up a phone-loss recovery path (admin re-provisioning). v1 answer: Fahad manually re-runs provisioning for the affected user and sends a new QR.
- Whether to push dashboards to a second mirror (e.g., an S3 bucket) for audit-trail redundancy. v1: no.
- Whether to automate the weekly `/weekly-audit` trigger (cron on Fahad's Mac) — v1 is manual trigger to keep things simple.

---

## Development

### Running tests
```bash
cd "/Users/adminadmin/Downloads/phonebot revamp/dev dashboard"
python3 -m pytest tests/dashboard/ -v
```

### Making changes
Follow the same TDD pattern the original build used:
1. Write a failing test in `tests/dashboard/test_<module>.py`.
2. Implement until the test passes.
3. Run the full suite — must stay at 53+ passed.
4. Commit with a `feat(dashboard):` or `fix(dashboard):` prefix.

### Worker code changes
Edit files in `worker/src/`. Then:
```bash
cd worker
wrangler deploy
```

---

## References

- **Spec:** `2026-04-23-dev-dashboard-design.md` (21 sections, authoritative design)
- **Plan:** `2026-04-23-dev-dashboard-plan.md` (the 21-task build plan this project followed)
- **Original wireframe:** `dev-dashboard-wireframe.html` (visual sketch before implementation)
