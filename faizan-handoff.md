# devdash — Standalone deploy handoff

**Audience:** Faizan (or whoever runs the deploy)
**Target:** Ship standalone devdash to `devdash.phonebot.co.uk`.
**Future:** HQ integration is deferred — plan for that is in `faizan-handoff-future-hq-port.md`. Ignore for now.

---

## Part 1 — The stack (standalone)

```
┌────────────────────────────────────────────────────────────────┐
│  devdash.phonebot.co.uk  (Cloudflare Worker + KV)              │
│                                                                │
│  worker/src/                                                   │
│    ├── index.ts          fetch handler + scheduled cron stub   │
│    ├── routes.ts         / (login + role HTML), /login, /logout│
│    ├── session.ts        cookie helpers + KV session store     │
│    ├── totp.ts           TOTP verify + AES-GCM secret decrypt  │
│    └── email.ts          MailChannels daily digest             │
│                                                                │
│  KV keys served by Worker:                                     │
│    dashboard:latest:ceo          pre-rendered HTML             │
│    dashboard:latest:pm           pre-rendered HTML             │
│    dashboard:latest:qa           pre-rendered HTML             │
│    dashboard:latest:qa_auditor   pre-rendered HTML             │
│    dashboard:latest:dev:<email>  pre-rendered HTML per dev     │
│    user:<email>                  {role, totp_secret_encrypted} │
│    session:<id>                  {email, role, ts}             │
│    alerts:latest                 {stuck_prs, bugs, disagree…}  │
└────────────────────────────────────────────────────────────────┘
                           ↑
                           │ pushes fresh HTML weekly + daily alert
                           │
┌────────────────────────────────────────────────────────────────┐
│  Python audit pipeline (runs on your Mac or any ops box)       │
│                                                                │
│  scripts/dashboard/                                            │
│    ├── config.py            load projects.yaml + users.yaml    │
│    ├── git_reader.py        git log per repo                   │
│    ├── handoff_parser.py    parse daily-handoff.md             │
│    ├── merit.py             Compass scoring                    │
│    ├── forecast.py          traffic lights + days-of-work      │
│    ├── render.py            Jinja2 → per-role HTML             │
│    ├── role_views.py        visibility matrix payloads         │
│    ├── worker_push.py       push HTML + alerts + users to KV   │
│    └── totp_provision.py    generate TOTP secrets per user     │
│                                                                │
│  Claude Code skills (already installed at ~/.claude/skills/):  │
│    /devdash-audit       weekly pipeline run                    │
│    /devdash-daily       dev EOD handoff helper                 │
│    /devdash-git-sync    one-time Bitbucket webhook + cron setup│
└────────────────────────────────────────────────────────────────┘
```

**One-liner:** Python runs weekly, generates role-specific HTML + alerts, pushes them to Cloudflare KV. Worker serves them from KV after TOTP login. Daily email cron fires from the Worker itself.

---

## Part 2 — What's already done

