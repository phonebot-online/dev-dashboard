# devdash — Phase 1 Scope
**Owner:** Fahad (CEO, Phonebot)
**Domain:** devdash.phonebot.co.uk
**Status:** Phase 1 feature set shipped in-browser on 2026-04-24 — demoable today, but NOT production-safe until Phase 1.5 blockers clear
**Target build duration:** 4 weeks after design sign-off (compressed — core shipped in a single working session)
**Date written:** 2026-04-24
**Last updated:** 2026-04-24 (post-ship reconciliation)

---

## Goal

Ship a fully operational multi-project dev visibility dashboard that lets Fahad see what his team is doing across 5 projects in real time, with role-gated views, TOTP login, daily email digests, and AWS-backed data storage — all for under $20/month.

---

## 1. Locked Feature List — 37 features (shipped in browser)

The following items are the complete Phase 1 scope. Items 1–25 were the original locked scope. Items 26–37 were promoted into Phase 1 during the April 24 build session because they turned out to be 1–2 hour work each, not 1–2 day work.

1. **TOTP auth** — Login via Google Authenticator for all 8 users. Session cookie (HttpOnly, Secure, SameSite=Strict), 24-hour TTL. Logout invalidates the session in DynamoDB immediately. *Note: the current front-end login is decorative — any 6 digits work. Real TOTP verification is a Phase 1.5 blocker, see Section 8.*

2. **5 role views with visibility matrix** — CEO (Fahad), PM (Imran), Dev (Faizan, Moazzam, Faisal, Usama), QA (junior), QA Auditor (Mustafa). Each role sees a different subset of data. The matrix is enforced server-side in Lambda before any S3 read. *Note: current client-side role gating is bypassable via DevTools. Server-side enforcement is a Phase 1.5 blocker.*

3. **Per-project sub-tabs** — All 5 projects (Phonebot 2.0, Phonebot HQ, Product Page Revamp, Mobile App MVP, Legacy Maintenance) appear as sub-tabs within every role view that has project access. Project count is configurable via `dashboard.config.yaml`.

4. **Compass visualization** — 4-axis radar chart per developer: Velocity, Craft, Reliability, Drive. Rendered as an SVG in the dev's own view and in CEO/PM views. Direction unlock thresholds configurable per project.

5. **Handoff multiplier** — Every Compass direction score is multiplied by a factor between 0.85 and 1.0 based on handoff completeness and quality. A developer who does not submit handoffs has all four Compass directions scaled down to 0.85. A developer with complete, structured handoffs scores 1.0. The multiplier is shown numerically in the score breakdown so it is never hidden.

6. **Rewards** — Four reward types, all configurable amounts:
   - Per-direction unlock: dev reaches threshold on a single Compass direction
   - True North bonus: dev scores above threshold on all four directions simultaneously
   - Team pool: shared bonus when the team as a whole hits a target
   - Owner bonus: manually issued by CEO to any dev
   Rewards are displayed in the dev's own view and in the CEO view. No automatic payment processing — rewards are recorded as ledger entries, disbursement is offline.

7. **Settings UI** — CEO and PM can edit: project list (name, deadline, dev assignments), user accounts (role, status), scoring thresholds (per Compass direction, per project), reward amounts, data retention tier durations, and audit log viewer. Read-only for all other roles.

8. **QA bug submission** — Form with fields: title, severity (P0–P3), description (markdown), project assignment, reproduction steps, device, browser, URL, reproducible (yes/no/sometimes), expected vs actual behaviour. On submit, written to `s3://devdash-data/projects/{project}/qa-findings/`. Auto-routed to project owner's open-items queue in DynamoDB. QA junior only. *Upgraded during April 24 build — original scope was title/severity/description/project/repro only.*

9. **QA Auditor audit submission** — FULLY REBUILT during April 24 build. Mustafa submits audits across 10 fixed categories (functionality, visual, accessibility, performance, security, data integrity, content, UX flow, mobile, compatibility) with per-finding severity (P0/P1/P2/P3) and TO/CC email-style routing to the responsible dev(s) plus PM/CEO observers. Category-specific metrics surface on the CEO and PM dashboards. Written to `qa-audits/` in S3. QA Auditor role only.

