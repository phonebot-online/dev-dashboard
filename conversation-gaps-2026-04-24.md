# Conversation Gaps — Dev Dashboard — 2026-04-24

Source transcript: `/Users/adminadmin/.claude/projects/-Users-adminadmin-Downloads-phonebot-revamp/2547e898-8181-4576-b103-914419d46546.jsonl` (~1094 lines, ~6.3 MB)

Cross-referenced against:
- `/Users/adminadmin/Downloads/phonebot revamp/dev dashboard/devdash.html` (v1 SPA, 118,955 bytes)
- Adjacent docs (`data-architecture.md`, `ops-guide.md`, `phase-1-scope.md`, `phase-2-scope.md`, `security-and-incidents.md`, `user-guides.md`, `long-term-roadmap.md`, `dev-handoff.md`)

Method: parsed user-role messages from the JSONL with `jq`, stripped echoed skill-doc content, walked each Fahad request against the current HTML + docs.

---

## IMPLEMENTED

| Fahad request | Where it lives now |
|---|---|
| Multi-view dashboard (CEO / PM / Dev / QA / QA Auditor / Settings) | `devdash.html:219` onward; role tabs gated at line 1505 |
| Google Authenticator OTP-style login per user | `devdash.html:142–208`, `tryLogin()` at line 1494 |
| Compass scoring model (Velocity / Craft / Reliability / Drive + Handoff multiplier) | `devdash.html:1525–1539`, settings at line 1051 |
| True North badge (all 4 directions ≥ threshold) | `devdash.html:350, 462, 619, 728`; logic at `hitTrueNorth()` line 1539 |
| Per-project tabs in every view | `activeProject` filter, `filteredProjects()`, `filteredBugs()` lines 1542–1556 |
| Off-project work logging (legacy firefighting, cyber-security fires) | `showOffProjectForm` modal line 1219; `Log off-project` button line 775; off-project hours shown in PM view line 478 |
| QA junior can submit bugs routed to owner | `submitBug()` line 1656, UI line 898; `suggestDevForBug()` auto-routes |
| QA Auditor can file audit reports | `submitAudit()` line 925 onwards |
| Ad-hoc feature request from CEO/PM | Floating button line 1197; `submitFeature()` line 1668 |
| Configurable project owner (not hardcoded) | Settings → Projects `owner_email` dropdown line 989 |
| Contributor list (beyond owner) | `contributor_emails` array line 995 |
| Project % complete, days remaining, days required | Project cards line 1306 onward carry `percent_complete`, `days_remaining`, `days_of_work_required`, `forecast_launch` |
| Worst-case launch forecast on CEO view | `worstCaseLaunch()` line 1577 |
| Dispute button on commits + bugs | `openDispute()` line 1688, modal line 1231, submit line 1689 |
| Regression watch section (visible) | CEO view line 546; hardcoded demo data line 1446 |
| Blocker / decision-debt section (small, not in-your-face per Fahad) | `blockers` array line 1436; surfaced line 520 |
| Rewards config (per-direction $, True North, Growth, Team pool, Owner bonus) | Settings → Rewards lines 1086–1110 |
| PM assessment upload (cross-reference against own Claude/ChatGPT output) | `submitPmAssessment()` line 1682 |
| Audit log of config changes | `auditLog` line 1450 |
| Legacy Maintenance as its own project | `id: 'leg'` line 1310 |
| Project-owner bonus % configurable | `owner_bonus_pct` line 1109 |
| Fahad / Imran / Faizan / Moazzam / Faisal / Usama / Mustafa / qa@ user seeds | Users array line 1296 |

---

## PARTIALLY IMPLEMENTED

