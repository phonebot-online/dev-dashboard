# Reward system — end-to-end lifecycle

**Status (2026-04-24):** Fahad's direction locked in. MVP shipped in devdash.html (sandbox). Remaining open questions at the end.

## 0. Locked-in decisions (Fahad, 2026-04-24)

| Decision | Value |
|---|---|
| Currency | PKR only (no multi-currency, no exchange-rate snapshots) |
| Payout cycle | Monthly, default payout day = 1st of each month |
| Absence rule | Pro-rated (worked_days ÷ 5 × reward) |
| New hire rule | No rewards during probation. `probation_end` per user. Starts from 0 after. |
| Termination rule | Forfeit all pending (no post-exit payouts) |
| Team pool split | Owner decides (Fahad allocates manually each unlock) |
| Monthly budget ceiling | Configurable in Settings, warning if exceeded |
| Approval | Both CEO + PM must tick (dual approval required) |
| Receipt to dev | Silent (no email/WhatsApp). History IS visible to dev. |
| History reset | CEO/PM can wipe from Settings → Rewards → Danger zone |
| Tax | Out of scope for this dashboard |

## 1. The question

Rewards today show "this week unlocked: 400 PKR (velocity, craft)". That's a snapshot. No history, no paid/unpaid state, no monthly aggregation, no CEO payout screen. This doc fixes that.

## 2. What's broken / missing right now

- Rewards are COMPUTED on every page render from the current week's compass. Nothing is stored.
- No history: dev can't see what they earned last week, last month, last year.
- No paid/unpaid distinction.
- No payout cycle (weekly? monthly? quarterly?) — currently implicit "weekly", no actual money changes hands in the dashboard.
- No CEO payout screen — Fahad has no "here's what I owe this month" view.
- No audit trail — "Fahad paid Faizan 70k PKR on 2026-03-31" isn't recorded anywhere.
- Team pool split rule is undefined — is 350k PKR split equally across 4 devs? Weighted by compass? Only to devs who hit True North?
- Growth reward (direction +10 pts month-over-month) cannot be computed — no month-ago baseline stored.
- Owner bonus (project ships green on time) has no triggering event — nothing records "this project shipped".
- Reward reversal: if a dispute is accepted AFTER payout, no clawback logic.
- Currency: amounts stored as `per_direction_aud: 35000` but currency = PKR. Legacy field name, no snapshot of exchange rate.
- Tax: Pakistan has income tax on bonuses — not flagged anywhere.
- Absent devs: if Faizan is sick 3 days, is his compass scored? Does he forfeit reward or get pro-rated?
- New hires mid-month: partial month treatment?
- Terminations: unpaid pending rewards — paid out or forfeit?

## 3. The lifecycle (proposed)

Every Monday after the weekly audit runs, it composes `rewardEvent` records for each dev:

```
rewardEvent = {
  id: timestamp,
  dev_email: "faizan@phonebot.com.au",
  week_start: "2026-04-21",  // Monday of the week being rewarded
  type: "direction" | "true_north" | "growth" | "team_pool" | "owner_ship",
  direction: "velocity" | "craft" | "reliability" | "drive" | null,
  amount: 35000,
  currency: "PKR",
  status: "pending" | "paid" | "void",
  paid_at: null | "2026-05-01",
  paid_by: null | "Fahad",
  payout_batch_id: null | batchId,
  note: ""
}
```

Four triggers → events created:
1. **Direction unlock** (per week): one event per direction that hit threshold. 0-4 events per dev per week.
2. **True North** (per week): one event if all 4 directions hit. In addition to the 4 direction events.
3. **Growth** (per month): one event per direction improved ≥10 pts vs same week last month.
4. **Team pool** (per unlock threshold crossed): one event per dev, split-rule-based.
5. **Owner ship** (per project shipped): one event to the project owner.

State transitions:
- `pending` → `paid` when CEO creates a payout batch and includes this event.
- `pending` → `void` when a dispute invalidates the underlying compass score (rare, requires CEO override).
- `paid` → `void` requires explicit clawback action + note. Default: no clawback.

## 4. Payout cycle (configurable)