10. **Feature request** — Any CEO or PM user submits a feature request (title, description, urgency, target project). Written to `feature-requests/` in S3. Appears in the assigned dev's queue on their next dashboard load.

11. **Off-project logging** — Dev logs time spent on interruptions (e.g., IT support, admin tasks, cross-project meetings) with a category, duration in minutes, and optional note. Logged items reduce the dev's available hours for Reliability scoring. Dev and CEO can see the log. PM sees total hours affected, not the individual entries.

12. **Daily clock-in** — Dev clicks "Start Day" when they begin and "End Day" when they finish. Clock records written to DynamoDB (`DEV#{email}:CLOCK#{date}`). Weekly hours totalled and displayed. No GPS, no enforcement — this is an honor system input. If a dev doesn't clock in, the day shows as "not recorded."

13. **Dispute flow — dev-side only** — Dev can raise a dispute on: (a) a specific commit being misattributed in the audit, or (b) a bug being incorrectly attributed to them. Dispute goes to PM's open disputes queue. *PM-side approve/reject/reassign UI is NOT shipped — deferred to Phase 2.* Disputes do not automatically change scores — CEO must apply any manual override separately.

14. **PM independent assessment upload** — Imran can upload a markdown or plain-text assessment file for any dev, for any week. Stored at `s3://devdash-data/projects/{project}/uploads/imran/`. Visible in PM view and CEO view. Never shown to the assessed dev directly.

15. **CEO hero banner** — Compact portfolio summary at the top of the CEO view: total open items across all 5 projects, number of items closed this week, number of active devs who clocked in today, overall team traffic light (green/amber/red derived from project traffic lights). No scrolling required to see this panel.

16. **Decision debt** — Items where the blocker is a pending CEO decision are tagged `waiting:ceo` in their item record. The CEO view shows these items grouped in a "Waiting on You" panel with a days-stuck counter. Items stuck over 5 days are highlighted amber; over 10 days, red.

17. **Stuck PRs** — Items of type `PR` that have been open for more than 2 calendar days without a merge or close event are surfaced in the PM and CEO views with a "stuck" badge and the number of days waiting.

18. **Regression watch — UI only** — The "possible regression" badge, match reference, and grouping panel are all shipped. *The underlying match logic is hardcoded demo data — real keyword extraction against `items/closed.json` is a Phase 2 item.* This is the single largest gap between what looks shipped and what is actually shipped.

19. **Daily email digest** — AWS SES sends an email to Fahad and Imran every weekday morning (configurable time, default 08:00 Sydney). Email contains: items closed yesterday (per project), new bugs filed, stuck PRs, decision debt items over 5 days, any disputes opened. Plain text + minimal HTML. SES cost at this volume: under $0.10/month. *SES wiring is in the worker code; not yet deployed. See Phase 1.5.*

20. **Theme system** — Dark, light, and cream themes. Stored per user in DynamoDB. Persists across sessions. Toggle is visible in the nav bar on all role views. *Theme bug on cards was fixed during April 24 build — previously some cards ignored the active theme. Now consistent across every card.*

21. **AWS backend** — S3 (data storage) + DynamoDB (hot tier + sessions) + Lambda (audit triggers, email, weekly audit runner) + SES (email). Cloudflare Worker handles auth and HTML delivery. No EC2, no RDS, no containers. *Worker source exists in `worker/src/*.ts`; `wrangler.toml` has `<FILL_AFTER_KV_CREATE>` placeholder. Not yet deployed. See Phase 1.5.*

22. **Data tiering** — Hot: DynamoDB, 0–14 days, TTL auto-deletes. Warm: S3 Standard-IA, 15–90 days, S3 Lifecycle rule transitions automatically. Cold: S3 Glacier Deep Archive, 90+ days, S3 Lifecycle rule. Retention durations configurable via Settings UI without touching infrastructure.

