# devdash — Data Architecture

**Owner:** Fahad (CEO, Phonebot)
**Domain:** devdash.phonebot.co.uk
**Infrastructure:** AWS (S3, Lambda, DynamoDB, SES) + existing Cloudflare Worker for auth/HTML delivery
**Date written:** 2026-04-24
**Last updated:** 2026-04-24 evening (synced with `devdash.html` after rewards/payouts, growth-log, persisted audit-log, dispute-propagation, feature-request-thread, and bug-field-persist additions; bugs I01 + I02 fixed)
**Status:** Design — awaiting Fahad sign-off on open decisions (Section 12)

---

## Why this document exists

The existing dashboard is a single Alpine.js HTML file backed by localStorage. That works for one person on one browser. It breaks the moment a second person uploads something, a device gets cleared, or 60 days of data accumulates. This document describes how data moves from staff uploads → stored records → Claude's audit context → HTML payloads — and how the system stays fast and cheap as the team grows from 8 people on day 0 to potentially 10+ projects two years from now.

The core problem is token economics, not storage. AWS will hold 10,000 files for almost nothing. The expensive question is: what fraction of those files does Claude actually need to read each week? This architecture answers that question with a tiered system where Claude almost always reads a 500-word summary card, not the raw history.

---

## 1. Storage Tiers

Three tiers based on age. Data moves automatically between them via S3 Lifecycle rules.

### Hot — DynamoDB, 0–14 days

**What lives here:** Active work items, current sprint status, clock-in/clock-out records, merit scores for the current and previous week, project-level metadata (name, status, owner, deadline, traffic light), latest knowledge card text per project, notification queue.

**Why DynamoDB:** Single-digit millisecond reads. The dashboard needs to load fast. DynamoDB on-demand pricing means you pay nothing between runs. At this team size you will not spend more than $1/month on DynamoDB.

**What moves out:** After 14 days, DynamoDB TTL deletes records. The S3 Warm layer already has the archived copy by then (see ingestion flow in Section 7).

**Rough cost:** $0.25 per million reads, $1.25 per million writes. At 8 users checking in daily, you will never hit 1 million reads in a month. Effective cost: **under $1/month**.

---

### Warm — S3 Standard-IA, 15–90 days

**What lives here:** Handoff MDs archived per day, QA finding reports, QA audit submissions, feature request files, prompt-response pairs, project snapshots (the JSON the weekly audit produces), week-summary markdown files (one per project per week), merit history per dev per week.

**S3 Standard-IA pricing:** $0.0125/GB/month. If every person uploads 100KB per day for 90 days, that is 8 people × 100KB × 90 days = ~72MB. Cost: **under $0.01/month**. Even with snapshots, qa audits, and full prompt-response pairs attached, you will be under 500MB warm storage for the first year. Monthly cost: **under $1/month**.

**Retrieval cost:** $0.01 per GB retrieved. Retrieving a full project's 90-day warm archive is cheap (a few MBs at most).

---

### Cold — S3 Glacier Deep Archive, 90+ days

**What lives here:** Everything older than 90 days, automatically transitioned by an S3 Lifecycle rule. Raw handoffs, old snapshots, old QA reports, prompt-response archives.

**Glacier Deep Archive pricing:** $0.00099/GB/month. Essentially free. Retrieval takes 12 hours (standard) or up to 48 hours (bulk). You only pull from here for quarterly reviews or if a dev disputes an old merit score.

**Retrieval cost:** $0.02 per GB (standard). A quarterly review pulling one project's 13-week summaries (not raw files, just the summaries — see Section 4) costs fractions of a cent.

**Effective cold storage bill for year one:** **under $0.50/month**.

---

### Total estimated AWS cost

| Service | Monthly estimate |
|---|---|
| DynamoDB (on-demand) | $0.50 |
| S3 Standard-IA (Warm) | $0.80 |
| S3 Glacier Deep Archive (Cold) | $0.20 |
| Lambda (audit trigger, summarizer) | $0.50 |
| SES (email alerts) | $0.10 |
| KMS (encryption key operations) | $0.30 |
| CloudTrail | $1.00 |
| Data transfer | $0.50 |
| **Total** | **~$4/month** |

Well under the $20/month target. The budget ceiling is reached only if you scale to 10+ projects with daily heavy uploads and run the weekly audit multiple times per week.

The April 24 schema additions (`scope_in`, `scope_out`, `phases`, `readiness`, `risks`, `links`, `absence`, `currency`) add roughly 1–3 KB per project and a few bytes per user. At current team + project count that is under 30 KB total — a rounding error against the Warm-tier estimate above. No cost retune needed.

The April 24 **evening** additions (rewardEvents, payoutBatches, growthLog, persisted auditLog, persisted regressionCandidates, dispute-propagation fields on bugs/audits, feature-request thread, reward-policy config) add roughly one row per payout decision per dev per week plus one row per payout batch per month. At 6 devs × 4 directions × ~52 weeks that is ~1,250 rewardEvents per year, ~50 KB. Audit log grows fastest — every Settings save, every payout, every reward regen writes a line — budget ~5 KB/month steady state. Still a rounding error against Warm.

---

## 2. Per-Project Data Structure

### 2a. Current Alpine.js schema (authoritative today)

Today the dashboard is a single Alpine.js SPA (`devdash.html`). As of 2026-04-24 evening it reads/writes **fourteen** localStorage keys on every `save(key)` call and on init:

```
devdash_config              ← projects[], users[], scoring, rewards, system
devdash_bugs                ← bugs[]
devdash_auditFindings       ← auditFindings[]
devdash_featureRequests     ← featureRequests[]
devdash_clockEntries        ← clockEntries{}  (keyed by YYYY-MM-DD)
devdash_blockers            ← blockers[]
devdash_stuckPrs            ← stuckPrs[]
devdash_disputes            ← disputes[]
devdash_pmAssessments       ← pmAssessments[]
devdash_growthLog           ← growthLog{}      (NEW, evening ship)
devdash_rewardEvents        ← rewardEvents[]   (NEW, evening ship)
devdash_payoutBatches       ← payoutBatches[]  (NEW, evening ship)
devdash_regressionCandidates← regressionCandidates[]  (FIXED: now loaded on init — bug I01)
devdash_auditLog            ← auditLog[]       (FIXED: now persisted — bug I02)
```

Plus three ambient keys outside that list: `devdash_theme`, `devdash_density`, `devdash_session`, and the per-email provisioning flags `devdash_provisioned_<email>`.

The AWS backing store described below (§2b–§2c) must mirror all fourteen shapes. Any field added here without a corresponding DynamoDB/S3 path will silently fail to persist after migration.

**`config.projects[]` — one entry per project**