Settings → Rewards → "Payout cycle":
- `weekly` — CEO sees payout screen every Monday, pays last week.
- `monthly` — default. CEO sees payout screen on the 1st of each month, pays previous month.
- `quarterly` — same but Q-end.
- `ad_hoc` — no cycle, CEO pays whenever.

The `rewardEvent` records accumulate regardless of cycle. Cycle only controls when the payout prompt appears.

**Answer to "do they start from 0 in month 2?"** — this-month totals yes, reset to 0 on the 1st. Lifetime history accumulates forever.

## 5. Dev view additions

New panel: **Rewards history** (below the current "Rewards unlocked this week").

```
REWARDS
─────────────────────────────
This week        35,000 PKR   (1 direction unlocked)
This month       210,000 PKR  (6 events, 0 paid, 6 pending)
Last month       340,000 PKR  (10 events, all paid 2026-03-31, ref #PAY-2026-03)
Lifetime         2.3L PKR     (41 events since joining)
─────────────────────────────
[Expand history ▾]
  2026-04-21 week   Velocity unlock    +35,000 PKR  pending
  2026-04-14 week   Velocity unlock    +35,000 PKR  pending
  2026-04-14 week   Craft unlock       +35,000 PKR  pending
  2026-04-14 week   True North         +180,000 PKR pending
  2026-04-07 week   Velocity unlock    +35,000 PKR  paid 2026-03-31 #PAY-2026-03
  ...
```

Tooltips on each pending event: "Expected payout: 2026-05-01" (based on cycle).

## 6. CEO view additions

New callout on CEO view: **Monthly payout obligation**.

```
MONTHLY PAYOUT (DUE 2026-05-01)
─────────────────────────────
Pending since 2026-04-01:
  Faizan     5 events    170,000 PKR
  Moazzam    4 events    140,000 PKR
  Faisal     2 events     70,000 PKR
  Usama      1 event      35,000 PKR
─────────────────────────────
Total owed:            415,000 PKR
Budget baseline:       500,000 PKR (from Settings → Rewards → monthly budget)
Headroom:              +85,000 PKR
[Run payout →]
```

"Run payout" opens a modal:
- Checklist of every pending event (grouped by dev).
- CEO ticks which to include (default: all).
- Adds reference number (e.g. bank transfer batch ID).
- Adds optional note.
- Confirm → every ticked event becomes `paid`, gets `paid_at`, `paid_by`, `payout_batch_id`.

Payout history accessible from CEO view: "Past payouts" list showing each batch + date + total + ref.

## 7. Settings additions (Rewards tab)

- **Payout cycle**: weekly / monthly (default) / quarterly / ad-hoc
- **Payout day**: 1st / 15th / last day of month (applies to monthly)
- **Monthly budget ceiling** (optional): warn CEO if projected payout exceeds this
- **Clawback policy**: never / within N days of payout / requires CEO override
- **Team pool split rule**: equal / weighted_by_compass / only_true_north_devs / owner_decides
- **Growth reward window**: month-over-month (default) / quarter-over-quarter / custom N weeks
- **Absence rule**: full reward / pro-rated / forfeit (default: pro-rated — if dev was absent 2 of 5 days, reward is × 3/5)
- **New hire rule**: no rewards for first N weeks (default: 0 — rewards immediately)
- **Termination rule**: pay all pending / forfeit all pending / pay at CEO discretion

Each configurable. Every change logged to audit log.

## 8. Team pool split rule — pick one

When portfolio avg hits a `unlock_threshold` (25, 50, 75, 100%), team pool releases. Split options:

- **A. Equal** across all active devs. Simple. Rewards equal participation.
- **B. Weighted by compass** — higher compass = larger share. Rewards contribution but compound-rich-get-richer.
- **C. True-North-only** — only devs who hit all 4 directions get a share. Hard gate, high motivation.
- **D. Owner-decides** — Fahad allocates manually each unlock. Max flexibility, min structure.

Recommendation: **C (True-North-only)** with a fallback to equal-split if nobody hit True North that quarter. Makes the team pool aspirational.

## 9. Edge cases you asked me to think through

