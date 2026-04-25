# Dev Dashboard — Design Spec

**Author:** Claude (with Fahad, Phonebot CEO)
**Date:** 2026-04-23
**Status:** Design locked. Implementation in progress (Task 1 complete; spec reopened for scope expansion on 2026-04-23).

---

## 1. Problem in one sentence

Fahad has ~6 developers, plus QA and QA Auditor roles, working across 4+ projects with no project manager, no product manager, and a history of failed senior-junior hierarchies. Visibility and follow-up currently happen over WhatsApp and Slack verbally. Top performers and underperformers are indistinguishable. There is no objective basis for bonuses, raises, or promotions. Bug reports from staging QA don't flow to devs systematically.

## 2. Who uses the dashboard

Five roles, eight people.

### User roster (maintained in `users.yaml`)

| Email | Role |
|---|---|
| fahad@phonebot.com.au | CEO |
| imran@phonebot.com.au | PM |
| faizan@phonebot.com.au | Dev |
| moazzam@phonebot.com.au | Dev |
| faisal@phonebot.com.au | Dev |
| usama@phonebot.com.au | Dev |
| mustafa@phonebot.com.au | QA Auditor |
| qa@phonebot.com.au | QA |

**Display convention:** headers and view titles show **role labels** (CEO / PM / Dev / QA / QA Auditor), not personal names. Personal names still appear in dev panels (the list of "what Faizan shipped") because devs need to be distinguishable — but nowhere is the viewer's own identity shown as "Fahad" or "Imran."

### Visibility matrix (who can see which tabs)

| Role | Tabs they can see |
|---|---|
| Dev | Dev + QA + QA Auditor |
| QA | Dev + QA + QA Auditor |
| QA Auditor | Dev + QA + QA Auditor |
| PM | PM + Dev + QA + QA Auditor |
| CEO | CEO + PM + Dev + QA + QA Auditor (everything) |

Workers (Dev / QA / QA Auditor) see each other's tabs horizontally. PM sees everything workers see plus their own tab. CEO sees all five.

## 3. Core approach — Claude is the brain, Cloudflare Workers is the door

Not a SaaS tool. Two moving parts:

