# Manual QA — Baazaar — devdash QA view evaluation

## Who I am
Manual QA, 4 years in, 2 at Baazaar. I test 6 browser/device combos a day, write most of my bugs in Slack screenshots, and I am tired of devs closing my tickets with "cannot reproduce."

## What I like (don't remove)
- The device + browser + "Always/Sometimes/Once" dropdowns — these are the three fields devs always ask me back about. Finally built into the form.
- Auto-route "Routes to owner: X" shown BEFORE I click submit. No more "wrong assignee" ping-pong.
- Inline severity, status and assignee dropdowns on the bug row. I can re-triage 10 bugs in one minute without opening each one.
- Click-row-to-expand pattern. List stays short, detail is one click away.
- Severity labels come from `config.system.severity_labels` — so CEO/PM can fix the label scheme without asking a dev.
- Empty state copy: "No bugs match your filters. Celebrate or panic — you decide." Honest. I respect it.

## What I wish existed (things that would give QA actual power)
1. **Screenshot / video attachments.** The whole reason devs dismiss me. No upload field = my evidence lives in Slack and gets lost. THIS is the #1 gap.
2. **Console log / network HAR paste field.** One textarea for "paste devtools output." Costs nothing, kills 50% of "works on my machine."
3. **Dev build / commit SHA field.** Which build did I test? Right now there's no way to pin a bug to a deploy — devs will say "that was old code."
4. **"Reopen" status.** Only open / in_progress / closed. When a dev closes and I re-test on next build and it fails, I need REOPENED as a first-class status so it shows up in metrics, not hidden inside "open."
5. **Comment / reply thread on each bug.** Right now there's a `details` field that's read-only in the list. I need back-and-forth WITH the dev without going to Slack.
6. **Bulk actions.** Select 5 bugs → change severity / status / assignee. When a release goes out I close 20 bugs; clicking each one is slow.
7. **Sort by severity, then age.** Currently only filter, no sort. HIGH from 14 days ago should sit above VISUAL from today.
8. **Duplicate detection on summary.** Warn me if my summary looks like an existing open bug — saves me logging the same thing twice.
9. **My bugs dashboard — how many I filed this week, % closed, avg days open.** Same thing devs get. Metrics that prove my work.
10. **Export to CSV.** For handoff to Faisal / CEO meetings.

## What's confusing or hard to read
- "FUNCTIONAL" vs "VISUAL" vs "HIGH" as severity labels — HIGH is a level, FUNCTIONAL/VISUAL are types. They shouldn't be in the same dropdown. Confusing.
- No timestamp on bugs, only "Nd ago." I can't tell if "2d ago" means 48hr or 50hr. For SLA tracking this matters.
- Assignee dropdown has no avatar or role — just names. Two "Ali"s on the team? I'd be guessing.
- Severity dropdown inside the row is shown as tiny `!text-[10px]` text. Hard to read on my work laptop.
- Delete button (×) is right next to expand arrow. One mis-click and the bug is gone. There's a confirm, but still scary.
- "Page / URL" accepts anything — no validation. Devs have complained about bugs with URL = "the checkout one".

## What's noise I'd delete
- The "(Older submissions may pre-date the new fields.)" fallback copy on expand. This is an internal dev comment. Ship the feature, hide the apology.
- The empty-state emoji line "🎉 or 😬 — you decide." — cute once, noise after. I see it 20x a day when I filter.
- Forcing me to pick a project from the dropdown when 90% of my bugs are for the same project. Remember my last project as default.

## What would help me when my written English isn't native
- Templates for "Steps to reproduce" — a 1/2/3 numbered starter in the textarea I can fill, not just a placeholder. Many QAs here would use this.
- A quick "Expected / Actual" two-field split would be clearer than one textarea mixing both. (I saw the placeholder tries to teach the format, but a split field teaches it harder.)
- Voice-to-text friendly fields — larger textareas so I can dictate on mobile without losing formatting.
- Don't auto-correct technical words. Summaries with "null" and "API" get mangled by mobile keyboards.

## My top 3 complaints (direct, as if venting to a fellow QA)
1. No screenshot upload. Seriously? This is a 2026 dashboard for QA and I still have to paste my screenshot in Slack and link it in the notes field? Every bug I file is weaker than it needs to be.
2. No reopen status + no comment thread = every dev can close my bug and the conversation dies. Then when it resurfaces it looks like a "new" bug and my metrics say nothing.
3. Severity dropdown mixes severity (HIGH) with bug type (FUNCTIONAL, VISUAL). Whoever designed `severity_labels` didn't talk to a QA. This breaks filtering — I can't ask "show me all HIGH visual bugs" because they're the same field.

## One feature that would make me LOVE it
Give me a one-click "Evidence Pack" on each bug: attached screenshot, console log, network HAR, browser+device+OS auto-detected, deploy SHA, and a timestamp. Then when a dev writes "works on my machine" I reply with a link to the pack. That single feature changes the power dynamic in every standup — devs can't hand-wave my bugs away any more, and I stop having to re-prove what I already tested. That is the feature that makes QA feel like engineering, not complaints.

## Power-imbalance items (what the dashboard gives DEVS that QA deserves too)
- Devs get per-person stats (commits, Compass score, leaderboard). QA gets nothing. I want bugs filed, bugs valid, avg days open, regression-catch rate.
- Devs can reassign bugs. QA can't reject a close. If a dev closes prematurely I have no dashboard mechanism to push back — only Slack.
- CEO/PM audit log for settings changes. QA has no audit — if a dev edits my severity from HIGH to VISUAL to make their number look better, I'll never know.
- Settings tab is locked to CEO+PM. QA should at least be able to propose severity labels / browser list changes, not just consume them.
- Devs get a "My work" focused view. QA has one combined form + one flat list. No "My bugs / Awaiting my re-test / Reopened" sub-tabs.

## Gut-check score
- Ease of logging a bug in 60 seconds (1-5): **4** — fields are right, but no screenshot upload and project always defaulting wrong costs 20 seconds.
- Evidence strength (1-5): **2** — "Can a dev dismiss my bug with 'works on my machine'?" Yes, easily. No attachment, no console, no build SHA.
- Voice / being heard (1-5): **2** — I can file, but I can't comment, reopen, or push back inside the tool.
- Would I actually use this instead of Slack: **No.** Right now I'd file here AND post in Slack with the screenshot, because the screenshot is where the truth is. Fix attachments + comments + reopen and the answer becomes yes.
