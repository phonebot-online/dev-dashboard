# devdash — Changelog

Append-only log of material changes to the dev dashboard. Newest on top.

Each entry below carries explicit **Test:** recipes per fix so this changelog doubles as the
manual-QA script for the dashboard. Walk top-to-bottom on a fresh browser to regression-test.

---

## 2026-04-27 — iMac-local recovery: L14 + U02-U11 + L05/L16/L17 ports

Office iMac was disconnected from git over the weekend. Sunday-morning fixes (user-clicks QA pass +
infra hardening) were authored locally on it. Porting now on top of the weekend hardening pass.
**U01** (owner dropdown) and **U05** (PM ⚖ chip) were already fixed differently/equivalently on
remote and are intentionally NOT re-applied.

### Infra (3 files)

- **L05** `scripts/dashboard/git_sync.py` — tz-aware datetime via `zoneinfo` so "today" slug matches
  the configured timezone (Melbourne / Karachi). Backward-compatible: only kicks in when config has
  an explicit `timezone` field.
  - **Test:** Set `timezone: Australia/Melbourne` in `dashboard.config.yaml` → run `git_sync.py`
    near the UTC-Melbourne day boundary → commits attribute to the correct local-time day.
- **L16** `worker/src/totp.ts` — correct base64url padding `(4 - len%4) % 4` in `decryptSecret`,
  plus 28-byte minimum validation (12 nonce + 16 GCM tag), plus `userEmail` in error messages so
  operator knows whose secret is corrupt.
  - **Test:** Provision a user with TOTP, manually corrupt their secret in KV, attempt login →
    error message names the user.
- **L17** `worker/src/email.ts` — 10s `AbortController` timeout on MailChannels POST. New
  `sendEmailWithRetry()` wrapper with exponential backoff (1s / 2s / 4s) + KV dead-letter queue
  at `alerts:failed:<date>` for tomorrow's cron to retry.
  - **Test:** Block MailChannels via firewall during a daily cron → check KV for
    `alerts:failed:<today>` entry; next day's cron retries cleanly.

### devdash.html

- **L14** Monotonic `nextId()` counter (lazy-init from max-of-all-known-ids). Replaced 14 sites of
  `id: Date.now()`. Avoids collisions during bursts even when `_guard` rate-limits.
  - **Test:** Stress-add 5 stuck PRs in <1s → all 5 get unique ids in `localStorage.devdash_stuckPrs`.
- **U02** CEO stat tiles pre-set filters before tab switch. "Open HIGH bugs → 2" now lands on QA
  view with severity=HIGH + status=open applied (was: all 6 bugs visible). Same for audit-findings
  tile. Feature + Stuck-PR tiles set `pmFocus` signal for future scroll-to.
  - **Test:** CEO view → click "Open HIGH bugs" → QA view shows only HIGH+open bugs.
