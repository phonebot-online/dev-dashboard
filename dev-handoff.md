# devdash — Developer Handoff

**Owner:** Fahad (CEO, Phonebot)
**Domain:** devdash.phonebot.co.uk
**Written:** 2026-04-24
**Last updated:** 2026-04-24 (schema + skills + QA-audit blockers)
**For:** The developer building the production version from the Alpine.js prototype.

---

## What this is

devdash is a multi-project dev visibility dashboard for Fahad. It tracks dev merit scores, sprint progress, QA findings, feature requests, clock-in/out, and generates weekly AI audits across all active Phonebot projects. The audience is Fahad (CEO), Imran (PM), Faizan/Moazzam/Faisal/Usama (devs), Mustafa (QA auditor), and junior QA staff.

The prototype is a single Alpine.js HTML file backed by localStorage. It has a complete working UI with role-based views, a compass scoring widget, login flow with TOTP UI, and all the data entry forms. What it does not have: a real backend, real TOTP verification, real persistence, or real scoring calculations. Your job is to build all of that.

> **SECURITY BLOCKER — READ BEFORE DEPLOYING ANYTHING.**
> `devdash.html` is a decorative shell, not a secure app. The `tryLogin()` function around line 1494 accepts any 6-digit code and hands out a session. The `VISIBILITY` matrix, Settings tab, and peer dev compass are all client-side filters — a 20-second devtools edit bypasses every role check. The Alpine prototype **must never be served from a public origin.** Only the Cloudflare/AWS Worker enforces real TOTP + role. Treat the HTML as a design reference, not a production codepath.
>
> Other blockers from the April QA-audit agent pass:
> - `pmSummaryHtml()` uses Alpine's `x-html` with an interpolated `displayName` — stored XSS if `displayName` is attacker-controlled. Sanitise or switch to `x-text` before reusing the template server-side.
> - `worker/wrangler.toml` still has `<FILL_AFTER_KV_CREATE>` as a placeholder. Fill it during infra setup or the Worker will not deploy.

**Read these docs before writing any code:**

- `data-architecture.md` — storage tiers, DynamoDB schema, S3 structure, security model
- `context-strategy.md` — how Claude audit runs are scoped, token budget, knowledge card mechanism
- `dashboard.config.yaml` — live config structure (projects, users, scoring weights, rewards)

---

## 1. Getting Started

### Prerequisites

```bash
# Python 3.11+
python3 --version

# Node 20+
node --version

# AWS CLI v2
aws --version

# AWS CDK v2
npm install -g aws-cdk
cdk --version

# Wrangler (Cloudflare Worker CLI)
npm install -g wrangler
wrangler --version

# LocalStack (for local AWS mocking)
pip install localstack
localstack --version
```

### Run the prototype locally

The prototype has no build step. Open `dev dashboard/devdash.html` directly in a browser:

```bash
open "/Users/adminadmin/Downloads/phonebot revamp/dev dashboard/devdash.html"
```

It loads Alpine.js and Tailwind from CDN. No server required. Login accepts any 6-digit code (prototype mode). All data lives in `localStorage` — clear it between test sessions if state bleeds.

### Run the backend locally with LocalStack

```bash
# Start LocalStack (emulates DynamoDB, S3, Lambda, SES, KMS, Secrets Manager)
localstack start -d

# Verify services are up
awslocal dynamodb list-tables
awslocal s3 ls

# Bootstrap local infrastructure (creates table + buckets)
cd infra/
STAGE=local cdk deploy --context local=true

# Run a backend handler directly (no Lambda cold start)
cd backend/
pip install -r requirements.txt
python -m pytest tests/ -v

# Or invoke a specific handler
python -c "
from handlers.auth import handler
event = {'body': '{\"email\": \"fahad@phonebot.com.au\", \"totp_code\": \"123456\"}', 'httpMethod': 'POST'}
print(handler(event, {}))
"
```

### Run the Cloudflare Worker locally

```bash
cd worker/
npm install
wrangler dev
# Worker available at http://localhost:8787
```

The worker needs `TOTP_ENCRYPTION_KEY` set as a secret. For local dev, add it to `.dev.vars`:

```
TOTP_ENCRYPTION_KEY=<base64-encoded-32-byte-key>
```

Generate a test key with: `python3 -c "import os, base64; print(base64.b64encode(os.urandom(32)).decode())"`.

---

## 2. Repository Structure

```
devdash/
  frontend/
    src/
      components/         # Alpine.js components extracted to modules
        compass.ts
        meritCard.ts
        projectPanel.ts
        bugForm.ts
        ...
      stores/             # Alpine store wrappers for API calls
        auth.ts
        projects.ts
        users.ts
      api/                # Thin typed API client
        client.ts
        types.ts
      styles/
        main.css          # CSS variables + base styles (extracted from devdash.html)
        themes.css        # dark / light / cream theme tokens
    public/
      index.html
    package.json
    vite.config.ts
    tsconfig.json
  backend/
    handlers/
      auth.py             # POST /auth/login, POST /auth/logout
      projects.py         # GET/PUT /projects/:id, GET /projects
      users.py            # Admin user provisioning
      uploads.py          # POST /projects/:id/uploads, handoffs, qa-findings, etc.
      audit.py            # POST /audits, GET /audit/status/:id
      context.py          # GET /context/:id, POST /context/load-more/:id
    shared/
      db.py               # DynamoDB helpers (get, put, query, update with condition)
      s3.py               # S3 helpers (get, put, presign, lifecycle)
      totp.py             # AES-GCM encrypt/decrypt + pyotp verify (matches totp_provision.py)
      auth_middleware.py  # Session cookie validation, role extraction
      errors.py           # Standard error responses
      config.py           # Load dashboard.config.yaml
    tests/
      test_auth.py
      test_projects.py
      test_uploads.py
      test_context.py
      test_audit.py
      conftest.py         # LocalStack fixtures
    requirements.txt
    requirements-dev.txt
  infra/
    lib/
      devdash-stack.ts    # CDK stack: DynamoDB, S3 buckets, Lambda functions, IAM roles
      cloudfront.ts       # CloudFront in front of S3 static hosting (frontend)
    bin/
      devdash.ts
    package.json
    cdk.json
  worker/
    src/
      index.ts            # Cloudflare Worker entry point (already built)
      routes.ts           # Login/logout/session routing (already built)
      session.ts          # Session token management in KV (already built)
      totp.ts             # AES-GCM decrypt + otplib verify (already built)
      email.ts            # SES alert email formatting (already built)
    wrangler.toml
    package.json
    tsconfig.json
  weekly-audit/
    main.py               # Invoked by Fahad's Claude Code via /weekly-audit slash command
    context_builder.py    # Assembles AuditContext per project (logic from context-strategy.md)
    prompts/
      audit_system.md     # System prompt for weekly audit
      card_update.md      # System prompt for knowledge card regeneration
      merit_scoring.md    # System prompt for per-dev merit computation
  scripts/
    dashboard/
      totp_provision.py   # Already built — provisions TOTP secrets + QR codes
      config.py
      render.py
      git_sync.py         # Written by /devdash-git-sync — pulls Bitbucket commits, HMAC-verified webhook
      ...
  .github/
    workflows/
      ci.yml              # lint + test on every push
      deploy.yml          # deploy on git tag
  dashboard.config.yaml
  README.md
```