| Scenario | Handling |
|---|---|
| Dev sick 2/5 days, hits threshold | Pro-rated to 3/5 of reward (configurable) |
| Dev sick 5/5 days | No reward (compass not computed that week) |
| Dev hits threshold, THEN a bug from that week is found in QA Auditor | Reward stands unless dispute is accepted within 14 days (configurable clawback window) |
| New hire joins Wed — scored on partial week? | No scoring for first 2 weeks (configurable); reward starts week 3 |
| Dev terminated with pending rewards | Default: pay at CEO discretion (not auto-paid, not auto-forfeited) |
| Pakistan income tax on bonuses | Not handled. Flag in "What we'll owe this month" — add gross vs net toggle in Settings → Rewards. |
| Currency change mid-month (PKR → USD) | Snapshot exchange rate on each event. Don't retroactively convert. |
| Fahad forgets to run monthly payout | Reminder email/WhatsApp on the payout day. Events stay pending, no auto-payout. |
| Growth reward: dev grew 12 pts but score is still < 75 | Pays the growth bonus (25k), not the direction unlock. Growth is independent. |
| True North for 4 weeks in a row | One True North bonus per week. No compounding multiplier. Could add a "streak" bonus later — 4-week streak = +X. |
| Project ships LATE but green (forecast was right, deadline wasn't) | Owner bonus still pays. Deadline overruns are handled by forecast slip, not retroactive penalty. |
| Project ships BUT was red for most of the cycle | Owner bonus does NOT pay. Must be green on the ship date. |

## 10. What to build RIGHT NOW (MVP)

The above is the full design. For the sandbox, minimum viable:

1. `rewardEvents[]` array in Alpine state + localStorage persistence.
2. `computeWeeklyRewards(dev, week)` helper — generates 0-5 events per dev per week from compass.
3. `payoutBatches[]` array — each batch `{id, ref, paid_at, paid_by, event_ids[], total, note}`.
4. Dev view: "This week / month / last month / lifetime" totals panel with expandable history.
5. CEO view: "Monthly payout obligation" callout + payout modal (checklist + confirm).
6. Settings → Rewards: payout cycle dropdown + absence rule dropdown.
7. Each paid event gets a receipt row visible to dev + CEO.

**Skip for now:**
- Growth month-over-month calc (needs historic compass snapshots — blocked until git sync is live).
- Team pool split logic (needs portfolio % history).
- Owner-ship bonus (needs project-ship event).
- Clawback policy flow.
- Currency snapshots / exchange rate.
- Pakistan tax.

These are phase 2 / real-data-required.

## 11. Questions for Fahad — original 6 (ANSWERED)

1. ~~Monthly payout cycle?~~ → **Monthly, 1st of month**
2. ~~Absence rule?~~ → **Pro-rated**
3. ~~Team pool split?~~ → **Owner decides**
4. ~~Monthly budget ceiling configurable?~~ → **Yes, in Settings**
5. ~~Approval — Fahad only or both?~~ → **Both (dual approval required)**
6. ~~Payout receipt?~~ → **Silent. History visible to dev. Reset from Settings.**

## 12. Q7-Q11 (ALL ANSWERED 2026-04-24)

| Q | Topic | Answer |
|---|---|---|
| Q7 | Clawback on late-accepted dispute | **No clawback ever** — once paid, it's paid. |
| Q8 | Payout reminder on the 1st | **Banner + push** — loud red banner on the 1st + push via Worker (WhatsApp/email). Configurable to banner-only. |
| Q9 | Growth bonus if improved but still below threshold | **Configurable** — defaults to "independent" (pays on +10pts regardless). Toggle in Settings → Rewards. |
| Q10 | True North streak bonus | **No streak bonus** — flat 180k per week, keep the rulebook simple. |
| Q11 | Owner bonus if project ships 1+ day late | **Strict (C)** — must ship ON deadline AND green throughout. `owner_bonus_grace_days = 0` default. One day late = no bonus. Configurable in Settings if ever needed. |

All 11 decisions locked. MVP + configurable rules are shipped.

## 12-LEGACY. Questions STILL OPEN — need your call

These came out while building the MVP. Each has a default I used; reject/confirm so I can update.

### Q7 — Clawback policy
If a dispute is accepted AFTER a reward has been paid (e.g. a bug originally attributed to Faizan gets resolved 3 weeks later as Usama's), do we claw back Faizan's reward?
- **(A) Never claw back** — once paid, it's paid. Dispute only affects future attribution.
- **(B) Claw back within N days of payout** — e.g. 14 days. After that, no claw back.
- **(C) Always claw back** — if the score was wrong, the money was wrong.
- **My default (A):** no claw back. Disputes after payout only fix the audit trail, not the money. Simplest policy, avoids awkward "give back money" conversations.

### Q8 — Payout reminder
On the payout day (1st of month), does Fahad get:
- **(A) WhatsApp reminder** — one message with pending total
- **(B) Email reminder** — same, via MailChannels
- **(C) Dashboard banner only** — no push, just the callout at top of CEO view
- **(D) All of the above**
- **My default (C):** banner only. Fahad already opens the dashboard every day; push can come in phase 2 if missed.

### Q9 — Growth bonus independence
A dev improved Velocity by +12 points (e.g. 55 → 67) but is still below the 75 threshold. The Velocity unlock doesn't fire — they're still below bar. Does the **growth bonus** (+25k PKR for +10 pt improvement) still pay?
- **(A) Yes, growth is independent** — rewards improvement regardless of absolute level. Good for keeping low-performers motivated.
- **(B) No, only pays growth if the new score is ≥ threshold** — no reward for "less bad than last month".
- **My default (A):** growth is independent. You want to reward trajectory, not just arrival. Low-scoring devs improving is exactly the behavior you want to reinforce.

### Q10 — True North streak bonus
A dev hits True North (all 4 directions ≥ threshold) for 4 weeks in a row. Do they get a streak bonus on top of the weekly True North reward?
- **(A) No streak bonus** — each week's True North pays the same flat 180k PKR.
- **(B) 2x bonus on week 4 of a streak** — "you sustained it, here's more"
- **(C) Configurable streak table** in Settings (week 4 = +X, week 8 = +Y, etc.)
- **My default (A):** no streak bonus initially. Keeps the math simple. Add later if you notice devs coasting after hitting True North once.

### Q11 — Owner bonus edge: late but green
A project ships 5 days past deadline but has stayed green throughout. Does the project owner still get the `owner_bonus_pct`?
- **(A) Yes, if ship date was within Y days of deadline** (e.g. 7 days grace)
- **(B) Yes unconditionally, as long as it's green on ship date**
- **(C) No — deadline must be met AND green**
- **My default (A) with Y=7:** some slip is human; 7 days of slip on green is still a solid ship. But any red during the cycle OR slip beyond 7 days = no bonus.

---

## 13. Phase 2 items (not in MVP, but in this spec)

The MVP shipped in the sandbox has:
- `rewardEvents[]` + `payoutBatches[]` with localStorage persistence
- Dev view: this-week / this-month / last-month / lifetime totals + expandable history
- CEO view: "Monthly payout due" callout + payout modal with dual-approval checkbox
- Settings → Rewards: payout_cycle, payout_day, monthly_budget_ceiling, require_dual_approval, absence_rule, new_hire_probation_weeks, termination_rule, team_pool_split
- Settings → Rewards → Danger zone: "Reset reward history" button (double confirm)
- Audit log entries for every payout + every reset

Phase 2 (deferred until real data):
- **Growth reward computation** — needs historic compass snapshots (month-ago baseline). Requires real weekly audit running for 4+ weeks.
- **Team pool split** — owner_decides is manual modal (Fahad picks beneficiaries + amounts); shipping that UI is phase 2.
- **Owner-ship bonus** — needs a "project shipped" event mechanism. Currently projects have `status: 'active'` — need a transition to `shipped` with a date to trigger.
- **Currency snapshots** — not needed since we're PKR-only.
- **Payout reminder push** (email/WhatsApp) — phase 2 (Q8).
- **Clawback flow** — phase 2 (Q7).