```jsonc
{
  "id": "p-phonebot-2",
  "name": "Phonebot 2.0",
  "owner_email": "faizan@phonebot.com.au",
  "contributor_emails": ["…"],
  "kickoff": "YYYY-MM-DD",
  "deadline": "YYYY-MM-DD",
  "status": "active",
  "sync_cadence": "weekly",
  "repos": ["pb-backend", "pb-frontend"],
  "traffic_light": "green|amber|red",
  "percent_complete": 0,
  "days_remaining": 0,
  "days_of_work_required": 0,
  "forecast_launch": "—",
  "summary": "one-line description",

  // ── April 24 additions (project-detail modal) ──
  "scope_in":  "markdown-ish textarea — what IS in scope",
  "scope_out": "markdown-ish textarea — what is NOT in scope",
  "phases":    [{ "name": "Design",  "status": "done|active|planned", "percent": 0-100 }],
  "readiness": [{ "item": "HMAC on order-status", "done": true }],
  "risks":     ["free-text risk 1", "risk 2"],
  "links":     [{ "label": "PRD", "url": "https://…" }]
}
```

**`config.users[]` — one entry per staff member**

```jsonc
{
  "email": "faizan@phonebot.com.au",
  "displayName": "Faizan",
  "role": "dev|pm|ceo|qa|qa_auditor",
  "hours_per_week": 40,
  "status": "active|inactive",
  // ── April 24 addition (absence tracking) ──
  "absence": {
    "type": "none|sick|vacation|public_holiday|bereavement|personal",
    "until": "YYYY-MM-DD",   // may be empty
    "note":  "free text"
  },
  // ── April 24 evening addition (probation) ──
  "probation_end": "YYYY-MM-DD" | null
}
```

[NEEDS VERIFICATION] Seed `users[]` in `devdash.html` does not set `probation_end` on any user, and `addUser()` does not initialize it. `computeRewards()` reads `u.probation_end` — if absent, the dev qualifies normally. Either (a) add `probation_end: null` to the seed + `addUser()` default, or (b) document that a missing field means "not on probation." Current behavior is correct but implicit.

**`config.rewards` — monetary incentive config**

```jsonc
{
  "currency": "PKR|AUD|USD|GBP|EUR|INR|AED",  // April 24 addition, default PKR
  "per_direction_aud": 35000,  "per_direction_extras": "learning budget",
  "true_north_aud":    180000, "true_north_extras":    "conference day + choice of next project",
  "growth_aud":        25000,  "growth_min_delta":     10,
  "team_pool_aud":     350000, "unlock_thresholds":    [25, 50, 75, 100],
  "owner_bonus_pct":   10,     "visibility":           "direction_public",

  // ── April 24 evening additions: payout policy (Fahad decisions) ──
  "payout_cycle":             "monthly | weekly | quarterly | ad_hoc",
  "payout_day":               1,                // 1-28, day of month payout is due
  "monthly_budget_ceiling":   500000,           // banner warns when pending exceeds this
  "require_dual_approval":    true,             // both Fahad + Imran must tick in payout modal
  "absence_rule":             "full | pro_rated | forfeit",
  "new_hire_probation_weeks": 0,                // paired with user.probation_end
  "termination_rule":         "pay | forfeit | ceo_decides",
  "team_pool_split":          "equal | weighted | true_north_only | owner_decides",
  "growth_bonus_rule":        "independent | threshold_only",
  "payout_reminder":          "banner_only | banner_and_push",
  "owner_bonus_grace_days":   0                 // 0 = strict (ship on deadline + green)
  // ⚠ _aud suffixes on amount fields are legacy. Amounts are displayed in `currency`.
  //   Do NOT rename the keys — stale localStorage would lose data.
}
```

**`auditFindings[]` — QA auditor findings (persisted via `submitAudit`)**

```jsonc
{
  "id": 1714000000000,
  "title": "...",
  "project": "Phonebot 2.0",
  "findings": "markdown body",
  "category":    "performance|responsive|code_quality|security|accessibility|seo|regression|parity|cross_browser|other",
  "severity":    "blocker|high|medium|low",
  "status":      "open|in_progress|closed",
  "days_ago": 0,
  "action_items": 1,
  "assigned_to": "faizan@phonebot.com.au",
  "cc":          ["email1", "email2"],
  "url":    "...",
  // Performance-only (blank otherwise)
  "metric": "LCP (s)", "actual": "", "target": "",
  // Responsive-only
  "device": "iPhone 14", "viewport": "375x812",
  // Responsive + cross_browser
  "browser": "Chrome",
  // Code-quality-only
  "file": "app/Controllers/…",
  "issue_type": "Complexity|Duplication|Dead code|Naming|…",
  "lines": "123-145",
  // Security-only
  "owasp": "A01: Broken access control",
  "risk":  "Low|Medium|High|Critical",

  // ── April 24 evening additions (dispute propagation) ──
  "disputed":            false,
  "dispute_id":          1714500000000 | null,
  "dispute_resolution":  "accepted|rejected|reassigned" | null,
  "reassigned_reason":   "free-text audit trail line"
}
```

`submitAudit()` now persists every category-specific field (`browser`, `issue_type`, `lines`, `owasp`, `risk`) — fields are blank when the category doesn't apply. Prior `[NEEDS VERIFICATION]` cleared.

**`bugs[]` — QA bug reports**

```jsonc
{
  "id": 1,
  "summary": "...",
  "severity": "HIGH|FUNCTIONAL|VISUAL",
  "project": "Phonebot 2.0",
  "status": "open|in_progress|closed",
  "days_open": 2,
  "assigned_to": "Faizan",       // display name, not email — legacy

  // ── April 24 evening additions (form-capture persisted) ──
  "device":          "desktop|tablet|mobile",
  "browser":         "chrome|safari|firefox|edge|ios-safari|android-chrome",
  "url":             "/checkout or full URL",
  "reproducible":    "always|sometimes|once",
  "steps":           "1. Go to /checkout\n2. …",
  "expected_actual": "Expected: one order\nActual: two orders",
  "details":         "free-text body (legacy field, still populated by some flows)",

  // ── April 24 evening additions (dispute propagation + reassign audit trail) ──
  "disputed":            false,
  "dispute_id":          1714500000000 | null,
  "dispute_resolution":  "accepted|rejected|reassigned" | null,
  "reassigned_reason":   "free-text audit trail line"
}
```

`submitBug()` now persists every form field. Prior `[NEEDS VERIFICATION]` cleared.

**`featureRequests[]` — feature intake from any role**

```jsonc
{
  "id": 1714000000000,
  "description": "free text",
  "urgency":     "low|medium|high",
  "project":     "Phonebot 2.0",
  "requester":   "Fahad",          // display name
  "target_dev":  "Faizan",         // display name, project owner by default
  "age_days":    0,

  // ── April 24 evening additions (inbox workflow) ──
  "status":         "accepted|declined|question|done" | null,
  "accepted_at":    "YYYY-MM-DD",
  "declined_at":    "YYYY-MM-DD",
  "completed_at":   "YYYY-MM-DD",
  "eta":            "YYYY-MM-DD | free text",
  "thread":         [{ "from": "Faizan", "when": "2026-04-24 14:22", "text": "✓ Accepted. Working on it." }],
  "reassigned_reason": "free-text audit trail line"   // set if target_dev rewritten by user-remove
}
```

**`disputes[]` — merit/assignment disputes filed by devs**