### Slash-command skills (not deployed, but load-bearing)

These live in `~/.claude/skills/` on Fahad's and each dev's laptop, not in the repo. The backend needs to stay compatible with the data they produce.

| Skill | What it does | Backend touchpoints |
|-------|--------------|---------------------|
| `/devdash-daily` | Dev end-of-day helper. Parses today's git commits, asks 4 questions, appends a CLOSED/IN PROGRESS/OPEN/OFF-PROJECT block to `daily-handoff.md`. Self-contained — no backend call today. | In production, the block format must stay stable so the audit parser can still read it. Optional upgrade: `POST /handoffs` from the skill so the Worker writes straight to S3. |
| `/devdash-audit` | Weekly CEO/PM audit. Loads `projects.yml` + `users.yml`, reads git log per repo, parses handoffs, computes merit, renders per-role HTML under `output/YYYY-WW/`. Calls `scripts/dashboard/*.py`. | Must keep reading the same config shape the backend now serves via `GET /config`. Once the backend is live, swap local YAML for the API call. |
| `/devdash-git-sync` | One-time infra setup. Writes `scripts/dashboard/git_sync.py`, configures the Bitbucket webhook with HMAC verification, documents the 06:00 cron entry. | Webhook target is a Lambda function URL. Store the HMAC secret in Secrets Manager alongside `TOTP_ENCRYPTION_KEY`. |

---

## 3. Migration Plan — Alpine.js Prototype to Production SPA

The prototype (`devdash.html`) is a ~3,000-line single file. The migration should not be a rewrite — it should be a series of extractable steps.

**Step 1: Move CSS out of inline `<style>` into a stylesheet.**

All CSS variables and component classes live in `<style>` at the top of `devdash.html`. Extract to `frontend/src/styles/main.css` and `themes.css`. No logic changes. Verify themes (dark, light, cream) still work after extraction.

**Step 2: Split Alpine components into proper modules.**

Alpine 3 supports `Alpine.data('name', () => {...})` and `Alpine.store('name', {...})`. Extract the monolithic `devdash()` function block into separate files:

- `compass.ts` — SVG compass rendering + score calculation
- `meritCard.ts` — per-dev merit display
- `projectPanel.ts` — project traffic light, progress, items
- `bugForm.ts` — bug submission form
- `clockWidget.ts` — clock in/out

Each module registers itself on `Alpine`. The `index.html` imports them via Vite.

**Step 3: Replace localStorage with API calls to the backend.**

This is the main migration step. Every place the prototype reads or writes `localStorage`, replace with a call to the typed API client (`frontend/src/api/client.ts`). The API client wraps `fetch`, attaches the session cookie automatically, and handles 401 responses with a redirect to `/login`.

Concrete substitutions:
- `localStorage.getItem('devdash_config')` → `GET /config`
- `localStorage.setItem('devdash_bugs', ...)` → `POST /bugs`
- `localStorage.getItem('devdash_session')` → session cookie (implicit, no JS needed)

**Step 4: Adopt Vite for build tooling.**

```bash
npm create vite@latest frontend -- --template vanilla-ts
```

Configure `vite.config.ts` to:
- Output to `dist/` for S3 deployment
- Add content-hash to filenames for CDN cache busting
- Strip comments and minify in production

**Step 5: Convert to TypeScript (recommended).**

Alpine 3 is fully compatible with TypeScript. Type the API response shapes in `frontend/src/api/types.ts` to match the backend Pydantic models. This catches shape mismatches at compile time rather than at runtime on Fahad's dashboard.

**Step 6: Add unit tests with Vitest.**

```typescript
// frontend/src/components/compass.test.ts
import { describe, it, expect } from 'vitest';
import { calculateCompass } from './compass';

describe('calculateCompass', () => {
  it('returns 100 for a perfect week', () => {
    expect(calculateCompass({ velocity: 100, craft: 100, reliability: 100, drive: 100 })).toBe(100);
  });
  it('handles zero scores', () => {
    expect(calculateCompass({ velocity: 0, craft: 0, reliability: 0, drive: 0 })).toBe(0);
  });
});
```

**Step 7: Add end-to-end tests with Playwright.**

```typescript
// e2e/login.spec.ts
test('login with valid TOTP code and see dashboard', async ({ page }) => {
  await page.goto('https://devdash.phonebot.co.uk');
  await page.fill('[name=email]', 'faizan@phonebot.com.au');
  await page.fill('[name=code]', getTotpCode(testSecret));
  await page.click('button[type=submit]');
  await expect(page).toHaveURL('/');
  await expect(page.locator('h1')).toContainText('devdash');
});
```

---

## 4. API Spec

All endpoints are Lambda function URLs routed through the Cloudflare Worker. The Worker handles auth cookie validation and passes `X-User-Email` and `X-User-Role` headers to Lambda. All requests/responses are `application/json` unless noted. All paths below require a valid `devdash_session` cookie except `/auth/*`.

### Auth

| Method | Path | Auth | Request | Response | Errors |
|--------|------|------|---------|----------|--------|
| `POST` | `/auth/login` | None | `{email, totp_code}` | `{role, display_name}` + sets `devdash_session` cookie | 401 invalid credentials |
| `POST` | `/auth/logout` | Required | — | `204` + clears cookie | — |

**Login response:**
```json
{ "role": "dev", "display_name": "Faizan" }
```

### Users (self-service absence)