- **U03** Blocker × confirm dialog shows title + id (`Delete this blocker?\n\n<title>\n\n(id #N)`)
  so wrong-clicks are catchable. Handler was already id-based — defensive UX fix.
  - **Test:** CEO Decisions modal → click × on R0-06 → confirm reads "...R0-06 secret rotation
    approval...(id #1)".
- **U04** `defaultTabFor(role)` helper maps role → own tab (qa → 'qa', qa_auditor → 'qa_auditor').
  Called from `tryLogin()` + session-resume. Was using `visibleRoleTabs()[0]` which sent QA / QA
  Auditor users to 'dev' tab on login.
  - **Test:** Log in as Kinza (QA) → lands on QA tab. Log in as Mustafa (qa_auditor) → lands on
    QA Auditor tab.
- **U06** Audit status dropdown adds Resolved option (per-row + filter). Old
  `status: "resolved"` audits silently rebound to "Open" because the option was missing.
  - **Test:** Mustafa → QA Auditor → Past audit findings → status dropdown shows 4 options.
- **U07** Theme localStorage load now tolerates both plain (`cream`) and JSON-encoded (`"cream"`)
  formats. Strips quotes if present, validates against allowed list, re-writes as plain string so
  future reads are clean. Density gets the same treatment.
  - **Test:** Set `localStorage.devdash_theme = '"cream"'` (with quotes) via DevTools → reload →
    page is in cream theme; localStorage value is now plain `cream`.
- **U08** `markSelfAbsent` + `clearSelfAbsence` now also update `currentUser.absence` snapshot for
  any direct readers (banner already used live `myAbsence()` so no immediate visual fix, but any
  future code path reading `currentUser.absence` stays fresh until re-login).
  - **Test:** Faizan → click 🤒 Sick today → banner updates immediately; `Alpine.$data(body).currentUser.absence` is fresh, not stale.
- **U09** `pruneBlankStuckPrs()` + `pruneBlankRegressions()` run before each `+` click and on
  `init()`. Blank rows no longer stockpile in localStorage.
  - **Test:** Click `+ Log PR` 3 times without filling → reload → no blank rows persist.
- **U10** `submitFeature()` trim+alert on empty / whitespace-only description. The `:disabled`
  binding only caught true empty string.
  - **Test:** Click "+ Feature request" → submit without typing → alert "Description required..."
    fires; no feature added.
- **U11** Dispute-accept owner edge — when disputing dev IS the project owner, clearing the
  bug to "owner" was a no-op. Now unassigns + alerts PM to pick a new owner.
  - **Test:** Faizan (owner of Phonebot 2.0) disputes a Phonebot 2.0 bug → PM accepts → alert
    fires + bug.assigned_to = '' + reassigned_reason explains.

### Docs

- New `offboarding-runbook.md` — 10-step procedure (T-7d through post-departure verification),
  cross-references `removeUser()`, TOTP revoke via wrangler, payout override flow, sandbox-test.
- New `qa-sandbox-run/user-clicks-qa.md` — full user-clicks QA agent report with all 11 findings
  (1 BLOCKER + 5 HIGH + 5 MEDIUM/LOW). Now archived as the source-of-truth for what these patches fix.

pytest 58/58 still green. node --check on inline JS clean.

---

## 2026-04-25/26 — Pre-AWS-launch hardening pass: persistence, reactivity, dead-settings wiring

Single-file SPA (`devdash.html`) hardened for the AWS static deploy. Every config field in Settings
either fires client-side or is honestly labelled `SERVER` (requires AWS pipeline). Persistence,
reactivity, and contributor flows audited end-to-end.

### Functional fixes

- **C2** `submitOffProject()` now calls `save('devMockData')` and init merges persisted devMockData
  over the in-memory seed (so seed devs aren't lost on upgrade). Off-project hours now survive
  reload.
  - **Test:** As a dev (Faizan), click "+ Log off-project", enter `2` hours + a description, submit
    → reload page → off-project counter under the compass shows the same value.
- **M1** Single-flight `_guard()` helper (1500ms TTL) applied to `submitBug`, `submitAudit`,
  `submitFeature`, `submitOffProject`, `submitPmAssessment`, `submitDispute`, `addBlocker`. Blocks
  rapid double-clicks even if `:disabled` reactivity hasn't propagated.
  - **Test:** As QA, fill new-bug form, double-click "Submit bug" rapidly → only one bug appears in
    the queue (no duplicate).
- **M2** QR `<img>` for login + Settings → Users now has `@error="qrFailed = true"` fallback
  showing the otpauth URL as text so users can paste manually if `api.qrserver.com` is blocked.
  - **Test:** Block `api.qrserver.com` in DevTools (Network → block request URL) → reload → on
    login screen, pick a user, click "I've scanned it" with code `123456` → fallback panel shows
    the otpauth URL instead of a broken image.
- **H4** `emptyDev()` returns `_isEmpty: true`. Dev view shows an amber "No activity data yet"
  banner above the all-zero compass when this flag is present.
  - **Test:** Settings → Users → Add new user (any role: dev) → CEO/PM clicks View profile on the
    new user → amber banner appears above the compass.
- **H5** `regressionCandidates` now carry a `project` field (UI select inline on each row +
  default-to-active-project on add + scoped filter via `filteredRegressionCandidates()` +
  `migrateConfig` backfill for old records).
  - **Test:** Filter dashboard to "Phonebot 2.0" → PM view → "+ Log regression" → new row has
    project pre-set to Phonebot 2.0 → switch project filter to "Phonebot HQ" → only HQ + untagged
    regressions show.
- **H7 / PROB-1 / PROB-2** Added `Probation ends` date column to Settings → Users (saves on
  change). `addUser()` derives `probation_end = today + new_hire_probation_weeks * 7` so the
  reward-skip path in `composeWeeklyRewards` actually fires.
  - **Test:** Settings → Rewards → set "New-hire probation (weeks)" to `2` → Settings → Users →
    "+ Add new user" → newly-created row has Probation ends = today + 14 days. Manually edit any
    existing user's probation date → reload → date persists.
- **BUG-CONTRIB-1** CEO + PM project portfolio cards now render contributor name chips next to
  the Owner line, so contributor changes in Settings → Projects are visible without opening the
  project detail modal.
  - **Test:** Settings → Projects → Phonebot 2.0 → tick a contributor checkbox → CEO view →
    Phonebot 2.0 card shows the contributor's name as a small grey chip immediately.
- **BUG-CONTRIB-2** `setProjectOwner(p, newEmail)` removes the new owner from `contributor_emails`
  (no more ghost duplicates where one person was simultaneously listed as Owner AND Contributor).
  - **Test:** Settings → Projects → Phonebot 2.0 → Contributors: tick Moazzam → change Owner from
    Faizan to Moazzam → contributors checkbox grid no longer shows Moazzam (he's been promoted to
    Owner cleanly). Project detail modal Team section shows Moazzam only as Owner, not duplicated.
- **BUG-CONTRIB-3** `removeUser()` calls `saveConfig()` explicitly at the end (was relying on the
  250ms debounced deep watch, which leaves a refresh-during-debounce race window).
  - **Test:** Settings → Users → click × next to any non-CEO user → confirm → immediately reload
    page (don't wait) → user remains removed; their cascaded reassignments persist.

### Wired previously-dead settings (every Settings field now either fires or is labelled SERVER)

- **VIS-1 / VIS-2** `scoring.visibility.self` (live | weekly | shape_only | opaque) and
  `scoring.visibility.peer` (shapes | shapes_only | none) now actually control compass display.
  CEO/PM/QA/QA-Auditor still see everything (visibility rule applies only to dev role). An amber
  italic note explains why something is hidden.
  - **Test:** Log in as a dev (Faizan) → Settings → Scoring → set "Dev sees own compass" to
    "Shape only" → flip to Dev view → score numbers replaced with `—`, shape still drawn, amber
    note explains why. Set to "Opaque" → entire compass body hidden with a centered notice. Log
    in as CEO → same dev view → all numbers visible regardless of setting.
- **ABS-1** `composeWeeklyRewards` now reads `daysWorkedThisWeek(email)` (counts weekday
  `clockEntries` keys, falls back to 5) and applies `absence_rule`: `full` ignores absence,
  `pro_rated` scales linearly, `forfeit` returns no events if any day is missing.
  - **Test:** Set Settings → Rewards → Absence rule = `forfeit` → "✨ Compose this week's rewards"
    → no events for any dev who has missing clockEntries (or all-5 if no clockEntries exist).
    Switch to `pro_rated` → re-compose → events appear with `Pro-rated × N/5` notes.
- **GROWTH-1** Growth events composed when `compassDelta(dev, direction) ≥ growth_min_delta`.
  `growth_bonus_rule = independent` pays regardless of new score; `threshold_only` requires the
  new score to also be ≥ direction threshold.
  - **Test:** Settings → Rewards → set growth_aud to e.g. `25000`, growth_min_delta `5` →
    "Compose this week's rewards" → check rewardEvents for `type: 'growth'` events with
    `note: '+N pts on <direction>'`. Switch growth_bonus_rule to `threshold_only` → only fires
    for directions where dev's score is also ≥ threshold.
- **OWNER-1** `composeWeeklyRewards` adds `owner_bonus` events when a dev owns a project that is
  `traffic_light: green` AND `forecast_launch ≤ deadline + owner_bonus_grace_days`. Amount =
  `owner_bonus_pct % of true_north_aud`, idempotent per project.
  - **Test:** Settings → Projects → Phonebot HQ (already green) → set forecast_launch `2026-05-18`,
    deadline `2026-05-20`, grace_days `0` → Compose → Moazzam (HQ owner) gets one
    `type: 'owner_bonus'` event for HQ. Re-compose → no duplicate (idempotent).
- **POOL-1** `composeTeamPoolEvents()` distributes `team_pool_aud` once per crossed unlock
  threshold according to `team_pool_split`: `equal` (per active dev), `weighted` (by strong
  directions count), `true_north_only` (TN devs only), `owner_decides` (one unallocated event for
  CEO to split manually).
  - **Test:** Settings → Rewards → team_pool_split = `equal` → portfolio %  crosses next threshold
    (e.g. average % >= 50) → Compose → each active dev gets a `type: 'team_pool'` pending event of
    equal amount. Switch to `true_north_only` → next compose → only devs with all 4 directions
    unlocked get the slice.
- **CYCLE-1** CEO payout banner predicate is now `isPayoutDueToday()` which respects
  `payout_cycle`: `monthly` fires on `payout_day`, `weekly` on Mondays, `quarterly` on day 1 of
  Jan/Apr/Jul/Oct, `ad_hoc` never auto-fires.
  - **Test:** Settings → Rewards → payout_cycle = `weekly` → CEO view → red "Payout day" banner
    shows on Mondays (otherwise hidden). Switch to `ad_hoc` → banner never shows automatically;
    CEO must open Rewards manually.
- **SYS-2** New top-of-page weekly audit reminder banner appears for CEO + PM on the day matching
  `system.weekly_audit_day`. Click "Open Rewards →" jumps to Settings → Rewards.
  - **Test:** Settings → System → set "Full weekly audit day" to today's day → page top now shows
    an amber banner "📅 Weekly audit day". Change to a different day → banner disappears.

### Honesty fixes (no behaviour change but stops the panel from lying)

- Login screen: blue disclaimer "Internal tool — TOTP scan is decorative until the AWS backend
  lands. Any 6-digit code will let you in." Same disclaimer in Settings → Users via the QR card.
- Settings → System → new "Wipe all dashboard data (go-live)" danger button. Two confirms. Clears
  every `devdash_*` localStorage key. Use ONCE before launch to clear demo seeds.
- `backend-badge` `SERVER` chip + inline note added to: `system.daily_pull`, `system.context.*`
  (3 fields), `system.snapshots.*` (3 fields), `system.aws.*` (4 fields). These don't fire
  client-side and now say so.
- Project detail modal → readiness checklist now carries a `MANUAL` badge with inline note:
  "Manual-by-design — most readiness items (e.g. 'QA sign-off', 'rollback tested') are human
  judgments. CI-detectable items will auto-tick once the AWS pipeline is wired." Stops CEO from
  expecting auto-magic ticking that doesn't exist yet.

### Settings panel — every field's status

| Field | Wired | Notes |
|---|---|---|
| `system.severity_labels`, `urgency_labels` | ✓ | Drives bug/feature form selects |
| `system.timezone` | ✓ | Live clock |
| `system.weekly_audit_day` | ✓ | New SYS-2 banner |
| `payout_day`, `monthly_budget_ceiling`, `payout_cycle`, `require_dual_approval` | ✓ | Banner + over-budget warning + cycle gate |
| `currency`, `unlock_thresholds`, `per_direction_aud`, `true_north_aud`, `growth_aud`, `team_pool_aud` | ✓ | Reward composition + payout flow |
| `scoring.directions.*.label/.threshold`, `handoff_multiplier.*`, `traffic.*` | ✓ | Compass + signal + coaching |
| `scoring.visibility.self`, `.peer` | ✓ NEW | VIS-1/2 |
| `rewards.absence_rule` | ✓ NEW | ABS-1 via clockEntries |
| `rewards.new_hire_probation_weeks` + `users[].probation_end` | ✓ NEW | PROB-1/2 |
| `rewards.growth_bonus_rule`, `growth_min_delta` | ✓ NEW | GROWTH-1 |
| `rewards.owner_bonus_pct`, `owner_bonus_grace_days` | ✓ NEW | OWNER-1 |
| `rewards.team_pool_split` | ✓ NEW | POOL-1 |
| `rewards.termination_rule` | ✓ | Used by removeUser cascade |
| `rewards.payout_reminder` (push portion) | ⚠ banner only | Push needs backend |
| `system.daily_pull` | ⚠ SERVER badge | Needs AWS daily Lambda |
| `system.context.*`, `system.snapshots.*`, `system.aws.*` | ⚠ SERVER badge | Pure config; consumed when backend lands |

### Still open (documented, not built — would require backend or significant new work)

- **Real auth (C1).** Any 6-digit code logs in as the picked user. Mitigated by the explicit
  disclaimer on login + Users tab. Real fix needs either a backend with TOTP verify, or
  Cloudflare Access / Cognito / similar in front.
- **Synthetic compass numbers (H1/H2/H3).** `compassDelta`, `personalBestAvg`, `handoffStreak`,
  per-project compass via `devForProject` — all derived from email-hash seeds. Look real, are not.
  Senior engineers will spot them. Mitigation: tooltip annotation deferred to post-launch.
- **No real git sync.** Devs' commits + items_closed + target are seeded in `devMockData`. The
  Python pipeline in `scripts/dashboard/` is the intended source but is not wired to the SPA. Real
  fix: a backend job runs the existing pipeline weekly, writes JSON, SPA fetches it on init.
- **No multi-user collaboration.** Each browser is its own world. CEO can't see PM's bug reassigns
  without sharing a browser session. Real fix: any backend with shared state (Cloudflare Workers +
  KV is the cheapest path; existing `worker/` folder has partial scaffolding).
- **Modal a11y.** No focus trap, no return-focus-on-close, no `:focus-visible` rings. Deferred.
- **Mobile <375px polish.** Header bars overflow on iPhone SE width. Deferred.
- **`Date.now() + Math.random()` IDs are floats.** Should use `crypto.randomUUID()`. Deferred —
  no functional bug observed.
- **Single-file 4,743-line HTML.** Hard to diff in PRs. Splitting into `index.html` + `app.js` +
  `tailwind.css` + built `tailwind` deferred to next sprint.
- **No automated tests.** Should add Playwright happy-paths for: login → log off-project → run
  payout. Deferred.

### Sandbox verification (single-browser)

- Stage 1/2/3 all pass `node --check` on extracted JS (122 KB).
- HTML structural balance verified: div=885/885, template=204/204, button=104/104, select=54/54,
  textarea=10/10, table=2/2, svg=3/3, script=3/3.
- Static server (`python3 -m http.server 8000`) serves devdash.html as 332 KB in ~24 ms.
- 45 `FIX` markers in source after this pass (was 14 pre-pass; +31 added).

### Files changed

- `devdash.html` — sole product. +391 / -77 lines.

---

## 2026-04-24 late-evening — Language-QA batch, viewer role, audit card upgrade, Faizan-handoff Parts 9-11

### Language-QA fixes (9 of 18)
- **L01** `git_sync.py` NameError (already fixed by pytest agent earlier).
- **L02** Added `timeout=60` + `encoding="utf-8"` to `subprocess.run` in `git_reader.py` so one hung/huge/LFS-prompting repo can't wedge the sync.
- **L03** `read_text(encoding="utf-8")` everywhere in `config.py` + `handoff_parser.py` — breaks silent mis-decoding on non-UTF8 platforms.
- **L04** `git_sync.sync_project()` now merges existing commit JSON before overwriting, so the webhook + cron can't clobber each other mid-day.
- **L06** `currentWeekStart()` rebuilt with local-time components (no UTC round-trip) so Sydney-local Monday no longer keys to Sunday.
- **L08** `submitOffProject()` guards `parseFloat(hours)` with `Number.isFinite` + alert; no more NaN poison into compass + reward amounts.
- **L10** `save(key)` wraps `localStorage.setItem` in try/catch with user-visible alert on quota exceed + `_storageWarnedOnce` latch. `$watch('config')` debounced 250ms.
- **L11** `JSON.parse()` on load now `console.warn`s + records `this.corruptStorageKeys[]` instead of silent swallow. Banner coming in next UI pass.
- **L15** Rotation at init: if `rewardEvents.length > 500`, archive oldest 250 to `devdash_rewardEvents_archive_<YYYY-MM>`. Same for `auditLog > 200`.

### New features
- **Viewer role** (read-only CEO view for non-dev staff — designer / CS / finance / interns). Added to VISIBILITY matrix + user role dropdown + `roleLabel/Color/Badge` helpers.
- **QA Auditor past-audit cards** — ⚖ In-dispute chip + ✓ Dispute accepted / ✕ Dispute rejected chips (dispute state was previously visible only on bug cards). Extended metric display to show `browser`, `owasp`, `risk`, `issue_type`, `lines` inline. Added per-finding delete button with confirm.
- **Schema migration** on init — old audit findings without `category` auto-migrate to `other`; old bugs get `disputed: false` default; old users get `probation_end: null` default (data-arch agent find).

### Docs
- **Faizan handoff** grew with Parts 9–11 (Fahad approved 2026-04-24):
  - **Part 9** Backup + Disaster Recovery — nightly KV dump via `kv_backup.py` cron + restore procedure.
  - **Part 10** TOTP lockout recovery — email-based one-time signed-token reset flow + routes to add in `routes.ts`.
  - **Part 11** Data export — one-click JSON dump button in Settings → System → Danger zone.
- **Phase-2 scope** Appendix C added for Retro + OKR layer (research-required before build, 10 open design questions listed).
- **Persona synthesis** written at `qa-sandbox-run/persona-findings-summary.md` — 5 Baazaar personas aggregated, opposing viewpoints flagged, top-12 features ranked.
- `reward-system-design.md` — all 11 Q-decisions locked.

### Sandbox verification tonight (via `/browse`)
- 5-week × 3-dev × 39-event reward simulation — March batch paid 705k PKR, April batch paid 1.24M PKR, dual-approval gate enforced, ledger reconciles.
- 14 integration bugs fixed + verified.
- Category migration: 3 legacy audits correctly moved to "other" category.
- Dispute lifecycle on audits end-to-end: submit → ⚖ chip → PM accept → ✓ chip + assigned_to cleared.

### Still open (documented, not built)
- 9 language-QA bugs remaining: L05 (Py tz-aware dt), L07 (ISO week formula), L09 (unlock_thresholds NaN filter), L12 (x-html → x-text), L13 (x-for index keys → stable ids), L14 (Date.now() collision), L16/L17/L18 (Worker TS).
- 6 new features Fahad approved tonight but not yet built: data export button, burnout detection chip, compass-score dispute, dispute escalation, offboarding runbook + test, AI insights wiring.
- I05 auditsForDev panel on dev view (helper exists, UI panel missing).
- Real Bitbucket webhook route in Worker.
- Manual `git_sync.py` run against phonebot-revamp repo as E2E smoke test.
- `kv_backup.py` + `kv_restore.py` scripts (specced in Faizan handoff Part 9).

---

## 2026-04-24 evening — Reward system MVP, Growth Track, 14 integration fixes, PM lockdown, dispute lifecycle wired

### New features
- **Reward system MVP** — `rewardEvents[]` + `payoutBatches[]` schemas; monthly payout cycle with configurable `payout_day` (1–28); "Compose this week's rewards" button (Settings → Rewards) seeds events idempotently; payout modal with event checklist + dual-approval (CEO + PM checkboxes, both required when `require_dual_approval: true`); "Payout due today" green banner fires on `payout_day` with total pending amount; rewards history panel on dev view (this week / this month / last month / lifetime + expandable per-event list); silent receipt (history visible, no push); Danger-zone **Reset reward history** button (two confirms, wipes `rewardEvents` + `payoutBatches`, keeps settings).
- **Reward policy locked — 11 decisions:** monthly cadence / pro-rated absence / forfeit on termination / owner_decides team-pool split / dual approval required / silent receipt with history / banner+push on payout_day / flexible growth-bonus rule / strict owner-ship-on-deadline / no clawback / no streak bonus.
- **Growth Track card (dev view)** — three panels: (1) Growth focus this week — weakest direction + micro-challenge + 3 learning resources + Mark-done; (2) Streaks & milestones — handoff streak, challenges done, personal best, True North countdown; (3) Write-up clarity — lints latest handoffs for vague phrases / missing sections / short word count. **"✎ Polish a note" modal** — paste draft, get issues list + suggested rewrite.
- **PM bug queue locked down** — severity badge and status chip are read-only with tooltips ("Severity owned by QA · Status owned by dev · You can reassign only"). Assignee remains the only PM-editable field.
- **Dispute lifecycle properly wired** — `submitDispute()` now marks `bug.disputed = true` + `dispute_id`, and records the *attributed* dev (not the disputing party); blue **⚖ In dispute** chip renders on bug/audit cards while open. `resolveDispute('accepted')` clears `disputed` + re-routes bug to project owner via `suggestDevForBug`. `reassignDispute()` moves assignment + clears `disputed`. `resolveDispute('rejected')` clears `disputed`, attribution stands.
- **Safe user removal** — `removeUser()` confirm dialog enumerates every cascade (owner_email cleared, contributor lists, open bugs + features reassigned to project owner, disputes marked resolved_by="user removed", pending rewards voided per `termination_rule`). All reconciled atomically; audit log records the summary.
- **Safe project removal** — `removeProject()` archives bugs / audits / feature requests by renaming project tag to `(archived: <name>)` instead of orphaning them; audit log records counts.

### Integration fixes (14)
- **I01** `regressionCandidates` bootstrapped with seed items + persistence.
- **I02** `auditLog[]` persisted to localStorage; survives reloads.
- **I03 (BLOCKER)** `removeUser()` now reconciles bugs / features / disputes / audits / blockers / projects / rewards in one pass — no more orphans.
- **I04** `removeProject()` archives orphans rather than deleting silently.
- **I05** `auditsForDev(email)` helper added; audit feed on dev view no longer crashes on missing assignee.
- **I06** `submitOffProject()` falls back to `currentUser` for non-seed devs (logging off-project from new accounts works).
- **I07** `resetConfigToDefaults()` confirm text is accurate; clears session state + `provisioned` flag; no more half-reset limbo.
- **I08** `reassignDispute()` filters by `status === 'active'` so archived devs aren't suggestable.
- **I09** `suggestDevForBug()` skips absent owners, falls through to contributors; no more auto-routing bugs to someone on vacation.
- **I10** `resolveDispute('accepted')` routes bug back to project owner (not just clearing attribution).
- **I11** Compass SVGs use CSS vars instead of hardcoded colors — themes work on all three modes.
- **I12** `.pulse` keyframe added (decision-inbox bell was styled but not animating).
- **I13** `submitDispute()` attributes the bug to the dev the bug *is on*, not the disputing party (bug: devs were previously disputing into their own name).
- **I14** `pendingOnCeo(projectName)` accepts an optional project scope; per-project CEO views count decision debt correctly.

### Infrastructure
- **Git sync scaffolded** — `scripts/dashboard/git_sync.py` written. Pulls daily commits from every project's repos; writes per-day JSON; idempotent on re-run; emits `_sync-report` with counts + errors.

### Verification
- **Sandbox re-verified end-to-end** — 14 `/browse` test runs. Reward simulation: 5 weeks × 3 devs × 39 events. March batch paid 705k PKR, April batch paid 1.24M PKR; ledger reconciles, dual-approval gates enforced, audit log captures every action.

---

## 2026-04-24 — Project detail modal, PKR currency, absence flow, density + collapse

### New features
- **Project detail modal (CEO + PM)** — clicking any project card opens a modal with build %, launch-readiness %, team, scope (IN/OUT), phases with progress bars, tickable readiness checklist, risks, links, repos. `✎ Edit` toggle makes every field inline-editable (phases, readiness items, risks, links all have add/remove buttons). Footer has "Filter dashboard to this project" shortcut.
- **PM Projects grid** — PM view now has the same clickable project grid as CEO, opening the same detail modal. Each card also has a "Filter" button for direct filtering.
- **Clickable dev cards** — CEO "Standout this week" card and all PM dev cards now click-through to that dev's full view. Old "View profile →" button is still there for clarity.
- **Developer absence flow** — every user has `absence: { type, until, note }`. Dev view has a self-serve banner: "🤒 Sick today" / "🏖️ Vacation (prompts for return date)" / "⏸ Other (prompts for date + note)" / "I'm back". PM dev cards show an absence badge. CEO view gets a "Out today / this week" callout panel (only appears when someone is absent).
- **PKR currency (configurable)** — Settings → Rewards has a Currency dropdown (PKR/AUD/USD/GBP/EUR/INR/AED). Default PKR. `formatMoney()` renders PKR-friendly (`35k`, `1.8L`). Default reward amounts scaled to PKR (35k / 180k / 25k / 350k).
- **Auto-QR flow** — adding a new user in Settings → Users pops an auto-QR card at the top (copy-link + dismiss). Every existing user row has a "QR" button to re-show the QR anytime.
- **Density toggle** — top-nav `≡/☰` button switches comfortable ↔ compact density site-wide (applies via `.density-compact` CSS class on body).
- **Collapsible sections** — CEO Portfolio and PM Projects sections now have ▾/▸ toggle headers.
- **Reset to defaults** — Settings → System has a new Danger zone card with "Reset all settings to defaults" button (clears `devdash_config` localStorage and reloads; bugs/audits/handoff preserved).

### Schema additions
- `projects[]`: `scope_in`, `scope_out`, `phases[]`, `readiness[]`, `risks[]`, `links[]`.
- `users[]`: `absence: { type, until, note }`.
- `rewards`: `currency`.
- `auditFindings[]`: `category`, `severity`, `assigned_to`, `cc[]`, plus category-specific fields (url, metric, actual, target, device, viewport, browser, file, issue_type, lines, owasp, risk).
- `bugs[]`: `device`, `browser`, `url`, `reproducible`, `steps`, `expected_actual`.

### QA & QA Auditor views
- **QA view upgrade** — device (desktop/tablet/mobile) + browser (Chrome/Safari/Firefox/Edge/iOS Safari/Android Chrome) + URL + reproducible (always/sometimes/once) + steps + expected-vs-actual fields on the bug form.
- **QA Auditor rebuilt** — 10 categories (performance, responsive, code_quality, security OWASP, accessibility, seo, regression, parity, cross_browser, other), severity (blocker/high/medium/low), category-specific metric fields (e.g. performance gets URL + metric + actual + target; security gets OWASP category + risk). Email-like routing: TO (assigned dev dropdown) + CC (checkbox multi-select across PM/CEO/other devs/QAs). Category + status filters on the findings list. Inline status dropdown on past audits. TO/CC headers shown on each audit card.

### Fixes
- **Theme system now actually works** — `.glass`, `.card`, `.card-hover`, `.tab-btn`, `.proj-btn`, `input/select/textarea`, `button.primary/secondary`, `.scrollable-thumb`, `.progress-track`, `.quote-footer` all use CSS variables. Three themed gradient vars (`--grad-banner`, `--grad-dev`, `--grad-compass`) with matching classes replace the 3 inline dark gradients that used to stay black on light/cream themes.
- **CEO Distribution panel** — renamed to "Portfolio health"; now shows portfolio-wide stats when `activeProject='all'`, switches to per-project status/%/forecast/days-remaining when a single project is selected. Was stagnant before.
- **PM contributor propagation** — comma-separated email input replaced with checkbox multi-select of active devs (no more silent typos). `$watch('config', ..., { deep: true })` auto-saves every field edit — the "Save changes" buttons are now redundant safety nets.
- **Stale localStorage masking defaults** — `migrateConfig(defaults)` merges missing fields from shipped defaults into any cached config without overwriting user edits. Also re-pulls shipped `scope_in/scope_out/phases/readiness/risks/links` if the user had them blank.
- **Users tab affordances** — `!bg-transparent !border-transparent` classes removed from user row inputs; role/status/email/hours are now visibly editable.
- **Per-project compass** — dev view `devViewTarget()` and PM view `sortedDevsForPm()` now return project-scoped versions when `activeProject != 'all'`. Compass numbers shift deterministically per `(dev, project)` via email+project char-sum hash. Commits filter by project prefix. Badge on dev view header shows "On: <Project>" vs "All projects".

### Personality pass
- **Role-specific punchy greetings** — `greeting()` + `greetingSpark()` now rotate 5 role-specific lines per day. CEO: "👑 The buck stops at your inbox"; Dev: "⚡ Your compass is your story. Ship something small today"; QA Auditor: "🧐 Five sharp findings > fifty filler ones"; PM: "📬 Decision debt grows like office plants nobody waters."
- **PM Monday morning summary** rewritten from dry stats into a tactical briefing: lead sentence routes on worst traffic light, emoji-tagged bullets for HIGH bugs / stuck PRs / at-risk devs / decision debt / disagreements / regressions, standout + off-project blurb, rotating italic closing line ("Your job is to remove rocks from the path, not put new ones there").

### New skills (invokable via `/`)
- `/devdash-daily` — end-of-day dev helper (<60s); picks project, pulls today's commits, asks 4 questions, appends CLOSED/IN PROGRESS/OPEN/OFF-PROJECT to `daily-handoff.md`, prints PM-pasteable summary.
- `/devdash-audit` — weekly CEO/PM audit pipeline; loads config → git log per repo → handoff parser → uploads reader → matcher → merit → forecast → renders per-role HTML to `output/YYYY-WW/`.
- `/devdash-git-sync` — one-time setup for Bitbucket webhook + daily cron; writes `scripts/dashboard/git_sync.py` + `git-sync-README.md`.

### Known blockers (from QA audit — do NOT deploy to public URL without addressing)
- `tryLogin()` accepts any 6-digit code — only the Cloudflare/AWS Worker enforces real TOTP.
- Role leakage via DevTools — Settings tab + peer compass + bonus amounts visible to any client.
- XSS in `pmSummaryHtml()` via `x-html` + interpolated `displayName`.
- `worker/wrangler.toml` has `<FILL_AFTER_KV_CREATE>` placeholder.
- Zero tests for `devdash.html` Alpine logic, `worker/src/*.ts`, or malformed handoff-input paths.

### Deferred
- Alternative CEO dashboard layout toggle (tabled until later).
- Archive mechanism (soft-hide closed bugs + closed audits).
- Collapsible sections beyond CEO Portfolio + PM Projects.

---

## 2026-04-24 earlier — Initial scope expansion + v2 spec

See `daily-handoff.md` entries 00:00 through 18:05 for Tasks 1–21 (foundation → Cloudflare Worker scaffold → TOTP provisioning → Worker auth + email cron → KV push → helper slash commands → operator README). 53/53 pytest tests pass at that point.

## 2026-04-23 — v1 spec + plan committed

See `2026-04-23-dev-dashboard-design.md` + `2026-04-23-dev-dashboard-plan.md`.
