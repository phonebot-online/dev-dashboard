# Senior PM — Baazaar — devdash PM view evaluation

## Who I am
I run two squads (16 devs) at a Karachi e-com company 5x Phonebot's size, in Slack and standups from 9am to 9pm. I don't need another dashboard — I need something that tells me what will slip this week before the CEO asks.

## What I like (don't remove)
- **Monday morning summary** at the top — this is the correct hierarchy. If I open on my phone in a rickshaw, that one block is the whole product.
- **Stuck PRs tile** with inline PR#, repo, waiting-on, merged — this is the single most actionable widget on the page. It matches the shape of my day.
- **Disputes panel with Accept / Reject / Reassign** — I've never seen a dashboard that lets the dev push back. That alone earns trust from my team.
- **Upload independent PM assessment** + "disagreement flagged" badge — someone finally acknowledged that the dashboard can be wrong. Big.
- **Filter bar scoping everything to one project** — I live in per-project context, not portfolio. Good that it's global.
- **Absence badges on dev cards** — stops me chasing someone on Slack who's on sick leave.

## What I wish existed
- **"What changed since I last opened this"** diff — I open the dashboard 6x a day, I don't want Monday's summary at 4pm Thursday.
- **Slack / WhatsApp push** for the 3 things that actually need me today (new dispute, PR stuck >3d, regression confirmed). I should not have to open the tab to learn these.
- **CEO-ready export button** — one click turns the Monday summary into something I can paste into the 10am leadership WhatsApp group without reformatting.
- **Forecast slip early-warning** on project cards — don't just show days_left vs work_left, tell me which project will miss its date based on this week's velocity trend.
- **Per-squad grouping** of the dev cards (I own 2 squads, not 16 individuals) — right now it's a flat grid, I have to eyeball who's mine.
- **Bug queue aging with SLA breach color** — "3d open" means nothing without knowing severity SLA. HIGH past 24h should be red and loud.
- **Cross-project dependency view** — when Squad A blocks Squad B, I find out in standup. The dashboard should surface it.
- **QA pass rate trend per dev** — I don't just want this week's compass, I want is-this-dev-getting-better-or-worse over 6 weeks.
- **"Waiting on me" personal inbox tile** — decision debt shows me what's stuck, but not what's stuck *on me specifically*.
- **Meeting load indicator per dev** — if a dev's velocity dropped because I put them in 12 meetings, the dashboard should tell me that's on me, not them.

## What's confusing or hard to read
- **Compass 4-direction radar on every dev card** — pretty, but at 16 devs this is 16 tiny shapes I can't compare at a glance. A table with 4 numeric columns would tell me more in 2 seconds.
- **"Handoff multiplier"** in the center of the compass — I had to re-read the legend. What is a "handoff" here? PR handoff? Shift handoff? Project handoff? Needs a one-line tooltip.
- **Decision debt vs Stuck PRs vs QA audit findings** — three tiles that feel like overlapping flavors of "stuck things". I'd merge into one prioritized list.
- **Regression watch "similar to R0-04"** — what is R0-04? Placeholder IDs that mean nothing to a new PM. Needs a human title.
- **"TRUE NORTH" / "OWNER" pills** — gamified badges on people. In my culture, and as a woman PM, I'd rather show the data and let humans judge.
- **Monday summary emoji-tagged bullets** — emojis as data category markers make this feel like a kids' app. I want severity colors, not 🚀 and ✨.

## What's noise I'd delete
- **Mini compass on the PM dev grid** — redundant with the dev drill-down. Replace with a sparkline of the last 6 weeks.
- **"No stuck PRs. Nice week."** empty-state cheerleading — patronizing. Just say "0 stuck PRs."
- **Per-dev summary paragraph on the card** — looks like AI-generated filler. Either make it a real standup note from the dev or cut it.
- **Placeholder data masquerading as real** — the regression tile example "Checkout double-click orders" reads like fake fixture data. Flag demo rows visually or my team will cite them as real.

## My top 3 complaints (direct, as if venting to another PM friend)
1. "It's Monday-shaped in a Thursday-afternoon world. I open this 6 times a day and it still shows me the Monday brief — where is the 'what's new since I looked at 2pm'?"
2. "Sixteen tiny radars is decoration, not data. If I want to rank my devs I'm opening Excel. Give me a sortable table or get out of my way."
3. "Half the tiles read like a gamified HR toy — TRUE NORTH, emojis in the brief, cheerleading empty states. I'm managing a P&L, not running a Duolingo streak."

## One feature that would make me LOVE it
A **"3 things before standup" push** at 9:45am every weekday: (1) who's absent today that I forgot, (2) the single PR most likely to slip a launch, (3) the one dispute or decision waiting on me. Delivered to WhatsApp with deep links back into devdash. If the dashboard reliably got this right 4 weeks in a row, I'd stop opening the full page — and I'd trust it. That's the bar. Right now it's a dashboard I have to work; I want one that works me.

## Signals that would actually change my day
- **Push at 9:45am** — today's absences + top 1 PR slipping + top 1 decision waiting on me (WhatsApp/Slack, not email).
- **Push when a dispute is raised** — I want to know within the hour, not Monday.
- **Push when a dev's compass drops >20% week-over-week** — silent trouble, before it becomes loud trouble.
- **Pull at noon triage** — filtered bug queue with SLA-breach at top, decision debt with aging.
- **Pull at end-of-day** — did each squad close what they committed to this morning, yes/no.

## Gut-check score
- Signal density (1-5): **3** — lots of widgets, some genuinely useful, but redundancy and decoration dilute it
- Usefulness in Monday morning 10 minutes (1-5): **4** — the summary block + stuck PRs + disputes is a legit Monday triage kit
- Trust (1-5): **3** — the "upload independent assessment" and "disputes" features earn trust; placeholder data and gamified badges lose it
- Would I actually open this every day: **Yes, but only Monday morning and Friday afternoon** — the rest of the week I need push, not pull, and devdash doesn't push yet.