| Method | Path | Auth | Request | Response | Errors |
|--------|------|------|---------|----------|--------|
| `PUT` | `/users/me/absence` | Required | `{type: "leave"\|"sick"\|"training"\|"other", until: "YYYY-MM-DD", note?: string}` | `{absence: {...}}` | 400 invalid type; 400 `until` in the past |
| `DELETE` | `/users/me/absence` | Required | — | `{absence: null}` | — |

`markSelfAbsent` / `clearSelfAbsence` in the prototype write directly to the user record. The audit script must read `users[].absence` so an absent dev is excluded from merit comparisons for that week rather than scored as a zero.

### Config

| Method | Path | Auth | Request | Response | Errors |
|--------|------|------|---------|----------|--------|
| `GET` | `/config` | Required | — | Full config JSON (projects, users, scoring, rewards, system) + `schema_version` | 403 if role-filtered fields requested |
| `PUT` | `/config` | CEO/PM only | Partial config JSON | `{updated: true, version: N}` | 403 if not CEO/PM; 409 version conflict |
| `PATCH` | `/config` | CEO/PM only | `{path: "dot.notation", value, version}` batched as `{changes: [...]}` | `{updated: true, version: N+1}` | 409 version conflict |

**Auto-save behaviour (important):** the prototype uses `$watch('config', ..., {deep: true})` to write to localStorage on every keystroke. In production this maps to `PATCH /config` with a **250ms debounce** and batched changes — **never per-field writes**. A dev typing a sentence would otherwise fire 50 round-trips and burn the 409 version field.

**Schema migration:** the prototype's `migrateConfig(defaults)` runs on init and fills in missing fields from the defaults. In production, `GET /config` must return a top-level `schema_version` integer. The client should refuse to boot (or auto-migrate client-side) on a mismatch. Server-side forward migration is preferred so old clients can't corrupt newer data.

### Projects

| Method | Path | Auth | Request | Response | Errors |
|--------|------|------|---------|----------|--------|
| `GET` | `/projects` | Required | — | Array of project metadata (role-filtered) | — |
| `GET` | `/projects/:id` | Required | — | Project detail + knowledge card + active items + `scope_in`, `scope_out`, `phases[]`, `readiness[]`, `risks[]`, `links[]` | 404 project not found; 403 role insufficient |
| `PUT` | `/projects/:id` | CEO/PM | `{status, deadline, traffic_light, scope_in?, scope_out?, phases?, readiness?, risks?, links?, version}` | `{updated: true, version: N+1}` | 409 version conflict |
| `PATCH` | `/projects/:id/readiness/:idx` | CEO/PM | `{checked: bool}` | `{updated: true}` | 404 index out of range; 409 version conflict |
| `PUT` | `/projects/:id/contributors` | CEO/PM | `{email, action: "add"\|"remove"}` | `{contributors: [...]}` | 404 user not found; 403 |
| `POST` | `/projects/:id/uploads` | Required | `multipart/form-data` with `.md`/`.txt` file + `upload_type` | `{s3_key, uploaded_at}` | 400 invalid type; 413 file too large (max 500KB) |

Notes:
- `PATCH /projects/:id/readiness/:idx` is the fast path for the inline checklist toggle in the project detail modal (prototype method: `toggleReadinessItem`). Keep it cheap — it fires on every click.
- `addPhase`, `removePhase`, `addReadinessItem`, `removeReadinessItem`, `addLink`, `removeLink` in the prototype all funnel into one `PUT /projects/:id` with the full new arrays. Do not create one endpoint per list operation — the UI already diffs locally.
- `openProjectDetail(id)` is pure client (opens the modal, no network call). Do not add a server endpoint for it.
- `devForProject(dev, projectId)` is a placeholder that synthesises a per-project compass from the aggregate one. Replace with a real calc using project-tagged commits during M3. Suggested endpoint: `GET /merit/:email/by-project/:project_id?week=YYYY-Www`.

### Bugs

| Method | Path | Auth | Request | Response | Errors |
|--------|------|------|---------|----------|--------|
| `POST` | `/bugs` | Required | `{project_id, title, description, severity, device?, browser?, url?, reproducible?: bool, steps?, expected_actual?, file_url?}` | `{id, created_at}` | 400 missing required fields |
| `PUT` | `/bugs/:id` | CEO/PM | `{status, assignee, resolution_note?}` | `{updated: true}` | 404; 403 role |

The extra environmental fields (`device`, `browser`, `url`, `reproducible`, `steps`, `expected_actual`) landed in the prototype's bug form on 2026-04-24. Store them alongside the bug record — they are optional but reduce the PM round-trip.

### Audits

| Method | Path | Auth | Request | Response | Errors |
|--------|------|------|---------|----------|--------|
| `POST` | `/audits` | QA Auditor | `{project_id, content_md, week}` | `{s3_key, created_at}` | 403 role; 409 duplicate for same week |
| `POST` | `/audit-findings` | QA Auditor | `{project_id, category: "security"\|"perf"\|"a11y"\|"ux"\|"code-quality"\|"other", severity: "P0"\|"P1"\|"P2"\|"P3", title, description, assigned_to, cc?: [email], metrics?: {...category-specific}}` | `{id, created_at}` | 400 invalid enum; 403 role |
| `PUT` | `/audit-findings/:id` | QA Auditor / CEO | `{status, resolution_note?}` | `{updated: true}` | 404; 403 |

**Category-specific metric fields** (validated server-side):
- `security` — `cve_id?`, `owasp_category?`, `exploitability: "low"\|"medium"\|"high"`
- `perf` — `lcp_ms?`, `cls?`, `inp_ms?`, `bundle_kb?`
- `a11y` — `wcag_criterion?`, `impact: "minor"\|"moderate"\|"serious"\|"critical"`
- `ux` — `friction_score?: 1..5`, `screens_affected?: int`
- `code-quality` — `file_path?`, `complexity?`, `duplication_pct?`
- `other` — freeform `metrics` object, no validation

### Features

| Method | Path | Auth | Request | Response | Errors |
|--------|------|------|---------|----------|--------|
| `POST` | `/features` | Any | `{project_id, title, description, urgency}` | `{id, created_at}` | 400 missing fields |

### Off-project work

| Method | Path | Auth | Request | Response | Errors |
|--------|------|------|---------|----------|--------|
| `POST` | `/off-project` | Dev | `{project_id, description, hours, date}` | `{id, created_at}` | 400 invalid hours; 403 not dev |