```jsonc
{
  "id":           1714500000000,
  "when":         "2026-04-24 14:22",
  "dev":          "Faizan",        // the CURRENTLY-attributed party (post-reassign, this is the new owner)
  "disputed_by":  "Moazzam",       // who actually raised the dispute (may differ from `dev`)
  "type":         "bug|audit",
  "itemId":       1714000000000,
  "itemLabel":    "short title/summary for context",
  "reason":       "free text",
  "status":       "open|accepted|rejected|reassigned|void",

  // ── April 24 evening additions (resolution trail) ──
  "reassigned_from": "Faisal",     // if status=reassigned, the prior `dev`
  "resolved_at":     "YYYY-MM-DD",
  "resolved_by":     "Fahad" | "auto (user removed)"
}
```

When `status=accepted`: the linked bug/audit has `dispute_resolution='accepted'` and (for bugs) is routed back to the project owner with `reassigned_reason` set. When `status=reassigned`: the linked item's `assigned_to` is updated and `dispute_resolution='reassigned'`.

**`rewardEvents[]` — individual bonus lines (one per dev per week per type/direction)**

```jsonc
{
  "id":              1714600000000,
  "dev_email":       "faizan@phonebot.com.au",
  "week_start":      "YYYY-MM-DD",             // Monday of the week earned
  "type":            "direction|true_north|growth|team_pool|owner_ship",
  "direction":       "velocity|craft|reliability|drive" | null,  // only when type=direction
  "amount":          35000,
  "currency":        "PKR",                    // snapshot of config.rewards.currency at time of generation
  "status":          "pending|paid|void",
  "paid_at":         "YYYY-MM-DD" | undefined,
  "paid_by":         "Fahad" | undefined,
  "payout_batch_id": 1714700000000 | undefined,  // set once batched
  "note":            "free text (e.g. '(voided: user removed)')"
}
```

Generated by `regenerateRewardEvents(weekStart)` which de-dupes on `dev_email:type:direction` per week, so re-running is idempotent.

**`payoutBatches[]` — one entry per actual payout run (Settings → Rewards → "Pay now")**

```jsonc
{
  "id":          1714700000000,
  "ref":         "PAY-2026-05 | bank transfer ID",
  "paid_at":     "YYYY-MM-DD",
  "paid_by":     "Fahad",
  "approved_by": ["ceo", "pm"],     // ["ceo"] if require_dual_approval=false
  "event_ids":   [1714600000000, 1714600000001, …],
  "total":       210000,
  "currency":    "PKR",
  "note":        "free text (e.g. 'Paid via HBL batch 4512')"
}
```

Writing a batch flips every referenced `rewardEvent.status` from `pending` → `paid` and stamps `paid_at / paid_by / payout_batch_id` on each. Append-only: batches are never edited or deleted.

**`growthLog{}` — dev-confirmed this-week growth actions (map, not array)**

```jsonc
{
  "faizan@phonebot.com.au-2026-W17": {
    "done_at":   "YYYY-MM-DD",
    "direction": "velocity|craft|reliability|drive"   // snapshot of that week's focus direction
  },
  "moazzam@phonebot.com.au-2026-W17": { … }
}
```

Keyed by `<email>-<ISOyear>W<weekNumber>`. Presence of a key = the dev clicked "Done" on their growth focus for that week. No entry = not yet done. `growthStreak(dev)` counts the number of keys prefixed with the dev's email.

**`auditLog[]` — append-only trail of settings/rewards/user actions**

Now persisted (bug I02 fix). Shape unchanged:

```jsonc
{
  "id":      1714800000000,
  "when":    "2026-04-24 09:12",
  "who":     "Fahad",
  "section": "Scoring|Users|Projects|Rewards|…",     // UI section that triggered the write
  "change":  "free-text audit sentence"
}
```

Write triggers today: `saveConfig()`, `confirmPayout()`, `resetRewardHistory()`, `removeUser()`, `removeProject()`. Reverse chronological (newest first via `unshift`).

**`regressionCandidates[]` — suspected regressions pending confirmation**

Now loaded on init (bug I01 fix). Extended shape:

```jsonc
{
  "id":        1714900000000,
  "current":   "Checkout double-click duplicate orders",
  "past":      "R0-04 checkout idempotency",
  "past_week": 8,
  "status":    "open|confirmed"
}
```

[NEEDS VERIFICATION] Seed rows in `devdash.html` omit `status`; `addRegression()` sets `status: 'open'`. Dashboard filtering treats missing as open, but AWS migration should default `status='open'` for backfilled rows.

### 2b. Client-side UI state (not persisted across browsers)

The following live only in the Alpine `x-data` instance — they do not round-trip to localStorage or to AWS, and do not need DynamoDB columns:

| Field | Values | Purpose |
|---|---|---|
| `density` | `comfortable` \| `compact` | UI density toggle |
| `collapsed` | `{ pmProjects, pmDevs, pmBugs, ceoPortfolio, ceoCallouts, qaPast, qaaPast }` booleans | Section collapse state |
| `showProjectDetail`, `activeProjectDetailId`, `projectDetailEdit` | modal state | Project-detail modal |
| `showPayoutModal` | boolean | Payout-run modal visibility |
| `payoutDraft` | `{ ref, note, selected_ids: [], ceo_approved: bool, pm_approved: bool }` | Pending payout form state, reset to defaults on `confirmPayout()` |
| `showPolishModal`, `polishNoteText`, `polishNoteResult` | modal state + textarea + result obj | Handoff-note polisher UI |
| `pendingQrEmail` | email string or `''` | Triggers auto-QR card after provisioning a new user |
| `auditCategoryFilter`, `auditStatusFilter` | category/status string or `'all'` | QA Auditor list filters |

If these need to persist per-user (e.g., Fahad wants his collapse state to survive reloads), they should be moved into `config.ui_prefs` keyed by email — not a separate DynamoDB table.

### 2c. Schema migration, reset, and reconciliation hooks

Four mechanisms protect data integrity across version bumps and destructive user actions:

- **`migrateConfig(defaults)`** — runs after localStorage load. Fills missing `contributor_emails / repos / scope_in / scope_out / phases / readiness / risks / links` on every project, and missing `absence` on every user. Also re-pulls the shipped default `scope_in / scope_out / phases / readiness / risks / links` for any project that has them blank, so new copy flows in on version bumps without the user losing their edits.

- **`resetConfigToDefaults()`** — wired to a red button in Settings → System. Clears `devdash_config`, `devdash_session`, AND every `devdash_provisioned_<email>` flag (so re-added users are forced to re-scan their QR). Preserves: bugs, audit findings, feature requests, disputes, blockers, stuck PRs, regression candidates, PM assessments, clock entries, reward events, payout batches, theme, density, audit log.

- **`resetRewardHistory()`** — separate nuclear op in Settings → Rewards → Danger zone. Wipes `devdash_rewardEvents` + `devdash_payoutBatches`, then writes an audit-log line. Does NOT touch `config.rewards` settings, users, or anything else. Use when the rewards system is being re-seeded from scratch.

