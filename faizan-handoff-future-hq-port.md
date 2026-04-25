# Faizan handoff — devdash wiring into Phonebot HQ

**Audience:** Faizan (Next.js + Postgres, owner of Phonebot HQ)
**Purpose:** Give you everything you need to turn the Alpine.js prototype (`devdash.html`) into a real, wired-up module inside Phonebot HQ.
**Written:** 2026-04-24
**Time estimate:** 10–14 working days solo, or 1 sprint with a second dev helping.

---

## Part 1 — What you're inheriting

### What exists today

| Thing | Status | Where |
|---|---|---|
| Alpine.js prototype UI | Works, all user-entered data persists to localStorage | `dev dashboard/devdash.html` (~2800 lines) |
| Python engine (git reader, handoff parser, merit scoring, forecast math, renderer) | Working. 53/53 pytest tests pass. Smoke test outputs 8 role-specific HTML files. | `dev dashboard/scripts/dashboard/*.py` |
| Cloudflare Worker scaffold (TOTP login, KV routing) | Coded, not deployed. Will NOT be used in HQ path. | `dev dashboard/worker/` — **ignore for HQ integration** |
| Python tests | 53 pass | `dev dashboard/tests/dashboard/` |
| 3 Claude Code skills | `/devdash-daily`, `/devdash-audit`, `/devdash-git-sync` | `~/.claude/skills/devdash-*/` |
| Documentation | architecture, scope, ops, security, user guides, CHANGELOG | `dev dashboard/*.md` |

### What's NOT wired yet

Everything the dashboard *reads* is still hardcoded mock data in `devdash.html`:

- `devMockData` — per-dev compass scores, commits, queue, off-project notes, handoff_mult
- `stuckPrs`, `regressionCandidates`, `blockers` — initial seeds only
- `percent_complete`, `days_remaining`, `days_of_work_required`, `forecast_launch` per project

Everything the dashboard *accepts from users* DOES persist correctly to localStorage:
- bugs, auditFindings, featureRequests, disputes, pmAssessments, blockers (after first save), stuckPrs (after first save), regressionCandidates (after first save), clockEntries, config

In the HQ port, localStorage → Postgres tables. The mock data → pipeline-produced data.

### What's known broken / risky

From the QA audit + today's sandbox run:

1. `tryLogin()` accepts any 6-digit code. **Decorative auth.** In HQ port: gone entirely — HQ's staff auth gates the route.
2. Role-leakage: `VISIBILITY` matrix + Settings tab + peer compass data gated client-side. **Fix:** every API endpoint server-gates by role.
3. XSS risk in `pmSummaryHtml()` — uses `x-html` and interpolates user-supplied `displayName`. **Fix:** in the React port, this is a `<PMSummary />` component with typed props and JSX escaping.
4. `wrangler.toml` placeholder. **Moot** — no Cloudflare in HQ path.
5. Zero tests for `devdash.html` Alpine logic. **Fix:** React components get component tests (Playwright or Vitest+RTL, whichever HQ uses).
6. No `schema_version` on config. **Fix:** migration table with version column on Postgres.
7. Merit scoring not pinned by test. **Fix:** before refactoring merit logic, write characterisation tests that lock current scoring to current outputs.

---