### Clock

| Method | Path | Auth | Request | Response | Errors |
|--------|------|------|---------|----------|--------|
| `POST` | `/clock` | Dev | `{action: "in"\|"out", project_id, timestamp?}` | `{clocked_at, action}` | 409 already clocked in/out; 403 not dev |

### Disputes

| Method | Path | Auth | Request | Response | Errors |
|--------|------|------|---------|----------|--------|
| `POST` | `/disputes` | Dev | `{merit_week, reason, evidence_md}` | `{id, created_at, status: "open"}` | 400 missing fields |

### Context

| Method | Path | Auth | Request | Response | Errors |
|--------|------|------|---------|----------|--------|
| `GET` | `/context/:project_id` | CEO/PM/Auditor | `?level=default\|extended\|full` | `{knowledge_card, open_items, recent_handoffs, token_estimate}` | 403 dev role |
| `POST` | `/context/load-more/:project_id` | CEO/PM | `{options: [...], confirmed: bool}` | If `confirmed=false`: `{preview, token_estimate}`. If `confirmed=true`: expanded context payload | 400 unknown option |

**Context levels:**
- `default` — knowledge card + open items + this week's handoffs (~5,000 tokens)
- `extended` — default + last 4 weeks handoffs + closed items 30d
- `full` — extended + all QA audits + all prompt-response history (show token warning)

### Snapshots (time-machine)

| Method | Path | Auth | Request | Response | Errors |
|--------|------|------|---------|----------|--------|
| `GET` | `/snapshots/:project_id/:date` | CEO/PM | — | Full weekly snapshot JSON for that date | 404 no snapshot; 403 |

### Audit log

| Method | Path | Auth | Request | Response | Errors |
|--------|------|------|---------|----------|--------|
| `GET` | `/audit-log` | CEO only | `?limit=50&cursor=...` | `{events: [...], next_cursor}` | 403 |

---

## 5. Database Schema

Single DynamoDB table: `devdash`. All data is in one table to avoid cross-table transactions and keep operational overhead low.

**Access patterns it serves:**
- Load all open items for a project (config pull, weekly audit)
- Get a dev's merit history for N weeks
- Get a dev's clock records for a day/week
- Session lookup by token (sub-millisecond)
- List active notifications

### Key patterns

| PK | SK | Description |
|----|-----|-------------|
| `PROJECT#{id}` | `META` | Project metadata (name, status, deadline, traffic light, owner, version, `scope_in`, `scope_out`, `phases[]`, `readiness[]`, `risks[]`, `links[]`, `contributors[]`) |
| `PROJECT#{id}` | `SCOPE` | Large free-text fields (`scope_in`, `scope_out`) **split out** if they exceed ~8 KB — see tiering note below |
| `PROJECT#{id}` | `KNOWLEDGE_CARD` | Current 500-word knowledge card text + `generated_at` |
| `PROJECT#{id}` | `ITEM#{item-id}` | Individual work item |
| `DEV#{email}` | `PROFILE` | User record incl. `absence {type, until, note}` |
| `DEV#{email}` | `MERIT#{YYYY-Www}` | Weekly merit score record |
| `DEV#{email}` | `CLOCK#{YYYY-MM-DD}` | Clock in/out for a day |
| `DEV#{email}` | `HANDOFF#{YYYY-MM-DD}` | S3 key pointer to handoff file (not full content) |
| `SESSION#{token}` | `DATA` | Session record with TTL |
| `BUG#{id}` | `DATA` | Bug record incl. `device`, `browser`, `url`, `reproducible`, `steps`, `expected_actual` |
| `AUDITFINDING#{id}` | `DATA` | Audit finding incl. `category`, `severity`, `assigned_to`, `cc[]`, `metrics{}` |
| `NOTIFICATION#{id}` | `DATA` | Queued notification with TTL |
| `GLOBAL` | `CONFIG#v{N}` | Config version history. Top-level record carries `schema_version` |
| `GLOBAL` | `REWARDS` | Rewards config incl. `currency` (PKR default; supports PKR/AUD/USD/GBP/EUR/INR/AED) |
| `GLOBAL` | `AUDIT_LOG#{timestamp}` | Config change event |

### Storage tiering for large text

DynamoDB items are capped at 400 KB and every read charges by item size. Large free-text fields from the prototype (`scope_in`, `scope_out`, individual `risks[].description`, long `readiness[].note`) can blow past that or just make the `PROJECT#META` read expensive for every project-list call.

Rules of thumb:

| Field size | Where it lives |
|------------|----------------|
| Under 1 KB | Inline on `PROJECT#META` |
| 1–8 KB | Split to `PROJECT#{id}` / `SCOPE` so `META` stays lean for list views |
| Over 8 KB or any attachment | `s3://devdash-data/projects/{id}/scope/{field}.md`, with just the S3 key on the DynamoDB item |

The same pattern applies to `bugs[].steps` + `bugs[].expected_actual` when a user pastes a long repro — store in S3 if the combined body exceeds 8 KB.

### GSIs

**GSI1: ByProject**
- GSI PK: `project_id`
- GSI SK: `created_at`
- Covers: list all bugs for a project, list all feature requests, list all uploads by project

**GSI2: ByWeek**
- GSI PK: `week` (e.g., `2026-W17`)
- GSI SK: `pk`
- Covers: load all merit scores for a given week (CEO wants to see full team grid at once)

### Example items