- **`removeUser(idx)`** — reconciles six reference types in a fixed order BEFORE splicing the user out, to prevent orphaned references:
  1. **Projects** — clear `owner_email` if matched, remove email from `contributor_emails[]` on every project.
  2. **Bugs** — for each bug `assigned_to` the removed user, reassign to the project owner's displayName (or `''` if unowned) and stamp `reassigned_reason`.
  3. **Feature requests** — same logic as bugs but on `target_dev`.
  4. **Disputes** — every open dispute where `dev === removedName` flips to `status='void'`, `resolved_by='auto (user removed)'`, `resolved_at=today`.
  5. **Audit findings** — clear `assigned_to` if it was their email, filter their email out of every `cc[]`, stamp `reassigned_reason`.
  6. **Blockers** — open blockers with `waiting_on === removedName` are rewritten to `waiting_on='(unassigned — user removed)'`.
  7. **Reward events** — if `config.rewards.termination_rule === 'forfeit'`, every pending event for the removed dev flips to `status='void'` with a note. Otherwise preserved.
  Finally: audit log line, splice user, remove their `devdash_provisioned_<email>` flag.

- **`removeProject(idx)`** — does NOT hard-delete linked items. Rewrites `project` field on every linked bug / audit finding / feature request to `(archived: <originalName>)`, so they remain filterable under All-Projects but disappear from the project-specific tab. Writes audit log line. Finally splices the project.

The backend replacement of localStorage (§2d, DynamoDB) must preserve all four behaviors: a server-side migration Lambda on config version bumps, and admin-only endpoints `POST /admin/config/reset`, `POST /admin/rewards/reset`, `DELETE /admin/users/{email}` (with the full reconciliation cascade), `DELETE /admin/projects/{id}` (with the archive relabel).

### 2d. AWS backing store

Every project gets its own S3 prefix. The project ID is a lowercase slug (`phonebot-2`, `phonebot-hq`, `product-page`, `mobile-app`, `legacy`).

```
s3://devdash-data/
└── projects/
    └── {project-id}/
        ├── metadata.json               ← name, status, deadline, owner, traffic light
        ├── knowledge-card.md           ← 500-word rolling summary (always loaded)
        ├── items/
        │   ├── active.json             ← all open items, updated weekly
        │   └── closed.json             ← all closed items (append-only)
        ├── handoffs/
        │   └── {YYYY-MM-DD}/
        │       └── {dev-email}.md      ← one file per dev per day
        ├── uploads/
        │   ├── fahad/                  ← CEO strategic docs, prompt uploads
        │   ├── imran/                  ← PM uploads
        │   └── {dev-email}/            ← dev-level uploads
        ├── qa-findings/
        │   └── {YYYY-MM-DD}-{slug}.md  ← individual QA bug reports
        ├── qa-audits/
        │   └── {YYYY-MM-DD}-mustafa.md ← Mustafa's long-form weekly audits
        ├── feature-requests/
        │   └── {YYYY-MM-DD}-{slug}.md  ← feature intake from any role
        ├── prompts/
        │   └── {YYYY-MM-DD}-{slug}.md  ← prompts uploaded by CEO/PM/dev
        ├── prompt-responses/
        │   └── {YYYY-MM-DD}-{slug}.md  ← Claude responses pasted back
        ├── snapshots/
        │   └── {YYYY-MM-DD}.json       ← full weekly audit snapshot (raw)
        ├── week-summaries/
        │   └── {YYYY-Www}.md           ← Claude-generated week summary (~300 words)
        └── merit-history/
            └── {YYYY-Www}/
                └── {dev-email}.json    ← final merit scores for that week
```

**Real example paths:**

```
s3://devdash-data/projects/phonebot-2/knowledge-card.md
s3://devdash-data/projects/phonebot-2/handoffs/2026-04-24/faizan@phonebot.com.au.md
s3://devdash-data/projects/phonebot-2/qa-findings/2026-04-24-login-totp-fails-safari.md
s3://devdash-data/projects/phonebot-2/qa-audits/2026-04-21-mustafa.md
s3://devdash-data/projects/phonebot-2/week-summaries/2026-W17.md
s3://devdash-data/projects/phonebot-2/merit-history/2026-W17/faizan@phonebot.com.au.json
s3://devdash-data/projects/mobile-app/knowledge-card.md
s3://devdash-data/projects/mobile-app/feature-requests/2026-04-23-biometric-login.md
```

**Global (cross-project) keys:**

```
s3://devdash-data/global/
├── audit-log.jsonl            ← append-only line-per-event audit trail
├── retention-config.json      ← days per tier, configurable
└── users/
    └── {email}.json           ← role, TOTP secret (encrypted), status
```

**DynamoDB table layout:**

One table: `devdash`. Partition key: `pk`, Sort key: `sk`.

```
pk: PROJECT#{project-id}         sk: META                          → project metadata (all §2a project fields inline)
pk: PROJECT#{project-id}         sk: KNOWLEDGE_CARD                → 500-word summary text
pk: PROJECT#{project-id}         sk: ITEM#{item-id}                → individual work item
pk: PROJECT#{project-id}         sk: AUDIT#{id}                    → auditFindings[] entry (§2a shape, incl. dispute fields + cc[])
pk: PROJECT#{project-id}         sk: BUG#{id}                      → bugs[] entry (§2a shape, incl. dispute fields + form fields)
pk: PROJECT#{project-id}         sk: FEATURE_REQ#{id}              → featureRequests[] entry (incl. status, thread, eta)
pk: PROJECT#{project-id}         sk: REGRESSION#{id}               → regressionCandidates[] entry
pk: DEV#{email}                  sk: META                          → user record + absence object + probation_end
pk: DEV#{email}                  sk: MERIT#{YYYY-Www}              → merit score record
pk: DEV#{email}                  sk: CLOCK#{YYYY-MM-DD}            → clock in/out times
pk: DEV#{email}                  sk: HANDOFF#{date}                → S3 key pointer (not full content)
pk: DEV#{email}                  sk: REWARD_EVENT#{id}             → rewardEvents[] entry (query by dev for history)
pk: DEV#{email}                  sk: GROWTH_LOG#{YYYY-Www}         → growthLog entry ({done_at, direction})
pk: REWARDS#GLOBAL               sk: PAYOUT_BATCH#{id}             → payoutBatches[] entry (GSI by paid_at for history)
pk: REWARDS#GLOBAL               sk: REWARD_EVENT#{id}             → mirror of DEV#… write, for cross-dev pending queries (or use GSI1 instead)
pk: DISPUTE#{id}                 sk: DATA                          → disputes[] entry
pk: CONFIG#GLOBAL                sk: REWARDS                       → currency + amount fields + payout policy (all §2a reward fields)
pk: CONFIG#GLOBAL                sk: SCORING                       → scoring weights
pk: CONFIG#GLOBAL                sk: AUDIT_LOG#{id}                → auditLog[] entry (append-only, sort desc by id)
pk: SESSION#{token}              sk: DATA                          → session (TTL 86400s)
pk: NOTIFICATION#{id}            sk: DATA                          → queued notifications (TTL 7d)
```

**SK patterns added in the April 24 evening ship:**