1. A **Claude Code slash command** (`/weekly-audit`) that Fahad runs on his Mac once a week. Claude does everything a human PM would do manually: pull commits, read handoffs, cross-check against scope, score merit, generate per-role HTML files.
2. A **Cloudflare Worker** (hosted free on Fahad's existing Cloudflare account at `devdash.phonebot.co.uk`) that serves the dashboard with TOTP (Google Authenticator) login. The Worker stores user secrets + role mappings + current dashboard data in Cloudflare KV.

No backend database. No SaaS subscriptions. No paid hosting. The Worker + KV runs free-tier forever for this usage pattern (well under 100k requests/day).

## 4. What the weekly slash command does

When Fahad runs `/weekly-audit` on Sunday night, Claude:

1. Reads `dashboard.config.yaml` (projects, repos, deadlines, scope docs) + `users.yaml` (email → role mapping).
2. For each project: pulls commits since last Sunday, reads the week's `daily-handoff.md` entries, reads the scope docs, reads the shared uploads folder (see section 7).
3. For each dev: matches commits to open items, audits each commit against the claimed item by reading actual code, scores on six signals (section 10).
4. Extracts off-project work from `daily-handoff.md` OFF-PROJECT entries and the `dev-uploads/` folder.
5. Reads Imran's independent assessment (if uploaded) → produces disagreement report.
6. Reads QA findings from `/qa-findings/` and QA Auditor deep-dive documents from `/qa-audits/`, attributes bugs to the right dev by code ownership.
7. Reads feature requests from `/feature-requests/<project>/` and adds them to the target dev's queue.
8. Computes per-project metrics: % complete, traffic light, forecast launch date, days remaining (calendar), days of work required (Claude's estimate), top performer, team off-project hours.
9. Detects stuck PRs (awaiting review > 2 days), generates email drafts to Fahad.
10. Renders **five per-role HTML files** (one per role) respecting the visibility matrix.
11. Pushes the week's data + HTML to Cloudflare Worker KV. Team members see fresh data next time they log in.
12. Archives the previous week's data locally (with a date suffix).

Runtime per run: 5–9 minutes. Quota cost: ~3–4% of Fahad's monthly Claude Max $100/5x allowance.

## 5. Authentication (TOTP via Cloudflare Workers)

### The flow a team member sees

1. Opens `https://devdash.phonebot.co.uk/` in a browser.
2. Types their email.
3. Types the current 6-digit code from Google Authenticator.
4. Worker validates the code against the stored shared secret (pyotp-equivalent in TS).
5. On success, Worker issues a 24-hour session cookie and serves the role-appropriate HTML.
6. Next visit within 24h: no re-login needed. After 24h: TOTP again.

### One-time provisioning (per user)

- Claude generates a TOTP shared secret + QR code for each email listed in `users.yaml`.
- Fahad sends each person their QR code privately (Signal, WhatsApp, or printout).
- Person installs Google Authenticator, scans the QR, their phone starts generating 6-digit codes.
- Secret is stored (encrypted) in Cloudflare KV keyed by email.
- Provisioning is idempotent — if `users.yaml` is edited to add/change someone, the next deploy provisions them.

### What the Worker stores in KV

- `user:<email>` → `{ role, totp_secret_encrypted, created_at }`
- `session:<token>` → `{ email, role, expires_at }`
- `dashboard:<role>:<iso_date>` → full HTML payload for that role and that week
- `dashboard:latest:<role>` → pointer to the most recent payload

### Why this is still zero-dollar

Cloudflare Workers free tier: 100,000 requests/day. Our team: 8 people × ~5 visits/week × 3 requests/visit = ~120 requests/week. We use 0.01% of the free quota.

KV free tier: 100,000 reads/day, 1,000 writes/day, 1GB storage. We use a handful. No cost.

Custom domain `devdash.phonebot.co.uk` is pointed via Cloudflare DNS (also free) at the Worker.

## 6. Off-project and interruption work

Devs are frequently pulled off their assigned project — legacy `phonebot.com.au` attacks, urgent customer escalations, DNS issues. Invisible to a dashboard that only reads project code. If untracked, an emergency-responder looks lazy and their merit score unfairly drops.

Three ways to log, use any:

**A. A 4th section in `daily-handoff.md`:**

```
## 2026-04-25 18:00 — Faizan / cowork-dev
CLOSED: R0-07, P0-13
IN PROGRESS: P0-15 Zip webhook
OPEN: waiting on Fahad — Zip webhook secret
OFF-PROJECT: legacy phonebot.com.au hack, 3h. Locked down hacked admin, rotated OpenCart passwords. Ongoing.
```

**B. A file dropped in `dev-uploads/<dev-name>/`** for longer write-ups.

**C. Optional slash command `/log-offproject`** — prompts (what / which project / hours / done or ongoing), appends a formatted line to their handoff entry. Helper, never required.

Merit scoring automatically reduces the expected target proportional to off-project hours. If a dev doesn't log off-project work, their merit score takes the hit — that's the incentive to log.

## 7. Uploads — the input side

Shared Bitbucket repo called **`dev-dashboard-inputs`**. Each role has an upload slot. Anyone with access drops markdown/text files; the dashboard ingests them on the next weekly audit. **Content is the user's business** — the dashboard reads, doesn't prescribe.

Repo structure:

```
/fahad-uploads/              (Fahad's slot — anything)
/pm-uploads/                 (Imran's slot — anything)
/dev-uploads/
    Faizan/
    Moazzam/
    Faisal/
    Usama/
/qa-findings/                (junior QA's slot — bugs, grouped by project)
    Phonebot-2.0/
    Phonebot-HQ/
    <project>/
/qa-audits/                  (senior QA Auditor's slot — deep audits, grouped by project)
    Phonebot-2.0/
    Phonebot-HQ/
    <project>/
/feature-requests/           (ad-hoc feature intake, grouped by project)
    Phonebot-2.0/
    Phonebot-HQ/
    <project>/
```

### How to upload

- **Bitbucket web UI** — click "Add file," upload. No git commands.
- **Git commit** — for those comfortable with CLI.
- **Optional slash command** — `/upload-to-dashboard` prompts for content + destination, formats, appends timestamp, commits.

Everyone already has Bitbucket access.

### PM independent assessment — a specific instance worth naming

Imran opens his own Claude or ChatGPT, pastes in the project scope + the week's commits, asks for a second-opinion assessment. He drops the output into `/pm-uploads/`. Dashboard reads it, compares it against its own Claude audit, produces a **disagreement block** flagging where the two AIs see things differently. A sanity check on Claude-checking-Claude.

## 8. QA flow (split between junior and senior)

### QA (junior) — continuous bug logging

Runs staging QA day-in, day-out. Appends findings to `/qa-findings/<project>/<date>-bugs.md`:

```
## 2026-04-25 14:00 — QA pass / Phonebot 2.0 staging
BUGS:
- Checkout payment button allows double-click → duplicate orders. HIGH.
- Voucher removal leaves discount applied. FUNCTIONAL.
- Product detail: stock banner overlaps price. VISUAL.
NOT BUGS:
- Stale copyright year. Flag to Fahad.
QUESTIONS:
- PayPal redirects twice on mobile Safari. Asked Faizan.
```

Dashboard reads this. On the CEO tab: per-project open bug count. On the PM tab: bugs attributed to the dev who owns the relevant code area. On the Dev tab: each dev sees bugs filed against their code. On the QA tab: the QA's own list of submitted bugs + their status.

Merit scoring: a real QA-confirmed bug on a dev's recent commit reduces that dev's Quality signal for the sprint. Incentive to get it right the first time.

### QA Auditor (senior) — weekly/biweekly deep audits

Runs functionality parity audits (1.0 → 2.0), use-case checks, feature-matrix reviews. Uses his own Claude or Codex to produce long-form findings. Drops documents in `/qa-audits/<project>/<date>-<topic>.md`:

```
## 2026-04-26 — QA Auditor / Phonebot 2.0 parity audit: Checkout
Scope: Checkout flow parity against 1.0 live site.
Method: Side-by-side walkthrough with Codex audit of 2.0 checkout controller.

FINDINGS:
- 2.0 is missing the "guest checkout express" path that 1.0 has at /checkout/express.
  Impact: regular shoppers in 1.0 can check out without account creation; in 2.0 they can't.
- 2.0's discount-code UX is 3 clicks deeper than 1.0's. Conversion risk.
...
```

Dashboard reads these, shows them on the QA Auditor tab + cross-references against open items and commits so his findings connect to the work. Counts as an "audit this week" tick mark.

## 9. Ad-hoc feature intake

You or Imran want to add a new feature idea or small button to a project on an ad-hoc basis. Mechanism:

### `/add-feature-request` slash command

Prompts:
1. Which project?
2. Plain-English description.
3. Rough urgency (low / medium / high).
4. Target dev (optional; leave blank and Claude picks based on code ownership).

Writes to `/feature-requests/<project>/<yyyy-mm-dd>-<slug>.md`:

```
## 2026-04-28 — Feature request from Fahad / Phonebot 2.0
Priority: medium
Target dev: (auto-assign)

Add a "notify me" button on out-of-stock product pages. Should collect
customer email and hit our Klaviyo list. 1.0 has this at /product/notify
— parity it for 2.0.
```

### Dashboard integration

- **Dev view:** feature requests targeted at this dev appear in their "queue for next week," labeled "new request from Fahad/Imran."
- **PM view:** inbox row — "3 new feature requests this week." Click to expand.
- **CEO view:** counted in portfolio metrics.
- **No approval step in v1.** Posted requests go straight into the target dev's queue. If Fahad wants to veto something Imran posted, he sees it on his view, deletes the file, gone next run.

## 10. Merit scoring — six signals, devs only

QA and QA Auditor are **excluded from merit scoring in v1** (different kind of work, different metrics — deferred to v2).

For devs: Fahad's confirmed weighting, heaviest to lightest.

| Tier | Signals | Approximate weight |
|---|---|---|
| 1 (heaviest) | Output + Quality | ~55% combined (~27% each) |
| 2 | Reliability | ~25% |
| 3 | Handoff discipline | ~12% |
| 4 (lightest) | Initiative + Unblock factor | ~8% combined (~4% each) |

Final percentages calibrated during implementation — the tier ordering is the contract.

- **Output** — items closed this week, complexity-weighted.
- **Quality** — per-commit audit: does the code cleanly do what the commit claims? QA-triggered bugs reduce this for the sprint.
- **Reliability** — weekly target auto-computed from rolling 4-week average, adjusted for off-project hours. Week 1 is neutral.
- **Handoff discipline** — is `daily-handoff.md` thorough (all 4 sections well-used) or bare-minimum?
- **Initiative** — closed items outside assigned list, spotted bugs while working.
- **Unblock factor** — did their work unblock someone else?

Weighted merit score = single 0–100 number. "Top performer of the week" on CEO view = highest score.

## 11. What the dashboard shows

Two levels of tabs on every view:
- **Top-level role tabs** (filtered by visibility matrix).
- **Project sub-tabs within each role tab** — `[All Projects] [Phonebot 2.0] [Phonebot HQ] [Project X] [Project Y]`.

"All Projects" in each role view = portfolio rollup for that role.

### Metrics that appear everywhere

- **Days remaining** — calendar days from today to project deadline. Shows on **all 5 role views**.
- **Overall days required** — shows on **all 5 role views**. Two numbers displayed side-by-side:
  - **Total project duration** — days from kickoff to deadline (e.g., "Phonebot 2.0: 120-day project, day 22")
  - **Days of work still needed** — Claude's estimate of dev-days required to close remaining items at current pace (e.g., "estimated 65 work-days to finish")
- **% complete** — items closed / total items × 100. Shows on **CEO, PM, Dev views only** (not QA, not QA Auditor).

### CEO view (Fahad's default)

- Hero: worst-case forecast launch date across all projects + overall traffic light.
- Portfolio strip: one line per project with its own traffic light, % complete, days remaining, days required (both types).
- Top performer this week: role label + one sentence (no personal name at the top — personal names appear in the drill-down dev panels).
- Team off-project hours with root cause.
- Open bugs per project (from QA findings).
- Open audit findings per project (from QA audits).
- Disagreement flags (PM independent assessment vs dashboard Claude).
- Feature requests inbox count.
- Email drafts queue.

### PM view (Imran's default)

Everything CEO sees minus CEO-specific callouts, plus:
- Per-dev panels with merit score, plain-English commit summary, target hit/miss, off-project hours.
- Blocker queue grouped by who's blocking.
- Stuck PR list.
- QA findings per project with dev attribution.
- QA Auditor findings per project.
- New feature requests inbox (full content, not just count).
- Imran's action log (from `imran-weekly-log.md`, optional).
- Dev-view selector — PM can click any dev and see their personal panel.

### Dev view

Single dev, their weekly summary, merit signals, target:
- Their commits with Claude audit results.
- Their off-project work this week.
- QA bugs attributed to their code.
- QA Auditor findings touching their code.
- Their queue for next week (including new feature requests targeted at them).
- 4-week history trend.

### QA view

- Bugs they submitted this week (all projects, sub-tabs per project).
- Status per bug (open / resolved / disputed).
- Dev each bug was attributed to.
- Days since submission (flag old unresolved bugs).
- **Also sees Dev and QA Auditor tabs** per the visibility matrix.

### QA Auditor view

- Audit documents submitted (all projects, sub-tabs per project).
- Cross-reference: for each audit finding, which commits and open items relate.
- Days since last audit per project (prompt if overdue).
- **Also sees Dev and QA tabs** per the visibility matrix.

### Trust layer — "why" link

Every Claude finding on every view has a "why?" link that expands an audit trail: which files, which commits, which lines of code Claude read. Nothing flips manually. Only Claude's code audit closes an item.

## 12. Quarterly auto-generated performance reviews (devs only)

End of each 13-week quarter, Claude generates a one-page review per **dev** based on:
- 13-week rolling merit score and its trend
- Off-project contribution total
- QA bugs they caused vs triggered
- Blockers they cleared
- Growth trajectory (rising, flat, declining)

Fahad reads each, edits in ~10 minutes, delivers. Becomes the record for bonus / raise / promotion decisions.

QA and QA Auditor get informal quarterly "summary" documents (bug counts, audits run, etc.) but not formal merit-scored reviews in v1.

## 13. Data sources summary

- **Git commits** — from local clones of each project's repos, via `git log`.
- **Daily handoff MDs** — 4 sections per entry: CLOSED / IN PROGRESS / OPEN / OFF-PROJECT.
- **Scope docs** — `CLAUDE.md`, `README.md`, project-specific overlays.
- **Open items list** — per project, listed in config.
- **Shared Bitbucket repo `dev-dashboard-inputs`:**
  - `/fahad-uploads/`
  - `/pm-uploads/`
  - `/dev-uploads/<dev>/`
  - `/qa-findings/<project>/`
  - `/qa-audits/<project>/`
  - `/feature-requests/<project>/`
- **Optional `imran-weekly-log.md`** — Imran's action log.
- **Config files:**
  - `dashboard.config.yaml` — projects, repos, deadlines, scope docs
  - `users.yaml` — email → role mapping
- **Cloudflare Worker + KV** — serves the authenticated dashboard at `devdash.phonebot.co.uk`, stores TOTP secrets + session cookies + per-role HTML payloads.

## 14. How Claude matches a commit to an open item

Weighted signal mix, priority order:

1. **Ticket ID in commit message** — highest confidence.
2. **Daily handoff MD "CLOSED:" entry** — high confidence, already the Phonebot convention.
3. **Branch name** — medium-high.
4. **File-path inference** — medium.

Combined confidence > 80% = auto-match. 50–80% = auto-match, flag for Imran review. Below 50% = "unmatched work" in the review queue. Never guesses silently.

## 15. Automated emails to Fahad (between weekly runs)

Cloudflare Worker runs a scheduled cron (free tier allows up to one cron per Worker) once a day. Checks:

- **Stuck PRs** (awaiting review > 2 days).
- **Severity-HIGH QA bugs** landing in `/qa-findings/`.
- **Disagreement flags** if Imran's independent assessment differs materially.

Sends email to fahad@phonebot.com.au via Cloudflare's built-in MailChannels integration (free). Subject prefix `[devdash]` for easy inbox filter.

## 16. Cost

- **SaaS subscriptions:** $0.
- **API spend:** $0. Claude runs on existing Claude Max $100/5x. ~12–15% of monthly quota across weekly runs.
- **Hosting:** $0. Cloudflare Workers + KV + DNS + MailChannels, all free tier on the existing Cloudflare account.
- **Dev time from Faizan:** $0. Claude builds this. Faizan stays on Phonebot HQ.

## 17. How Fahad runs it (weekly cadence)

**Sunday night:**
1. Open Claude Code in the workspace.
2. Type `/weekly-audit`.
3. Wait 5–9 minutes.
4. Claude reports "done — dashboard pushed to Worker, 8 users will see fresh data on next login."

**Monday morning (each team member):**
1. Open `https://devdash.phonebot.co.uk/` in browser.
2. Enter email + TOTP code.
3. See the dashboard with their role's tabs.

**Quarterly (Fahad):**
- Run `/quarterly-review`. Produces one-page review per dev for editing and delivery.

## 18. What this is NOT — explicit scope exclusions

- **Not a ticket system.** Items live wherever they already live. Dashboard reads, doesn't own.
- **Not real-time.** Weekly refresh + daily email checks.
- **Not a replacement for Phonebot HQ** (Faizan's separate Next.js + Postgres build).
- **Not something Faizan builds.** Claude builds this. Faizan stays on HQ.
- **Not a time-tracking tool.** Off-project hours are self-reported estimates.
- **Not an AI-assist detector.** Whether a dev used Claude, Cursor, or raw keyboard doesn't matter — audit + problem-solved is what counts.
- **Not a burnout detector in v1.** Deferred.
- **Not milestone-driven in v1.** Milestones added later.
- **Not merit-scoring QA or QA Auditor in v1.** They get views and upload paths; scoring deferred.
- **Not a feature-approval workflow.** Fahad/Imran post requests directly; vetoes happen by file deletion.

## 19. Open implementation decisions

To resolve when I write the implementation plan:

- Exact YAML schema for `users.yaml`.
- Whether QR code provisioning UX is inside Claude Code output or a standalone HTML tool.
- Whether to rotate TOTP secrets on any cadence (probably never in v1).
- Session cookie rotation / forced-logout mechanism.
- How to handle a user who loses their phone (admin reprovisioning flow).
- Whether dashboard HTML payload is stored whole in KV or assembled at request time.
- Format of each project's open-items list — may differ per project.

## 20. Build effort

**7–8 days of Claude's work.** Possibly 9 if Cloudflare Worker deployment hits a snag.

Breakdown:
- Days 1–2: config (both yaml files), data pull (git log + MD reading + uploads), commit-to-item matching, merit scoring with off-project adjustment.
- Day 3: traffic lights, forecasts, metrics math (% complete + days remaining + days required).
- Days 4–5: HTML generation per role with per-project sub-tabs, feature intake, QA + QA Auditor views.
- Day 6: Cloudflare Worker — TOTP validation, KV session + user storage, role routing, HTML payload serving.
- Day 7: provisioning flow (QR codes), daily email cron worker, end-to-end testing on Phonebot 2.0 real data.
- Day 8: `/quarterly-review` skeleton, polish, trust-layer "why" links, archive of old runs.

Delivered as Claude Code slash commands + Cloudflare Worker deployment, both installed once.

## 21. What signals "done"

- All 8 users can log in at `https://devdash.phonebot.co.uk/` with their email + TOTP code.
- Each role sees only the tabs the visibility matrix allows.
- Per-project sub-tabs render for every role view.
- Per-project metrics show: % complete (on CEO/PM/Dev), days remaining (all), days required both-types (all).
- Fahad can run `/weekly-audit` and the dashboard updates for all 8 users within 10 minutes.
- Merit scoring adjusts for off-project hours.
- QA bugs flow from `/qa-findings/` to the right dev panels.
- QA Auditor findings flow from `/qa-audits/` to the QA Auditor tab + cross-reference against open items.
- Feature requests flow from `/feature-requests/` to the target dev's queue.
- "Why" links show real audit trails on every finding.
- Daily email cron fires and sends stuck-PR / HIGH-bug / disagreement alerts to Fahad.
- `/quarterly-review` produces one-page reviews per dev.
- Adding a new project to `dashboard.config.yaml` or a new user to `users.yaml` requires zero code changes.
- Whole weekly flow runs start-to-finish in under 10 minutes of wall time.