```json
// Project metadata
{
  "pk": "PROJECT#phonebot-2",
  "sk": "META",
  "name": "Phonebot 2.0",
  "status": "active",
  "deadline": "2026-07-30",
  "traffic_light": "green",
  "owner_email": "fahad@phonebot.com.au",
  "percent_complete": 44,
  "items_closed": 27,
  "items_total": 61,
  "scope_in": "OpenCart 1.0 parity: catalog, checkout, order history, admin",
  "scope_out": "Mobile app, subscription billing, loyalty",
  "phases": [
    {"name": "Parity", "status": "in_progress", "due": "2026-06-15"},
    {"name": "Launch", "status": "blocked", "due": "2026-07-30"}
  ],
  "readiness": [
    {"label": "SSL live", "checked": true},
    {"label": "SES warmed", "checked": false}
  ],
  "risks": [
    {"title": "Legacy DB migration", "severity": "P1", "owner": "faisal@phonebot.com.au"}
  ],
  "links": [
    {"label": "Staging", "url": "https://staging.phonebot.co.uk"}
  ],
  "contributors": ["faizan@phonebot.com.au", "faisal@phonebot.com.au"],
  "version": 3,
  "updated_at": "2026-04-24T10:00:00Z"
}

// User profile with absence
{
  "pk": "DEV#faizan@phonebot.com.au",
  "sk": "PROFILE",
  "display_name": "Faizan",
  "role": "dev",
  "absence": {
    "type": "leave",
    "until": "2026-04-29",
    "note": "Eid holiday"
  },
  "updated_at": "2026-04-24T09:12:00Z"
}

// Work item
{
  "pk": "PROJECT#phonebot-2",
  "sk": "ITEM#pb2-item-034",
  "title": "Customer portal — order history view",
  "status": "open",
  "assignee": "faisal@phonebot.com.au",
  "priority": "P1",
  "created_at": "2026-03-15T08:00:00Z",
  "closed_at": null,
  "ttl": 1748649600,
  "project_id": "phonebot-2",
  "week": "2026-W17"
}

// Dev merit record
{
  "pk": "DEV#faizan@phonebot.com.au",
  "sk": "MERIT#2026-W17",
  "score": 82,
  "tier": "Solid",
  "compass": {
    "velocity": 85,
    "craft": 78,
    "reliability": 90,
    "drive": 75
  },
  "signal_breakdown_s3_key": "projects/phonebot-2/merit-history/2026-W17/faizan@phonebot.com.au.json",
  "override": false,
  "generated_at": "2026-04-20T23:00:00Z",
  "week": "2026-W17",
  "project_id": "phonebot-2"
}

// Session
{
  "pk": "SESSION#a3f9c2...",
  "sk": "DATA",
  "email": "faizan@phonebot.com.au",
  "role": "dev",
  "created_at": 1745529600,
  "ttl": 1745616000
}
```

### Why single-table

At this scale (8 users, 5 projects, weekly audit cadence), multi-table DynamoDB adds operational overhead for essentially zero benefit. Every access pattern above fits cleanly into PK/SK or a GSI. Single-table keeps costs near zero (DynamoDB on-demand, under $1/month at this volume) and means one CDK resource to manage.

---

## 6. Authentication Flow

> **Reminder — decorative login in the prototype.** `tryLogin()` in `devdash.html` (~L1494) accepts any 6-digit code and sets the local session flag. That code path exists to demo the UX; it is not security. Everything below is the **production** flow that must be live before the dashboard sees a public hostname. Do not serve the raw HTML from S3/CloudFront without the Worker in front.

**First visit (user not logged in):**

1. Browser hits `devdash.phonebot.co.uk`. Cloudflare Worker intercepts.
2. Worker checks for `devdash_session` cookie. Not present → serve login HTML form.
3. User enters email and 6-digit code from Google Authenticator.
4. Form `POST`s to `/login`.

**Backend login (Worker → Lambda or Worker direct):**

The current prototype handles auth in the Cloudflare Worker directly (see `worker/src/routes.ts`). The production path for the backend API uses Lambda, but the Worker remains the auth gate for dashboard HTML delivery.

1. Worker reads `user:{email}` from KV. If not found → `"Login failed."` (no detail, by design).
2. Worker retrieves `totp_secret_encrypted` from the user record.
3. Worker calls `decryptSecret(totp_secret_encrypted, env.TOTP_ENCRYPTION_KEY)` using Web Crypto AES-GCM.
4. Worker calls `verifyTotp(code, secret)` via `otplib`. Window of ±1 step (±30 seconds) to tolerate clock drift.
5. On success: `createSession(kv, email, role)` generates a 32-byte hex token, stores `{email, role, created_at}` in KV with 24h TTL.
6. Response: `302 /` with `Set-Cookie: devdash_session=<token>; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`.

**Subsequent requests:**

1. Worker reads `devdash_session` cookie.
2. Calls `getSession(kv, token)`. If missing or expired → redirect to login.
3. Fetches `dashboard:latest:{role}` (or `dashboard:latest:dev:{email}` for dev-scoped views) from KV.
4. Returns cached HTML. No Lambda call needed for reads — this is what makes the dashboard fast.

**Logout:**

1. `GET /logout`.
2. Worker calls `deleteSession(kv, token)` — removes from KV immediately.
3. Sets `Max-Age=0` on the cookie to clear it from browser.
4. Redirects to `/`.

**TOTP reset (CEO triggers):**

1. Fahad opens Settings → Users → selects user → "Reset authenticator".
2. `POST /admin/provision-user` with `{email, regenerate: true}`.
3. Lambda generates new TOTP secret via `pyotp.random_base32()`.
4. Encrypts with `encrypt_secret(secret, key)` from `shared/totp.py`.
5. Updates user record in DynamoDB and KV.
6. Returns new QR code as base64 PNG.
7. Fahad sends QR code to the affected dev out of band (WhatsApp, email).

