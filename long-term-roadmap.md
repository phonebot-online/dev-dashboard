# devdash — Long-Term Challenges and 3 / 6 / 12-Month Roadmap

**Owner:** Fahad (CEO, Phonebot)
**Written:** 2026-04-24
**Audience:** Fahad + anyone who builds the next phase
**Status:** Strategic reference — not a sprint board

---

## 1. Honest Assessment of Current State

### What is actually built

- `devdash.html` — an Alpine.js single-page prototype that runs entirely in the browser on localStorage. It has: three themes (dark / light / cream), a working login screen with a two-step TOTP flow (email pick → code entry), five role views (CEO, PM, Dev, QA Auditor, QA) with correct visibility-matrix gating, compass visualization rendering all four Compass directions (Velocity / Craft / Reliability / Drive), a settings panel that lets you edit team configuration, project tabs with sub-tab navigation, and a theme toggle. The data model behind it is hardcoded demo objects — Faizan, Moazzam, Faisal, Usama — with synthetic merit scores.
- `dashboard.config.yaml` — partial config covering one project (Phonebot 2.0). Repos, scope docs, devs, and deadline are declared. No reward config, no retention config, no direction weights.
- `users.yaml` — email-to-role map for 8 users.
- Cloudflare Worker scaffolding (`worker/`) — TypeScript structure with stubs for TOTP, session, email, and routing. Not deployed.
- Python modules (`scripts/dashboard/`) — scaffolded but most are stubs. `config.py` and `git_reader.py` have partial logic. `merit.py`, `forecast.py`, `render.py` are empty or placeholder.
- `data-architecture.md` — full backend architecture documented (DynamoDB + S3 tiering, knowledge card mechanism, API surface). Design only — nothing built.
- `context-strategy.md` — token economics documented. Design only.

### What is mocked / faked in the prototype

Everything the dashboard currently shows when you click around is hardcoded data in the Alpine.js `devdash()` function: merit scores, handoff content, project percentages, traffic lights, reward amounts. None of it comes from real commits, real handoffs, or real QA uploads. The TOTP login "works" visually but accepts any code (there is no real secret validation in the HTML prototype).

### What is missing entirely

- The weekly audit Lambda / slash command pipeline (no production version exists)
- Real TOTP validation against stored secrets (backend not built)
- AWS infrastructure: DynamoDB, S3 buckets, KMS key, SES config, CloudTrail — zero provisioned
- Knowledge card generation — no Claude call happens yet
- Merit scoring engine — no real Compass calculation runs
- Handoff ingestion — `handoff_parser.py` is a stub
- Git reader — partial, not integrated into any audit pipeline
- User provisioning workflow — `totp_provision.py` not yet complete
- Reward payout calculation — not even modelled
- Dispute workflow — UI button exists but no backend process or PM review flow
- Email digest — SES config and Lambda trigger not built
- Bug attribution to dev — completely mocked (the design says "git blame logic missing")
- Any form of DR / backup / restore

**Summary:** What is built is a polished proof-of-concept that shows Fahad how the system will look and feel. It is not a system. The architectural thinking is solid. The gap between the prototype and a production deployment is approximately 3–5 developer weeks of focused backend + integration work, assuming a competent engineer who does not have to redesign anything.

---

## 2. Month 1 After Go-Live — Challenges and What to Expect

### Adoption friction

TOTP setup will trip people up. At least one person — likely Faisal or the junior QA — will lose their phone, reinstall an authenticator app, or set up a new device and not transfer the secret. You have no self-service TOTP reset flow built. Fahad will need to manually re-provision them via `totp_provision.py`, which means either running it locally or giving the admin endpoint enough documentation that he can do it quickly. Plan for 2–3 support requests in the first week.

Clock-in habit does not exist on the team yet. Right now clock-in/out is part of the handoff concept. If devs write handoffs inconsistently — or not at all — merit scoring has no signal for the Drive direction. In week 1 you will likely see handoffs from Faizan (who already uses this pattern) and silence from at least two others. Imran's PM chase rhythm needs to start immediately: a brief WhatsApp reminder on the first two or three Mondays until the habit forms, then it runs itself.

The handoff format needs polishing before go-live. If the template is not dead simple — a one-liner for CLOSED, one-liner for IN PROGRESS, one-liner for OPEN — devs will either skip it or write walls of text that Claude cannot parse cleanly. Publish a 5-line example and pin it somewhere they will actually see it.