| SK pattern | Maps to | Why on this PK |
|---|---|---|
| `REWARD_EVENT#{id}` under `DEV#{email}` | Single rewardEvents[] row | Query "all of Faizan's events this year" is the dominant read path |
| `PAYOUT_BATCH#{id}` under `REWARDS#GLOBAL` | Single payoutBatches[] row | Payout history is a global list, not dev-scoped |
| `GROWTH_LOG#{YYYY-Www}` under `DEV#{email}` | One growthLog entry | Matches the JS key structure `<email>-<week>` |
| `AUDIT_LOG#{id}` under `CONFIG#GLOBAL` | Single auditLog[] row | Audit log is org-wide; sort descending by id for newest-first scans |
| `REGRESSION#{id}` under `PROJECT#{id}` | Single regressionCandidates[] row | Once regressions carry a project tag (TODO in code), this is the natural home |

Choose either a secondary mirror under `REWARDS#GLOBAL sk: REWARD_EVENT#…` OR a GSI on `status` — don't do both. GSI1 on `(status, week_start)` is cheaper at scale for the "show me all pending events" query that drives the Pay-now modal.

**Large text placement — `scope_in` / `scope_out`:** keep inline on the `PROJECT#… / META` item. DynamoDB item size limit is 400KB; the richest project in the current seed (Phonebot 2.0) is under 2KB total, and `scope_in`/`scope_out` are bounded by textarea UX to a few hundred words. Splitting them to child items (e.g., `sk: SCOPE_IN`) would cost an extra round-trip on every project-detail open for no real benefit. Revisit only if a single scope field ever crosses ~50KB.

**`phases[]`, `readiness[]`, `risks[]`, `links[]`:** also inline as native DynamoDB lists/maps on the META item. No need for child items.

DynamoDB does not store file content (handoffs, QA audit long-form, uploaded prompts) — only pointers to S3 keys and structured metadata. This keeps DynamoDB cheap and fast.

---

## 3. Knowledge Card Mechanism

This is the most important design decision in the entire document. Everything else is optimization. The knowledge card is how Claude avoids reading 6 months of raw files every week.

**What it is:** A 500-word (roughly 650 tokens) plain-text summary of a project's current state. One per project. Updated every Sunday night as part of the weekly audit.

**What it contains:**
- Current objective in one sentence (e.g., "Shipping Phonebot 2.0 by July 30 — 34 of 61 items closed, 44% complete, on pace for June 28 if current velocity holds.")
- Who is assigned to what this week (Faizan: auth + order flow; Moazzam: product feed; Faisal: customer portal)
- The 3 most important open items by priority
- Any blockers recorded in handoffs this week
- The most recent QA finding summary
- Last week's merit tier distribution (not individual scores — just "2 Exceptional, 1 Solid, 1 Developing")
- Any CEO/PM notes uploaded since the last card

**How it is built (weekly):**

The weekly audit Lambda calls Claude with a focused prompt:

```
You are updating the knowledge card for {project-name}.
Previous card: [previous 500-word card]
New data this week:
- Items delta: [list of newly closed and newly opened items since last card]
- Handoff entries this week: [all CLOSED and OPEN lines from all dev handoffs, ~500 words]
- QA findings this week: [bug titles and severity, ~100 words]
- QA audit (if filed): [Mustafa's summary section only, ~200 words]
- CEO/PM uploads (if any): [titles and one-line descriptions]

Write a new 500-word knowledge card. Do not pad. Be specific.
```

**Token cost of that call:** roughly 1,500 tokens in, 700 tokens out. About 2,200 tokens per project per week. Five projects = 11,000 tokens for the weekly card regeneration pass.

**How it evolves:** The card replaces itself. The previous card is fed in as context so Claude can preserve long-running context (e.g., "Faisal has been blocked on payment gateway since week 3 — now resolved in week 7") while updating what changed. Old cards are not deleted — they are archived to `week-summaries/` so Fahad can audit the history.

**What happens if there is no activity:** If a project has zero handoffs and zero uploads in a week, the card is not regenerated. The existing card is kept. A stale indicator (last updated: N days ago) appears on the dashboard.

---

## 4. Context Loading Strategy Per Run

Each run type loads a different slice of data. The rule: load the minimum that answers the question, with a well-defined escalation path to load more.

### Default Weekly Audit (runs Sunday night)

**Loaded per project:**

1. Knowledge card — 650 tokens
2. Active items from `items/active.json` — ~500 tokens for 40 items
3. This week's handoffs (all devs, CLOSED + IN PROGRESS + OPEN lines only, not full content) — ~800 tokens
4. This week's QA findings (titles + severity + one-line descriptions) — ~200 tokens
5. Week's QA audit summary section (Mustafa's first 300 words) — ~300 tokens
6. Any CEO/PM uploads this week (full content if under 500 words, truncated otherwise) — ~400 tokens

**Total per project: ~2,850 tokens. Rounding up to 5,000 tokens to allow for variance.**

Five projects loaded simultaneously: ~25,000 tokens per weekly audit.

Merit scoring for each dev is a separate sub-call using only that dev's data (see below).

---

### Per-Dev Merit Computation (within the weekly audit)

**Loaded per dev per project:**

1. Their own handoff entries this week (full content) — ~600 tokens
2. Their commits this week (message, files changed) — ~400 tokens
3. Active items assigned to them — ~300 tokens
4. Previous week's merit score + feedback — ~150 tokens

**Total per dev: ~1,450 tokens.** Four devs across five projects = 29,000 tokens for all merit computations.

---

### Regression Check (ad hoc, triggered by QA finding)

When the QA auditor files a bug that looks like a regression, the system does a keyword search on the history layer before loading any context:

1. Extract keywords from the bug report (e.g., "payment", "BACS", "timeout")
2. Run an S3 Select query against `items/closed.json` and recent `week-summaries/` for those keywords
3. Load only the matching records (typically 2–5 items) — ~500 tokens
4. Pass to Claude with the new bug report for comparison

**Total for a regression check: ~1,500 tokens.** Never loads more than 5 matching historical items unless the user explicitly expands.

---

### Quarterly Review (13-week lookback)

The system does NOT load 13 weeks of raw snapshots. It loads:

1. 13 `week-summaries/` files per project — each is ~300 words = 3,900 words total per project
2. Merit history for the quarter (13 entries per dev) — ~200 tokens per dev
3. Knowledge card current state — 650 tokens

**Total for one project's quarterly review: ~6,500 tokens.** If Fahad wants a cross-project quarterly review, multiply by 5 = ~32,500 tokens.

Raw snapshots stay in Warm/Cold storage but are never automatically loaded in a quarterly review. They are there if a specific question requires drilling in.

---

### User-Triggered "Load More Context" Button

When Claude's standard audit produces an answer that feels incomplete, the dashboard shows a "Load more context" button. This is not a free-for-all: the button shows the user what will be loaded and an estimated token cost before they confirm.

**Load more options (shown as a menu):**

| Option | What gets loaded | Approx tokens |
|---|---|---|
| Last 4 weeks raw handoffs | All CLOSED/IN PROGRESS/OPEN lines, 4 weeks | +8,000 |
| Full QA audit text | Mustafa's complete submission (not just summary) | +2,000 |
| Closed items detail | Full description of closed items (last 30 days) | +4,000 |
| Full prompt-response history | All prompt-response pairs for this project | +6,000 |
| Cross-project context | Load a second project's knowledge card | +650 |

When the user clicks an option, the dashboard shows: "This will load approximately 8,000 additional tokens. Confirm?" — and only then triggers the Lambda call with the expanded context.