23. **Knowledge card** — One 500-word rolling plain-text summary per project, regenerated weekly by the audit Lambda using Claude. The card contains: current objective in one sentence, who is assigned to what, the 3 most important open items, current blockers, last week's QA finding summary, merit tier distribution. The previous card is archived to `week-summaries/` before replacement. All roles see the knowledge card for their visible projects.

24. **Per-project context isolation** — Lambda context builder constructs S3 paths using only the active `project_id`. No cross-project data loads in any default run. Cross-project data requires explicit CEO action via the "load more context" option.

25. **Token budget tracking** — The CEO view shows: tokens consumed in the last weekly audit run, tokens consumed in the current month, percentage of estimated monthly quota used. A warning appears at 80% of the monthly estimate. Token counts are written to DynamoDB after each Lambda run.

---

**Promoted into Phase 1 during the April 24 build session:**

26. **Project detail modal** — Click any project from the CEO or PM view and a full modal opens showing scope, phases, readiness percent, active risks, and related links. Replaces the previous "click a project = nothing happens" behaviour.

27. **Inline editing inside the project detail modal** — CEO and PM can edit scope text, phase status, readiness, and risks directly in the modal without going to Settings. Edits persist to the same DynamoDB record the modal loads from.

28. **PKR currency + configurable currency dropdown** — Previously AUD-only. Now defaults to PKR for the Karachi team and exposes a dropdown in Settings (AUD / PKR / USD / GBP). All reward ledger entries, financial totals, and displays respect the active currency.

29. **Developer absence flow** — Self-serve: dev marks themselves absent (sick, leave, personal) with a reason and expected return. PM and CEO see an Absence column next to Compass scores. Absent devs are excluded from stuck-PR attribution and have their Drive direction paused for the day rather than penalised.

30. **Density toggle (comfortable / compact)** — Every role view has a density switch in the nav bar. Comfortable is the default for CEO. Compact is the default for devs and QA. Persisted per user in DynamoDB.

31. **Collapsible sections** — CEO Portfolio and PM Projects sections are collapsible. State persists per user. Reduces scroll on long pages. (More sections become collapsible in Phase 2.)

32. **Per-project compass scoping** — When a CEO or PM picks a project filter, the Compass numbers for every dev recompute against only that project's commits, handoffs, and QA findings. Previously the numbers were a flat cross-project average regardless of the filter.

33. **Auto-QR card on new user creation + per-user QR button** — Creating a new user in Settings auto-generates a TOTP QR code card, displayed inline and emailable. Every existing user row has a "QR" button to regenerate and redisplay without touching the CLI.

34. **Schema migration + Reset-to-defaults escape hatch** — New schema version number is stamped on every stored record. On load, stale records auto-migrate. "Reset to defaults" button in Settings clears the current user's local state if the UI gets wedged.

35. **Role-specific punchy greetings + rebuilt PM morning briefing** — CEO, PM, Dev, QA, QA Auditor each get a role-shaped one-line greeting at the top of their view. The PM morning briefing was rebuilt from scratch — now surfaces yesterday's closed items, today's expected deliveries, active disputes, and absent devs in a single scannable block.

36. **CEO Distribution panel responsive to project filter** — The distribution chart (merit tier distribution across the team) now recomputes when the project filter changes. Previously always showed all-projects data regardless of filter.

37. **Clickable dev cards** — Dev cards in PM view and the CEO Standout panel are now clickable — opens the dev's full Compass breakdown, recent handoffs, and commit summary in a side panel.

**Also shipped outside the numbered feature list (supporting infrastructure):**

- `/devdash-daily` skill — end-of-day dev helper, writes structured handoff entries in under 60 seconds
- `/devdash-audit` skill — weekly CEO/PM audit, renders per-role HTML snapshots
- `/devdash-git-sync` skill — Bitbucket webhook + HMAC verification + cron entry docs for daily commit sync

---