### Week 1 calibration reality

Merit scores in week 1 are noise. Not because the model is wrong, but because:

- Reliability scoring needs 4+ weeks of baseline before consistent-vs-inconsistent means anything.
- Velocity is based on item closure rate, and in week 1 some items may not yet be linked to devs properly.
- Drive depends on handoff consistency — if devs haven't done handoffs before, the baseline is zero, and a single handoff scores "exceptional" just for existing.

Do not show week 1 merit scores to devs. Show Fahad the raw data privately and treat it as a calibration run. Tell the team: "scores go live at week 4." This avoids day-one score anxiety before the system has earned credibility.

### Data noise and gaming risk

Within 2–3 weeks of go-live, at least one dev will probe what affects their score. The most likely gaming vectors:
- Writing very long, detailed handoffs (gaming Drive) without the actual work to back them up
- Closing trivial items rapidly (gaming Velocity without substance)
- Padding commit messages with references to scope items

The Handoff multiplier is your main defense here: handoff claims that are not backed by corresponding commits get flagged. Make sure the commit-to-handoff cross-check is running from day one, not as a phase-2 feature.

### What Imran's role looks like in month 1

Imran gets a view that shows aggregated merit tiers and project status. His job changes from "chasing on WhatsApp" to "logging blockers into the system and reading the dashboard digest." If he does not adapt, the dashboard becomes Fahad's private tool and Imran stays on WhatsApp. That is a failure mode. Imran needs a real task: own the handoff chase, log feature requests when they come in, and write at least one structured PM upload per week (sprint priorities, upcoming risk). Make this explicit before go-live.

### Likely month 1 pain points with answers

| Pain point | Likely cause | Answer |
|---|---|---|
| Score looks wrong for a dev | Handoff missing for a key delivery | PM reviews signal breakdown, Fahad manually overrides with reason logged |
| TOTP login fails | Clock skew on phone or wrong account selected | Check phone time sync; re-provision if needed via admin endpoint |
| Dashboard shows stale data | Weekly audit not triggered (Fahad forgot Sunday run) | Set a calendar reminder; alternatively, trigger from any device with CLI access |
| Dev complains about score publicly | Score visible before system has enough history | Keep scores CEO-only for first 4 weeks — only share after calibration period |
| Knowledge card feels generic | First-run bootstrap from scope docs is thin | After week 2, the cards will have real handoff + commit data and improve quickly |

---

## 3. Month 3 — What Starts to Break or Become Visible

### Accumulated data weight

By month 3, each project has 12 weeks of handoffs, ~200–300 commits, QA findings, and weekly snapshots. The knowledge card mechanism handles this cleanly in theory — the weekly audit still loads ~9,600 tokens per project because old data stays in S3 and does not enter the default context. But if the knowledge card generation has been unreliable (hallucinations, missed deliveries, stale data in the card) the divergence between what Claude thinks the project looks like and what it actually looks like becomes significant.