---

## 5. Security

### Encryption at rest

All S3 objects are encrypted with AWS KMS using a customer-managed key (CMK). This gives Fahad full key ownership and an audit trail of every key usage. If you use the default S3 SSE-S3 key instead, AWS manages it for you but you lose the audit trail. Given that this data contains merit scores and staff performance information, CMK is the right call.

DynamoDB is encrypted at rest using the same KMS CMK.

KMS key operations cost $0.03 per 10,000 API calls. At this team size: **under $0.30/month**.

### Encryption in transit

All traffic uses TLS 1.2+. This is enforced via an S3 bucket policy (`aws:SecureTransport: true`), Lambda function URLs with HTTPS only, and the Cloudflare Worker which already terminates TLS.

### IAM role-based access

Three IAM roles:

1. **devdash-lambda-audit** — read/write access to `s3://devdash-data/projects/*`, read/write to DynamoDB, publish to SES. No KMS admin rights.
2. **devdash-lambda-read** — read-only access to `s3://devdash-data/projects/*/knowledge-card.md` and DynamoDB metadata. Used by the context-loading endpoint.
3. **devdash-admin** — used only by Fahad for user provisioning and configuration changes. Not attached to any running Lambda.

S3 bucket is private. No public access block is disabled. There are no pre-signed URLs — all access goes through Lambda.

### Audit log

CloudTrail is enabled on the devdash S3 bucket. Every read and write of every object is logged. Logs go to a separate `devdash-audit-logs` S3 bucket (also encrypted, read-only even for the Lambda roles).

This means: if a merit score is ever disputed, Fahad can pull the CloudTrail log and see exactly when it was written and by which Lambda execution.

### Session security

Session tokens are 32 bytes of cryptographic random, stored in DynamoDB with a 24-hour TTL. Session cookies use `HttpOnly; Secure; SameSite=Strict`. Sessions are invalidated on logout (DynamoDB delete). No JWT — tokens have no embedded data, so a stolen token cannot be decoded for information.

TOTP secrets are stored encrypted (AES-GCM, 256-bit key) in DynamoDB. The encryption key lives in AWS Secrets Manager (not in environment variables or code). The Cloudflare Worker retrieves it at runtime via the `TOTP_ENCRYPTION_KEY` secret, which was already implemented in the existing plan.

---

## 6. Data Retention and Archival

### Default retention

| Tier | Age | Action |
|---|---|---|
| DynamoDB Hot | 0–14 days | TTL auto-deletes after 14 days |
| S3 Standard-IA Warm | 15–90 days | S3 Lifecycle transitions from Standard |
| S3 Glacier Deep Archive Cold | 91–365 days | S3 Lifecycle transitions from IA |
| Permanent delete | 365+ days | S3 Lifecycle expires objects |

These are defaults. The `global/retention-config.json` file lets Fahad override them per project or globally without touching infrastructure.

### Dev offboarding flow

When a dev leaves (e.g., if Usama or Moazzam moves on):

1. **Day 0:** Their account is disabled in `users/{email}.json`. They can no longer log in. Their data is not touched.
2. **Day 0–30:** Read-only archive period. Fahad can still pull their historical merit data, handoffs, and contributions for any handover work.
3. **Day 30:** Their S3 prefix is tagged `status=archived`. A Lambda job generates a final summary JSON with their contribution history.
4. **Day 30+:** Data follows the standard retention schedule (warm for 90 days, cold for 365 days total).
5. **Year 2 (or N years, configurable):** All their raw files expire. The compressed merit history summary (a single JSON) is retained permanently as an employment record.

This approach means: if you accidentally offboard someone (or they come back), you can restore full access within minutes just by re-enabling their user record. Nothing is hard-deleted for at least one year.

### GDPR-style right to erasure

Not strictly required for a small Australian company with contractors, but available as a precaution: a `DELETE /user/{email}` admin endpoint can purge all S3 objects with the user's prefix, delete their DynamoDB records, and log the deletion event to CloudTrail. This is irreversible. It requires Fahad's TOTP confirmation.

---

## 7. Bootstrap Progression — Day 0 to Day 365

### Day 0 — First run

The system has no history. There are no handoffs, no commits logged, no QA findings.

**What happens:**

1. Fahad runs the provisioning script (already built as `totp_provision.py`). It generates TOTP secrets for all 8 users, writes them to DynamoDB, and outputs QR codes to distribute.
2. Fahad uploads initial scope documents for each project: CLAUDE.md, README-for-new-claude.md, the Phonebot 2.0 scope docs, whatever exists for other projects.
3. The weekly audit runs with only these scope documents. Claude reads them and writes a bootstrap knowledge card for each project. Example for Phonebot 2.0: "Phonebot 2.0 is a Laravel rewrite of the OpenCart 1.0 platform. 61 items on the launch checklist. Faizan is the assigned dev. No commits or handoffs recorded yet — knowledge card bootstrapped from scope documents."
4. The cards are written to S3 and DynamoDB.
5. Dashboard shows: 0 closed items, 5 projects with bootstrap knowledge cards, no merit scores.

**What the team sees when they log in:** A working dashboard with real project names and statuses. No "no data" errors. The knowledge cards serve as the initial truth.

---

### Day 5 — First week of data

By now:
- Devs have submitted 3–5 handoff MDs each
- Faizan has committed 10–15 commits to the Phonebot 2.0 repo
- Mustafa (QA auditor) has likely filed his first audit
- The QA person has filed 2–3 bug reports

**What changes:** The weekly audit now has real handoff data. Knowledge cards update to reflect actual activity. Merit scores appear for devs (though week 1 scores should be treated as provisional — the system needs 3+ weeks to have enough signal for accurate scoring).

**What does NOT work yet:** The "regression check" is unhelpful this early because there is no history to search against. The "load more context" button adds very little because there is little warm storage. The quarterly review is meaningless.

**Cost at day 5:** Effectively zero. A few KB of S3 storage, a handful of DynamoDB reads.

---

### Day 90 — Steady state

By now:
- 8 people × 5 projects × 12 weeks of data = substantial history
- Each project has 12 week-summaries, 12 merit history entries per dev, 60+ handoffs per dev
- Total S3 storage: roughly 150–300MB across all projects
- DynamoDB hot tier holds only last 14 days

**What the weekly audit looks like now:** Claude reads 5 knowledge cards (one per project), gets this week's deltas, produces merit scores, updates the cards. Token cost is identical to day 5 — about 25,000 tokens for the full audit — because it never loads the old history automatically.

**What has changed behaviorally:**
- The knowledge cards are now rich with evolved context (7-word project histories baked in)
- Regression checks now actually find things (12 weeks of closed items to search against)
- Merit scoring is now reliable (enough weeks to see patterns)
- The quarterly review feature becomes usable for the first time

**DynamoDB hot tier cost:** still under $1/month. Items older than 14 days are gone from DynamoDB and living in S3 IA.

---

### Day 365 — One year in

By now:
- ~250MB in Warm (last 90 days), ~1GB in Cold (91–365 days)
- 52 week-summaries per project, quarterly reviews possible for the full year
- Some raw files from months 1–3 have started transitioning to Glacier Deep Archive
- The team probably has 6–10 projects (you said it can grow)