### 1. Dispute flow — submit works, resolution does not
**What exists:** Dev clicks Dispute on a commit or bug → modal captures reason → stored in `disputes[]` with `status:'open'` → surfaced in PM view line 574.
**Gap:** No approve / reject / resolve UI. PM can read disputes but cannot close them, attribute to another dev, or reverse the merit impact. The reason text is displayed and that's it.
**Fahad quote:** (Implied by design review — this was a pending item: "Dispute flow for audit findings: button exists, backing logic not built").
**Where it should live:** PM view dispute card at `devdash.html:574–588` — add Resolve / Reject / Reassign buttons + status filter.

### 2. Regression detection — UI present, logic absent
**What exists:** "Regression watch" card on CEO view (line 546) renders two hardcoded candidates.
**Gap:** No similarity search against the history layer; `regressionCandidates` is static demo data (line 1446). The assistant proposed "Claude searches history for similar → flags" — that logic is not in the worker or the HTML.
**Fahad quote:** Not Fahad's direct ask but approved as part of the scope. Pending since data-architecture.md was finalised.
**Where it should live:** Worker (`dev dashboard/worker/`) + history layer query; CEO card needs to render whatever the worker outputs.

### 3. Off-project surfacing in CEO view
**What exists:** `Team off-project hours` block in PM view (line 383), per-dev off-project note in PM list (line 478), dev's own off-project log in Dev view (line 785).
**Gap:** CEO view doesn't summarise aggregate off-project drain at the portfolio level. Fahad explicitly said off-project consumes ~15h/wk on legacy — that should be front-and-centre for the CEO so he can see velocity loss.
**Where it should live:** CEO portfolio strip near line 380–420.

### 4. Blocker / WhatsApp-backed philosophy
**What exists:** Small blocker queue on CEO view line 520.
**Gap:** Fahad said blockers should be "subtle, not in your face" because devs WhatsApp him directly — the section is present but there is no WhatsApp deep-link or "Ping Fahad" shortcut, and no suppression rule that hides blockers < N hours old (because devs WhatsApp within minutes).
**Fahad quote:** "all they have to do is pick up their WhatsApp, call us or message us or email us So I'm really not sure if we need the blocker. Maybe we need the blocker, but in a subtle or in a very not in your face way."

### 5. QA Auditor weekly/bi-weekly cadence + time-tracking
**What exists:** Audit report submission form.
**Gap:** Fahad said "this guy is doing deeper functionality and functionality parity matrix audits" and "might login his time or other analysis." No time-logging input on QA Auditor form; no parity matrix view; cadence is not enforced/surfaced ("last audit: Xd ago" tied to his expected 1-2 week cadence).

### 6. Kimi reference dashboard parity check
**Fahad quote:** "i was able to get a more thorough version made by kimi in less then the time it took you to develop your skeleton structure . why is that and how you can improve.? im only paying kimi $20 where im paying you $300" (URL: `https://nkuvihofekkxe.kimi.show/`)
**Gap:** No explicit visual/feature parity diff between Kimi's version and current state was ever produced and closed out. Unknown whether anything from Kimi's thorough version is still missing.

---

## NOT IMPLEMENTED

### A. Custom prompt upload (CEO + PM → devs)
**Fahad quote:** "also i think its very important that imran or me provides a custom prompt to the dev team from time to time which has detailed insights into their usage , token usage, productivity and other important info. either i give my prompt and imran gives his custom prompt ... the result of which (prompt output) they should upload, word for word, to their dev dashboard."
**Refinement:** "we should have somewhere to upload something of file or an MD file something on our panels as well. Which is like a document that provides additional context either weekly or in that project as a whole."
**Scope decision (Fahad):** "CEO/PM upload prompts → tagged with ID. - yes to the respective project only not the entire dev context across all projects"
**Gap:** Zero `prompt` references in `devdash.html`. No upload affordance on any panel. No "respective project" tagging. This was explicitly approved twice and never built.
**Where it should live:** CEO view + PM view: an "Assign custom prompt" card scoped to an active project. Dev view: an "Upload prompt output" card with textarea that saves the word-for-word response.

