# devdash — Phase 2 Scope
**Owner:** Fahad (CEO, Phonebot)
**Domain:** devdash.phonebot.co.uk
**Depends on:** Phase 1 fully live and stable (which itself depends on Phase 1.5 security hardening closing first — see `phase-1-scope.md` Section 8)
**Target start:** 30 days after Phase 1 go-live, confirmed stable
**Target completion:** Month 6 from Phase 1 launch
**Date written:** 2026-04-24
**Last updated:** 2026-04-24 (post-ship reconciliation — items promoted into Phase 1, new items deferred in)

---

## Goal

Refine Phase 1 based on 4+ weeks of real usage, then expand into strategic features (similarity-based regression detection, AI-usage signals, cross-project visibility, integrations, mobile experience) that are only worth building once the team has formed habits around Phase 1.

---

## What Triggers Phase 2 Start

Phase 2 does not start automatically at month 2. It starts when all four of these are true:

1. **Phase 1.5 is closed** — the five security hardening blockers in `phase-1-scope.md` Section 8 are all fixed. If Phase 1.5 is still open, Phase 2 does not start, full stop.
2. **30 days of stable Phase 1 operation post go-live** — zero P0 bugs, weekly audit has fired successfully 4 consecutive weeks, daily email digest has not missed more than 2 weekdays in a row.
3. **All 8 users are active** — everyone has logged in at least once in the past 7 days.
4. **Fahad has reviewed Phase 1 usage patterns** — specifically: which features are used most, which are ignored, and whether the handoff multiplier and Compass scoring feel calibrated. This is a 30-minute review, not a formal audit.

If Phase 1 is still unstable at 30 days, Phase 2 start slides until stability is confirmed.

---

## Phase 2 Feature List

Each feature includes: purpose, what it depends on, effort estimate, and priority within Phase 2.

Items 1–14 are the original Phase 2 list, refined. Items 15–24 are new — promoted out of Phase 1 on April 24 because they were not shipped in the compressed build session (or were explicitly deferred during scope).

---

### 1. Regression Detection — Real Logic (Keyword First, Then Similarity)
**Priority:** P0 (promoted from P1 — Phase 1 regression watch is hardcoded demo data, so this is the single biggest credibility gap)
**Effort:** 3–5 days