**What changes at this scale:**
- The weekly audit still costs ~25,000 tokens because the knowledge card mechanism keeps the footprint constant regardless of history depth
- Adding a new project adds exactly 5,000 tokens to the weekly audit (one new knowledge card + its week's data)
- The oldest data in Glacier is essentially free to keep but costs real money (and time) to retrieve
- Quarterly reviews for year-ago quarters require a Glacier retrieval request (12-hour wait) — this is acceptable for a once-a-year lookback

**What you should do at day 365:** Review the retention config. If 12-month history is more than you need for operational purposes, shorten the warm tier to 60 days and cold to 180 days. You can always keep compressed summaries permanently at negligible cost.

---

## 8. Token Budget Math

### Weekly audit (runs once per week)

| Task | Tokens (in + out) |
|---|---|
| Knowledge card regeneration, 5 projects | 11,000 |
| Default audit context load, 5 projects | 25,000 |
| Merit scoring, 4 devs × 5 projects | 29,000 |
| Per-role HTML payload generation | 8,000 |
| **Weekly total** | **~73,000 tokens** |

### Daily lightweight pull (runs Mon–Sat)

The daily pull does NOT call Claude. It is a Lambda that reads DynamoDB, checks for new QA findings or handoffs, and sends an email summary to Fahad if anything is flagged. No tokens consumed. Cost: SES email ($0.10/1000 emails).

If a daily pull finds a regression-pattern bug, it triggers a 1,500-token Claude call (see regression check, Section 4).

Assuming 2 regression checks per week on average: 2 × 1,500 = 3,000 tokens/week.

### Monthly total

- 4 weekly audits × 73,000 = 292,000 tokens
- 8 regression checks × 1,500 = 12,000 tokens
- Knowledge card regeneration already counted in weekly audit
- Ad-hoc "load more context" (assume 3 per week, 5,000 tokens each) = 60,000 tokens

**Monthly total: ~364,000 tokens in, ~100,000 tokens out.**

### Comparison to Claude Max $100/5x quota

Claude Max at the $100/month tier includes access to Claude Sonnet (or equivalent) with a session-based limit rather than per-token billing. The typical real-world monthly token consumption for a $100/month Max subscriber doing regular development work is in the range of 20–40 million tokens per month.

At ~464,000 tokens total per month (input + output combined), devdash consumes roughly **1–2% of the monthly Max quota**. Even if the team doubles its usage or you add 5 more projects, you are unlikely to exceed 5% of quota from dashboard operations alone.

The risk is not the weekly audit itself. The risk is a team member using "load more context" aggressively or Fahad running multiple quarterly reviews in a single session. A reasonable guardrail: display a running token counter in the dashboard and warn when a single session exceeds 100,000 tokens.

---

## 9. Per-Project Context Isolation

### How queries scope to a project

Every Lambda invocation that calls Claude includes a `project_id` parameter. The context-loading code constructs S3 paths using only that project's prefix. There is no cross-project loading in any default run type.

The only time two projects appear in the same Claude context is if:
- Fahad explicitly uses the "load cross-project context" option (see Section 4)
- A QA finding references a shared component (rare, handled by the user deciding which project it belongs to)

### Data access matrix

This defines who can read what via the dashboard API.

| Role | Own project data | Other project data | All merit scores | Own merit score | Audit logs |
|---|---|---|---|---|---|
| CEO (Fahad) | Full read | Full read | Full read | N/A | Full read |
| PM (Imran) | Full read | Full read | Aggregated only | N/A | No |
| Dev (Faizan, Moazzam, Faisal, Usama) | Own handoffs + commits + merit | Knowledge card only | No | Yes | No |
| QA (junior) | QA findings for assigned project | No | No | No | No |
| QA Auditor (Mustafa) | Full read (all projects) | Full read | Aggregated only | No | No |

"Aggregated only" means merit tiers (Exceptional/Solid/Developing/At Risk) are visible but not raw scores. Raw scores and underlying signal breakdowns are CEO-only.

### Implementation

The Lambda context-loading endpoint validates the session role before assembling any S3 reads. A dev session requesting another dev's merit history gets a 403 before any S3 call is made. This check happens in the Lambda handler, not the Cloudflare Worker — the Worker only handles auth and routing, not data authorization.

---

## 10. Failure Modes and Mitigations

### Too much accumulated data → context overflow

**Trigger:** A project has 200 open items (e.g., legacy maintenance backlog is never cleared).

**Detection:** Lambda measures token estimate before each Claude call. If it exceeds 60,000 tokens for one project, it triggers a pre-summarization pass.

**Mitigation:** Before the weekly audit, a separate Lambda reads items in batches of 50 and asks Claude to group them into 10 themes with a one-line description each. The audit then loads themes instead of raw items. The underlying items are preserved in S3.

---

### Context window overflow on a specific question

**Trigger:** A user asks Claude to "look at everything Faisal has done this year" via a custom prompt.

**Mitigation:** The "load more context" button (Section 4) never loads everything silently. It always shows a token estimate and requires confirmation. If the estimated load exceeds the context window, the button is disabled and replaced with a message: "This request requires more context than one session allows. Consider narrowing to one project or one time period."

---

### Stale data issues

**Trigger:** Faizan uploaded a handoff two days ago but the dashboard shows yesterday's snapshot.

**Mitigation:** Every S3 write updates a DynamoDB record with `last_updated` timestamp. The dashboard header shows "Data as of [timestamp]" for each project. If the timestamp is more than 25 hours old on a workday, the header highlights it in yellow with a "Stale — last audit was X hours ago" badge.

Knowledge cards also carry a `generated_at` field. If a knowledge card is more than 8 days old, the weekly audit Lambda auto-regenerates it even if no new data arrived.

---

### Concurrent edit conflict

**Trigger:** Fahad and Imran both upload a new strategic doc to the same project at the same time.

**Mitigation:** S3 does not have native locking, but uploads are append-only (each file has a timestamp in its key). There is no overwrite risk. The only true concurrent edit scenario is editing DynamoDB project metadata (e.g., changing a deadline). For that, we use DynamoDB conditional writes (`ConditionExpression: attribute_not_exists(version) OR version = :current_version`). If two writes race, one wins and the other gets a `ConditionalCheckFailedException`. The dashboard returns a "Someone else saved this at HH:MM — please reload" message.

---

### Internet down / AWS outage

**Trigger:** Fahad opens the dashboard and AWS is unreachable.

**Mitigation:** The Cloudflare Worker (which already handles auth and HTML delivery) caches the last-generated HTML payload in Cloudflare KV with a 7-day TTL. Users can still log in and see the most recent dashboard state. Data is read-only in this state — uploads will fail with a clear error message ("Uploads unavailable — connection issue. Your data has not been lost.").

On the Lambda side: if the weekly audit fails partway through (e.g., S3 write timeout), a dead-letter queue retries it up to 3 times. If all retries fail, SES sends Fahad an alert with the error.

---

### Merit score dispute

**Trigger:** Faisal believes his merit score is wrong because a major delivery was missed in the audit.

**Mitigation:** Every merit score record in S3 includes a `signal_breakdown.json` alongside the final score. Fahad can share this with the dev. The breakdown shows exactly which handoff entries were counted, which commits were matched, and what the off-project adjustment was. If the dispute is valid (a handoff was not read correctly), Fahad can override the score manually via the admin endpoint and the correction is logged to CloudTrail.

---

## 11. API Surface

The backend consists of Lambda function URLs behind the Cloudflare Worker. All endpoints return JSON unless noted. All require a valid session cookie (except `/auth/*`).

### Auth

**POST /auth/login**
Request: `{ email, totp_code }`
Response: Sets `devdash_session` cookie. Returns `{ role, display_name }`.

**POST /auth/logout**
Request: Session cookie.
Response: Clears session cookie.

---

### Projects

**GET /projects**
Returns list of all projects with metadata and traffic light for the calling user's role. Filtered by visibility matrix.

**GET /projects/{project-id}**
Returns full project metadata + current knowledge card. Dev role gets only their own items.

**PUT /projects/{project-id}/metadata**
CEO/PM only. Updates deadline, status, traffic light. Uses optimistic lock (requires current `version` in body).

---

### Uploads

**POST /projects/{project-id}/uploads**
Multipart form. Accepts `.md` and `.txt` files. Writes to S3 at the correct path for the calling user's role. Returns S3 key and upload timestamp.

**POST /projects/{project-id}/handoff**
Dev only. Body: raw markdown text. Writes to `handoffs/{today}/{email}.md`. Validates that no handoff exists for today yet (prevents accidental duplicates — if one exists, requires `?overwrite=true`).

**POST /projects/{project-id}/qa-findings**
QA role only. Body: markdown bug report + severity field. Writes to `qa-findings/`.

**POST /projects/{project-id}/qa-audits**
QA Auditor (Mustafa) only. Body: full markdown audit. Writes to `qa-audits/`.

**POST /projects/{project-id}/feature-requests**
Any role. Body: description + urgency. Writes to `feature-requests/`.

---

### Audit and Context

**POST /audit/trigger**
CEO only. Triggers the weekly audit Lambda immediately (instead of waiting for Sunday). Returns `{ job_id }` for polling.

**GET /audit/status/{job-id}**
Returns current audit run status: `pending / running / complete / failed`.

**GET /projects/{project-id}/context**
Returns the default context load for the current project (knowledge card + active items + this week's handoffs). Used by the dashboard to show Claude's current view. Also returns `{ token_estimate }`.

**POST /projects/{project-id}/context/expand**
Request: `{ options: ["handoffs_4w", "full_qa_audit", "closed_items_30d"] }`
Returns: Token estimate and confirmation prompt before loading. Requires a second call with `{ confirmed: true }` to actually load.

**GET /projects/{project-id}/knowledge-card**
Returns the current knowledge card text. All roles. Used for the "project at a glance" panel.

---

### Merit

**GET /merit/{dev-email}**
CEO only. Returns full merit history and signal breakdowns.

**GET /merit/{dev-email}/current**
Dev can access own record. CEO/PM see all. Returns current week's score + tier.

**PUT /merit/{dev-email}/{week}**
CEO only. Manual override. Requires `{ score, reason, override_reason }`. Logs to CloudTrail.

---

### Administration

**POST /admin/provision-user**
CEO only. Creates a new user, generates TOTP secret, stores encrypted in DynamoDB, returns QR code as base64 PNG.

**DELETE /admin/users/{email}**
CEO only. Disables user account. Requires TOTP confirmation from Fahad.

**GET /admin/audit-log**
CEO only. Returns paginated CloudTrail events for devdash resources.

**PUT /admin/retention-config**
CEO only. Updates tier durations in `global/retention-config.json`.

---

## 12. Open Design Decisions — Fahad's Sign-Off Required

These are real choices that affect cost, behavior, and staff experience. They do not have a single right answer. Each needs a yes or no.

---

**Decision 1: DynamoDB TTL length — 14 days or 30 days?**

14 days keeps DynamoDB very cheap and relies on S3 IA for anything older. 30 days means the weekly audit can always hit DynamoDB for the last month without any S3 reads, which is faster and costs slightly more (still under $3/month extra). If the team is doing ad-hoc "what happened last week" checks frequently, 30 days is worth it.

Recommendation: 30 days. The speed improvement for ad-hoc checks outweighs the trivial cost.

---

**Decision 2: Knowledge card length — 500 words or 800 words?**

500 words keeps weekly token costs low. 800 words allows for richer project context (can include more item detail and more nuanced blocker descriptions). At 5 projects, the difference is about 7,500 tokens per weekly audit.

Recommendation: 500 words to start. Adjust per project if a specific project's card feels too thin after 4 weeks.

---

**Decision 3: Merit scores — visible to PM (Imran), or CEO only?**

Currently the matrix shows Imran sees "aggregated only" (tiers, not scores). If Imran is managing sprint planning, raw scores might help him have direct conversations with devs. But if those conversations become political, it undermines the flat-hierarchy intent.

Recommendation: Keep aggregated-only for PM. If Fahad wants to share a score with Imran directly, he can do that outside the dashboard.

---

**Decision 4: Daily lightweight pull — should it call Claude at all?**

Currently designed to be zero-Claude (just email alerts). An alternative is a 10,000-token daily Claude call that writes a one-paragraph status to the dashboard ("Yesterday: Faizan closed 3 items. Moazzam is blocked on the payment API — no commits for 2 days."). This uses roughly 40,000 tokens/month extra but gives Fahad a daily written summary rather than a raw alert.

Recommendation: Start without it. Add after 4 weeks if the weekly cadence feels too infrequent for Fahad's needs.

---

**Decision 5: S3 bucket region — ap-southeast-2 (Sydney) or eu-west-2 (London)?**

The team appears to be based in Pakistan (developers) and Australia (business), with the domain on .co.uk. Data residency and latency both matter. Sydney (ap-southeast-2) is closer to the Australian business operation. London (eu-west-2) is closer to the .co.uk domain's implied audience, though the domain suffix alone does not obligate UK data residency.

Recommendation: ap-southeast-2 (Sydney). Latency to developers in Pakistan is similar either way, and the business entity is Australian.

---

**Decision 6: Should QA junior (unnamed in the current team) have upload access to all projects or only assigned ones?**

Currently the design gives QA read access to any project's QA findings but upload access only to assigned projects. If the junior QA ends up testing across multiple projects simultaneously, this will require an admin to update their assignment. Alternatively, QA can upload to any project freely.

Recommendation: Restrict to assigned projects. Forces Fahad to explicitly assign QA work rather than letting it drift.

---

**Decision 7: Cloudflare Worker KV as the primary serving layer, or move to Lambda + CloudFront?**

The existing plan uses Cloudflare Worker KV to cache and serve HTML payloads (already built). This is fast, free at this scale, and already implemented. The alternative is Lambda + CloudFront (pure AWS), which consolidates the stack but costs slightly more and requires more setup.

Recommendation: Keep Cloudflare Worker. It is already built and working. Moving to Lambda + CloudFront is unnecessary complexity for this team size.

---

*End of document. Section 12 decisions should be recorded before backend development begins. Estimated backend build time given the existing Worker + Python foundation: 3–5 days.*