## 2. Explicit Out of Scope for Phase 1

The following items are confirmed out of scope and will not be built, prototyped, or partially implemented in Phase 1. They live in Phase 2.

- Mobile app or PWA
- ML-based regression detection (keyword match only is the *intended* Phase 1; hardcoded demo is the *actual* Phase 1 — see item 18)
- AI-usage detection or prompt-quality flags
- Peer nomination layer
- Real-time concurrent editing with locks (Phase 1 has a "last write wins" indicator only — concurrent edit lock is Phase 2)
- Cross-project capacity planning view
- Weekly retro auto-generation (Claude-written drafts)
- Cost/revenue linkage or Xero integration
- Slack, Jira, Linear, or any third-party integration
- ML-assisted effort estimation
- Public API
- SSO or SAML
- Screenshot archive (Phase 1 stores JSON state snapshots only)
- Bug attribution from git blame (Phase 1 manual attribution only)
- Snapshot time machine with time slider
- DR automated offsite backup (S3 versioning enabled, but no automated export)
- Quarterly performance view (deferred to Phase 2)
- Secret rotation workflow for TOTP reset
- Custom-prompt upload flow (CEO/PM pushes a prompt scoped to a project, dev uploads word-for-word output) — deferred to Phase 2
- Automated email-to-CEO on bug submission via SES — deferred to Phase 2
- PM-side dispute resolution UI (approve/reject/reassign) — deferred to Phase 2
- "Stick" / private-conversation flow for underperformers — deferred to Phase 2
- Archive mechanism (soft-hide closed bugs and closed audits) — deferred to Phase 2
- Collapsible sections for views beyond CEO Portfolio and PM Projects — deferred to Phase 2
- Alternative CEO dashboard layout toggle — deferred to Phase 2

---

## 3. User Acceptance Criteria

### CEO (Fahad)
- Can log in with Google Authenticator TOTP (real TOTP, not the demo 6-digit accept)
- Sees hero banner (total open items, items closed this week, active devs today, team traffic light) without scrolling
- Can see all 5 projects in sub-tabs
- Can view each dev's full Compass radar, raw scores, and signal breakdown
- Can click any project and see the full project detail modal (scope, phases, readiness, risks, links)
- Can edit project detail fields inline inside the modal
- Can click any dev card to see their full breakdown
- Can see the "Waiting on You" decision debt panel with days-stuck counter
- Can see all stuck PRs across all projects
- Can see the distribution panel recompute when a project filter is selected
- Can trigger the weekly audit manually from the UI
- Can view and edit all Settings (projects, users, thresholds, rewards, retention, currency)
- Can set currency to AUD, PKR, USD, or GBP
- Receives daily email digest by 08:00 Sydney time (once SES is deployed)
- Can see token budget usage for the current month
- Can apply a manual override to any dev's merit score with a reason logged
- Can disable a user account in Settings
- Can view the full audit log
- Can toggle density (comfortable / compact)
- Can collapse / expand Portfolio sections
- Can mark a dev absent and see the Absence column on Compass

### PM (Imran)
- Can log in with TOTP
- Can see all 5 projects in sub-tabs and per-project Compass scoping
- Can see all dev Compass radar charts (aggregated tier only — no raw scores)
- Can see the rebuilt morning briefing
- Can see open dispute queue *(approve/reject/reassign UI is Phase 2 — for now PM can only view the queue)*
- Can upload an independent assessment for any dev
- Can submit feature requests to any project
- Can edit Settings for projects, users, thresholds, and rewards (same editing rights as CEO)
- Can click any dev card to see full breakdown
- Can collapse / expand PM Projects sections
- Can see absent devs in the dedicated Absence column
- Sees stuck PRs for all projects
- Receives daily email digest