Schedule the first manual knowledge card audit at week 10. Pull the knowledge card text for each project and compare it to the actual sprint board. If more than 3 items are wrong (said "closed" but still open, missed a blocker that's been in handoffs for two weeks), the card rebuild process needs to trigger. This is a 15,000–20,000-token one-off cost — acceptable.

### First quarterly review: does the scoring hold?

The first quarterly review is your stress-test. Fahad will look at 13 weeks of merit data and form judgments. The most common failure at this point is not the math — it is that the scoring reflects what was logged, not what actually happened. If Faisal spent 6 weeks debugging a payment gateway integration that never showed in clean commits or handoffs because the work was "messy," his score will look flat. If Moazzam wrote many small commits for a visible UI feature, his score looks strong. This is a real tension, and it cannot be fixed purely by tuning the model.

The answer is not to over-engineer the scoring model. The answer is the manual override capability: Fahad uses it when scoring is clearly wrong due to a data gap, logs the reason, and the override creates a precedent. After two or three of these, the team understands what signal quality is expected and handoff discipline improves.

### Feature request backlog starts piling up

By month 3, every team member has discovered the feature request button. You will have 20–30 feature requests logged across projects, almost none of them triaged. Imran needs a clear role here: he owns the feature request queue. Either he triages them in a weekly pass (mark as approved / deferred / rejected) or they become a graveyard. If feature requests have no lifecycle, devs stop filing them within 60 days.

### Cross-project load visibility: the Faizan problem

Faizan is currently assigned to at least Phonebot 2.0 and possibly other projects. By month 3, if he is on 3–4 projects, his per-project merit scores will each look weak because his capacity is split. The dashboard will show him as "Developing" on two projects simultaneously while Fahad knows he is the best overall contributor. This is a real reporting flaw.

The current data model stores merit per-dev per-project-per-week. There is no aggregated cross-project view. Building one is a Phase 2 item, but flag it now: if the scoring makes Faizan look bad because he is spread thin, and Fahad does not have a way to see total output, reward decisions will be based on incomplete data.

### Trust and team dynamics

Around month 3, at least one dev will ask Fahad directly: "What does my score look like?" This is the first real governance moment. Having a documented score-sharing policy before this happens matters. Recommended stance: Fahad shares the score privately in a one-on-one, shows the direction breakdown, and explains what would move each direction. He does not publish leaderboards or share other devs' scores. This policy needs to be written and communicated before go-live, not improvised in month 3.

The dispute workflow goes from a theoretical button to a real process in month 3. Expect 1–2 disputes. The process needs to be explicit: dev raises dispute → Fahad reviews signal breakdown → either confirms score or overrides with reason → dev receives written explanation. Without a written explanation, disputes create lingering resentment.

---

## 4. Month 6 — The Real Test

### First project archives

When a project ships (assume Phonebot 2.0 ships around July 2026), the dashboard needs to handle the transition: close out the project, preserve all merit history, generate a final project retro. This flow does not exist yet in the design. The current data architecture assumes you run `DELETE /admin/projects/{id}` and data follows the retention schedule — but there is no "archive and freeze" state that lets Fahad look at a completed project's full history without triggering a Glacier retrieval.

Before the first project ships, decide: does a shipped project live in a "completed" view on the dashboard (still accessible, read-only, showing final merit scores and retro), or does it disappear? If the former, build a project archive state and a read-only view. If the latter, export a PDF summary before archiving. Do not make this decision at 11pm the night before launch.

### Regression detection: does it actually work?

By month 6, regression detection has 26 weeks of history to search against. The design describes a keyword search on `items/closed.json` and `week-summaries/`. This will find regressions where the bug description uses the same keywords as the original item. It will miss regressions where the new bug is described differently ("payment fails on BACS" vs "bank transfer timeout"). Real regression detection needs semantic similarity — comparing meaning, not keywords. This is the gap where a basic TF-IDF or embedding similarity check (even a simple one) would catch 60–70% more real regressions. Keyword-only will have a high false-negative rate on real bugs by month 6.

If regression detection has produced three false negatives by month 6 — where Mustafa filed a real regression that the system missed — you will lose credibility with Fahad on the audit feature. Either fix the similarity search before then, or be transparent that the regression match is "a starting point, not a guarantee" and let Mustafa decide.

### Reward program: are the right people winning?

By month 6 the reward program has paid out 2–3 times (assuming monthly or quarterly cycles). The honest question is: did the people who won the reward actually deserve it in Fahad's gut-level assessment? If yes, the scoring model is working. If Fahad is overriding or second-guessing payouts at this rate, there is a systematic calibration problem in the Compass weights.

Two common drift patterns at month 6:
- **Velocity over-weighted:** devs who close many small items beat devs who close fewer large items. Fix: add an item-complexity weight (effort estimate) so a hard item counts more than a trivial one.
- **Drive under-weighted for remote blockers:** devs in Pakistan who are blocked on responses from Fahad or Imran (timezone gap) look passive. The Drive direction needs to account for blockers that are externally caused — the handoff "OPEN: waiting on X" entry should not penalize the dev.

### Team growth scenarios

By month 6, there is a reasonable chance at least one dev has left or one new dev has joined. The data architecture handles dev departure well (disable account, data persists, generates final summary JSON). What it does not handle is the new dev experience. A new dev joining at month 6 sees 6 months of history for everyone else and zero history for themselves. Their merit scores will be low simply because the baseline calculations have no history for them. This is the same cold-start problem as week 1, but it happens in the middle of a mature dataset.

The answer: new dev's first 4 weeks are explicitly a calibration period — no scores shared, no reward eligibility. Communicate this upfront to the new hire as part of onboarding, not as a surprise at week 5.

### Who audits Mustafa?

Mustafa's QA audits feed directly into merit scoring. He has more influence on dev scores than any other single input outside of commits. By month 6, if Mustafa has been consistently hard on one dev and lenient on another — whether consciously or not — the data will reflect a systematic bias. There is no mechanism currently to audit Mustafa's audit quality.

This needs a periodic Fahad review: every quarter, Fahad reads Mustafa's last 4 audits and asks whether the severity assessments are consistent. If two bugs of similar impact have been filed at different severities for different devs, that is a calibration conversation. Build the habit of reviewing the auditor, not just the audits.

---

## 5. Month 12 — Mature System, What Matters Now

### History is an asset, not just a record

At 12 months you have 52 week-summaries per project, quarterly reviews, full merit history, and enough pattern data to answer questions like: "Which dev has the most consistent Reliability score?" and "Which project had the highest bug-rate-per-delivery?" These questions are worth asking. The data is there. The dashboard does not currently surface them as built-in analytics. You either build reporting views for these in month 10–11, or Fahad queries them manually via the audit endpoint.

### Configuration has drifted

The `dashboard.config.yaml` at month 12 will not look like the one at launch. Direction weights will have been tweaked. Reward amounts may have changed. Retention periods adjusted. Projects added and removed. The audit trail captures this in CloudTrail, but there is no human-readable "settings change log" that Fahad can read without pulling raw CloudTrail events.

Build a settings changelog — a simple append-only JSONL log that records: who changed what setting, when, and what the old and new values were. This becomes essential when a dev disputes a score and the scoring formula at the time of the score was different from the current formula.

### Claude Max quota over 12 months: actual evidence

The context-strategy.md estimates ~379,000 tokens per month for devdash operations. At 12 months, with 8–10 projects and a team that has learned to use "load more context" liberally, the real number may be 600,000–800,000 tokens per month. That is 50–60% of a conservative Max quota estimate. Add Fahad's own Claude usage (architecture questions, writing, code review) and you are at or near the quota ceiling.

At month 12, look at the actual token logs (if instrumented) and make a data-based decision: either the dashboard stays efficient because the knowledge card mechanism held up, or it grew beyond projections and needs a quota review. Do not wait for a quota error to trigger this review — schedule it at month 10.

### Hiring implications

By month 12, devdash has 12 months of objective data on the team. This should influence two decisions: 
1. Promotion or raise decisions should reference the 12-month merit trend, not just the last month.
2. When hiring a new dev, Fahad can set a benchmark: "our top performer's 12-month Compass profile looks like this." This makes hiring criteria more objective and less "gut feel on the interview day."

The risk is using the dashboard as a replacement for human judgment rather than a reference. The dashboard cannot measure: architecture thinking, cross-team communication quality, mentoring, or how a person handles a production incident. Make sure job assessments cite devdash as one input among several, not as the primary score.

### Fahad's actual weekly rhythm at month 12

The system was designed for a Sunday-night weekly audit. In reality, Fahad's usage pattern by month 12 will probably look like:
- Sunday: triggers the audit, reads the email digest Monday morning
- Mid-week: checks the dashboard once, reviews any flagged items
- Monthly: reviews merit scores before any reward payouts
- Quarterly: runs a formal quarterly review

What will have stopped: manually chasing devs on WhatsApp for status. If the handoff habit stuck (it will, after 3–4 months of Imran's enforcement), WhatsApp becomes a communication channel again, not a project-status channel. That is the actual win.

### The "am I now a slave to the tool?" reflection

At some point around month 9–12, Fahad will face a real version of this question. The dashboard generates data. The data requires interpretation. The interpretation requires time. If every Monday starts with 20 minutes of dashboard reading before any real work, the dashboard has created overhead, not saved it.

The mitigation is in the design: the email digest is designed to be a 2-minute read that tells Fahad what to care about, with links to dive deeper only if needed. If the digest is doing its job, Fahad reads it in 2 minutes and only opens the dashboard when something is flagged. If he is opening the dashboard out of habit rather than necessity, that is a discipline issue, not a system issue. The system cannot fix it — only Fahad can.

---

## 6. Per-User Long-Term Challenges

### Fahad (CEO)

The biggest long-term risk for Fahad is over-relying on the dashboard and losing the direct-relationship intuition he has built over years. WhatsApp chats gave him social signal — tone, responsiveness, how a dev phrases a problem — that devdash does not capture. A dev who scores 92/100 on Compass but is emotionally disengaging from the company will not show up in merit data until they have already mentally quit.

The opposite risk: Fahad ignores the dashboard because it requires effort, and the team reverts to WhatsApp status updates within 6 months. The system only helps if Fahad actually uses it as the primary tracking mechanism.

Balance point: use devdash for tracking work output and making reward decisions. Keep direct calls with each dev monthly for the human signal. Do not let the dashboard replace those conversations.

### Imran (PM)

The risk at 6–12 months is that Imran becomes a dashboard operator: logging items, chasing handoffs, running the feature request queue — and stops doing actual product management (prioritisation decisions, trade-off analysis, stakeholder communication). If devdash makes the operational work so visible that Imran spends all his time on it, his PM leverage decreases rather than increases.

Signs this is happening: Imran is adding more and more small items to the backlog rather than deciding which big things to not do. The fix: Imran's PM upload (his weekly submission to the dashboard) should include a "what I decided NOT to do this week" field. Makes de-prioritization visible and forces the habit.

### Devs (Faizan, Moazzam, Faisal, Usama)

**Score anxiety:** Once devs see their Compass scores, some will anchor to the number. Faisal getting a 74 one week and 71 the next will feel like a setback, even if both scores are solidly "Solid" tier. Normalise score variance. Communicate that week-to-week movement of ±5 points is noise, and the relevant signal is the 4-week trend.

**Gaming:** Gaming intensity peaks at months 2–4 when the scoring mechanics are new and curiosity is high. It typically plateaus when devs realise that gaming one direction (e.g., writing many handoff entries) does not significantly move the overall score without corresponding commit and item-closure signal. The Handoff multiplier is the main anti-gaming control — keep it active.

**Privacy concerns:** Australian employment law does not prohibit work performance tracking for contractors, but if any team member is an employee, automated merit tracking that affects pay may require disclosure and consent under the Privacy Act 1988 and Fair Work Act. Get this confirmed by an employment lawyer before using devdash scores to directly influence salary or bonus decisions. Keep a policy document that explains what is tracked, how it is used, and how to dispute it.

### Mustafa (QA Auditor) and junior QA

Mustafa's risk: "bug farming" — filing more bugs, not better bugs, because activity feels like productivity. By month 6, if the QA audit count has doubled but the severity of actual bugs found has stayed flat, that is a signal. Build a metric Fahad reviews quarterly: bugs filed per audit vs bugs confirmed by devs as valid. A high false-positive rate from QA is a quality problem on the QA side, not just the dev side.

Junior QA risk: feeling invisible. The dashboard currently shows QA findings attributed to the QA role, but the junior QA does not have a merit score. They are a contributor without a feedback loop. Consider adding a lightweight QA performance dimension in Phase 2 — not a full Compass model, but acknowledgment of quality and coverage metrics. Otherwise turnover in the junior QA role is likely within 12 months.

### New hires

Anyone joining after month 6 is onboarding into a system that has 6 months of team history, established scoring norms, and reward precedents. They will not understand why certain score thresholds matter, what a "Solid" tier means in practice, or why the Handoff multiplier is configured the way it is.

Devdash needs an onboarding document that is maintained as the system evolves — not a static README from day one. New hires should get a 30-minute walkthrough of the dashboard from Fahad or Imran, a copy of the scoring model with worked examples, and a clear statement of the calibration period. Without this, month-1 scores for a new hire will be misread by both the hire and by Fahad.

---

## 7. Phase 2 Feature Additions (Months 3–6)

These are the features most likely to be needed based on the month 3 and month 6 challenges above.

| Feature | Why it's needed | Complexity |
|---|---|---|
| Semantic regression detection | Keyword-only misses real regressions; needs embedding similarity | Medium |
| Cross-project capacity view | Faizan on 4 projects looks weak on each; need aggregate | Medium |
| Mobile-optimised CEO view | Fahad will be traveling; dashboard is desktop-only now | Low-Medium |
| Automated weekly retro summary | Weekly audit produces data; someone should write the narrative | Low (Claude call) |
| Feature request triage workflow | Queue is growing; needs approve / defer / reject states | Low |
| Dev cold-start grace period flag | New hires show as "no data" for 4 weeks; flag needs to be explicit | Low |
| AI usage annotation | Fahad raised concern about devs using Claude but poorly; log AI-assisted commits | Medium |
| Peer nomination layer | Compass is top-down; optional peer signal adds social dimension | Medium |
| Cost/revenue project linkage | Which projects are generating margin? Contextualises dev output | High |

---

## 8. Phase 3 Feature Additions (Months 6–12)

| Feature | Why it's needed | Complexity |
|---|---|---|
| Hiring integration | 12 months of merit data informs what a benchmark hire looks like | Medium |
| Board-facing quarterly view | If investors or advisors review Phonebot operations | Medium |
| ML-assisted effort estimation | Claude currently estimates effort from scope; a trained model would be more accurate | High |
| GitHub / Bitbucket PR auto-import | Currently relies on dev commits; PR-level data adds code review signal | Medium |
| Public API for integrations | If team starts using Jira, Linear, or other tools — pull into devdash | Medium |
| White-label potential | If Fahad ever wants to productise devdash for other small tech teams | High |
| Xero payroll integration | Reward payouts need to flow to actual payments | Medium |
| SSO / SAML auth | If Phonebot grows to a team size where managing TOTP secrets is impractical | Medium |

---

## 9. Critical Gaps — Address Before or During Month 1

These are not future roadmap items. They are gaps that will cause pain if left open.

**Disaster recovery and backup.** The current design has no tested restore procedure. S3 versioning is not mentioned. If a Lambda bug writes corrupt data to DynamoDB and S3, or if a lifecycle rule misconfiguration deletes warm data early, there is no restore path. Before go-live: enable S3 versioning on the devdash bucket, test a manual restore of a project snapshot, and document the 3-step restore procedure somewhere Fahad can find it at 2am.

**User provisioning flow in production.** `totp_provision.py` exists but is not a clean workflow. The sequence of "new user joins, generate TOTP, distribute QR code securely, confirm setup" needs to be a single command that outputs clear instructions. This will be needed for every new hire and every TOTP reset. Not having it documented means Fahad will be improvising under pressure.

**Audit trail for config changes.** The data architecture mentions CloudTrail for data access, but configuration changes (direction weights, tier thresholds, reward amounts) are not currently logged with before/after values in a human-readable format. Every time Fahad changes a config value, that change should be written to the settings changelog (a simple append-only file). Without this, a dev who disputes a score from 3 months ago cannot verify that the scoring formula was the same then as now.

**Offline resilience.** Fahad is in Australia. The team is in Pakistan. The AWS infrastructure is (proposed) in Sydney. If Fahad is traveling to Pakistan or Southeast Asia and has poor connectivity, he needs to be able to read the dashboard. The Cloudflare KV cache (7-day HTML payload) handles read-only access. But triggering the weekly audit requires CLI access to his Mac or a deployed Lambda trigger. Document the offline runbook: "If Fahad cannot run the audit on Sunday, here is how to trigger it from any device."

**TOTP secret compromise.** There is no documented procedure for what happens if a team member's TOTP secret is compromised (phone stolen, authenticator data leaked). The current design stores secrets encrypted in DynamoDB. The reset flow — generate new secret, invalidate old sessions, deliver new QR code securely — is not built and not documented. This needs to be a 5-minute admin task, not an architecture problem. Write the procedure now; build the endpoint before month 1.

**Dispute workflow — the PM review process.** The UI has a "dispute score" button. There is no backend process defined for what happens after you click it. Specifically: who gets notified, what evidence they review, what the resolution steps are, and how the outcome is communicated to the dev. Without this, disputes either get ignored (causing resentment) or escalate to Fahad directly every time (defeating the purpose). Write a one-page dispute SOP before go-live. Imran should own the first-level review.

**Bug attribution accuracy.** The design says "auto-route by code ownership" but the actual git blame logic is not built. Currently, QA findings are attributed manually or not at all. In month 1, Mustafa needs a clear way to tag which dev a bug belongs to when filing a finding. The automatic attribution is a Phase 2 problem — in month 1, make the manual attribution field required.

---

## 10. Settings That Must Stay Configurable

These settings must never be hardcoded. They will all change at some point.

| Setting | Why it changes |
|---|---|
| Number of Compass directions (currently 4) | Fahad may add a 5th direction (e.g., "Communication") or drop one |
| Direction names | "Drive" replaced Kimi's "Leverage/Unblock" — another rename is plausible |
| Direction weights (% of total score) | Will be rebalanced after first quarterly review |
| Tier thresholds per direction (what counts as Exceptional vs Solid) | Calibration based on 3 months of real data |
| Reward amounts per direction, currency, payment frequency | May add projects, change budget, change cycle |
| Handoff multiplier range (min–max) | Needs to be tuned after month 2 |
| Context window days (how far back default audit looks) | May tighten from 14 days to 7 days if noise increases |
| DynamoDB TTL length (14 vs 30 days) | Affects query speed vs cost — design suggests 30 days |
| Retention periods per tier (Warm: 15–90 days, Cold: 90–365 days) | Projects may want longer retention for compliance |
| Severity and urgency labels in QA findings | Will evolve as QA discipline matures |
| Visibility matrix rules | If a new role is added (e.g., Designer) |
| Daily digest time and email recipients | When team timezone distribution changes |
| S3 bucket name, region, KMS key ARN | Per deployment environment |
| Snapshot retention count | Tradeoff between cost and quarterly review depth |
| Feature request urgency levels | Will grow beyond initial 3 levels |

Settings that can be hardcoded (stable by design):
- Auth method: TOTP (until SSO is explicitly added)
- Session TTL: 24 hours
- Handoff format: CLOSED / IN PROGRESS / OPEN
- S3 path structure (changing this would break all existing data)

---

## 11. Architectural Flexibility — Design for Change

These are the places where locking in a specific implementation will cost real effort to undo later.

**Compass direction count must be data-driven.** The current prototype hardcodes four directions: `dir-velocity`, `dir-craft`, `dir-reliability`, `dir-drive`. If the config adds a fifth direction, the HTML, merit calculation, and reporting all need to change. The right design: compass directions are a JSON array in config. The HTML renders N spokes on the radar chart, the merit model reads the directions array, the score is `sum(direction_weight * direction_score)` for all N directions. No special-casing for "four directions."

**Reward formula as a plugin.** The current design implies a formula like `(compass_score * handoff_multiplier) - deductions`. The exact formula is going to change. Do not embed it in `merit.py` as a hardcoded calculation. Put the formula as a small JSON expression or a named function that can be swapped without touching the rest of the scoring engine.

**Auth provider abstraction.** The Worker currently wires directly to TOTP. If Phonebot ever grows to 20+ staff and a proper directory becomes warranted, swapping to SSO (Google Workspace, Okta, SAML) should require changing the auth module, not the entire Worker. Keep the auth interface clean: `authenticate(email, credential) → { valid: bool, role: string }`.

**Git host abstraction.** `git_reader.py` currently assumes local git repos (the path is `/Users/adminadmin/Downloads/phonebot revamp/...`). If code moves to Bitbucket Cloud or GitHub, the reader needs to call their respective APIs. Abstract this early: a `GitProvider` interface with implementations for `LocalGit`, `BitbucketCloud`, `GitHub`. Swap by config.

**Storage abstraction.** The data architecture correctly defaults to AWS (DynamoDB + S3 + KMS). But DynamoDB-specific calls should not be scattered through the codebase. Use a `StorageClient` abstraction with `put`, `get`, `query`, and `delete`. The DynamoDB implementation is the default. A LocalFileStorage implementation (for local testing) should be trivial to wire in. This also makes the system testable without real AWS credentials.

**LLM abstraction.** Every Claude call in the weekly audit should go through a thin `LLMClient` interface: `complete(prompt, options) → string`. Today this routes to Claude Max via the CLI. If Anthropic changes pricing or Fahad switches to a different model for certain tasks, the routing should be a one-line config change, not a code change.

---

## 12. Strategic Call-Outs for Fahad

Things that are not in any ticket and should be thought about now.

- **Selling or spinning off a project.** If Phonebot sells its legacy product or spins off a project as a separate company, what happens to that project's data in devdash? The current design stores all projects under one S3 bucket and DynamoDB table. There is no data portability plan. Decide in advance: if a project leaves the company, can you export a clean snapshot of all its data (merit history, QA findings, project docs) and delete it from the main system?

- **Dev refusing TOTP on privacy grounds.** This is unlikely but possible. If a team member objects to biometric-style authentication or argues that the merit tracking system constitutes workplace surveillance under Australian privacy law, you need a written policy. Even if contractors have fewer protections than employees, having no policy is always the riskier position. Draft a one-page "devdash data policy" explaining what is collected, how it is used, who can see it, and how disputes are handled. Have every team member acknowledge it in writing before go-live.

- **Australian employment law and automated merit tracking.** If any team member is classified as an employee (not a contractor), automated performance tracking that influences pay or promotion may trigger obligations under the Fair Work Act 2009 — specifically, adverse action provisions if a score is used as part of termination reasoning. The dashboard stores enough data to be used as termination evidence. Get advice from an employment lawyer before month 3, not after a dispute arises.

- **Reward payouts and Xero.** The reward program pays out in dollars. Those payments need to go through payroll or be classified as contractor payments on invoices. Neither of these connects to devdash automatically. Right now the reward amounts are calculated in the dashboard and Fahad presumably approves them manually. If payouts become monthly, the link between "devdash says Faizan earned $320 this month" and "Xero creates the payment" needs to be explicit. Either devdash generates a payout CSV that imports into Xero, or someone manually transcribes the numbers. Manual transcription at monthly cadence is one typo away from a payment dispute.

- **Claude Max pricing change.** The system's cost model assumes Claude Max at $100/5x remains available and that the monthly token quota remains sufficient. Anthropic has changed pricing multiple times. If Claude Max is restructured to per-token billing, the devdash monthly cost at 379,000 tokens would be approximately $19–$38/month depending on model tier — affordable, but no longer "nearly free." If it were discontinued, the entire audit pipeline breaks. Design decision: have a documented fallback. The fallback does not have to be sophisticated — it can be "if Claude Max changes, we switch to Claude API and budget $50/month for tokens." But write it down now, not in the panic of a pricing change.

- **Who has the admin credentials if Fahad is incapacitated.** The admin endpoint requires Fahad's TOTP. The AWS `devdash-admin` IAM role credentials are presumably on Fahad's local machine. If Fahad is unavailable for 2 weeks — sick, traveling without access, or otherwise unreachable — and a TOTP reset is needed or a user needs to be provisioned, who does it? Designate a technical deputy (probably Faizan, as the most senior dev) with read-only access to enough documentation to handle a basic admin action. Store the emergency runbook somewhere Fahad can point someone to under stress.

- **Scope creep driven by visibility.** The moment the team can see who is closing items and at what rate, project scope will start to be gamed at the PM level — Imran may add more items to look busy, or devs may break large items into smaller ones to show more closures. Visibility creates incentives. Watch for item count inflation in the first 60 days: if the total open-item count grows faster than it is being closed, that is a signal to look at whether items are being created for scoring reasons rather than project reasons.

---

## Month-by-Month Summary Table

| Month | Primary risk | Most important action |
|---|---|---|
| Go-live | Adoption fails; team does not form habits | Imran enforces handoff chase; TOTP setup supported day 1 |
| Month 1 | Cold-start scores mislead; gaming starts | Keep scores CEO-only for 4 weeks; publish handoff format clearly |
| Month 2 | Data noise; score calibration | First manual check: are scores matching Fahad's gut? Adjust weights if not |
| Month 3 | Knowledge card drift; feature request backlog grows | Manual knowledge card audit; Imran triages feature queue |
| Month 4 | First trust moment: a dev challenges their score | Dispute SOP invoked; outcome documented; sets precedent |
| Month 5 | Cross-project dev visibility gap | Decide whether to build aggregate view or handle manually |
| Month 6 | First project archives; regression detection tested at scale | Build project archive state; evaluate regression detection quality |
| Month 9 | Quota usage creeping; config has drifted | Token log review; settings changelog audit |
| Month 12 | System has become infrastructure — or been quietly abandoned | Formal retrospective: what stuck, what did not, what to change for year 2 |

---

*This document should be reviewed at month 3 and updated with what actually happened versus what was predicted. The gaps between plan and reality at that point are where the real system design work lies.*

*Owner: Fahad. Written by: devdash architecture review, 2026-04-24. Next review: 2026-07-24.*