**Purpose:** Phase 1 shipped the regression-watch UI but the backing match logic is hardcoded demo data. Step 1 is real keyword matching (what was originally spec'd as Phase 1); step 2, still Phase 2, is similarity search for the cases keyword matching misses ("checkout timeout" vs "payment page hangs").

**How it works — step 1 (keyword, immediate):** When a new QA bug is filed, a Lambda runs substring and token match against `items/closed.json` and the last 6 weeks of `week-summaries/` for that project. A hit attaches a "possible regression" badge referencing the original closed item. This replaces the current hardcoded data.

**How it works — step 2 (similarity, after keyword is live and stable):** Generate text embeddings via AWS Bedrock Titan Text Embeddings v2 at $0.0001 per 1K tokens. Compare against a precomputed index of closed item embeddings stored in S3 as a flat JSON vector file. Cosine similarity above 0.82 triggers a "possible regression" badge. Runs alongside keyword match, not instead of it.

**Dependencies:** Phase 1 closed items data model. AWS Bedrock access for step 2.

**Cost implication:** Step 1 is Lambda compute only (negligible). Step 2 Bedrock embeddings at this volume (~50 new QA bugs/month × 300 tokens) costs under $0.02/month.

---

### 2. AI-Usage Signal
**Priority:** P1
**Effort:** 4–6 days

**Purpose:** Flag commits that look like low-effort AI-generated code — large token-dense diffs with no test changes, no comment updates, and no related handoff entry. Coaching signal, not punishment.

**How it works:** The weekly audit Lambda adds an AI-usage heuristic to the per-dev merit computation:
- Commit diff line count vs commit message word count ratio (a 500-line diff with a 4-word message is suspicious)
- Whether any test files were touched in the same commit
- Whether the dev's handoff for that day mentions the commit context
- Whether the same file was modified again within 2 days (possible rework)

Each signal contributes a 0–1 score. The composite score is shown as a "signal quality" indicator in the CEO view. A low score does not automatically reduce merit — it surfaces for human review.

**Dependencies:** Phase 1 handoff submission, commit logging, weekly audit Lambda.

**Cost implication:** ~40,000 extra tokens/month. Acceptable.

---

### 3. Peer Nomination
**Priority:** P3
**Effort:** 2–3 days

**Purpose:** Optional recognition layer. A dev nominates another dev for a specific contribution. Visible to CEO; CEO can surface one publicly per week. Does not affect merit scores.

**How it works:** Nomination form on the dev view. Fields: recipient, project, one-line reason. Stored at `s3://devdash-data/global/nominations/{week}/{nominator}.json`. CEO sees all nominations per week. No voting, no weighting.

**Dependencies:** Phase 1 dev view, auth.

**Cost implication:** None material.

**Note:** P3 because nice-to-have. Skip if Phase 1 usage shows the team culture does not benefit from it.

---

### 4. Cross-Project Capacity View
**Priority:** P1
**Effort:** 3–4 days

**Purpose:** Surface when a dev is overloaded (high off-project hours + many open items + low clock-in consistency) and when a dev has capacity slack.

**How it works:** New "Capacity" tab in the CEO view only. Grid: devs as rows, projects as columns, each cell showing items open, items closed this week, off-project hours, clock-in consistency. A combined load score per dev. Amber at 75% load, red at 90%.

**Dependencies:** Phase 1 off-project logging, clock-in, per-project item counts, per-project Compass scoping (#32 in Phase 1).

**Cost implication:** Small.

---

### 5. Weekly Retro Auto-Generation
**Priority:** P2
**Effort:** 2–3 days

**Purpose:** Claude drafts a weekly retrospective from handoff summaries, closed items, and QA findings. PM and CEO review before sharing. Saves 30–45 minutes of PM time per week.

**How it works:** New `/weekly-retro` slash command or a button in the PM view triggers a Lambda call. Loads the week's knowledge cards, closed items, QA findings, regression or dispute events. Claude produces a 400-word draft: What went well, What was slow, What to watch next week. Written to S3 as draft, surfaced in the PM view for editing.

**Dependencies:** Phase 1 knowledge cards, weekly audit.

**Cost implication:** ~60,000 tokens/month.

---

### 6. Mobile Experience — Responsive PWA
**Priority:** P2
**Effort:** 5–7 days

**Purpose:** The Phase 1 dashboard is desktop-first. Devs clock in/out on mobile. A responsive layout and PWA manifest removes friction.

**What changes:**
- All role views re-layouted for 375px+ viewports
- Nav bar collapses to hamburger on mobile
- Clock-in/clock-out promoted to top of mobile dev view
- PWA manifest + service worker for offline read of the last cached HTML payload
- Add-to-home-screen prompt on first mobile visit

**Dependencies:** Phase 1 complete and stable. Density toggle (Phase 1 #30) helps here — compact mode is essentially a mobile-ready mode.

**Cost implication:** None material.

---

### 7. Bug Attribution from Git Blame
**Priority:** P2
**Effort:** 4–5 days

**Purpose:** Phase 1 bug attribution is manual. Phase 2 adds a git blame step: when a bug specifies a file and approximate line range, the Lambda calls `git blame` and surfaces the last author as a *suggested* attribution — never auto-applied.

**How it works:** QA bug submission form gains optional file path and line range fields. If both provided, Lambda calls `git blame` on the specified repo. Result attached as `suggested_attribution: {email}`. PM confirms or overrides.

**Dependencies:** Phase 1 bug submission form (already has the upgraded fields — #8), repo access from Lambda.

**Cost implication:** Negligible.

---

### 8. Concurrent Editing — Real Locking
**Priority:** P3
**Effort:** 3–4 days

**Purpose:** Phase 1 has "last write wins." Phase 2 replaces with a real 90-second DynamoDB lock and a "Locked by Imran until 14:32" indicator.

**Dependencies:** Phase 1 Settings UI, DynamoDB records, project detail modal inline edit (#27 in Phase 1).

**Cost implication:** Marginal.

**Note:** P3 because conflicts are rare on a team of 8. Only promote to P2 if Phase 1 usage shows real conflicts.

---

### 9. Snapshot Time Machine
**Priority:** P2
**Effort:** 3–4 days

**Purpose:** Nightly Lambda writes a full JSON snapshot of dashboard state. Time slider in the CEO view lets Fahad scrub back through past states.

**How it works:** Nightly Lambda reads DynamoDB, writes a single JSON file to `s3://devdash-data/global/snapshots/{YYYY-MM-DD}.json`. Time slider loads the selected snapshot and renders a read-only view.

**Dependencies:** Phase 1 data model fully stable.

**Cost implication:** Under $0.01/month.

---

### 10. Integrations — Bitbucket/GitHub + Slack
**Priority:** P2 (Bitbucket/GitHub), P3 (Slack)
**Effort:** 3–4 days each

**Purpose:**
- Bitbucket/GitHub: auto-import PR data so stuck-PR and commits-this-week data does not need manual logging.
- Slack: replace SES daily email with a Slack message (to confirm preference in Phase 1 usage review).

**Dependencies:** Phase 1 daily digest Lambda (for Slack), API tokens. The `/devdash-git-sync` infrastructure from Phase 1 covers the scaffolding — this is wiring it to real auto-import.

**Cost implication:** Free tier handles this volume.

---

### 11. Cost/Revenue Linkage (Xero)
**Priority:** P3
**Effort:** 5–7 days

**Purpose:** Connect per-project P+L from Xero. CEO-only view.

**How it works:** Monthly Lambda pulls Xero P+L via the Xero API. Xero account codes map to project IDs. Monthly summary per project to `s3://devdash-data/projects/{project}/financials/{YYYY-MM}.json`. New "Financials" sub-tab in the CEO view.

**Dependencies:** Xero API credentials. Phase 1 clock-in data. Currency system (Phase 1 #28) handles multi-currency display.

**Cost implication:** Xero API free for core plan. Negligible.

**Note:** P3. If setup takes more than 7 days, cut to Phase 3.

---

### 12. TOTP Reset Workflow
**Priority:** P1
**Effort:** 1–2 days

**Purpose:** Phase 1 has no self-service TOTP recovery. Phase 2 adds a dev-initiated reset request, CEO approves, new QR code emailed.

**How it works:** "Lost authenticator?" link on login. Dev enters email → SES sends time-limited reset link → dev confirms → request lands in Fahad's admin queue → Fahad approves → new secret generated, old one invalidated, QR emailed via the auto-QR card mechanism (Phase 1 #33).

**Dependencies:** Phase 1 SES setup, real TOTP (Phase 1.5), auto-QR card (Phase 1 #33).

**Cost implication:** Negligible.

---

### 13. User Provisioning UI (Full)
**Priority:** P2
**Effort:** 1–2 days (reduced from 2–3 — auto-QR card in Phase 1 #33 did most of the work)
**Purpose:** Phase 1 auto-QR card covers new-user QR generation. Phase 2 completes the loop: bulk add, disable, re-activate, full user table with action buttons — all from Settings without touching CLI.

**Dependencies:** Phase 1 Settings UI, auto-QR card (Phase 1 #33), admin Lambda endpoints.

**Cost implication:** None material.

---

### 14. DR / Backup — S3 Versioning + Automated Export
**Priority:** P1
**Effort:** 2–3 days

**Purpose:** Phase 1 has S3 Lifecycle rules but no versioning and no offsite backup.

**How it works:**
- S3 versioning on `devdash-data` bucket, non-current versions expire after 30 days
- Weekly Lambda exports a compressed archive (knowledge cards, merit history, week-summaries) to `devdash-backups` bucket in `us-east-1`. Retention: 26 weeks.

**Cost implication:** Under $0.20/month total.

---

### 15. Custom-Prompt Upload Flow (NEW — deferred from Phase 1)
**Priority:** P1
**Effort:** 3–4 days

**Purpose:** CEO or PM pushes a prompt scoped to a specific project. The assigned dev sees the prompt in their dashboard and uploads the word-for-word output (handoff reply, code snippet, screenshot, or structured JSON) without retyping or paraphrasing. This is how Fahad and Imran steer the AI/dev loop without Slack-herding.

**How it works:** CEO/PM opens a "Push prompt" form: recipient dev, project, prompt body, expected output format (text / code / screenshot / JSON), due-by timestamp. Stored at `s3://devdash-data/projects/{project}/prompts/{prompt-id}.json`. Dev sees the prompt as a card in their view with an "Upload response" button. Response stored at `s3://devdash-data/projects/{project}/prompts/{prompt-id}/responses/{dev}-{timestamp}.{ext}`. CEO and PM see response inline; dev sees their own submissions.

**Dependencies:** Phase 1 feature request form (similar shape), per-project context isolation, auth.

**Cost implication:** S3 storage only. Negligible.

---

### 16. Automated Email-to-CEO on Bug Submission via SES (NEW — deferred from Phase 1)
**Priority:** P1
**Effort:** 1 day

**Purpose:** Currently a bug submission writes to S3 and appears on the CEO dashboard on next load. For P0 and P1 bugs, Fahad wants an immediate email. This is one SES send per high-severity bug.

**How it works:** The bug submission Lambda checks severity. If P0 or P1, fire an SES email to Fahad (and Imran for P0) with the bug title, severity, reporter, project, and a link back to the dashboard item. Non-blocking — if SES fails, the bug is still persisted and surfaced in-app.

**Dependencies:** Phase 1 SES setup, bug submission Lambda (already has the upgraded fields from Phase 1 #8), daily digest Lambda for template reuse.

**Cost implication:** Handful of SES sends per week. Under $0.01/month.

---

### 17. PM-Side Dispute Resolution UI (NEW — deferred from Phase 1)
**Priority:** P1
**Effort:** 2–3 days

**Purpose:** Phase 1 ships dispute *submission* but not dispute *resolution*. PM can see the queue but cannot approve, reject, or reassign. This closes the loop so disputes are not a write-only feature.

**How it works:** The PM view gains a Disputes panel with three actions per dispute: Approve (dispute stands, reason required), Reject (dispute denied, reason required), Reassign (pick a different dev as the responsible party, reason required). Every action is written to the audit log. Resolution fires a notification to the disputing dev and the CEO. Approved and rejected disputes remain visible in the panel until archived (see #22).

**Dependencies:** Phase 1 dispute submission, audit log, PM view.

**Cost implication:** None material.

---

### 18. Quarterly Performance View (NEW — promoted in, deferred from Phase 1)
**Priority:** P2
**Effort:** 3–4 days

**Purpose:** At the end of each quarter, Claude drafts a one-page review for each dev based on 13 weeks of merit history, week-summaries, dispute log, and PM independent assessments.

**How it works:** "Generate Quarterly Review" button in the CEO view (visible only in months 3, 6, 9, 12). Triggers a Lambda that loads 13 `week-summaries/*.md` files per project, `merit-history/{week}.json` for 13 weeks, and PM independent assessments from the quarter. Claude produces a ~600-word draft per dev: summary of the quarter, top contributions, patterns of concern, suggested conversation points. Stored in S3, displayed in the CEO view as editable text.

**Token cost per run:** 5 projects × 4 devs × ~6,500 tokens = ~130,000 tokens. Once per quarter. Monthly amortised: ~43,000 tokens.

**Dependencies:** Phase 1 merit history data (13 weeks minimum), week-summaries, PM independent assessments.

**Cost implication:** Quarterly Claude call. No additional AWS cost.

---

### 19. "Stick" / Private Conversation Flow for Underperformers (NEW — deferred from Phase 1)
**Priority:** P2
**Effort:** 2–3 days

**Purpose:** When a dev's Compass scores are consistently low or a pattern of concern emerges, Fahad needs a private channel to flag it — separate from the audit log, invisible to the dev and to other team members, with a paper trail for consistency across time.

**How it works:** The CEO view gets a "Stick" action on every dev card. Clicking it opens a private journal entry form: concern summary, observed behaviour, date of expected conversation, follow-up date. Stored at `s3://devdash-data/global/stick/{dev-email}/{timestamp}.md`. Visible only to the CEO (not PM, not the dev). A stick-count badge appears on the dev card in the CEO view only. KMS-encrypted at rest, IAM-scoped to Fahad's principal only.

**Dependencies:** Phase 1 dev cards (clickable — #37), audit log, KMS.

**Cost implication:** S3 storage only. Negligible.

**Note:** The name "Stick" is Fahad's. Product surface uses a neutral label ("Private note") — the storage path uses `stick/` for the internal semantic.

---

### 20. Archive Mechanism (NEW — deferred from Phase 1)
**Priority:** P2
**Effort:** 2 days

**Purpose:** Closed bugs and closed QA audits accumulate in the in-app lists and add scroll. Deleting them loses the paper trail. An archive soft-hides them from default views but keeps them queryable.

**How it works:** Every closed bug and closed audit gets an "Archive" button. Archived items are excluded from default list renders but appear under a "Show archived" toggle. Archive action sets `archived_at` and `archived_by` on the record in DynamoDB. Archive is reversible — any CEO or PM can unarchive. Archived items still appear in regression-watch matches and quarterly reviews.

**Dependencies:** Phase 1 closed bugs and audit data model.

**Cost implication:** None material.

---

### 21. More Collapsible Sections (NEW — deferred from Phase 1)
**Priority:** P3
**Effort:** 1 day

**Purpose:** Phase 1 shipped collapsible sections for CEO Portfolio and PM Projects only. Phase 2 extends to: dev view's knowledge card panel, QA Auditor's category metrics, off-project log, rewards ledger, disputes panel.

**How it works:** Each candidate section gets the same collapse/expand affordance and per-user persistence used in Phase 1. No new infrastructure.

**Dependencies:** Phase 1 collapsible sections implementation (#31).

**Cost implication:** None.

---

### 22. Alternative CEO Dashboard Layout Toggle (NEW — deferred from Phase 1)
**Priority:** P3
**Effort:** 3 days

**Purpose:** Some CEOs prefer a dense single-page layout, others prefer a tabbed drill-down. Phase 1 defaults to the Portfolio layout. Phase 2 adds a second layout option ("Focus mode" — current project only, full width, no Portfolio summary) and a toggle to switch between them, persisted per user.

**How it works:** CEO Settings gets a "Layout" radio group: Portfolio (default) / Focus. Focus layout is a single-project view with the project detail modal content inlined, no hero banner, no distribution panel, no standout panel. The toggle is instant, persisted to DynamoDB, reversible.

**Dependencies:** Phase 1 CEO view, project detail modal (#26), theme system (#20), density toggle (#30).

**Cost implication:** None.

**Note:** P3 — build only if Phase 1 usage shows the Portfolio layout is too dense for the actual workflow.

---

### 23. Real Git Sync — Production Wiring (NEW — promoted out of Phase 1)
**Priority:** P0 (feeds every Compass score — placeholder data undermines the whole scoring system)
**Effort:** 2–3 days

**Purpose:** Phase 1 shipped the `/devdash-git-sync` skill which documents the infrastructure (Bitbucket webhook with HMAC, `scripts/dashboard/git_sync.py`, 06:00 cron entry). Phase 2 wires it to production: webhook registered on real Bitbucket repos, HMAC secret in AWS Secrets Manager, `git_sync.py` running on a schedule, real commits flowing into DynamoDB.

**How it works:** Register webhooks on the 5 project repos. Webhook endpoint is the Cloudflare Worker, which verifies HMAC and writes raw events to an SQS queue. `git_sync.py` runs every hour (not daily — reduces staleness) reading the queue, computing per-dev per-project commit stats, writing to DynamoDB. Daily 06:00 Sydney cron does a reconciliation pass to catch anything SQS dropped.

**Dependencies:** Phase 1.5 complete (worker deployed), SQS queue provisioned, Bitbucket admin access.

**Cost implication:** SQS and Lambda cost under $0.20/month at this volume.

---

### 24. Real AWS Deploy — Cloudflare Worker + Wrangler Config (NEW — promoted out of Phase 1)
**Priority:** P0 — this is part of Phase 1.5 closure but also a Phase 2 bookkeeping item because Phase 2 features depend on a deployed worker
**Effort:** 1 day (assumes KV namespaces and Secrets are already planned)

**Purpose:** Phase 1 shipped worker source in `worker/src/*.ts` and a `wrangler.toml` with `<FILL_AFTER_KV_CREATE>`. Phase 1.5 closes this as a gate. Listed here so Phase 2 planning does not double-book it.

**How it works:** See `phase-1-scope.md` Section 8 item #4. Create KV namespaces, populate `wrangler.toml`, `wrangler deploy`, smoke-test login, smoke-test session persistence, point DNS.

**Dependencies:** Phase 1.5 security fixes first — do not deploy a worker that accepts any 6-digit code, leaks role via DevTools, and renders XSS in PM summaries.

**Cost implication:** Cloudflare Workers free tier covers this volume.

---

## Budget Implications

### Phase 1 AWS cost: ~$4/month (estimated)

| Service | Phase 1 | Phase 2 |
|---|---|---|
| DynamoDB | $0.50 | $0.70 (more reads: capacity view, custom prompts, stick entries) |
| S3 Standard-IA (Warm) | $0.80 | $1.30 (more files: snapshots, nominations, financials, custom-prompt responses, archive metadata) |
| S3 Glacier (Cold) | $0.20 | $0.30 (historical data growing) |
| Lambda | $0.50 | $1.00 (new cron jobs: nightly snapshot, weekly export, git_sync hourly) |
| SES | $0.10 | $0.15 (bug alert emails + TOTP reset emails + daily digest) |
| KMS | $0.30 | $0.35 (stick entries encrypted separately) |
| CloudTrail | $1.00 | $1.00 (same) |
| SQS (git sync queue) | $0.00 | $0.20 |
| S3 versioning (non-current versions) | $0.00 | $0.10 |
| S3 backup bucket (cross-region) | $0.00 | $0.05 |
| Bedrock (embeddings for regression) | $0.00 | $0.02 |
| Data transfer | $0.50 | $0.80 |
| **Total** | **~$4/month** | **~$5.97/month** |

Phase 2 peak (with 10 projects, 12 users, heavy usage) approaches $10–14/month — still under the $20/month target.

---

## Risks

### 1. Team adoption fatigue
**Risk:** Team forms partial habits in Phase 1. Devs clock in on some days, skip handoffs on others. By Phase 2, Compass scores feel unreliable.

**Mitigation:** Before Phase 2 starts, Fahad reviews the Phase 1 30-day metrics. If handoff consistency is below 4 days/week for 3 of 4 devs, delay Phase 2. Do not add features on top of unused ones.

### 2. Scope creep from early usage
**Risk:** 4 weeks of Phase 1 usage produces a 15-item wish list. Phase 2 expands to 6 months of work instead of 3.

**Mitigation:** All Phase 1 feature requests go into the in-app backlog. Reviewed at Phase 2 kickoff, scored against Phase 2 priorities. Only P1-equivalent items enter Phase 2 without a formal sign-off.

### 3. Knowledge card drift at month 3+
**Risk:** Knowledge cards accumulate inaccuracies over time.

**Mitigation:** Manual knowledge card audit at 90 days. Fahad reviews the 5 cards. Anything materially wrong triggers a "rebuild from scratch" (Phase 1 feature — loads 4 weeks of raw handoffs and regenerates clean).

### 4. AWS cost spike from Glacier retrievals
**Risk:** A dispute or quarterly review triggers Glacier retrieval. Unexpected AWS bill.

**Mitigation:** "Load more context" button gets a Glacier retrieval cost estimate: "Retrieving this data from Glacier costs approximately $0.03 and takes 12 hours. Confirm?"

### 5. Xero API complexity
**Risk:** Xero OAuth 2.0 setup is more complex than estimated.

**Mitigation:** P3 priority means last. If it takes more than 7 days, cut to Phase 3.

### 6. Phase 1.5 slips and blocks Phase 2 (NEW)
**Risk:** Phase 1.5 security hardening takes longer than expected. Phase 2 start slides indefinitely. Fahad loses patience and ships features on top of an unhardened worker.

**Mitigation:** Phase 1.5 is a hard gate — Phase 2 does not start until `/cso` and `/security-review` are clean. If Phase 1.5 slips more than 2 weeks, re-scope the blockers and assign a dedicated security pass rather than treating them as incidental work. Shipping Phase 2 features on top of XSS or decorative auth is worse than shipping nothing.

### 7. Regression detection real logic disappoints (NEW)
**Risk:** The real keyword matching in item #1 produces more false positives or false negatives than the hardcoded demo suggested. Team loses trust in the "possible regression" badge.

**Mitigation:** Run keyword matching in shadow mode for 2 weeks — produce the badge but also log which items it fired on. Fahad reviews the shadow log. Only promote to production badges when the precision looks acceptable. Plan for similarity search (step 2 of item #1) as the real fix if keyword alone is too noisy.

---

## Success Metrics — Phase 2 Exit (Month 6)

Phase 2 is complete when:

1. Real regression detection (keyword first, then similarity) has fired at least 3 real regression alerts in 60 days — at least 1 was confirmed by QA as a valid catch.
2. The AI-usage signal has been reviewed by Fahad at least twice as part of a merit score conversation.
3. Cross-project capacity view has been used by Fahad to make at least one dev assignment decision.
4. PWA tested on iOS Safari and Android Chrome without layout-breaking issues. All 8 users have loaded the dashboard on mobile at least once.
5. Bitbucket/GitHub PR auto-import live for at least 2 of the 5 projects — devs on those projects no longer manually logging commits.
6. Monthly AWS cost under $12 (comfortable headroom before the $20 ceiling).
7. No P0 bugs introduced by Phase 2 features for the final 14 days of the phase.
8. Token budget tracker shows monthly Claude usage still under 80% of quota, even with retro generation and new heuristic scoring.
9. Quarterly review generator has produced at least one draft Fahad used as the basis for a real dev review conversation.
10. TOTP reset flow tested end-to-end by at least one user other than Fahad.
11. **(NEW)** Custom-prompt upload flow has been used by Fahad or Imran at least 10 times — proves the feature solves the steering problem, not just ships.
12. **(NEW)** At least 5 disputes have been resolved end-to-end using the PM-side resolution UI.
13. **(NEW)** Git sync is live on at least 3 of 5 projects with real commits — no project still on placeholder data.
14. **(NEW)** Bug alert emails have fired for at least 3 P0 or P1 bugs and Fahad has confirmed receipt within the target window.

---

*Phase 2 scope is a plan, not a contract. Priority within Phase 2 (P0/P1/P2/P3) means build P0 items first (regression real logic, git sync, AWS deploy), then P1 (capacity, AI signal, DR, TOTP reset, custom prompts, bug alerts, dispute resolution), then P2 (retro, mobile, git blame, snapshots, quarterly review, stick flow, archive, financials, user provisioning UI), then P3 (nominations, locking, Slack, alt layout, more collapsibles) as timeline allows. Fahad makes the call at the Phase 2 kickoff review.*

---

## Appendix B — Integration into phonebot CMS + sibling projects (deferred nice-to-have, confirmed 2026-04-24)

**Approved integration path (CEO decision, confirmed 2026-04-24):**

### Ship target — Path C: devdash lives INSIDE Phonebot HQ

Fahad's direction: **devdash is built as a module within Phonebot HQ (Faizan's Next.js + Postgres ops platform), not inside Phonebot 2.0.** Reasons:
- HQ is already the staff-facing ops platform — devdash is staff-ops by nature.
- Next.js stack matches what devdash was drafted in (Alpine.js → React port is lower-risk than to Livewire).
- HQ's Postgres holds devdash tables alongside existing HQ schema.
- **Phonebot 2.0 stays a pure customer-facing e-comm app** — no internal tooling loaded into the main revenue-generating codebase. Keeps the Laravel + Next.js repo lean for customer perf and release safety.

**Concrete plan when Phase 2 kicks off:**
1. Add a top-level `devdash` module inside phonebot-hq (e.g. `apps/devdash/` or `modules/devdash/` per HQ's convention).
2. Reuse HQ's existing staff auth — no separate TOTP surface, no Cloudflare Worker needed.
3. Add devdash tables to HQ's Postgres per the schema in `data-architecture.md` / `dev-handoff.md` Section 5.
4. Python audit pipeline stays as a worker (cron or scheduled Lambda) writing INTO HQ's Postgres.
5. Port Alpine.js state → React components; keep the Compass / reward / project / absence logic intact.

**Alternates (fallback only — not the plan of record):**
- **Path B (Laravel + Livewire in Phonebot 2.0)** — use only if HQ cannot take the module. Keeps Phonebot 2.0 clean? No — that's the whole reason Path B is the fallback not the target.
- **Path A (iframe embed in HQ)** — use only if a full React port is blocked and something has to go live quickly. Converts to the real HQ module later without losing work.
- **Skip Path D (headless API)** until 2+ serious consumers justify it. Premature architecture otherwise.

**Per-project integration map** (see `role-expansion-map.md` for full reasoning — summary here):

| Project | Stack | Approach | Work |
|---|---|---|---|
| **Phonebot HQ** (devdash home) | Next.js + Postgres | **Path C — devdash lives here** | Port Alpine → React module; add Postgres tables; reuse HQ auth |
| Phonebot 2.0 | Laravel 10 + Next.js 14 | Feed-only (commits + bugs pulled) | Repo path in config. **No devdash UI loaded into 2.0.** |
| Product Page Revamp | UI-only | Feed-only (git repo registered, no embed) | Add `/ppr` to `projects.yml`; git-sync pulls commits |
| Mobile App MVP | React Native | Feed-only (no dashboard host) | Repo path in config |
| Legacy Maintenance | OpenCart PHP | Feed-only, minimal | Repo path + handoff OFF-PROJECT entries |

**Architecture principle:** devdash lives in ONE host (**Phonebot HQ**) and READS data FROM all 5 projects via git sync + handoff notes. 1-to-N relationship, never N-to-N. Do NOT replicate devdash inside Phonebot 2.0, Product Page Revamp, Mobile App MVP, or Legacy Maintenance.

**Prerequisites that gate ALL integration paths** (must close before integration work starts):
1. Replace `devMockData` + hardcoded arrays (`stuckPrs`, `regressionCandidates`, `blockers`) with real data sources.
2. Kill the decorative `tryLogin()` — enforce real TOTP or CMS SSO (depending on path).
3. Migrate from localStorage → proper DB (schema in `dev-handoff.md` + `data-architecture.md`).
4. Fix the `x-html` XSS in `pmSummaryHtml()`.
5. Add `schema_version` + merit/compass characterisation tests so scores can't silently drift during the port.

**Scheduling:** integration is **Phase 2 P1** (below regression real logic, git sync, AWS deploy but above mobile, snapshots, quarterly view). Fahad confirmed this is desired but not blocking for Phase 1 launch. Revisit at the Phase 2 kickoff review.

---

## Appendix C — Retro + OKR layer (Phase 2, research-required)

Fahad confirmed 2026-04-24: **YES in phase 2, with proper deep research** (not a superficial "Retro tab").

**Why it matters:**
- Compass + weekly summary = tactical ("did we ship this week?")
- Retro + OKR = strategic ("are we moving the right dials this quarter?")
- Without this, patterns ("payment flow keeps breaking") never get captured and the team relearns the same lessons.

**Research required before building (should match the depth of `reward-system-design.md`):**
- Retro cadence — weekly / fortnightly / monthly / release-end?
- Retro format — 3-question (went-well / didn't / try-next), 4L (liked-learned-lacked-longed-for), start/stop/continue, or custom?
- Retro ownership — PM runs, CEO observes, all-hands, or per-squad?
- Retro → action-item tracking — do items become blockers automatically if not closed by next retro?
- OKR cadence — quarterly is standard; some teams go half-annual
- OKR ownership — company-level (Fahad sets), team-level (PM sets), personal (dev sets) — or all three tiers?
- OKR scoring — 0-1.0 grading at quarter-end, or binary hit/miss?
- Link between OKRs + compass — does hitting an OKR key result feed into Drive? Or stay separate?
- Public vs private — all devs see all OKRs, or role-gated?
- Integration — do Retro action-items surface as blockers / feature requests / audit findings?

**Don't build until the design doc answers all 10 questions** (pattern: 6-decisions reward design → MVP code). Premature Retro features produce "yet another checkbox" that nobody fills in.

**Phase 2 priority:** P2 (below regression logic / git sync / AWS deploy / HQ integration / burnout detection / AI insights, above parity matrix / quarterly view).