### Dev (Faizan, Moazzam, Faisal, Usama)
- Can log in with TOTP
- Sees their own Compass radar with current scores and handoff multiplier
- Sees the knowledge card for each project they are assigned to
- Can submit daily handoffs (with `/devdash-daily` slash command backing it)
- Can clock in and clock out
- Can log off-project interruptions with category and duration
- Can submit feature requests
- Can raise a dispute on a commit or bug attribution
- Can mark themselves absent with reason and expected return
- Can see their own rewards ledger (in configured currency)
- Can only see other projects' knowledge cards — no other devs' data visible
- Cannot see any other dev's merit scores *(this is enforced client-side only today — Phase 1.5 blocker for server enforcement)*

### QA (junior)
- Can log in with TOTP
- Can submit bug reports (title, severity, description, reproduction steps, device, browser, URL, reproducible, expected vs actual) for assigned projects only
- Can see QA findings they have submitted
- Cannot see merit scores, Compass data, or handoff content

### QA Auditor (Mustafa)
- Can log in with TOTP
- Can submit weekly audit for any project across 10 fixed categories with per-finding severity and TO/CC routing
- Can see category-specific metrics on the CEO and PM dashboards
- Can see knowledge cards and QA findings for all projects
- Can see aggregated merit tiers for all devs (not raw scores)
- Cannot see individual merit score breakdowns or raw signal data
- Cannot access the audit log

---

## 4. Build Timeline — Actuals

Original plan was 4 weeks after design sign-off. Actual build compressed heavily:

- **April 23 and earlier:** Design sign-off, scope lock, infrastructure skeleton
- **April 24 (single session):** All 37 features listed above shipped in-browser. Hours estimates had been 1–2 days per item; reality was 1–2 hours.

What still needs time:

- **Phase 1.5 (1–2 weeks):** Security hardening blockers — see Section 8. Nothing goes to production until these close.
- **Week of April 28 onwards:** Real AWS deploy, real TOTP, real git sync, test coverage. Once Phase 1.5 closes, go-live follows immediately.

---

## 5. Go-Live Checklist

All items must be checked before the domain goes live for the full team. Items marked **[1.5]** are Phase 1.5 blockers (Section 8) and must close first.

**Infrastructure**
- [ ] **[1.5]** Cloudflare Worker deployed to `devdash.phonebot.co.uk`, HTTPS enforced, `wrangler.toml` has real KV namespace IDs (no `<FILL_AFTER_KV_CREATE>`)
- [ ] S3 bucket `devdash-data` created in ap-southeast-2 (Sydney), all public access blocked
- [ ] DynamoDB table `devdash` created, on-demand billing, KMS CMK encryption enabled
- [ ] 3 IAM roles created with least-privilege policies (devdash-lambda-audit, devdash-lambda-read, devdash-admin)
- [ ] KMS CMK created, key policy restricts admin to Fahad's IAM user only
- [ ] SES sending identity verified for `devdash@phonebot.com.au`
- [ ] CloudTrail data events enabled on `devdash-data` bucket, logs to `devdash-audit-logs` bucket
- [ ] SQS dead-letter queue attached to weekly audit Lambda (3 retries before DLQ)
- [ ] S3 Lifecycle rules active (IA at 15 days, Glacier at 90 days, expire at 365 days)

**Security (Phase 1.5 blockers)**
- [ ] **[1.5]** Decorative login removed — real TOTP server-side verification wired
- [ ] **[1.5]** Server-side role enforcement — role gating no longer bypassable via DevTools
- [ ] **[1.5]** XSS fix in `pmSummaryHtml()` — `x-html` sink + `displayName` interpolation sanitised
- [ ] **[1.5]** Baseline test coverage for Alpine logic, `worker/src/*.ts`, and malformed handoff-input paths

