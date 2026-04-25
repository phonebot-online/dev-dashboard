# devdash — User Guides
**Dashboard URL:** devdash.phonebot.co.uk
**Last updated:** 2026-04-24 (evening)

This document covers everything you need to use devdash — from first login to daily workflows for every role. It is the single reference for all 8 users. If you are new, start at Section 0.

---

## Contents

- [Section 0 — First-time setup (all users)](#section-0--first-time-setup-all-users)
- [Section 1 — CEO guide (Fahad)](#section-1--ceo-guide-fahad)
- [Section 2 — PM guide (Imran)](#section-2--pm-guide-imran)
- [Section 3 — Dev guide (Faizan, Moazzam, Faisal, Usama)](#section-3--dev-guide-faizan-moazzam-faisal-usama)
- [Section 4 — QA guide (junior QA)](#section-4--qa-guide-junior-qa)
- [Section 5 — QA Auditor guide (Mustafa)](#section-5--qa-auditor-guide-mustafa)
- [Section 6 — Settings reference (CEO + PM only)](#section-6--settings-reference-ceo--pm-only)
- [Section 7 — Onboarding (new user joining the team)](#section-7--onboarding-new-user-joining-the-team)
- [Section 8 — Common questions (FAQ)](#section-8--common-questions-faq)

---

## Section 0 — First-time setup (all users)

This is a one-time process. After this, you log in with just a 6-digit code each time.

### Step-by-step

1. **Open the dashboard URL** — Go to devdash.phonebot.co.uk in any browser (Chrome or Safari recommended).

2. **Pick your name** — You will see a list of all team members. Tap or click your name.

3. **Scan the QR code** — Open Google Authenticator on your phone. Tap the + button (or the scan icon) and point the camera at the QR code on screen.

4. **Enter the 6-digit code** — Google Authenticator will show a 6-digit number that rotates every 30 seconds. Type it into the code field on the dashboard and press Confirm.

5. **You are in.** Your role view loads automatically. Bookmark the URL.

Your session stays active for 24 hours. After that it logs out automatically. On your next login, open devdash.phonebot.co.uk, pick your name, and enter the 6-digit code from Google Authenticator — no QR scan needed again.

---

### The three buttons in the top-right (everyone has these)

- **≡ / ☰ density button** — Switches between comfortable and compact layout. Compact shrinks padding and font sizes so you see more on one screen. Useful on small laptops or when you want a dense overview.
- **◐ / ☀ / ✧ theme button** — Rotates through dark, light, and cream themes. Your choice is remembered in this browser.
- **Sign out** — Ends the session immediately.

### What to do if the QR code does not scan

- Make sure the camera is in focus and the screen brightness is turned up.
- Try on a different device (a phone with a better camera is fine for the initial scan, even if you plan to use a tablet day-to-day).
- In Google Authenticator, instead of scanning, tap "Enter a setup key" — contact Fahad or Imran for your manual key string.
- If nothing works, contact Fahad directly. He can re-show your QR from Settings → Users → QR button on your row.

### What to do if Google Authenticator is on a different phone

If you have switched phones since your initial setup and did not transfer Google Authenticator:

1. Your old codes no longer work.
2. Contact Fahad or Imran.
3. Fahad goes to Settings → Users, clicks the **QR** button next to your row, and sends you the fresh QR code.
4. You scan it on the new phone and go through the one-time setup again.

This is a manual process — there is no self-service reset in Phase 1.

---

## Section 1 — CEO guide (Fahad)

### What you see

When you log in, your view is organised into four areas:

**Portfolio health banner (top strip)**
- When "All Projects" is selected: shows on-track / at-risk / behind counts, worst-case launch forecast, and decision debt count.
- When a specific project is selected: switches to per-project health — status dot, completion %, forecast date, days remaining.

**Out today / this week callout (conditional)**
- Only appears when one or more teammates has an active absence.
- Shows name, absence type, and return date as a row of badges.
- Disappears automatically when everyone is back.

**Portfolio grid (collapsible ▾/▸)**
- One card per project: traffic light status, completion %, launch-readiness %, deadline forecast.
- Click a project card to open the detail modal (full scope, phases, readiness checklist, risks, links). More on this below.
- A "Filter dashboard" link on each card narrows every panel to that single project.

**Team snapshot (dev cards)**
- Top performer this week with a one-line summary.
- If someone hit all 4 compass directions above threshold: a True North badge replaces the one-liner.
- Each dev card is clickable anywhere — opens their full dev view.
- Absence badges appear on the card if the dev is away.

**Stats row**
- Open HIGH bugs, open audit findings, pending feature requests, stuck PRs.

---

### The project detail modal (new — for every project)

Clicking any project card opens a modal. On the left you see:
- Build progress %, launch-readiness %, owner, contributors.
- **Scope** — two columns (IN scope, OUT of scope).
- **Phases** — list with per-phase progress bars.
- **Launch-readiness checklist** — tickable. Ticks save automatically. The % updates live.
- **Risks** — numbered list.
- **Links** — spec docs, audit reports, wireframes, repos.

Hit the **✎ Edit** toggle at the top-right of the modal to edit every field inline: scope textareas, phase add/remove, checklist add/remove, risk add/remove, link add/remove. Changes save as you type. Hit it again (**✓ Done editing**) to lock the fields.

The modal footer has **Filter dashboard to this project** — closes the modal and narrows every panel to that project.

---

### Your weekly ritual (5–10 minutes, Monday morning)

1. **Read the banner.** Portfolio health or per-project health depending on what you have selected.
2. **Out-today callout.** If anyone is flagged absent, plan around it before making new asks.
3. **Scan the portfolio grid.** Click any yellow or red card — it opens the full detail modal with scope, phases, and readiness.
4. **Top performer dev card.** Read the summary. True North badge is rare — a private thank-you message is warranted.
5. **Decision debt.** Anything waiting on you more than 4 days — act or delegate to Imran. Over 5 days turns amber, over 10 turns red.
6. **Feature request button.** Floating button, bottom-right. Title, description, urgency, target project. Lands in the assigned dev's queue.

---

### What you upload and configure

- **Feature requests** — Floating button.
- **Private notes per dev** — Settings → Users → three-dot menu → Note. Visible only to you.
- **Currency** — Settings → Rewards → Currency dropdown (PKR default; AUD/USD/GBP/EUR/INR/AED available). All reward amounts display in the current currency.
- **Score overrides** — Dev panel → Override button. Requires a reason. Logged in audit log.

---

### Rewards — full lifecycle

Rewards run on a **monthly cycle**. Every week the audit adds **reward events** to each dev's ledger (pending). On the **1st of the next month**, you run the payout — one payment per dev, one line in the books.

**The moving parts:**
- **Reward events.** Generated weekly by the audit: direction unlocks, True North, growth bonus, team pool splits, owner-ships-on-deadline. Each sits in `pending` status until paid.
- **"Compose this week's rewards" button.** Settings → Rewards. Runs the reward rules against this week's data and inserts the events. Safe to re-run — it dedupes on (dev, week, type, direction).
- **Payout-due banner.** On the 1st of the month, a banner fires at the top of your view saying "Today is the 1st. Run this month's payout." with the total pending amount. One click opens the payout modal.
- **Payout modal with dual-approval.** Lists every pending event (dev, type, direction, amount, week). Two checkboxes at the bottom: **✓ CEO approves** and **✓ PM approves**. Both must be ticked before **💰 Confirm payout** un-locks. Add a payment ref (bank transfer ID, Wise ref, cash handover code) and an optional note. Click confirm — all selected events flip to `paid`, a payout batch is created, the audit log records it.
- **Payout history.** Every dev sees their own: **this week / this month / last month / lifetime**, with an expandable list of every event (date, type, direction, amount, paid/pending status). Silent receipt — no push notification when an event is added, but the history is always visible.

**Policy — all 11 decisions live in Settings → Rewards:**

| Policy | Default | Notes |
|--------|---------|-------|
| Payout cadence | Monthly | Day of month (1–28) configurable |
| Payout day | 1 | Banner + (future) push fire on that day |
| Dual approval | Yes (CEO + PM) | Set to "No" to let CEO ship alone |
| Absence rule | Pro-rated | Full / pro-rated / forfeit. Pro-rated = amount × days worked / 5 |
| New-hire probation | 0 weeks | Set to e.g. 4 to block rewards for first month |
| Termination rule | Forfeit | Forfeit / pay / ceo_decides. Applies when a user is removed |
| Team pool split | Owner decides | Equal / weighted by merit / True North only / owner decides |
| Unlock thresholds | 25/50/75/100% | Team pool milestone marks |
| Growth bonus rule | Flexible (10+ pts month-on-month) | Any direction |
| Owner ship rule | Strict (on deadline or nothing) | Project owner gets a bonus iff project ships on/before deadline |
| Clawback | None | Paid events are never reversed |
| Streak bonus | None | Handoff streaks show on the dev card but don't generate rewards |

**Danger-zone — Reset reward history.** Settings → Rewards → red **Reset reward history** button at the bottom. Deletes every `rewardEvent` and every `payoutBatch`. Requires two confirms. Settings (amounts, policy) survive. Use only if a bad compose run made the ledger unusable.

**Example scenarios:**
- *"Faizan was sick 3 days this week."* His direction bonus this week is pro-rated: `amount × 2/5`. Compose picks that up automatically from the absence log.
- *"New dev Usama hit a direction bonus in week 1."* Probation blocks it — event isn't generated. Set probation to 0 if you disagree with the default.
- *"Moazzam quit mid-month with 2 pending events."* Removing him in Settings → Users triggers the confirm dialog — pending rewards are voided per `termination_rule: forfeit`. If you'd rather pay out, change the rule to `pay` before removing the user.
- *"Team pool hit 75% on Portal Migration."* A team pool event lands on each contributor per `team_pool_split`. Owner-decides means you pick the ratio (UI: ledger entries you edit pre-payout).

---

### What you do NOT do

- **Edit scoring weights mid-sprint** unless it is a deliberate quarterly recalibration.
- **Delete user records without reading the confirm dialog.** See Safe user removal below.
- **Manually close bugs or mark disputes resolved.** That is Imran's job.

---

### Safe user removal

Settings → Users → **×** on a user row fires a confirm dialog that spells out exactly what cascades before anything happens. It looks like:

```
Remove <name> (<email>)?

This will:
  • Clear owner_email from any project they own (will show "unowned")
  • Remove them from project contributor lists
  • Reassign their open bugs to each project's owner (or "unassigned")
  • Reassign their open feature requests to each project's owner
  • Mark disputes with resolved_by = "user removed"
  • Forfeit any pending reward events (per termination_rule)

Continue?
```

Every one of those is reconciled automatically — no orphan bugs, no dangling disputes, no ghost assignments. The audit log records the full summary. **If you want to keep someone's pending rewards, change `termination_rule` in Settings → Rewards to `pay` before removing them.**

---

### Safe project removal

Settings → Projects → **Remove project** archives rather than deletes. The bugs, audit findings, and feature requests tagged to that project get renamed to `(archived: <Project>)` so they stay queryable but no longer clutter active views. The audit log records a count: `Removed project <name> — archived N bugs + M audits + K feature requests`. If you need the project back, re-add it in Settings and manually re-tag the archived items.

---

### Example scenarios

**"Faizan's Reliability dropped 15 points"** — Open his dev card. Check off-project hours. If he logged a lot, the drop is expected. If he logged nothing, check handoff multiplier. Ask Imran to check in.

**"Product Page Revamp went yellow"** — Click the project card. Detail modal shows which readiness items are unticked, phase progress, and risks. If the dev on it is Faisal, a WhatsApp ping is usually enough.

**"A HIGH bug I had not seen in the daily digest"** — Forward to Imran with a note. He routes to the right dev.

---

## Section 2 — PM guide (Imran)

### What you see

**Monday summary banner**
- Punchy, tactical briefing rewritten every Monday. Emoji-tagged bullets route on worst traffic light, HIGH bugs, stuck PRs, at-risk devs, decision debt, disagreements, regressions, standout, off-project, and a rotating italic closing line. Not a dry stats dump — it tells you what to do first.

**Projects grid (collapsible ▾/▸) — same cards and modal as CEO view**
- Per-project cards with traffic light, completion %, readiness %, dot colour.
- Click any card to open the full project detail modal (scope, phases, readiness checklist, risks, links). Same ✎ Edit toggle as the CEO view.
- Each card has a **Filter** button for one-click narrowing of every panel to that project.

**Per-dev cards (main column)**
- Mini compass shape, merit tier, weekly hours.
- Absence badge if the dev is flagged out.
- Click anywhere on a card to open the dev's full view.
- Sorted strongest-first.

**QA bug queue (right column) — READ-ONLY on severity + status**
- Top 6 open bugs. Severity badge, dev attribution, days open. "View all" for the full list.
- **Severity is QA's call. Status is the dev's call. Assignee is your call.** You can only reassign — the severity badge and status chip are both locked with a tooltip ("Severity owned by QA — edit on QA view" / "Status owned by assigned dev"). If you think a severity is wrong, message the QA. If a status is wrong, message the dev.
- If a bug shows a blue **⚖ In dispute** chip, a dev has disputed their attribution — see the dispute flow below.

**Four signal cards**
- Decision debt (waiting on Fahad — you escalate).
- Stuck PRs (open more than 2 days).
- Regression watch (possible regressions flagged by keyword match).
- QA audit findings (open items from Mustafa's audits).

**Two management cards (bottom)**
- Open disputes.
- Your recent assessments (last 3 you uploaded).

---

### Your weekly ritual (20–30 minutes, Monday morning)

1. **Read the Monday briefing banner.** Act on the bullet that is flagged hottest first.
2. **Projects grid.** Click any amber or red card — modal shows scope, readiness, and risks. Edit the checklist live if something needs adding.
3. **Per-dev cards.** Any red direction gets a WhatsApp. Check absence badges before chasing anyone.
4. **QA bug queue.** Reassign wrong attributions. Chase HIGH bugs open more than 3 days.
5. **Decision debt.** Escalate anything stuck on Fahad more than 4 days.
6. **Stuck PRs.** Find who the dev is waiting on and nudge them.
7. **Disputes.** Read each, resolve or escalate. Do not let them sit a week. See the dispute flow below.

---

### Dispute flow — how it actually works now

When a dev clicks **Dispute** on a bug or audit:
1. A `dispute` record is created.
2. The underlying bug/audit is marked `disputed: true` with a link back to the dispute id.
3. The dev's bug/audit card shows a blue **⚖ In dispute** chip so everyone knows it's in limbo.
4. The dispute lands in your **Open disputes** panel (bottom-left of your view) with ✓ Accept / ✕ Reject / Reassign dropdown.

**Your three actions:**

| Action | What happens |
|--------|--------------|
| **✓ Accept** | Dispute is marked accepted. The bug is re-routed to the **project owner** (not just cleared — it lands on someone's desk). `disputed: false`, chip disappears. |
| **✕ Reject** | Attribution stands. Dispute is marked rejected. `disputed: false`, chip disappears. The dev keeps the bug. |
| **Reassign** | Dropdown of all active devs. Pick one — the bug moves to them. Dispute marked resolved. `disputed: false`, chip disappears. |

The audit log records every resolution. Rejecting doesn't punish the dev — the system tracks dispute patterns, not individual rejections.

---

### What you upload and configure

- **Independent assessment** — Upload Assessment button in your view. First 300 words become the summary. Visible to you and Fahad only.
- **Bug reassignment** — Inline dropdown on any bug in your queue → pick a dev. Auto-logs the reason.
- **Feature requests** — Floating button.
- **Settings** — Same editing rights as Fahad. Do not change reward amounts or currency without checking first.

---

## Section 3 — Dev guide (Faizan, Moazzam, Faisal, Usama)

### What you see

Your view is personal. Other devs cannot see your numbers. You cannot see theirs — only compass shapes (radar outline, no values).

**Absence banner (top of your view)**
- When you are present: a calm strip saying so, plus quick buttons: **🤒 Sick today**, **🏖️ Vacation** (prompts for return date), **⏸ Other** (prompts for return date + optional note).
- When you are absent: a purple banner showing your absence type, return date, and an **I'm back** button to clear it.
- Your absence is visible to PM and CEO immediately — no need to message anyone.

**Your compass (centre)**
- Four directions: Velocity, Craft, Reliability, Drive.
- Radar chart with your current scores.
- Handoff multiplier numerically below (e.g. "0.93").
- Direction chips for each direction at or above threshold.
- Overall merit score + tier.
- A badge beside your name says **On: <project>** when a single project is selected, or **All projects** when not — so you always know what the numbers are scoped to.

**Your week**
- Commits this week with audit status (clean / flagged / disputed).
- Queue for next week.
- Bugs attributed to your code.
- Pending feature requests targeting you.

**Rewards panel (right)**
- Per-direction unlock progress.
- Team pool milestone progress.
- Your rewards ledger with amounts in the team currency (PKR default — e.g. "35k PKR", "1.8L PKR").

**Clock-in (top nav)**
- "Day started" / "Day not started". Start Day, End Day buttons.

---

### Your daily ritual (1–2 minutes)

1. Log in with your 6-digit code.
2. If you are off sick or on leave, hit the absence button at the top of your view before anything else.
3. Click **Start Day**.
4. Do your work. You do not need to stay on the dashboard.
5. Click **End Day** when done. If you forget, the day closes at midnight — manual entry via Off-Project fixes any mismatch.
6. Before closing the laptop: append a handoff entry to the project's `daily-handoff.md` file.

---

### Your weekly ritual (5 minutes, Monday morning)

1. Glance at your compass. Which direction moved?
2. Read any new feature requests.
3. Check bugs attributed to you. Fix what is yours, dispute what is not.
4. Check reward unlock progress.

---

### What you submit

- **Off-project work** — Off-Project button in your view. Fields: category, minutes, optional note. Logging this scales your Reliability target down proportionally — not logging it costs you unnecessary points.
- **Disputes** — Dispute button on any bug or audit finding. Short, clear explanation. PM reviews.
- **Handoff notes** — Written directly into the project's `daily-handoff.md` file. Format:

```
## YYYY-MM-DD HH:MM — your-name
CLOSED: what you finished today
IN PROGRESS: what is still open
OPEN: blockers, questions, anything that needs attention
```

---

### Growth Track (card on your dev view)

Your dev view has a Growth Track card — three panels to help you compound skill over weeks, separate from raw weekly scores.

**Panel 1 — 🎯 Growth focus this week**
- Picks your **weakest direction** this week (lowest of Velocity / Craft / Reliability / Drive).
- Suggests a **micro-challenge** scoped to that direction (e.g. "Ship one complexity-5+ ticket this week" for Velocity, "Write a test for the next bug fix" for Craft).
- Lists **3 learning resources** — articles, patterns, or repo docs targeting that direction.
- A **Mark done** button logs the challenge in your growth log — contributes to "challenges done" counter in Panel 2.

**Panel 2 — 🔥 Streaks & milestones**
- **Handoff streak.** How many consecutive weeks you wrote handoffs every working day. Rolls to zero on any missed day.
- **Challenges done.** Lifetime count from Panel 1.
- **Personal best.** Your highest overall merit score ever, with the week it happened.
- **True North countdown.** How close you are *this week* to hitting 75+ on all four directions — shows "2 of 4" with which directions need to come up. Disappears when you hit True North.

**Panel 3 — Write-up clarity**
- Analyses your most recent handoff notes. Flags vague phrases ("worked on stuff", "the thing"), missing sections (no CLOSED / IN PROGRESS / OPEN), and too-short entries (under 40 words).
- **✎ Polish a note** button opens a modal. Paste your draft, click **✎ Polish** — the lint runs and shows:
  - A list of issues found (with the specific words/phrases).
  - A **suggested rewrite** in the proper CLOSED/IN PROGRESS/OPEN format.
  - You can copy the rewrite, or clear and try again.
- This is not scored. It's a writing aid — the handoff multiplier still runs off whether you wrote the handoff, not how well.

---

### Rewards — full lifecycle

Rewards are **monthly**, not weekly. Your compass updates every week, but money moves once a month.

**How you earn events (added to your ledger automatically):**

| Event type | How to earn it | When |
|------------|----------------|------|
| Direction bonus | Score 75+ on any single compass direction | Weekly |
| True North bonus | Score 75+ on all four directions in the same week | Weekly (rare) |
| Growth bonus | Improve any direction by 10+ points month-on-month | Monthly |
| Team pool split | Your project hits 25/50/75/100% completion | On milestone |
| Owner ship bonus | Project you own ships on/before deadline | On launch |

**Pro-rated absence.** If you're sick or on leave for some of the week, your direction bonus is scaled: `amount × days worked / 5`. You don't lose it — you get the proportional share.

**New-hire probation.** For your first N weeks (default 0, CEO sets), no reward events are generated. Your compass still tracks — rewards just start after probation ends.

**Your rewards history panel** (right column of dev view) shows:
- **This week** — events earned this week (pending).
- **This month** — total this calendar month.
- **Last month** — what you were paid (or forfeited).
- **Lifetime** — running total since you joined.
- **Next payout** date — "the 1st of next month" (or whatever day is configured).
- Expandable list: every event with date, type, direction, amount, paid/pending status.

**When you get paid.** On the 1st of the month, Fahad and Imran both tick approve in the payout modal. One consolidated payment per dev, via bank transfer / Wise / cash — method + reference logged in the batch. Your ledger entries flip from pending → paid. No push notification (silent receipt) — check your history panel.

**If you leave the team.** Pending reward events are voided by default (`termination_rule: forfeit`). If the CEO wants to pay them out, they change the rule before removing you. There's no clawback — already-paid events are never reversed.

---

### How NOT to game the system

- **Do not cherry-pick easy tickets.** Velocity is complexity-weighted.
- **Do not hide off-project work.** Logging it scales your target down — hiding it costs you.
- **Do not skip handoffs.** The multiplier (0.85–1.0) hits all four directions.
- **Do not dispute everything.** Imran sees the pattern.

---

## Section 4 — QA guide (junior QA)

### What you see

**Bug submission form (top, always visible)**
- Title
- Severity (HIGH / FUNCTIONAL / VISUAL)
- Project (dropdown — only projects you are assigned to)
- Description
- **Device** — desktop / tablet / mobile
- **Browser** — Chrome / Safari / Firefox / Edge / iOS Safari / Android Chrome
- **Page URL** — where the bug happened
- **Reproducible** — always / sometimes / once
- **Steps to reproduce**
- **Expected vs actual**

**Your bug queue (below)**
- All bugs you have submitted. Status per bug. Dev attribution.

If a project is missing from your dropdown, Fahad needs to assign you to it in Settings.

---

### Your daily ritual

1. Test on staging.
2. Fill in one bug at a time — don't batch.
3. Check your queue for resolved bugs, verify on staging.
4. If a fix does not work, message Imran. Don't contact the dev directly.

---

### How to write a good bug report

**Title** — One line, specific.
- Good: "Checkout double-click creates duplicate order"
- Bad: "Checkout broken"

**Severity** — Be honest.
- HIGH: blocks a core action or launch.
- FUNCTIONAL: works wrong, has a workaround.
- VISUAL: looks wrong, works fine.

**Steps** — Numbered. Include the exact data you used.

**Device / Browser / URL** — Fill every field. These are the first things a dev checks.

**Reproducible** — "always" if you can make it happen every time, "sometimes" for intermittent, "once" if you can't get it back.

**Expected vs actual** — Two sentences.

---

### What you do NOT do

- Contact the developer directly. Route through Imran.
- Mark your own bugs resolved. That's the dev's call.
- Submit the same bug twice.

---

## Section 5 — QA Auditor guide (Mustafa)

### What you see

Your view is built around audit findings, not daily bugs.

**New audit finding form**
- **Title**
- **Project** (all 5 visible)
- **Category** — 10 options: Performance, Responsive / mobile, Code quality, Security (OWASP), Accessibility (WCAG), SEO, Regression, Parity (1.0 vs 2.0), Cross-browser, Other.
- **Severity** — blocker / high / medium / low.
- **Category-specific metric fields** appear dynamically based on category:
  - *Performance:* URL, metric (LCP / TTFB / CLS / TBT / bundle size), actual value, target.
  - *Responsive:* device, viewport, browser.
  - *Code quality:* file path, issue type (Complexity / Duplication / Lint / Dead code), lines.
  - *Security:* OWASP category (A01–A10), risk level.
- **Findings body** — free text. Use the structured FINDING / IMPACT / RECOMMENDED FIX format shown in the placeholder.
- **Routing:**
  - **TO** — dropdown of the assigned dev (one person).
  - **CC** — checkbox multi-select across PM, CEO, other devs, QAs.

**Past audit findings (collapsible)**
- Each card shows category badge, severity badge, TO / CC headers, the finding body.
- **Filters at the top of the list:** category dropdown + status dropdown.
- **Inline status dropdown** on each finding — open / in_progress / closed. Changing it saves immediately.

**Context panels**
- Dev commits for the week.
- Junior QA's bugs for the week.

---

### Your weekly / biweekly ritual

1. Pick the project you are auditing.
2. Read the knowledge card, recent commits, and junior QA's queue.
3. Run the audit (parity, use-case review, feature matrix).
4. Submit each finding separately. Pick the right category — filters and reporting depend on it.
5. Route each with TO + CC so the right people know.
6. As devs close items, flip the status dropdown to `in_progress` then `closed`.

---

### What makes a good audit finding

- **Be specific, not generic.** Name the commit / file / URL.
- **Be comparative on parity.** Fahad uses parity with 1.0 as the launch go/no-go.
- **End with a concrete action.** Who, what, by when.
- **Pick the right category.** Filters rely on it. If it's a performance bug, file under Performance, not Other.

Structure for the body:

```
## FINDING 1 — [short title]
**Impact:** [what breaks]
**Evidence:** [commit SHA / file path / bug ID / URL]
**Action:** [what needs to happen, who]
```

---

## Section 6 — Settings reference (CEO + PM only)

Six tabs: Projects, Users, Scoring, Rewards, System, Audit log. Changes save as you type — there is no Save button. Scoring changes take effect at the next weekly audit run. Project and user changes take effect immediately.

---

### Projects tab

| Setting | What it controls | Notes |
|---------|-----------------|-------|
| Project name | Display name everywhere | Changing mid-project updates all views immediately |
| Owner email | Default assignee for unrouted items | Must be an active user |
| Kickoff + deadline | Timeline calculations + traffic light forecast | — |
| Status | active / paused / archived | Paused stops scoring. Archived hides from all views. |
| Repos | Repo paths for commit scanning | One per line |
| **Contributor emails** | Which devs count for this project | **Checkbox multi-select** of active devs (not comma-separated input — that caused silent typo failures before April 24). |
| Scope IN / OUT | Used on project detail modal | Editable in Settings or live in the modal via ✎ Edit |
| Phases | Named phases with percent-complete | Edit in Settings or live in the modal |
| Readiness checklist | Tickable launch-readiness items | Drives the readiness % on cards |
| Risks | Short risk statements | — |
| Links | Label + URL pairs | Spec docs, audit reports, wireframes |

---

### Users tab

| Setting | Notes |
|---------|-------|
| Display name | Shown everywhere |
| Email | Login identity. Cannot be changed after TOTP provisioning without a re-provision. |
| Role | ceo / pm / dev / qa / qa_auditor. Changing role changes the view on next login. |
| Hours per week | Used in Reliability scoring |
| **Absence** | Dropdown: none / sick / vacation / public_holiday / bereavement / personal. When set, a date field appears for expected return. Shows as a badge on the user's dev card and in the CEO "Out today" callout. |
| Status | active / on_leave / archived |
| **QR button** | Re-shows the TOTP QR code for this user. Use if they've changed phones. |

**Adding a new user:** fill in name, email, role, hours. When you click Add, a QR card pops at the top of the page with a copy-link button and a dismiss. Send the link to the new user via DM or email.

---

### Scoring tab

| Setting | Default | Notes |
|---------|---------|-------|
| Direction labels | Velocity / Craft / Reliability / Drive | Don't change mid-cycle |
| Direction thresholds | 75 each | Range 65–80 sensible |
| Handoff multiplier | 0.85–1.0 | Don't go below 0.75 or it swamps the signal |
| Green max / Yellow max | 3 / 7 days slip | — |
| Score visibility to self | live | live / weekly / shape_only / opaque |
| Score visibility to peers | shapes_only | shapes / shapes_only / none |

---

### Rewards tab

| Setting | Default | Notes |
|---------|---------|-------|
| **Currency** | PKR | Dropdown: PKR / AUD / USD / GBP / EUR / INR / AED. Changing the currency does NOT convert existing amounts — set the currency first, then set the amounts. |
| Per-direction amount | PKR amount | Shown as ledger entry. Payout happens offline. |
| True North amount | Larger PKR amount | Rare by design. |
| Growth bonus amount | Smaller PKR amount | Paid when a direction jumps 10+ pts month-on-month |
| Team pool size | Larger PKR amount | Split at milestones |
| Unlock thresholds | 25/50/75/100% | — |
| Visibility mode | direction_public | direction_public / all_public / all_private |

PKR amounts display with lakhs-style shortcuts — e.g. 35,000 → "35k PKR", 180,000 → "1.8L PKR".

---

### System tab

| Setting | Default | Notes |
|---------|---------|-------|
| Daily pull | on | Off saves AWS cost, delays commit data |
| Weekly audit day | Monday | Runs midnight Sunday night |
| Timezone | Sydney (AEST/AEDT) | — |
| Context window — active days | 14 | — |
| Context window — compressed | 15–90 | S3 Standard-IA |
| Context window — cold | 90+ | Glacier Deep Archive |
| Snapshot retention | 365 days | — |
| Severity labels | HIGH / FUNCTIONAL / VISUAL | — |
| Urgency labels | P0 / P1 / P2 / P3 | — |
| AWS region | ap-southeast-2 | Don't change post-launch |
| Digest recipients | Fahad, Imran | Comma-separated |
| Digest time | 08:00 local | — |

**Danger zone (bottom of System tab):** a red **Reset all settings to defaults** button. Resets projects, users, scoring, rewards, and system config to built-in defaults. Handoff notes, bugs, and audits are kept. Use this if stale browser data is masking new defaults after an update.

### Auto-migration

When the dashboard loads, any saved data from an older version is automatically topped up with missing fields (contributor_emails, scope_in, scope_out, phases, readiness, risks, links, absence, currency) without overwriting what you already edited. You should rarely need the Reset button.

---

## Section 7 — Onboarding (new user joining the team)

### Fahad's checklist

1. Settings → Users → Add User → enter name, email, role, hours.
2. Auto-QR card pops up at the top of the page.
3. Copy the QR link (or screenshot the QR) and send to the new user via DM.
4. Settings → Projects → tick the new user in the **contributor checkbox grid** for every project they work on.
5. Dismiss the auto-QR card.
6. If they need the QR again later, hit the **QR** button next to their row.

### New user's steps

1. Open devdash.phonebot.co.uk.
2. Pick their name.
3. Scan the QR with Google Authenticator.
4. Enter the 6-digit code.

### Manager walkthrough

- 10 minutes covers it.
- Show: role tabs, project sub-tabs, density toggle, theme toggle, the absence banner (for devs), the clock-in buttons (for devs).
- Show: the `daily-handoff.md` convention in the project folder.

---

### Timeline expectations for new devs

Merit scoring needs history. Don't evaluate a new dev's compass in their first month.

| Period | What to expect |
|--------|---------------|
| Week 1–2 | "Insufficient data" |
| Week 3–4 | Partial score |
| Month 2+ | Full compass |

---

### Onboarding checklist for Fahad

- [ ] Added in Settings with correct role and hours
- [ ] Ticked as contributor on relevant projects
- [ ] Auto-QR card appeared → link shared (private DM, not group)
- [ ] New user confirmed login from own device
- [ ] Role view looks correct
- [ ] 10-min walkthrough done
- [ ] For devs: `daily-handoff.md` convention explained
- [ ] Added to WhatsApp / Slack

---

## Section 8 — Common questions (FAQ)

**Q: My compass dropped this week. What does that mean?**

Look at which direction dropped:
- Velocity: you shipped less complexity-weighted work.
- Craft: more audit flags or lower review signal.
- Reliability: missed target hours or handoff multiplier fell.
- Drive: fewer self-initiated items.

---

**Q: I disagree with an audit finding or bug attribution. What do I do?**

Click Dispute on the item. Short, clear explanation. Imran reviews. Don't message the QA team directly.

---

**Q: Can I see other devs' compass scores?**

Default: no numbers, shape only (radar outline). Configurable in Settings → Scoring → Score visibility to peers.

---

**Q: What if I forget to clock in?**

The system estimates hours from your first and last commit. For a big mismatch, log a correction via Off-Project with category "Manual time correction".

---

**Q: What happens if my phone dies and I lose Google Authenticator?**

Contact Fahad. He goes to Settings → Users → clicks the **QR** button next to your row. You scan the fresh QR on your new phone.

---

**Q: How do I mark myself absent?**

If you're a dev: the absence banner at the top of your dev view. Three buttons — 🤒 Sick today (no prompt), 🏖️ Vacation (asks for return date), ⏸ Other (asks for return date + optional note). When you're back, the banner turns purple and shows an **I'm back** button. PM and CEO can also set it manually via Settings → Users → Absence column.

---

**Q: Where do I set project scope and readiness?**

Two ways.
- **Live edit:** click any project card in CEO or PM view → modal opens → hit **✎ Edit** top-right → edit scope IN / OUT, add phases, tick readiness items, add risks, add links. Changes save as you type. Hit **✓ Done editing** to lock.
- **Settings:** Settings → Projects tab has the same fields for bulk editing.

The tickable readiness checklist drives the readiness % that appears on every project card.

---

**Q: How do I change currency?**

Settings → Rewards → Currency dropdown. PKR (default), AUD, USD, GBP, EUR, INR, AED. Changing it does NOT convert existing amounts — set currency first, then set amounts. All reward strings in the dev view, rewards panel, and ledger update immediately.

---

**Q: What does the density button do?**

The **≡ / ☰** button in the top-right switches between comfortable and compact layouts. Compact shrinks card padding and font sizes so you see more on one screen. Useful on small laptops or for at-a-glance reviews. Applies across every view and tab. Your choice is remembered per browser.

---

**Q: Why did my compass numbers change when I switched projects?**

The compass is project-scoped. When you filter to a single project, the numbers shift to reflect just that project's work — commits are filtered by project prefix, items-closed count scales, and the summary line updates. A badge next to your name says **On: <Project>**; when you're back on "All Projects", the badge reads **All projects**. The scoping is deterministic per (dev, project) so the same filter always shows the same numbers. If your number jumps unexpectedly, check the project sub-tab row at the top — one is probably selected.

---

**Q: How do I log work that was not in my queue?**

Off-Project button. Category, duration, optional note. Log it the day you did it. Your Reliability target scales down proportionally — skip this and Reliability takes an unfair hit.

---

**Q: How often should I write handoff notes?**

End of every working day. Three lines is fine. CLOSED / IN PROGRESS / OPEN. Missing handoffs drop your multiplier, which drops all four directions. Five missing days = 0.85 multiplier = 15% off the top across the board.

---

**Q: What is True North?**

75+ on all four compass directions in the same week. Hard — all four need to be strong at once. When someone hits it, the CEO banner replaces the usual top-performer line with "True North — [name]" for that week, and it triggers the biggest reward in the system.

---

**Q: The regression watch flagged a bug as a "possible regression." What does that mean?**

Keyword match against previously closed items. A prompt to investigate, not a confirmed regression. Click the flag to see what matched. Coincidental = ignore. Real = escalate.

---

**Q: I submitted a feature request. What happens next?**

Routes to the dev assigned to the target project. Appears in their queue on next load. No automatic acknowledgement in Phase 1 — follow up with Imran or the dev if you need a timeline.

---

**Q: The dashboard says "Insufficient data" on my compass.**

Not an error. First ~2 weeks of a new dev or a new scoring cycle. Keep clocking in, committing, and writing handoffs. Full compass from week 5.

---

**Q: Can Fahad see my raw compass numbers?**

Yes. Imran sees shapes and tiers. Other devs see shapes only. Configurable in Settings → Scoring → Score visibility.

---

**Q: The auto-QR card in Settings — can I dismiss it?**

Yes. It has a **Dismiss** button. If you need the QR again later, click the **QR** button on the user's row in Settings → Users — it will reappear.

---

**Q: Something looks wrong after a dashboard update — stale data showing?**

Settings → System → Danger zone → Reset all settings to defaults. This resets projects, users, scoring, rewards, and system config to built-in defaults. Handoff notes, bugs, and audit findings are kept. In most cases the auto-migration on load handles this silently and you won't need to.

---

**Q: What if there is a critical bug on a Saturday?**

Daily digest is weekdays only. Bug filed Saturday shows in Monday's digest. For genuinely urgent weekend issues: WhatsApp Fahad or Imran. No real-time notifications in Phase 1.

---

**Q: How do rewards get paid?**

Monthly, on the 1st. Every week the audit adds reward events to your ledger (pending). On the 1st of the next month, Fahad and Imran both tick approve in the payout modal, pick a payment method (bank transfer / Wise / cash), add a reference, and confirm. All your pending events flip to paid — one consolidated payout per dev. You see it in your rewards history panel. No push notification — silent receipt.

---

**Q: Why can't I edit a bug's severity on the PM view?**

Ownership is split now: **severity is QA's call, status is the dev's call, assignee is the PM's call.** On the PM view, the severity badge and status chip are locked (with a tooltip that says who owns them). You can only reassign the dev. If you think a severity is wrong, message the QA; if a status is wrong, message the dev.

---

**Q: What happens to my pending rewards if I leave?**

Default: forfeited (`termination_rule: forfeit` in Settings → Rewards). Fahad can override this per-departure by changing the rule to `pay` before removing you from the system, in which case pending events get paid out in the next cycle. Already-paid events are never clawed back.

---

**Q: How do I know when the payout is due?**

On the 1st of the month, a green **PAYOUT DUE TODAY** banner fires at the top of the CEO view with the total pending amount and a "Run payout now" button. Devs don't see this banner — check your rewards history panel to see your pending amount and the "next payout" date at the top of the panel.

---

**Q: What does "in dispute" mean on my bug?**

A blue **⚖ In dispute** chip means a dev (usually the one attributed to the bug) has disputed the attribution. The bug is in limbo — the dev hasn't been cleared, and the PM hasn't resolved it yet. Imran reviews every dispute and picks one of three outcomes: **Accept** (you're right, bug routes to the project owner), **Reject** (attribution stands, chip goes away), **Reassign** (bug moves to a different dev, chip goes away). Don't bypass the dispute button to message Imran directly — the chip is how the whole team sees the bug is under review.

---

*Document maintained by: CEO / PM*
*For dashboard issues or access problems, contact Fahad at fahad@phonebot.com.au*