### B. Automated email-to-CEO when QA finds a bug (approved shortcut)
**Fahad quote:** "2) it can fixed via a simple email to ceo function? is that possible an automated email to me?"
**Context:** Approved as the cheap alternative to full escalation workflow.
**Gap:** No mailto, no SES stub, no config field for notification email. Settings → System mentions "digest_time" (line 1157) but nothing per-event.
**Where it should live:** `submitBug()` at line 1656 should trigger an email via worker; Settings → System needs a CEO-notify checkbox + per-severity threshold.

### C. "Stick" / Tier-D underperformance private-conversation flow
**Fahad quote (answering assistant's Q about the stick):** "3 - Private conversation between you and them"
**Gap:** Rewards side is fully built (per-direction bonuses, True North, Growth, Team pool, Owner bonus). Penalty side has no UI. No "private flag" toggle on PM view, no low-performance surface for CEO, no 4-week-at-Tier-D alert.
**Where it should live:** PM view — a "Needs private conversation" list only visible to CEO + PM, auto-populated from trailing 4-week compass data.

### D. Quarterly performance review (approved as "novel idea")
**Fahad quote:** "yes novel idea for qtrly performance is good."
**Context:** The assistant proposed a quarterly history view replacing the traditional annual review. Fahad said yes.
**Gap:** No quarterly aggregation view, no history-layer rollup UI, no "download quarterly review" action. The "compass trail" / history layer is mentioned in docs but not surfaced as a quarterly view.

### E. Bypass-all-permissions request (was blocking dev velocity)
**Fahad quote:** "1) i need to bypass all permissions that u keep asking me every 2 seconds"
**Gap:** This is a Claude-settings task, not a dashboard task, but it was raised in the same conversation and there's no evidence it was ever actioned for Fahad's environment. `.claude/settings.json` review not confirmed in transcript.

### F. Cross-view visibility matrix (approved)
**Fahad quotes:**
- "oh Dev should be able to see qa and qa auditor view"
- "qa & qa auditor should be able to see dev and qa auditor/QA view"
- "PM should be able to see dev+qa+qa auditor views"
**Status:** `VISIBILITY` constant at line 1505 matches this precisely. **This is actually IMPLEMENTED** — double-checked. Moved from NOT to IMPLEMENTED mentally; keeping the note here so the reader knows it was verified.

### G. Project-owner badge on dev chip
**Fahad quote:** "one dev will be the project owner. so one dev must have the project owner badge or something."
**Status:** `isOwnerOfActiveProject()` at line 1560 exists but there is no visible OWNER badge rendered next to the dev's name in the PM dev list or in the dev card. True North badge is rendered, owner badge is not. **Partial → fix.**

### H. Gaming-the-system detection / anti-sycophancy guardrails
**Fahad quote:** "You haven't really thought about the devs, how they will perform on the job, and how they avoid, and how can they game the system etc etc."
**Gap:** No detection for commit-padding, no review of commit quality vs quantity, no flag for "only works on easy tickets." The Compass uses velocity which is gameable. This was Fahad's explicit concern and no guardrail exists.

### I. Kimi operational edge cases (offline, concurrent edits, data loss, timezones, DR, abuse, moonlighting, AI bad prompts, office politics, data theft, tech-debt regressions)
**Gap:** `security-and-incidents.md` was written but:
- No UI for concurrent-edit detection / conflict resolution on Settings
- No offline mode (SPA assumes connectivity for worker data)
- No moonlighting detection (commits outside business hours on a project the dev isn't assigned to)
- No data-theft audit trail beyond the basic auditLog (3 hardcoded entries)
- Office-politics guard: Fahad's rule "no dev-to-dev reporting" is documented but not enforced by the scoring model (Faizan's rating of Usama would still flow in through PM assessment if Imran copy-pastes it)

### J. Permissions/roles are hardcoded in VISIBILITY object
**Fahad's rule:** "dont hardcode everything. make everything as much configurable as possible. STOP BEING FUCKING LAZY"
**Gap:** `VISIBILITY` at line 1505 is a code constant. Owner is configurable, users are configurable, projects are configurable — role-view matrix is not.

### K. "Days remaining" + "days required" on CEO/PM/Dev/QA/Auditor — all views
**Fahad quote:** "for ceo/pm/dev/qa/auditor view i also need some sort of days remaining and also overall days required for a project to complete."
**Status:** Data is on each project (line 1306), but surfacing is inconsistent. Dev view shows on project chip, CEO portfolio strip has it, **QA and QA Auditor views don't render days_remaining / days_of_work_required per project.** Partial — one-line fix per view.

### L. CEO dashboard doesn't show "5 projects" the way Fahad asked
**Fahad quote:** "we are running five projects. I want to see how those five projects will get displayed in the CEO dashboard and in the PM dashboard and in the dev dashboard and in QA or and QA dashboard."
**Status:** 5 projects are seeded. But there is no single "5 projects at a glance" master grid on the CEO view — the CEO view groups by metric, not by project. Partial.

---

## DECISIONS PENDING (questions Fahad never fully answered)

1. **Handoff multiplier range** — currently 0.85–1.00. Is the 0.85 floor the right place, or does a dev with zero handoff hygiene deserve harsher (e.g., 0.70)? Assistant set the default; Fahad never confirmed the floor.

2. **True North bonus $ amount** — Settings shows an input, Fahad never set a number. Defaults to whatever the assistant seeded.

3. **Growth bonus threshold** — default 10-point improvement is assistant's pick, Fahad didn't confirm.

4. **Team bonus pool unlock thresholds** — 25/50/75/100% milestones, Fahad never confirmed these are the right cuts.

5. **Moonlighting policy** — the team philosophy memo says "no dev-to-dev reporting." What's the policy on a dev moonlighting on another project (not Phonebot) during work hours? Never raised, never answered.

6. **QA Auditor's deeper audits — where do they feed into Compass?** Do Mustafa's parity findings affect Faizan's Craft score? Never decided.

7. **Legacy Maintenance project — how does a dev's time on it get counted against their own project's velocity?** Fahad said it "consumes ~15h/wk." Counted as off-project, not against their project? Needs explicit rule.

8. **PM assessment disagreement threshold** — `disagreement_flagged: this.newPmAssessment.length > 50` (line 1683) is a proxy (length of text). Fahad never defined what "disagreement flag" means operationally.

9. **Dispute SLA** — "PM + CEO review disputes at the end of the week" is in the modal (line 1235). Not enforced; no timer; no escalation if unreviewed.

10. **Off-project approval** — Who approves off-project hours? Currently the dev self-reports. Fahad might want CEO sign-off for anything > N hours.

---

## Top 5 NOT IMPLEMENTED (ranked by Fahad-urgency)

1. **Custom prompt upload flow (A)** — approved twice, never built.
2. **Automated email-to-CEO on bug (B)** — approved as shortcut, never wired.
3. **Dispute resolution UI (Partial #1)** — half-built, can't be used in anger.
4. **Regression detection backing logic (Partial #2)** — UI is demo data.
5. **"Stick" / private-conversation flow for Tier-D (C)** — rewards one-sided without it.

---

## Methodology notes / caveats

- Transcript had ~40% skill-doc echo (superpowers:brainstorming, writing-plans, verification-before-completion, settings-audit). Filtered those out using length + prefix heuristics.
- Assistant messages were scanned separately to identify what was proposed — so the "NOT IMPLEMENTED" list captures items Fahad approved that were assistant-originated as well as Fahad-originated.
- Dashboard was inspected line-by-line from `devdash.html`. Worker/backend (`dev dashboard/worker/`) and scripts (`dev dashboard/scripts/`) were not deeply inspected — some "NOT IMPLEMENTED" items may have partial backing there. Flag worth: verify by `grep -r` if you want to close that uncertainty.