**Users**
- [ ] All 8 user accounts created in `s3://devdash-data/global/users/`
- [ ] TOTP secrets generated and written to DynamoDB (encrypted)
- [ ] QR codes distributed to: Fahad, Imran, Faizan, Moazzam, Faisal, Usama, Mustafa, QA junior (via auto-QR card feature #33)
- [ ] All 8 users have confirmed they can log in from their own devices
- [ ] All 8 users have confirmed their role view looks correct

**Data**
- [ ] Initial scope documents uploaded for all 5 projects
- [ ] Bootstrap knowledge cards generated and verified for all 5 projects
- [ ] `dashboard.config.yaml` reflects all 5 projects, correct dev assignments, correct thresholds, default currency set
- [ ] `users.yaml` reflects all 8 users with correct roles

**Email**
- [ ] SES test email sent to Fahad and Imran successfully
- [ ] Daily digest Lambda scheduled (EventBridge rule: weekdays 08:00 Sydney time)
- [ ] Email format reviewed by Fahad

**Operational**
- [ ] Weekly audit Lambda test-run against all 5 projects with real data — output reviewed by Fahad
- [ ] Fahad can manually trigger weekly audit from CEO view
- [ ] Token budget tracker showing correct numbers after test run
- [ ] Theme toggle tested in all 3 themes on Chrome and Safari (theme bug fixed during April 24 build — re-verify across all cards)
- [ ] Density toggle tested on all role views
- [ ] Dispute submission tested end-to-end *(PM approve/reject is Phase 2, so PM receipt of the dispute is the acceptance signal here)*
- [ ] Project detail modal and inline edit tested by CEO and PM
- [ ] Currency dropdown tested in all four options
- [ ] Absence flow tested end-to-end (dev marks absent → PM/CEO see absence column)

---

## 6. Known Limitations at Launch

Fahad explicitly accepts these limitations at go-live:

1. **Week 1 merit scores are provisional.** The system needs 3+ weeks of handoffs and commits before merit scoring has enough signal to be reliable.
2. **Regression watch is demo data until Phase 2.** The UI is shipped; the match logic is hardcoded. Real keyword matching is a Phase 2 item.
3. **Clock-in is honor system.** No enforcement. A dev who doesn't clock in shows "not recorded."
4. **Dispute resolution is one-way in Phase 1.** Dev submits, PM sees the queue. Approve/reject/reassign is Phase 2.
5. **Concurrent editing shows a conflict message but does not lock.** "Last write wins." No optimistic locking UI.
6. **No TOTP reset self-service.** Fahad re-provisions manually using the `totp_provision.py` script. Self-service reset is Phase 2.
7. **QA assignment is explicit.** The QA junior can only submit bugs for projects Fahad has explicitly assigned.
8. **Daily email digest is weekday-only.** No weekend email.
9. **Glacier retrieval takes 12–48 hours.** No UI for Glacier restore requests — Fahad must trigger via AWS Console.
10. **Knowledge cards can drift.** Poor handoffs produce poor cards. Garbage in, garbage out.
11. **Git sync is placeholder data.** The `/devdash-git-sync` skill sets up the infrastructure and docs; actual Bitbucket webhook wiring happens during Phase 1.5 / go-live. Until then commits shown are seeded.
12. **AWS deploy not executed yet.** Worker code exists in `worker/src/*.ts`; `wrangler.toml` has a placeholder. Nothing is deployed to production as of this date.

---

## 7. Success Metrics — 30 Days After Launch

The dashboard is "working" at 30 days if all of the following are true:

1. All 8 users have logged in at least once in the past 7 days (via real TOTP, post Phase 1.5)
2. The daily email digest has fired without failure on at least 18 of the past 20 weekdays
3. At least 3 of the 4 devs are submitting daily handoffs 4+ days per week (via `/devdash-daily`)
4. All 5 projects have a knowledge card with a `generated_at` timestamp within the last 8 days
5. Fahad has used the dashboard to make at least one staffing or prioritization decision he attributes to data from the dashboard (qualitative, self-reported)
6. Fahad has used the project detail modal to update scope or readiness at least 3 times (new — proves the modal + inline edit is actually used, not just shipped)
7. At least 2 devs have used the absence flow end-to-end (new — proves absence is used, not just decorative)
8. Monthly AWS cost is under $8 (well under the $20 target, allowing headroom for growth)
9. Zero P0 bugs open in the dashboard itself that block any role from accessing their view
10. The weekly audit has run successfully for at least 3 consecutive weeks
11. At least 2 disputes have been submitted (PM-side resolution UI is Phase 2 so end-to-end resolution is not yet a metric)
12. Token budget tracker shows monthly consumption under 80% of the quota estimate
13. QA Auditor has filed at least 3 weekly audits using the rebuilt 10-category / TO-CC form (new — proves the rebuilt auditor view works in practice)

---

## 8. Phase 1.5 — Security Hardening Blockers (BEFORE Production Deploy)

These five items were surfaced by the April 24 QA audit. Phase 1 is demoable today in-browser, but **none** of these can be skipped before the dashboard goes live on `devdash.phonebot.co.uk` with real user data. Treat Phase 1.5 as a hard gate, not a nice-to-have.

### 1. Decorative login must route through real TOTP server
**Severity:** P0
**What's broken:** The current front-end login accepts any 6-digit code and drops the user into the role view they picked. There is no server-side verification of the TOTP code against the DynamoDB-stored secret.
**Fix:** Wire the Cloudflare Worker login handler to validate the submitted code against the encrypted TOTP secret in DynamoDB (TOTP RFC 6238, 30-second window, ±1 step drift tolerance). Reject invalid codes with a 401. Rate-limit to 5 attempts per email per 15 minutes.

### 2. Role leakage via DevTools
**Severity:** P0
**What's broken:** Role gating is currently client-side only. Opening DevTools and flipping the `role` variable in Alpine state reveals the Settings tab and peer Compass data to any logged-in user.
**Fix:** Every data fetch the worker handles must re-check the session's stored role from DynamoDB and filter server-side before returning JSON. The client-side role flag becomes a cosmetic hint only — the server is the source of truth.

### 3. XSS in `pmSummaryHtml()` via `x-html` + `displayName` interpolation
**Severity:** P0
**What's broken:** `pmSummaryHtml()` builds an HTML string that embeds user-controlled `displayName` values, then renders with Alpine's `x-html` directive. A malicious display name containing `<script>` or `<img onerror=...>` executes in the PM view.
**Fix:** Either (a) switch to `x-text` and build the structure via DOM nodes rather than a template string, or (b) run every interpolated value through a strict HTML-escape helper before concatenation. Option (a) is the safer choice.

### 4. `wrangler.toml <FILL_AFTER_KV_CREATE>` placeholder
**Severity:** P1 (blocks deploy — not a security bug, but a deploy-blocker)
**What's broken:** The `wrangler.toml` in `worker/` still has `<FILL_AFTER_KV_CREATE>` where the KV namespace ID should be. Attempting `wrangler deploy` fails.
**Fix:** Run `wrangler kv namespace create devdash-sessions`, paste the returned ID into `wrangler.toml`, repeat for any additional namespaces, then deploy.

### 5. Zero test coverage on critical paths
**Severity:** P1
**What's broken:** No tests exist for:
- Alpine component logic (compass score computation, dispute submission, absence flow, currency formatting, theme toggle)
- `worker/src/*.ts` (auth handler, role enforcement, session validation)
- Malformed handoff-input paths (empty body, oversized body, wrong project ID, unicode edge cases)
**Fix:** Minimum bar before production:
- 10 Vitest/Jest tests for Alpine logic covering the happy path and one failure path per feature
- 5 integration tests against a local `wrangler dev` worker covering login success/failure, role enforcement, session expiry, KV read failure, and dispute submission
- 5 fuzz/boundary tests for handoff input paths
Once the 20-test floor is green in CI, Phase 1.5 closes.

**Exit criteria for Phase 1.5:** All 5 items above are closed. CSO review (`/cso`) and `/security-review` both clean on the current branch. Then — and only then — the worker deploys to `devdash.phonebot.co.uk` and Phase 1 go-live checklist proceeds.

---

*Phase 1 scope is locked. Any feature request that arrives during Phase 1.5 or the 30-day stabilisation window goes into the Phase 2 backlog unless it is a P0 bug.*