| Piece | Status |
|---|---|
| Worker code (auth, TOTP verify, session, role-routing, email cron) | ✅ Written, tested in isolation |
| Python pipeline | ✅ 53/53 pytest pass, smoke test generates 8 HTMLs end-to-end |
| TOTP provisioning (AES-GCM encrypted secrets, otpauth:// QR URLs) | ✅ `scripts/dashboard/totp_provision.py` |
| KV push | ✅ `scripts/dashboard/worker_push.py` (uses Cloudflare REST API) |
| 3 slash-command skills | ✅ Installed at `~/.claude/skills/devdash-{daily,audit,git-sync}/` |
| Alpine.js preview UI (`devdash.html`) | ✅ Working prototype — NOT what ships. Ships the rendered HTML from `render.py`. |

## What's NOT done

1. `wrangler.toml` has `id = "<FILL_AFTER_KV_CREATE>"` placeholder.
2. No domain DNS. Cloudflare zone `phonebot.co.uk` needs a route.
3. No KV namespace created yet.
4. No `TOTP_ENCRYPTION_KEY` secret set on Worker.
5. 8 users don't have TOTP QR codes yet.
6. Worker not deployed.
7. First pipeline run hasn't happened against real repos (only synthetic smoke test).
8. Git sync cron not installed on ops box.

---

## Part 3 — Step-by-step

### Step 1 — Environment setup
```bash
# Install wrangler if not present
npm install -g wrangler

# Log in to the Phonebot Cloudflare account
wrangler login

# Confirm account + zones
wrangler whoami
```

**Acceptance:** `wrangler whoami` shows the right account; `phonebot.co.uk` zone is listed.

### Step 2 — KV + secret provisioning
```bash
cd "dev dashboard/worker"
wrangler kv:namespace create DASHBOARD_KV
# Copy the returned id — paste into wrangler.toml replacing <FILL_AFTER_KV_CREATE>

# Generate a 32-byte AES key (base64)
openssl rand -base64 32
# Copy the output — set as a secret:
wrangler secret put TOTP_ENCRYPTION_KEY
# Paste the key when prompted

# Set MailChannels API secret if you use one
wrangler secret put MAILCHANNELS_API_KEY
```

**Acceptance:** `wrangler kv:key list --namespace-id=<id>` returns empty; `wrangler secret list` shows both secrets.

### Step 3 — DNS + route
- In Cloudflare dashboard → `phonebot.co.uk` → DNS:
  - Add CNAME `devdash` → `devdash.workers.dev` (proxied / orange cloud on).
- The `[[routes]]` entry in `wrangler.toml` already pins `devdash.phonebot.co.uk/*` to the Worker.

**Acceptance:** `dig devdash.phonebot.co.uk` returns Cloudflare IPs.

### Step 4 — First Worker deploy
```bash
cd "dev dashboard/worker"
npm install
wrangler deploy
# Should print: Published devdash (x.xx sec) at https://devdash.phonebot.co.uk
```

Test: open `https://devdash.phonebot.co.uk` in browser → should show login form. No errors in Worker logs (`wrangler tail`).

**Acceptance:** 200 response on root URL.

### Step 5 — TOTP provisioning for 8 users
```bash
cd "dev dashboard"
export TOTP_ENCRYPTION_KEY="<the base64 key from Step 2>"
python3 scripts/dashboard/totp_provision.py scripts/dashboard/users.yaml --output ./qr-codes/
```

This writes one `{email}.png` QR code per user to `qr-codes/` AND writes encrypted secrets to a JSON file ready for KV upload. Then push them:

```bash
export CF_ACCOUNT_ID="<from wrangler whoami>"
export CF_KV_NAMESPACE_ID="<from Step 2>"
export CF_API_TOKEN="<create in CF dashboard, scope: Workers KV Storage: Edit>"
python3 -c "
from scripts.dashboard.worker_push import push_user_records
import json
records = json.load(open('qr-codes/user-records.json'))
push_user_records('$CF_ACCOUNT_ID', '$CF_KV_NAMESPACE_ID', '$CF_API_TOKEN', records)
print('pushed', len(records), 'user records to KV')
"
```

**Distribute QR codes:**
- WhatsApp each person their QR PNG file (1 image each, 8 messages).
- Instruct: open Google Authenticator → + → Scan QR. Done.

**Acceptance:** `wrangler kv:key list --namespace-id=<id>` shows 8 `user:<email>` entries. One dev (e.g. Faizan) can scan, log in at `devdash.phonebot.co.uk`, reach a "no content yet" page served by the Worker (no 500 errors).

### Step 6 — First real pipeline run
```bash
cd "dev dashboard"
# Make sure real repo paths are in dashboard.config.yaml:
#   projects:
#     - id: pb2
#       repos: ['/actual/path/to/pb-backend', '/actual/path/to/pb-frontend']
#     ...

# Sanity check first with synthetic data
PYTHONPATH=. python3 scripts/dashboard/smoke_test.py

# Real run against real repos
PYTHONPATH=. python3 scripts/dashboard/weekly_audit.py
```

If `weekly_audit.py` doesn't exist yet, write it as a thin wrapper — ~60 lines calling existing modules in order. The smoke_test.py is basically this with synthetic inputs; replace inputs with real file paths and call `worker_push.push_payloads` + `push_alerts` at the end.

**Acceptance:** `wrangler kv:key list` shows `dashboard:latest:ceo`, `:pm`, `:qa`, `:qa_auditor`, 4× `dashboard:latest:dev:<email>`, and `alerts:latest`. Logging in as Fahad at the URL → CEO HTML renders with REAL numbers (not synthetic).

### Step 7 — Smoke-test all 5 roles
Log in as each of the 8 users, confirm each sees the right view + nothing they shouldn't. Fix anything obviously broken (usually: typos in `wrangler.toml`, DNS propagation, or missing env var).

### Step 8 — Git sync — webhook OR cron

**Webhook path (Bitbucket / GitHub):**
- In each repo → Settings → Webhooks → Add.
- URL: `https://devdash.phonebot.co.uk/webhook/git` (need to add this route to `routes.ts` — ~20 lines).
- Secret: set via `wrangler secret put GIT_WEBHOOK_SECRET`.
- Events: push only.
- Verification in Worker: `X-Hub-Signature-256` with HMAC-SHA256 + `hmac.compare_digest`-style constant-time compare.
- On valid push: write to KV `commits:<project>:<sha>` with author + message + ts.

**Cron backstop (on any Mac / Linux box with ssh access to repos):**
```bash
# /opt/devdash/scripts/dashboard/git_sync.py exists per /devdash-git-sync skill
crontab -e
# Add:
0 6 * * * cd /opt/devdash && PYTHONPATH=. /usr/bin/python3 scripts/dashboard/git_sync.py >> /var/log/devdash/sync.log 2>&1
```

`git_sync.py` writes to local JSON files (`output/commits/<YYYY-MM-DD>-<project>.json`) that the weekly audit reads on its next run.

**Acceptance:** push a test commit to one of the 5 project repos. The commit appears in the dashboard dev view after the next pipeline run (webhook = near-instant if wired to push into KV directly; cron = next audit).

### Step 9 — Weekly audit cron
```bash
# Same ops box
crontab -e
# Add:
0 7 * * 1 cd /opt/devdash && PYTHONPATH=. /usr/bin/python3 scripts/dashboard/weekly_audit.py >> /var/log/devdash/audit.log 2>&1
```

Runs Mondays 07:00 local. Runs the full pipeline, pushes fresh HTML to KV. Everyone who logs in Monday morning sees fresh content.

**Acceptance:** touch a test handoff entry, force-run `weekly_audit.py`, confirm KV keys update (`wrangler kv:key get --namespace-id=<id> dashboard:latest:ceo | head`).

### Step 10 — Daily email digest
The Worker already has `scheduled()` wired (cron `0 13 * * *` in `wrangler.toml`). It reads `alerts:latest` from KV and emails `fahad@phonebot.com.au + imran@phonebot.com.au` via MailChannels.

Content per current `email.ts`:
- Stuck PRs > 2 days
- HIGH-severity open bugs > 1 day
- Disagreements between PM assessment and dashboard audit

**Acceptance:** force a manual cron: `wrangler cron trigger` → check both inboxes.

### Step 11 — Security hardening (blockers from QA audit)

Three things CANNOT ship to production without verifying:

1. **TOTP verification is real, not decorative** — the decorative `tryLogin()` lives in `devdash.html` which is the prototype, NOT what the Worker serves. The Worker's `routes.ts` calls `verifyTotp()` in `totp.ts` which does real TOTP verification. **Verify this path is what's live:**
   - Load `https://devdash.phonebot.co.uk`.
   - Try login with `000000`. Should get 403 / "Invalid code".
   - Try with the correct current TOTP from Google Authenticator. Should get 200 + cookie set.

2. **XSS in rendered HTML** — `render.py` produces server-side HTML with Jinja2 auto-escape on. Confirm by:
   ```bash
   # Set a user's displayName to <script>alert(1)</script> in users.yaml
   # Run weekly_audit.py
   # Fetch dashboard:latest:pm from KV
   # grep "<script>" — should find 0 matches (should be escaped to &lt;script&gt;)
   ```

3. **Role gating** — in the Worker, `routes.ts` already checks `session.role` before serving `dashboard:latest:<role>`. Verify:
   ```bash
   # Log in as a dev → try to fetch /settings or /ceo → should 403.
   ```

**Acceptance:** all three above pass.

### Step 12 — Docs + handover
Write `DEPLOY-LOG.md` with:
- Cloudflare account used
- KV namespace ID
- Domain / DNS record
- Secret names in place
- TOTP secrets file (encrypted) backed up where
- Cron schedule in effect
- Which dev has Worker dashboard access

Hand Fahad the ops-box credentials + an envelope with the master `TOTP_ENCRYPTION_KEY` in case disaster recovery is ever needed.

---

## Part 4 — Checklist

- [ ] `wrangler login` done
- [ ] KV namespace created, id in `wrangler.toml`
- [ ] `TOTP_ENCRYPTION_KEY` secret set
- [ ] `MAILCHANNELS_API_KEY` secret set (if needed)
- [ ] DNS CNAME `devdash.phonebot.co.uk`
- [ ] `wrangler deploy` succeeds
- [ ] Login page loads at the URL
- [ ] TOTP provisioned for 8 users, QR codes distributed
- [ ] `weekly_audit.py` written + runs against real repos
- [ ] KV keys populated: `dashboard:latest:{ceo,pm,qa,qa_auditor}` + 4 dev-specific + `alerts:latest`
- [ ] Each of 8 users logs in successfully + sees their role view
- [ ] Git webhook OR git_sync cron in place
- [ ] Weekly audit cron scheduled (Mondays 07:00)
- [ ] Daily email cron verified firing
- [ ] TOTP 000000 → rejected (real verification active)
- [ ] Role gating verified (dev can't reach /settings)
- [ ] Jinja2 auto-escape verified (`<script>` in displayName → escaped)
- [ ] `DEPLOY-LOG.md` written
- [ ] `TOTP_ENCRYPTION_KEY` backed up offline (NOT in git)

---

## Part 5 — Known gotchas

1. **Don't commit `TOTP_ENCRYPTION_KEY`** anywhere. Not in `.env`, not in docs, not in commit messages. It's a Worker secret (managed via `wrangler secret put`) and an offline backup (Fahad's safe).
2. **`dashboard.config.yaml` has dummy repo paths** (`/pb-backend`, `/pb-frontend`). Edit to real local paths OR make them Bitbucket URLs before first run.
3. **Melbourne vs Karachi time** — `timezone: Australia/Melbourne` in config. All cron jobs run in the ops-box's local time. If ops box is in PKT, Melbourne 07:00 = PKT 04:00. Adjust.
4. **PKR reward amounts look weird to CEO if stale** — if Fahad opens the dashboard and sees `400 PKR` instead of `35k PKR`, his localStorage from the old prototype is overriding. Tell him to use Settings → Rewards → "Reset amounts to PKR defaults" (or clear `devdash_config` from localStorage).
5. **Cloudflare KV is eventually consistent** (~60s propagation). If you push new HTML and don't see it, wait a minute.
6. **`wrangler tail`** is your friend for debugging 500s in Worker logs.

---

## Part 6 — What Fahad gets after this is done

- `https://devdash.phonebot.co.uk` live, TOTP-gated, 8-user roster.
- Every Monday morning, the dashboard auto-refreshes with last week's data.
- Every day at 13:00 UTC, Fahad + Imran get an email digest of stuck PRs + HIGH bugs + PM disagreements.
- Commits from all 5 projects flow in via webhook or cron.
- Everything the Alpine.js prototype did — except the server data is real, not hardcoded.

---

## Part 7 — What's deliberately deferred

- Polish items from the persona-agent research (CEO wants GMV/runway tile, PM wants WhatsApp push, etc.) — see `qa-sandbox-run/persona-*.md`.
- HQ integration (port as module inside Phonebot HQ) — see `faizan-handoff-future-hq-port.md`.
- Pinned merit/compass tests — add when you first modify scoring math.
- Playwright regression coverage for the rendered HTML.

---

## Part 8 — If scope has to shrink

If anything has to be cut, drop in this order (keeps the core loop alive):
1. Daily email cron (Step 10) — Fahad can check the dashboard manually.
2. Git webhook (Step 8 webhook path) — leave cron-only.
3. Jinja2 XSS verification (Step 11 #2) — LOW risk in practice; users.yaml is controlled by Fahad.

Do NOT skip: Step 11 #1 (real TOTP verification) or Step 11 #3 (role gating). Those are hard blockers before it goes on a public URL.

---

Good luck. Questions → ping Fahad. The old HQ-port plan lives in `faizan-handoff-future-hq-port.md` for when we decide to do that migration later.

---

## Part 9 — Backup + Disaster Recovery (Fahad approved 2026-04-24)

**Risk:** Everything lives in one Cloudflare KV namespace. If someone deletes the KV, runs reset, or a Worker deploy clobbers a key, all reward history + bug records + audit log are gone with no recovery.

### Step B1 — Nightly backup to S3 (or local ops box)
```bash
# Cron at 02:00 local, Python, exports KV → gzipped JSON → S3 or /opt/devdash-backups/
# /opt/devdash/scripts/dashboard/kv_backup.py  (to be written — ~40 lines)

# Dumps every KV key in DASHBOARD_KV namespace via Cloudflare API
# Writes: /backups/devdash-YYYY-MM-DD.json.gz
# Keeps: last 30 daily + 12 monthly snapshots
# Alerts: MailChannels to Fahad if backup fails 2 days in a row
```

### Step B2 — Cron entry
```
0 2 * * * cd /opt/devdash && /usr/bin/python3 scripts/dashboard/kv_backup.py >> /var/log/devdash/backup.log 2>&1
```

### Step B3 — Restore procedure
Document at `DISASTER-RECOVERY.md`:
1. Identify latest clean backup (`ls -lt /backups/devdash-*.json.gz`)
2. Unzip + verify JSON structure
3. Replay into KV: `python3 scripts/dashboard/kv_restore.py <backup-file>`
4. Smoke test: log in as Fahad, confirm `rewardEvents` + `bugs` + `auditFindings` counts match pre-disaster export
5. Communicate scope: post in WhatsApp how many days of post-backup data were lost

**Not yet written:** `kv_backup.py` and `kv_restore.py`. Both are ~40 lines calling Cloudflare REST API `storage/kv/namespaces/<id>/keys` + `values/<key>` endpoints. Write them in Day 1 or Day 2 of the deploy.

**Acceptance:** Delete a test key in KV; run restore; confirm the key returns with correct value.

---

## Part 10 — TOTP lockout recovery (Fahad approved 2026-04-24)

**Scenario:** Faizan loses his phone → Google Authenticator gone → can't generate 6-digit codes → can't log in.

### Recovery flow

1. User hits `/auth/recover` (new route) with their email.
2. Worker checks if `user:<email>` exists → if yes, sends a one-time recovery link to their email via MailChannels with a 30-minute signed token (HMAC using `TOTP_ENCRYPTION_KEY`-derived signing secret).
3. User clicks the link → Worker verifies the signed token → renders a fresh QR code page with a NEW TOTP secret → encrypts the new secret with AES-GCM → writes to KV at `user:<email>`.
4. Old secret is invalidated (replaced). Old sessions for that user are force-logged out (delete all `session:*` entries matching the email).
5. User scans new QR → can log in again.

### Rate limiting

- Max 1 recovery email per user per 24 hours
- Max 3 recovery emails per IP per 24 hours
- Logged to `recovery_log` KV key for audit trail

### Fahad-only override

If the email channel itself is compromised (attacker has user's email), Fahad can manually re-provision:
```bash
cd "dev dashboard"
python3 scripts/dashboard/totp_provision.py users.yaml --only <email> --force --output qr-codes/
# Upload the new encrypted secret via worker_push.push_user_records for that single user
# WhatsApp the new QR PNG directly to the user
```

### Routes to add to `worker/src/routes.ts`

- `GET /auth/recover` → form to enter email
- `POST /auth/recover` → send recovery email (rate-limited)
- `GET /auth/recover/confirm?token=<signed>` → validate token + render new-QR page
- `POST /auth/recover/complete?token=<signed>` → finalise new secret

**Acceptance:** Force-delete Faizan's `session:*` + `user:faizan@...` entries → Faizan hits `/auth/recover` → receives email → clicks → scans new QR → can log in within 30 min of the reset email.

---

## Part 11 — Data export (Fahad approved 2026-04-24)

**Purpose:** One-click "dump everything to JSON" so Fahad can leave Cloudflare / archive to offline / audit externally without being locked in.

### In-dashboard button

In Settings → System → Danger zone (below Reset-to-defaults):

```
[ Export all data → .json ]
```

On click: builds a single JSON payload containing:
```json
{
  "version": 1,
  "exported_at": "2026-04-24T23:45:00Z",
  "exported_by": "Fahad",
  "config": { ... },
  "bugs": [ ... ],
  "auditFindings": [ ... ],
  "featureRequests": [ ... ],
  "disputes": [ ... ],
  "blockers": [ ... ],
  "stuckPrs": [ ... ],
  "regressionCandidates": [ ... ],
  "pmAssessments": [ ... ],
  "clockEntries": { ... },
  "rewardEvents": [ ... ],
  "payoutBatches": [ ... ],
  "growthLog": { ... },
  "auditLog": [ ... ]
}
```

Triggers a browser download: `devdash-export-YYYY-MM-DD.json`.

### Server-side equivalent

For a full KV snapshot (including TOTP secrets, sessions, commits from `commits:<project>:<sha>`):
```bash
python3 scripts/dashboard/kv_backup.py --all --output devdash-full-$(date +%F).json.gz
```

This is the operational cousin of the backup cron — safe to run manually anytime.

### Re-import path

Not built yet. If needed: write `import-legacy` API route that accepts the exported JSON, validates schema version, writes each array back to its KV key. Phase 2 if Fahad ever needs it.

### Acceptance

Click the Export button; open the downloaded JSON; confirm every localStorage key is present with the current day's data; payload parses cleanly in a fresh browser via `JSON.parse()`.

---