**Auto-QR flow (prototype's `pendingQrEmail`):** the prototype keeps `pendingQrEmail` in transient client state and renders a QR via a CDN library. In production, the QR must be generated **server-side** in Lambda from the AES-GCM encrypted secret in DynamoDB and returned as a base64 PNG. The plaintext secret must never cross the wire. Client-side should only hold the `pendingQrEmail` long enough to render the returned PNG, then clear it.

---

## 7. TOTP Secret Encryption

The format is defined in `scripts/dashboard/totp_provision.py` and must be consistent across Python and TypeScript. Both sides are already implemented — do not change the format.

**Wire format:** `base64url(nonce || ciphertext_with_GCM_tag)`

- Nonce: 12 bytes, random per encryption
- Key: 32 bytes AES-256 (base64-standard encoded when stored in Secrets Manager / Wrangler secrets)
- Algorithm: AES-GCM, no additional authenticated data (AAD is `None`/`null`)

**Python (encryption):**
```python
# shared/totp.py — matches totp_provision.py exactly
import base64, os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

def encrypt_secret(secret: str, key: bytes) -> str:
    nonce = os.urandom(12)
    ct = AESGCM(key).encrypt(nonce, secret.encode("utf-8"), None)
    return base64.urlsafe_b64encode(nonce + ct).decode("ascii")

def decrypt_secret(encrypted: str, key: bytes) -> str:
    raw = base64.urlsafe_b64decode(encrypted)
    return AESGCM(key).decrypt(raw[:12], raw[12:], None).decode("utf-8")
```

**TypeScript (decryption, Worker — already built in `worker/src/totp.ts`):**
```typescript
export async function decryptSecret(encrypted: string, keyB64: string): Promise<string> {
  const keyBytes = Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0));
  const b64 = encrypted.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '==='.slice((b64.length + 3) % 4);
  const raw = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, cryptoKey, raw.slice(12));
  return new TextDecoder().decode(pt);
}
```

**Key management:**
- The 32-byte key is generated once: `python3 -c "import os, base64; print(base64.b64encode(os.urandom(32)).decode())"`
- Stored in AWS Secrets Manager as `devdash/totp-encryption-key`
- Stored in Cloudflare as a Wrangler secret: `wrangler secret put TOTP_ENCRYPTION_KEY`
- Never in environment variables, never in code, never in `.env` files
- Lambda retrieves it at cold start via `boto3.client('secretsmanager').get_secret_value(...)`

**TOTP verification:**

Python backend uses `pyotp`:
```python
import pyotp

def verify_totp(code: str, secret: str) -> bool:
    totp = pyotp.TOTP(secret)
    return totp.verify(code, valid_window=1)  # ±30 second tolerance
```

Cloudflare Worker uses `otplib` with matching settings (step=30, digits=6, window=1). Both are compatible with Google Authenticator's TOTP implementation (RFC 6238).

---

## 8. Weekly Audit Script

**How it runs:** Fahad invokes `/weekly-audit` inside a Claude Code session. This is not a cron job and does not call the Anthropic API directly — it runs inside Fahad's Claude Max session. Claude reads the `weekly-audit/main.py` script and executes it as a tool call.

**What it does:**

1. For each project in `dashboard.config.yaml`:
   a. Calls `context_builder.build_audit_context(project_id, ...)` to assemble the default context load (knowledge card + open items + this week's handoffs/uploads/QA findings). See `context-strategy.md` for exact token budgets.
   b. Invokes the Claude audit using the system prompt from `weekly-audit/prompts/audit_system.md`.
   c. If the audit result includes `needs_history: true`, calls `context_builder.fetch_on_demand(...)` with the flagged keywords, then re-runs the audit with expanded context.
   d. Runs per-dev merit scoring using `weekly-audit/prompts/merit_scoring.md`.
   e. Regenerates the knowledge card using `weekly-audit/prompts/card_update.md`.
   f. Writes the snapshot JSON to S3 (`projects/{id}/snapshots/{date}.json`).
   g. Writes the new knowledge card to S3 and DynamoDB.
   h. Writes merit scores to DynamoDB.

2. Generates role-appropriate HTML payloads (CEO view, PM view, dev-specific views).
3. Writes each payload to Cloudflare KV (`dashboard:latest:{role}`, `dashboard:latest:dev:{email}`).
4. Writes `alerts:latest` to KV for the Worker's daily cron to pick up and email to Fahad.

**Testing locally with sample data:**

```bash
cd weekly-audit/

# Generate sample data
python main.py --dry-run --project phonebot-2 --sample-data

# Run against LocalStack (real DynamoDB + S3, no Claude call)
STAGE=local python main.py --project phonebot-2 --skip-claude

# Run with a real Claude session (requires ANTHROPIC_API_KEY or Claude Code context)
python main.py --project phonebot-2
```

The `--sample-data` flag seeds the project with one week of synthetic handoffs, commits, and QA findings drawn from `tests/fixtures/`. The `--skip-claude` flag replaces all Claude calls with fixture JSON responses — useful for testing the storage pipeline without burning Claude quota.

Reference `context-strategy.md` for the full load strategy, cache invalidation rules, and token budget tables.

---

## 9. Testing Strategy

> **High-risk gap — no tests exist for the Alpine logic in `devdash.html` today.** Every scoring calc, role filter, schema migration, and auto-save path in the prototype was hand-tested in the browser. Before you extract components in Step 2 of the migration, pin the current behaviour with characterisation tests (Vitest + JSDOM). Otherwise the port will silently change numbers that Fahad has already anchored on.

### Unit tests (Python, pytest)

One test per happy path and one per failure mode for every handler. Run against in-memory mocks, not LocalStack.

```bash
cd backend/
pip install -r requirements-dev.txt
pytest tests/ -v --cov=handlers --cov-report=term-missing
# Target: 80% coverage on handlers/ and shared/
```

Example structure:
```python
# tests/test_auth.py
class TestLogin:
    def test_valid_totp_issues_session_cookie(self, mock_db, valid_totp):
        ...
    def test_invalid_totp_returns_401(self, mock_db):
        ...
    def test_unknown_email_returns_401_not_404(self, mock_db):
        # Security: do not reveal whether the email exists
        ...
    def test_expired_session_redirects_to_login(self, mock_db, expired_session):
        ...
```

### Integration tests (LocalStack)

Test the full request path: HTTP → Lambda handler → DynamoDB/S3 → response.

```bash
localstack start -d
pytest tests/integration/ -v -m localstack
```

Key integration scenarios:
- Full login → session → authenticated request → logout cycle
- Upload a file → verify it lands at the correct S3 key
- Submit a bug → retrieve it via `GET /bugs` → verify role filtering

### End-to-end tests (Playwright)

Run against the deployed staging environment. Requires a test user with a known TOTP secret.

```bash
cd frontend/
npx playwright test
```

Core scenarios:
- Login with valid TOTP → see dashboard → logout
- Dev submits a bug → PM sees it in PM view
- CEO changes a project deadline → version conflict if done concurrently
- Stale session → redirect to login without data leak

### Characterisation tests (frontend, Vitest + JSDOM)

Before the prototype is refactored, pin today's behaviour:

- `migrateConfig(defaults)` — given a stale config missing the new fields (`scope_in`, `phases`, `readiness`, `absence`, `currency`, `category`, `severity`, `device`, `browser`, etc.), returns a config with all fields filled from defaults and no data lost.
- Compass calculation — lock the current output for a known input set. These are the numbers devs are already disputing about; changing them silently will erode trust.
- Role visibility (`VISIBILITY` matrix) — for each role, assert which tabs and which peer data are visible. Regression here is the role-leakage blocker.
- Auto-save debounce — 50 rapid `config` edits produce exactly one batched `PATCH /config` call after 250 ms.
- `pmSummaryHtml()` XSS regression — a `displayName` containing `<script>` renders escaped, not executed.

### Snapshot tests

The weekly audit produces a JSON snapshot. Verify that snapshot structure does not regress:

```python
# tests/test_audit_snapshot.py
def test_snapshot_has_required_keys(sample_audit_output):
    required = {"project_id", "week", "merit_scores", "knowledge_card", "open_items", "generated_at"}
    assert required <= set(sample_audit_output.keys())
```

### Load tests (optional)

Simulate 100 bug submissions per week and verify DynamoDB capacity stays on-demand without throttling. Use `locust` or `k6`. Only needed before launch if Fahad expands to 10+ projects.

### TDD discipline

For all scoring-related code (compass calculation, merit tier thresholds, reliability math), write the test first. These are the values that devs will dispute — the calculation must be deterministic and documented in tests.

**Coverage targets:** 80% for `backend/`, 60% for `frontend/src/`. The scoring modules (compass, merit tiers, reliability) should hit 95% — those are the numbers devs dispute.

---

## 10. Coding Conventions

**Python:**
- Version: 3.11+
- Formatter: Black (`black .`)
- Import sorter: isort (`isort .`)
- Type hints everywhere — all function signatures, all dataclass fields
- No bare `except:` — always catch specific exceptions
- Lambda handlers follow the pattern: `def handler(event: dict, context: Any) -> dict`
- Shared utilities in `backend/shared/` — no handler imports another handler

**JavaScript/TypeScript:**
- Formatter: Prettier (`npx prettier --write .`)
- Linter: ESLint with `@typescript-eslint`
- Named exports preferred over default exports (easier to grep)
- No `any` type unless unavoidable — use `unknown` + narrowing
- Alpine.js components use `Alpine.data('name', () => ({...}))` pattern

**Commit messages (Conventional Commits):**

```
feat: add bug dispute endpoint
fix: clock-in race condition on rapid double-click
docs: update API spec with /disputes endpoint
refactor: extract DynamoDB helpers to shared/db.py
test: add integration test for login flow
chore: update pyotp to 2.9.0
```

**PR process:**
- 1 reviewer required (Fahad or Imran)
- CI must be green (lint + tests)
- No PRs exceeding 400 lines without prior discussion
- File size limit: 500 lines — split if exceeded

**Secrets discipline:**
- No secrets in code, `.env` files, or commit history
- All secrets go in AWS Secrets Manager or Wrangler secrets
- Rotate the `TOTP_ENCRYPTION_KEY` annually (requires re-encrypting all TOTP secrets — build a migration script)

---

## 11. CI/CD

### On every push

```yaml
# .github/workflows/ci.yml
on: [push, pull_request]
jobs:
  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.11" }
      - run: pip install -r backend/requirements-dev.txt
      - run: black --check backend/
      - run: isort --check-only backend/
      - run: pytest backend/tests/ -v --cov=handlers
  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - run: cd frontend && npm ci
      - run: cd frontend && npm run lint
      - run: cd frontend && npm run test
      - run: cd frontend && npm run build
```

### On git tag (deploy)

```yaml
# .github/workflows/deploy.yml
on:
  push:
    tags: ['v*']
jobs:
  deploy-backend:
    steps:
      - run: cd infra && cdk deploy --require-approval never
  deploy-frontend:
    needs: deploy-backend
    steps:
      - run: cd frontend && npm run build
      - run: aws s3 sync dist/ s3://devdash-static/ --delete
      - run: aws cloudfront create-invalidation --distribution-id $CF_ID --paths "/*"
  deploy-worker:
    steps:
      - run: cd worker && wrangler deploy
```

### Branch protection

Main branch requires a passing PR. No direct push. Tag-based deploys only. Protect `main` with:
- Require PR review (1 reviewer)
- Require status checks to pass
- No force push

---

## 12. What the Prototype Does NOT Have (Production Must)

These are the concrete gaps between what you can demo today and what ships to the team.

| Prototype behaviour | Production requirement |
|---|---|
| Any 6-digit code logs you in (`tryLogin()`, ~L1494) | Real TOTP verification via `pyotp.verify()` with ±1 window |
| Role filter is client-side (`VISIBILITY` matrix, Settings tab, peer dev compass) — devtools bypass is trivial | Role filtering enforced in Lambda for every read and write; client filter kept only as a UX hint |
| `pmSummaryHtml()` uses `x-html` with interpolated `displayName` → stored XSS | Sanitise with DOMPurify or switch to `x-text`; server-side template rendering for the digest email |
| `worker/wrangler.toml` has `<FILL_AFTER_KV_CREATE>` placeholder | Real KV namespace id filled in during `cdk deploy` / `wrangler kv:namespace create` |
| localStorage as database | DynamoDB + S3 as defined in `data-architecture.md` |
| Per-field localStorage writes on every config change (`$watch` deep) | 250 ms debounced `PATCH /config` with batched changes |
| No `schema_version` on config | Server returns `schema_version`; migration handled server-side on write |
| Hardcoded compass scores (mock data) | Real compass calculation from dev handoff signals, commit data, and weekly audit scoring |
| `devForProject()` synthesises per-project compass client-side | Real per-project merit calc using project-tagged commits; `GET /merit/:email/by-project/:project_id` |
| No git integration | Git blame for bug attribution; commit-to-item matching in weekly audit |
| Mock regression items in QA view | Keyword-search on `items/closed.json` via S3 Select before flagging a regression |
| No email sending | SES digest to Fahad via Cloudflare Worker cron (daily) + audit completion alert |
| No knowledge cards | Weekly Claude call per project to regenerate 500-word knowledge card |
| No audit trail | CloudTrail on all S3 + DynamoDB operations; `GLOBAL` audit log in DynamoDB |
| Config edits lost on page reload | `PATCH /config` writes to DynamoDB with version locking |
| No user management | `POST /admin/provision-user` generates TOTP secret + QR code; disable/enable accounts |
| QR code is a static placeholder | Real provisioning via `totp_provision.py` — generates per-user secret + real QR |
| `pendingQrEmail` holds a client-generated QR | Server-side QR generation in Lambda from encrypted TOTP secret; plaintext never leaves Lambda |
| No absence state | `PUT /users/me/absence` + `absence {type, until, note}` on user record; audit excludes absent devs |
| Rewards currency fixed | `rewards.currency` (PKR/AUD/USD/GBP/EUR/INR/AED); store ISO code on the `GLOBAL#REWARDS` item |
| No audit-finding categories | `auditFindings[]` carries `category`, `severity`, `assigned_to`, `cc[]`, category-specific `metrics{}` |
| No bug environment fields | `bugs[]` carries `device`, `browser`, `url`, `reproducible`, `steps`, `expected_actual` |
| Inline edit mode in project detail modal assumes no conflicts | Optimistic updates with `If-Match: version`; on 409, show merge dialog |
| Density / theme / collapsed-sections — localStorage preferences | Keep as localStorage-only; do not round-trip to server |

---

## 13. Effort Estimate

All estimates assume a solo senior developer who has read the existing docs and prototype before starting. Re-read the codebase before committing to client-facing timelines. The schema + skills update on 2026-04-24 added roughly **4–5 days** of backend work (new endpoints, tiered scope storage, absence handling, category-specific audit findings, per-project merit calc, debounced config PATCH, server-side QR). The revised total is **~5 weeks**, not 4.

| Milestone | Work | Duration |
|-----------|------|----------|
| **M0** | Characterisation tests for the Alpine prototype (compass calc, role visibility, schema migration, auto-save debounce, XSS guard). Pins current behaviour before anything moves. | **2–3 days** |
| **M1** | Vite build setup, CSS extraction, Alpine component split, backend auth (real TOTP + server-side QR), session management, `GET /config` with `schema_version`, debounced `PATCH /config`, basic project endpoints, LocalStack dev environment working | **2 weeks** |
| **M2** | All CRUD endpoints (bugs with env fields, uploads, audits, audit-findings with categories + metrics, features, off-project, clock, disputes, absence, contributors, readiness toggle, scope tiering to S3), DynamoDB single-table schema live, role-based filtering enforced **server-side**, XSS fix in digest renderer, integration tests passing | **1.5 weeks** |
| **M3** | Weekly audit script wired to real storage, context_builder pulling from DynamoDB/S3, knowledge card generation working, merit scoring writing to DynamoDB (including real per-project merit from project-tagged commits), absence-aware merit, snapshot JSON written to S3 | **1 week** |
| **M4** | SES email digest, Cloudflare Worker KV payloads written after audit, `wrangler.toml` KV id filled, CDK stack deploying to AWS, GitHub Actions CI/CD pipeline live, staging environment accessible | **3–4 days** |
| **M5** | Playwright e2e tests on staging, load test, production deploy, onboarding Fahad + team to real TOTP, documentation updates | **3–4 days** |
| **Total** | | **~5 weeks** |

The riskiest milestone is M3 — the weekly audit script touches the most moving parts (Claude sessions, DynamoDB, S3, KV writes, per-project merit calc). Build M2 first and make sure the storage layer is solid before wiring Claude into it. Do not skip M0: refactoring without a regression net is how the compass scores will quietly shift under Fahad and the team.

---

## 14. Onboarding Task List

Work through these in order during your first week. They are sequenced to give you real understanding before you write real code.

1. **Read the three core docs.** `data-architecture.md`, `context-strategy.md`, `dashboard.config.yaml`. Understand the storage tiers, the token budget logic, and the config structure before touching code.

2. **Run the prototype.** Open `devdash.html` in a browser. Log in as each role (Fahad, Imran, Faizan, Mustafa). Understand what each view shows and what data each form submits. This is the UX contract.

3. **Audit the Worker codebase.** Read `worker/src/` end to end. The auth flow, session management, TOTP decryption, and email dispatch are already built. Do not re-implement them in Lambda — Lambda is for data ops, the Worker is for auth and HTML delivery.

4. **Run the Python scripts.** `cd scripts/dashboard && python smoke_test.py`. Understand what `totp_provision.py`, `render.py`, and `config.py` do. These are the foundation for the `weekly-audit/` scripts.

5. **Set up LocalStack.** Follow the instructions in Section 1. Run `awslocal dynamodb list-tables` and confirm it returns an empty list. You need this working before writing any Lambda code.

6. **Write the DynamoDB table with CDK.** This is your first real task. Create `infra/lib/devdash-stack.ts` with the table definition from Section 5. Add the two GSIs. Deploy locally. Verify with `awslocal dynamodb describe-table --table-name devdash`.

7. **Implement `POST /auth/login` as a Lambda.** This is the most important endpoint. Write the handler, write the test (`test_valid_totp_issues_session_cookie`, `test_invalid_totp_returns_401`, `test_unknown_email_returns_401_not_404`). All three must pass before you move on.

8. **Implement `GET /config`.** Hard-code the response shape to match `dashboard.config.yaml`. Wire the frontend prototype to fetch from this endpoint instead of reading from the bundled config object.

9. **Implement the uploads endpoint.** `POST /projects/:id/uploads` — multipart form, write to S3 at the correct key path from `data-architecture.md`. Write the integration test: upload a file, verify it appears at `s3://devdash-data/projects/{id}/uploads/{role}/{file}`.

10. **Implement the bug submission flow end-to-end.** `POST /bugs` → DynamoDB write → `GET /projects/:id` returns the bug in the bug list → role filtering (dev cannot see another dev's merit score). This is the most common daily action on the dashboard.

11. **Wire the context endpoint.** `GET /context/:project_id?level=default`. It should return the knowledge card from DynamoDB + open items from DynamoDB + this week's handoff S3 keys. Do not load file content — just pointers. Verify the `token_estimate` field is populated.

12. **Write a dry-run of the weekly audit script.** `python weekly-audit/main.py --dry-run --project phonebot-2 --skip-claude`. It should read from LocalStack, assemble the context, print what it would have sent to Claude, and write a placeholder snapshot. No Claude calls needed at this stage.

13. **Deploy backend to AWS staging.** Run `cdk deploy` against a real AWS account (dev stage). Confirm Lambda function URLs are live, DynamoDB table exists, S3 buckets exist with correct lifecycle rules.

14. **Run the full auth flow against staging.** Provision a test user with `totp_provision.py`. Scan the QR code in Google Authenticator. Log in at the staging URL with a real TOTP code. Confirm you land on the correct role view.

15. **Run Playwright e2e tests.** Confirm login, bug submission, and PM view all pass. Fix whatever breaks. These tests are your regression guard for all future changes.

---

*Questions about this doc: reach Fahad directly. Do not ask about requirements not covered here — make a reasonable call and note it in your first PR description.*