## Part 2 — Target architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  Phonebot HQ (Next.js + Postgres, existing)                          │
│                                                                      │
│  apps/devdash/                                                       │
│    ├── app/devdash/[view]/page.tsx   React UI (ported from Alpine)   │
│    ├── app/api/devdash/*             Next.js API routes              │
│    └── components/                   CEOView, PMView, DevView, etc.  │
│                                                                      │
│  HQ Postgres:                                                        │
│    devdash_projects, devdash_users, devdash_bugs, devdash_audits,    │
│    devdash_blockers, devdash_features, devdash_disputes,             │
│    devdash_config, devdash_audit_log, devdash_clock_entries,         │
│    devdash_compass_snapshots                                         │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
              ↑                                     ↑
              │                                     │
              │ writes weekly scores                │ writes daily commits
              │                                     │
┌─────────────────────────────┐       ┌─────────────────────────────────┐
│  Python audit worker        │       │  Git sync worker                │
│  (cron, daily/weekly)       │       │  (Bitbucket webhook + 06:00     │
│  /devdash-audit skill runs  │       │  fallback cron)                 │
│  scripts/dashboard/*.py     │       │  scripts/dashboard/git_sync.py  │
└─────────────────────────────┘       └─────────────────────────────────┘
              ↑                                     ↑
              │ reads handoff notes                 │ pulls commits
              │                                     │
       daily-handoff.md                       Bitbucket repos
                                              (all 5 projects)
```

The frontend is **dumb**. It reads from Postgres via Next.js API routes. Nothing in the frontend computes scoring or reads git.

Python engine is **authoritative**. Runs on a schedule, writes facts to Postgres, never serves traffic.

---

## Part 3 — Step-by-step build plan

### Step 0 — Characterisation tests (BEFORE any refactor) · 0.5 day

Don't start the port until you lock current merit/compass behaviour. If you refactor and the numbers silently drift, Fahad stops trusting the system.

```bash
cd "dev dashboard"
python3 -m pytest tests/dashboard/ -q
# 53 tests should pass — record the exact compass output for one or two devs
# as a snapshot test, not just "doesn't crash" tests.
```

**Add a new test file `tests/dashboard/test_merit_pinned.py`:**
- Load the same synthetic data the smoke test uses.
- Run merit + forecast.
- Assert exact compass dicts for each dev.
- Assert exact `traffic_light` + `days_of_work_required` for each project.
- These are the "if these numbers change, that's a breaking change" tests.

**Acceptance:** 5+ pinned tests passing. Run them after every merit / forecast change for the rest of the project.

---

### Step 1 — Postgres schema + migration harness · 1 day

**Location in HQ:** wherever HQ keeps migrations (Drizzle? Prisma? raw SQL?). Follow existing convention.

**Tables to create** (prefix `devdash_` so they don't collide with HQ tables):

```sql
-- Schema version control
CREATE TABLE devdash_schema_version (
  version INT PRIMARY KEY,
  applied_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users are a projection of HQ staff — link by email
CREATE TABLE devdash_users (
  email TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ceo','pm','dev','qa','qa_auditor')),
  hours_per_week INT DEFAULT 40,
  status TEXT DEFAULT 'active',
  absence_type TEXT DEFAULT 'none',
  absence_until DATE,
  absence_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Projects
CREATE TABLE devdash_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_email TEXT REFERENCES devdash_users(email),
  contributor_emails TEXT[] DEFAULT '{}',
  kickoff DATE,
  deadline DATE,
  status TEXT DEFAULT 'active',
  sync_cadence TEXT DEFAULT 'weekly',
  repos TEXT[] DEFAULT '{}',
  traffic_light TEXT DEFAULT 'green',
  percent_complete INT DEFAULT 0,
  days_remaining INT DEFAULT 0,
  days_of_work_required INT DEFAULT 0,
  forecast_launch TEXT,
  summary TEXT,
  scope_in TEXT,
  scope_out TEXT,
  phases JSONB DEFAULT '[]',
  readiness JSONB DEFAULT '[]',
  risks JSONB DEFAULT '[]',
  links JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bugs (QA-submitted)
CREATE TABLE devdash_bugs (
  id BIGSERIAL PRIMARY KEY,
  summary TEXT NOT NULL,
  severity TEXT NOT NULL,
  project TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  days_open INT DEFAULT 0,
  assigned_to TEXT,
  details TEXT,
  device TEXT,
  browser TEXT,
  url TEXT,
  reproducible TEXT,
  steps TEXT,
  expected_actual TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit findings (QA Auditor)
CREATE TABLE devdash_audits (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  project TEXT NOT NULL,
  findings TEXT,
  category TEXT NOT NULL,
  severity TEXT DEFAULT 'medium',
  days_ago INT DEFAULT 0,
  action_items INT DEFAULT 1,
  status TEXT DEFAULT 'open',
  assigned_to TEXT,
  cc TEXT[] DEFAULT '{}',
  url TEXT, metric TEXT, actual TEXT, target TEXT,
  device TEXT, viewport TEXT, browser TEXT,
  file TEXT, issue_type TEXT, lines TEXT,
  owasp TEXT, risk TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Blockers (CEO decision debt)
CREATE TABLE devdash_blockers (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  waiting_on TEXT,
  project TEXT,
  days INT DEFAULT 0,
  status TEXT DEFAULT 'open',
  resolved_at DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Feature requests (CEO/PM → dev)
CREATE TABLE devdash_features (
  id BIGSERIAL PRIMARY KEY,
  description TEXT NOT NULL,
  urgency TEXT DEFAULT 'medium',
  project TEXT NOT NULL,
  requester TEXT,
  target_dev TEXT,
  age_days INT DEFAULT 0,
  status TEXT, -- accepted / declined / question / done
  eta TEXT,
  accepted_at DATE, declined_at DATE, completed_at DATE,
  thread JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Disputes (dev disputing attribution)
CREATE TABLE devdash_disputes (
  id BIGSERIAL PRIMARY KEY,
  dev TEXT,
  "when" TEXT,
  type TEXT,
  item_id BIGINT,
  item_label TEXT,
  reason TEXT,
  status TEXT DEFAULT 'open',
  resolved_at DATE,
  resolved_by TEXT,
  reassigned_from TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Config (singleton row)
CREATE TABLE devdash_config (
  id INT PRIMARY KEY DEFAULT 1,
  scoring JSONB NOT NULL,
  rewards JSONB NOT NULL,
  system JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (id = 1)
);

-- Audit log (append-only, for Settings change history)
CREATE TABLE devdash_audit_log (
  id BIGSERIAL PRIMARY KEY,
  "when" TIMESTAMPTZ DEFAULT NOW(),
  who TEXT,
  section TEXT,
  change TEXT
);

-- Clock entries (dev clock-in/out)
CREATE TABLE devdash_clock_entries (
  id BIGSERIAL PRIMARY KEY,
  email TEXT REFERENCES devdash_users(email),
  date DATE NOT NULL,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  UNIQUE(email, date)
);

-- Weekly compass snapshots (for history, trends, week-over-week delta)
CREATE TABLE devdash_compass_snapshots (
  id BIGSERIAL PRIMARY KEY,
  email TEXT REFERENCES devdash_users(email),
  week_start DATE NOT NULL,
  velocity INT, craft INT, reliability INT, drive INT,
  handoff_mult NUMERIC(4,3),
  items_closed INT, target INT,
  off_project_hours INT,
  summary TEXT,
  UNIQUE(email, week_start)
);

-- Git commits (written by git_sync.py)
CREATE TABLE devdash_commits (
  sha TEXT PRIMARY KEY,
  project TEXT NOT NULL,
  author_email TEXT,
  author_name TEXT,
  message TEXT,
  committed_at TIMESTAMPTZ NOT NULL,
  audited BOOLEAN DEFAULT FALSE,
  audited_by TEXT,
  audited_at TIMESTAMPTZ
);

INSERT INTO devdash_schema_version (version) VALUES (1);
```

Seed data migration: port the current `config.users`, `config.projects`, and the 8 users + 5 projects from `devdash.html:~2065` through `~2196`.

**Acceptance:** migrations run clean on a fresh Postgres + one on a branch of HQ's existing dev DB. `SELECT * FROM devdash_projects` returns 5 rows.

---

### Step 2 — Next.js API routes (the contract the frontend reads) · 2 days

Create under `app/api/devdash/`. Each route gates on HQ's existing staff session + the role-visibility matrix.

**Minimum route set for MVP:**

| Method | Route | Body / Response |
|---|---|---|
| `GET` | `/api/devdash/config` | full config object |
| `PATCH` | `/api/devdash/config` | partial update, debounced 500ms client-side |
| `GET` | `/api/devdash/projects` | all projects |
| `GET` | `/api/devdash/projects/:id` | one project with scope/phases/etc |
| `PUT` | `/api/devdash/projects/:id` | full update |
| `PATCH` | `/api/devdash/projects/:id/readiness/:idx` | `{done: true}` |
| `PUT` | `/api/devdash/projects/:id/contributors` | `{emails: [...]}` |
| `GET` | `/api/devdash/users` | all users |
| `PUT` | `/api/devdash/users/me/absence` | `{type, until, note}` |
| `DELETE` | `/api/devdash/users/me/absence` | clear |
| `GET` | `/api/devdash/devs?week=2026-W17&project=pb2` | dev list w/ compass scoped to project+week |
| `POST` | `/api/devdash/bugs` | new bug (returns id) |
| `PUT` | `/api/devdash/bugs/:id` | update (status, severity, assigned_to) |
| `DELETE` | `/api/devdash/bugs/:id` | delete |
| `POST` | `/api/devdash/audits` | new audit finding |
| `PUT` | `/api/devdash/audits/:id` | update status |
| `GET` | `/api/devdash/blockers` | all open |
| `POST` | `/api/devdash/blockers` | new |
| `PATCH` | `/api/devdash/blockers/:id` | resolve/dismiss |
| `GET` | `/api/devdash/features?target=<email>` | feature requests for a dev |
| `POST` | `/api/devdash/features` | new (CEO/PM only) |
| `PATCH` | `/api/devdash/features/:id/action` | `{action: accept|decline|question|eta|done, text}` |
| `GET` | `/api/devdash/disputes` | all |
| `PATCH` | `/api/devdash/disputes/:id/resolve` | `{outcome: accepted|rejected|reassigned, new_dev?}` |

**Role-visibility matrix** — gate every GET server-side:

```ts
const VIS: Record<Role, Tab[]> = {
  ceo: ['ceo','pm','dev','qa','qa_auditor','settings'],
  pm: ['pm','dev','qa','qa_auditor','settings'],
  dev: ['dev','qa','qa_auditor'],
  qa: ['dev','qa','qa_auditor'],
  qa_auditor: ['dev','qa','qa_auditor'],
};
```

**Acceptance:** Curl every endpoint with a non-CEO session cookie — settings-level endpoints return 403. Bugs can be POSTed by QA but `GET /api/devdash/users?admin=true` is CEO-only.

---

### Step 3 — Port Alpine state → React + shared hooks · 3 days

Don't port component-by-component. Port **state first**, then wrap components around it.

**a) TypeScript types** (1 file, ~200 lines): `apps/devdash/types/devdash.ts`
Mirror the shapes you just put in Postgres. One `interface` per table. `Compass`, `Project`, `ReadinessItem`, `Phase`, `AuditFinding`, `Bug`, `Blocker`, `FeatureRequest`, `Dispute`, `User`.

**b) React Query hooks** (or whichever fetch lib HQ uses): `apps/devdash/hooks/`
- `useConfig()` — GET + PATCH with 500ms debounce (replaces `$watch('config', deep: true)`)
- `useProjects()`, `useProject(id)`
- `useDevs({ project?, week? })` — replaces `devs` + `devForProject` + `sortedDevsForPm`
- `useBugs({ status?, severity? })`
- `useAudits({ category?, status? })`
- `useBlockers()`, `useFeatures({ target? })`, `useDisputes()`

**c) Pure logic** (copy verbatim from Alpine, drop in `apps/devdash/lib/`):
- `scoring.ts` — `strongDirections`, `hitTrueNorth` (Alpine method → pure fn)
- `rewards.ts` — `rewardHeadline`, `rewardDetail`, `teamPoolProgress`
- `coaching.ts` — `compassCoaching`, `handoffCoaching`
- `formatting.ts` — `formatMoney`, `currencySym`, `absenceIcon`

These are pure → copy the function bodies from `devdash.html`, wrap in TS, done.

**Acceptance:** unit tests for each logic file pass. Hooks return the same shapes as the Alpine getters did.

---

### Step 4 — React component port · 4 days

Port in this order (top = easiest, bottom = most dependencies):

1. **`Nav.tsx`** (top bar, clock, theme, density, sign-out) — 30 min
2. **`GreetingBar.tsx`** + **`RetroMascot.tsx`** — 2 hr (SVG + CSS is portable; logic 50 lines)
3. **`DecisionsModal.tsx`** — 2 hr
4. **`ProjectDetailModal.tsx`** — 4 hr (most complex modal, inline edit)
5. **`CEOView.tsx`** — composes: Portfolio grid, Callouts (Standout / Off-project / Decision debt), 4 stat tiles, Absent callout. Consumes the above.
6. **`PMView.tsx`** — Monday briefing, Projects grid, Dev cards with mini-compass, Bug queue, Stuck PRs + Regressions, Disputes.
7. **`DevView.tsx`** — Header, Compass SVG, direction bars + coaching, Rewards panel, Commits + Queue, Feature requests (accept/decline/thread), Bugs on your code.
8. **`QAView.tsx`** — Bug form + bug list with inline controls.
9. **`QAAuditorView.tsx`** — Category-specific finding form + TO/CC + findings list.
10. **`SettingsView.tsx`** — Projects / Users / Scoring / Rewards / System / Audit log tabs.

**Theme system:** copy the CSS variables block verbatim into a single `devdash.css` or Tailwind config. The `.theme-dark / .theme-light / .theme-cream` + `.density-comfortable / .density-compact` pattern is CSS-only and portable.

**Auth integration:** HQ already has a session hook. Wrap every view in:

```tsx
export default async function DevdashPage() {
  const session = await getStaffSession();
  if (!session) redirect('/login');
  const role = await getDevdashRole(session.email);
  return <DevdashApp role={role} email={session.email} />;
}
```

`getDevdashRole` reads `devdash_users.role` by email.

**Acceptance:** Playwright smoke test logs in as each of the 5 roles, walks the visible tabs, submits one bug + one audit, reads one project detail modal, asserts no console errors.

---

### Step 5 — Python engine → writes to Postgres · 2 days

The Python scripts currently read config + git + handoffs and write HTML. We need to change the **sink**: instead of writing HTML, write to Postgres.

**New file `scripts/dashboard/db_writer.py`:**

```python
import psycopg
from typing import Any

def write_compass_snapshot(conn, email, week_start, compass, handoff_mult, items_closed, target, off_project_hours, summary):
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO devdash_compass_snapshots
            (email, week_start, velocity, craft, reliability, drive, handoff_mult, items_closed, target, off_project_hours, summary)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (email, week_start) DO UPDATE SET
              velocity = EXCLUDED.velocity, craft = EXCLUDED.craft, reliability = EXCLUDED.reliability,
              drive = EXCLUDED.drive, handoff_mult = EXCLUDED.handoff_mult,
              items_closed = EXCLUDED.items_closed, target = EXCLUDED.target,
              off_project_hours = EXCLUDED.off_project_hours, summary = EXCLUDED.summary
        """, (email, week_start, compass['velocity'], compass['craft'],
              compass['reliability'], compass['drive'], handoff_mult,
              items_closed, target, off_project_hours, summary))
    conn.commit()

def write_project_forecast(conn, project_id, traffic_light, percent_complete, days_remaining, days_of_work_required, forecast_launch):
    # similar upsert …
    pass

def write_commits_batch(conn, commits):
    # bulk insert with ON CONFLICT (sha) DO NOTHING
    pass
```

**Modify `smoke_test.py` → `weekly_audit.py`:**
- Load config from Postgres (not YAML).
- Run git_reader, handoff_parser, matcher, merit as before.
- Instead of `render.build_role_html`, call `db_writer.write_compass_snapshot` per dev, `write_project_forecast` per project.
- Delete the HTML rendering path (or keep as debug-only flag).

**Cron entry:**
```
0 6 * * 1-5  /usr/bin/python3 /opt/devdash/scripts/dashboard/weekly_audit.py daily >> /var/log/devdash/audit.log 2>&1
0 6 * * 1    /usr/bin/python3 /opt/devdash/scripts/dashboard/weekly_audit.py weekly >> /var/log/devdash/audit.log 2>&1
```

**Acceptance:** run weekly_audit.py against a test DB. Confirm `SELECT velocity FROM devdash_compass_snapshots WHERE email = 'faizan@…' AND week_start = '2026-04-21'` returns a real number (not NULL, not 0).

---

### Step 6 — Git sync · 1 day

Implement `scripts/dashboard/git_sync.py` per the `/devdash-git-sync` skill spec (`~/.claude/skills/devdash-git-sync/SKILL.md`).

- Walks `projects[].repos` from Postgres.
- Per repo: `git -C <path> fetch --all && git log --since="yesterday" --pretty=format:'%H|%an|%ae|%at|%s'`.
- Writes to `devdash_commits` table (ON CONFLICT DO NOTHING so it's idempotent).
- Bitbucket webhook alternative: Next.js API route `/api/devdash/webhook/bitbucket` with HMAC verification, same write path.

**Acceptance:** webhook + cron both write to `devdash_commits`. Duplicate SHAs don't duplicate rows.

---

### Step 7 — Replace `devMockData` in frontend · 1 day

In the React port, `useDevs()` hook calls `/api/devdash/devs?week=<current>` instead of reading the hardcoded JS const. The API:

1. Reads config.users + config.projects.
2. Joins `devdash_compass_snapshots` at current week, `devdash_commits` for commit list, `devdash_users.absence`.
3. Returns the shape the Alpine code used (same field names) so components don't need to change.

**Acceptance:** dev view shows real commits for Faizan from last week, real compass scores from the audit run, real queue from handoff OPEN parsing.

---

### Step 8 — Migrate user-entered data from localStorage · 0.5 day

Anyone who used the Alpine prototype has data in browser localStorage. On first load of the new HQ-hosted version, offer a one-time import:

```tsx
// Only runs if user has devdash_bugs in localStorage
if (localStorage.getItem('devdash_bugs')) {
  await fetch('/api/devdash/import-legacy', { method: 'POST', body: JSON.stringify({
    bugs: JSON.parse(localStorage.getItem('devdash_bugs')),
    auditFindings: JSON.parse(localStorage.getItem('devdash_auditFindings')),
    // ... etc
  })});
  localStorage.removeItem('devdash_bugs');
  // ... etc
}
```

**Acceptance:** Fahad's browser reports "12 bugs imported, 8 audits imported" on first load. LocalStorage keys are deleted so it doesn't reimport.

---

### Step 9 — Observability · 0.5 day

Reuse HQ's existing observability stack. Add:
- Log every API route with user + role + status.
- Alert on weekly_audit.py failure (cron exits non-zero, MailChannels email Fahad).
- Dashboard: `SELECT COUNT(*), MAX(week_start) FROM devdash_compass_snapshots` surfaced as a health tile in HQ's admin.

**Acceptance:** a failed cron run pages Fahad within 10 minutes.

---

## Part 4 — Checklist for go-live

- [ ] Step 0 pinned tests committed
- [ ] Schema migrated, seed data in staging DB
- [ ] All API routes respond with correct 2xx/4xx per role
- [ ] All React views render with real Postgres data (no mock imports)
- [ ] Playwright smoke test passes for all 5 roles
- [ ] Python engine cron running + writing snapshots
- [ ] Git sync running + populating commits table
- [ ] Legacy localStorage import works for Fahad's browser
- [ ] Blockers closed: decorative-login gone, role-leakage server-gated, XSS via `x-html` impossible (React auto-escapes), schema_version in place
- [ ] Audit log populating on every config change
- [ ] Observability alert wired

Sign-off: Fahad + Imran.

---

## Part 5 — Known gotchas

- **Per-project compass is currently synthetic** (deterministic hash of email+project). Once real data is in Postgres, replace `devForProject()` logic with a query: `SELECT * FROM devdash_compass_snapshots WHERE email = ? AND week_start = ? AND project_id = ?` and compute project-scoped directly from per-project commit activity.
- **`handoff_mult` is not yet applied to compass scores** — the Settings → Scoring → handoff_multiplier min/max values are currently decorative. If you want to fix this in the port, apply it in `merit.py` before writing to `devdash_compass_snapshots`.
- **Mascot + retro effects** are CSS-only and port cleanly to React. The `teamMood()` computation moves into a hook.
- **Time zone** — `config.system.timezone` is `Australia/Melbourne`. All cron jobs assume server is in Melbourne time. If HQ hosts in another region, translate on input, not display.
- **PKR formatting** — `formatMoney` expects amounts > 100000 render as `1.8L` (lakhs), > 1000 as `35k`. Keep this logic; Pakistan audience expects lakhs formatting.
- **Absent-user handling in compass** — if `devdash_users.absence_type != 'none'`, the compass calculation should skip scoring that week OR flag as "insufficient data". Don't penalize a dev on vacation.

---

## Part 6 — Open questions for Fahad

Answer these before starting, to prevent rework:

1. **Which week starts the data series?** Monday 2026-04-21 as baseline, or wait until a fresh Monday after launch?
2. **Handoff multiplier semantics** — should scores be shown PRE-multiplier (raw) or POST-multiplier (final) in the bars? Currently shown raw + multiplier displayed separately in compass centre.
3. **Currency** — default PKR for the team in Pakistan, but if Fahad wants CEO view in AUD for board reporting, do we dual-track or always PKR?
4. **Compass history retention** — keep all weekly snapshots forever, or roll up to monthly after 6 months?
5. **Off-project hours** — log as individual entries OR single weekly aggregate? Currently it's a running single number per week which loses detail.
6. **Role leaks** — should PM see dev compass numbers raw, or only the chip / shape? Design doc says "shapes only for peers"; not yet enforced server-side.
7. **Integration with existing HQ "staff" table** — share the users row by email foreign-key, or keep devdash_users as a duplicate with last_sync'd_at to staff? Faster port if duplicate; cleaner if FK.

---

## Part 7 — What NOT to do

- Don't port the Cloudflare Worker. Cut it. HQ is the host.
- Don't port the TOTP provisioning flow. HQ auth replaces it.
- Don't port the 200+ existing `devMockData` lines. Delete them during the port.
- Don't "modernise" the Compass math. It's passing pytest + Fahad trusts it. Refactor AFTER step 0 pinned tests.
- Don't change field names during the port. `per_direction_aud` stays that literal name in Postgres even though amounts are in PKR — the suffix is legacy, renaming during a port creates merge conflicts with no benefit.
- Don't build tests last. Add Playwright smoke as you port each view, not in a batch at the end.

---

## Part 8 — Effort sheet (TWO OPTIONS)

Fahad has asked for this in **1–2 days max**. Below is both a comfortable plan (17 days) and a compressed plan (2 days) so the tradeoffs are explicit.

### Option A — Compressed 2-day sprint (Fahad's target)

**Day 1 (10–12h focused work) — data plane**
| Hour | Task |
|---|---|
| 0–1 | Schema + migration (Part 3 Step 1) — paste the DDL into HQ migrations, run |
| 1–2 | Seed users + projects from `devdash.html:~2065-2196` — one SQL INSERT file |
| 2–4 | Next.js API routes: just the 10 most critical — `GET /config`, `GET /projects`, `GET /devs`, `GET /bugs`, `POST /bugs`, `PUT /bugs/:id`, `GET /audits`, `POST /audits`, `GET /features`, `PATCH /features/:id/action` |
| 4–5 | Role gating middleware (one file, VIS matrix) |
| 5–7 | TypeScript types + hooks for the 10 routes above |
| 7–10 | CEO + PM views ported (skip all modals first pass; modals on Day 2) |
| 10–12 | Wire CEO + PM to real API; smoke-test in browser |

**Day 2 (10–12h focused work) — views + engine**
| Hour | Task |
|---|---|
| 0–3 | Dev + QA + QA Auditor views ported |
| 3–5 | Settings view (Projects + Users tabs only first pass; Scoring/Rewards/System later) |
| 5–7 | Project detail modal + Decisions modal + Auto-QR modal |
| 7–9 | Python `db_writer.py` — write compass snapshots to Postgres; point `weekly_audit.py` at real repos |
| 9–10 | Git sync cron + one Bitbucket webhook |
| 10–11 | Legacy localStorage import (one-time on first visit) |
| 11–12 | Manual smoke test as all 5 roles in dev; hand to Fahad |

**Total: ~22 focused hours.** Doable by one strong Next.js dev in two 12-hour days OR two devs pair-working for one 10-hour day.

### Option B — Comfortable 17-day plan (for reference)

| Phase | Days |
|---|---|
| 0 · Characterisation tests | 0.5 |
| 1 · Postgres schema | 1 |
| 2 · API routes (full set, 23 endpoints) | 2 |
| 3 · Types + hooks + pure logic | 3 |
| 4 · React component port (all 10 components + modals) | 4 |
| 5 · Python → Postgres sink | 2 |
| 6 · Git sync | 1 |
| 7 · Replace mock data | 1 |
| 8 · Legacy localStorage import | 0.5 |
| 9 · Observability + alerts | 0.5 |
| Buffer | 2–3 |
| **Total** | **~17–18 days solo, ~10 days with a second dev** |

---

## Part 8.5 — What the 2-day sprint sacrifices (read before committing)

If you pick Option A, these are the things you're NOT doing on Day 1–2. Each becomes a follow-up ticket.

**Cut on purpose (do in week 2):**
- ❌ **Step 0 pinned merit/compass tests.** *Risk:* refactors can silently drift scoring; Fahad loses trust if numbers change without an announcement. *Mitigation:* add them on Day 3 before any merit/forecast edit.
- ❌ **Playwright smoke tests for all 5 roles.** *Risk:* regressions on future PRs. *Mitigation:* manual smoke by Fahad on Day 2, Playwright in week 2.
- ❌ **Observability + cron failure alerts.** *Risk:* audit cron silently fails and nobody knows for a week. *Mitigation:* tail the log manually Day 1–7, add alerting week 2.
- ❌ **Full API surface (23 endpoints).** Shipping 10 first; the other 13 (disputes resolve, blockers CRUD, contributors PUT, readiness PATCH, absence PUT, etc.) are Day 3.
- ❌ **Scoring + Rewards + System Settings tabs** (complex configuration UIs). Projects + Users tabs only in the 2-day version.
- ❌ **Retro pixel-mascot + CRT ticker.** Visual flair, zero business value in the port. Skip.
- ❌ **Theme cycling (dark/light/cream) + density toggle.** Default to one theme for MVP; preferences come later.
- ❌ **Per-project compass mini-cards on PM view with individual radars.** Use the flat list + direction chips only; the radar SVGs are a Day 3–4 nice-to-have.
- ❌ **Feature request thread replay + ETA prompts.** Ship accept/decline only; questions + thread in week 2.
- ❌ **Dispute reassign + resolved-tail list.** Ship accept/reject only; reassign week 2.
- ❌ **Project detail modal inline editing.** Read-only modal Day 1–2; edit mode week 2.

**Must ship Day 1–2 (not negotiable):**
- ✅ Postgres schema + seed
- ✅ Staff auth gating + role visibility
- ✅ CEO + PM + Dev + QA + QA Auditor views readable (no crashes per role)
- ✅ Bug + audit submission ends-to-end (write flow)
- ✅ Legacy localStorage import (so Fahad keeps his existing bugs/audits)
- ✅ Python audit + git sync writing to Postgres
- ✅ No decorative login (real HQ session gate)

### Recommended: two-dev sprint

If Faizan pairs with ONE other Next.js dev for ONE 10-hour day:
- Dev A: data plane (schema + API + hooks + Python sink) — 5 hours
- Dev B: React component port (5 views + 2 modals) — 5 hours
- Last 2 hours: integration, smoke-test together

This fits **1 day** and ships MVP. Second day is buffer + legacy import + critical Day 1 bugs. More realistic than one person doing 22 focused hours in 2 days.

### Recommended cut sequence (if time slips mid-sprint)

If Day 1 runs over, drop in this order (keep value, shed risk):
1. First: drop retro mascot + CRT ticker
2. Drop theme + density toggle
3. Drop per-project mini-radars on PM
4. Drop Settings tabs except Projects + Users
5. Drop Project detail modal edit mode (read-only OK)
6. Drop feature request threading
7. LAST resort: drop one of Dev / QA / QA Auditor views and ship role-gates stub

Stop at step 3 if possible. Steps 6–7 mean the core reward loop is hurt.

---

---

## Part 9 — After go-live (phase 2 inputs, not for first sprint)

These came out of the role-persona research (CEO / PM / Dev / QA / QA Auditor personas of a 5x-bigger Pakistan e-commerce company). Full findings in `qa-sandbox-run/persona-*.md`. Highlights:

**CEO (Baazaar) wants:**
- Monday CEO one-pager strip: GMV + runway + features-shipped-to-prod + decisions-on-me with WoW arrows.
- Cost-per-squad / cost-per-feature in PKR (defend burn to the board).
- Dev flight-risk / attrition signal (Pakistan-specific: top devs get poached every 6 months).

**PM (Baazaar) wants:**
- 9:45am push to WhatsApp/Slack: today's absences + top slipping PR + top decision waiting on me.
- "What changed since I last opened this" diff view.
- Per-squad grouping (owns 2 of 4 squads, not 16 flat cards).

**(Dev / QA / QA Auditor persona findings pending — will append when agents finish)**

---

Good luck. File questions in this doc or ping Fahad directly. The prototype HTML stays at `dev dashboard/devdash.html` as reference during the port — don't delete it until HQ module is green in staging.
