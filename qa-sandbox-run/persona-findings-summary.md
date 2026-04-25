# Persona findings — synthesis across 5 roles

**5 personas** (CEO / PM / Senior Dev / Manual QA / Senior QA Auditor) evaluated their own role's view in Baazaar context (30 devs, 80 staff, $120k/mo burn, Pakistan-based e-comm, 5x Phonebot). Individual files: `persona-ceo.md`, `persona-pm.md`, `persona-dev.md`, `persona-qa.md`, `persona-qa-auditor.md`.

This doc: what they agree on, what they disagree on, ranked feature list, deliberate kill list.

---

## 1. What ALL 5 personas asked for (high confidence → build these)

| # | Ask | Personas | Why it matters |
|---|---|---|---|
| 1 | **Evidence attachments** (screenshots, HAR, Lighthouse JSON, console log, build SHA) | QA #1, Auditor #2, CEO implicit | QA's top wish, auditor's second. Changes the power dynamic: devs can't "works on my machine" a bug with photo evidence. Required for any external audit. |
| 2 | **Trend data, not snapshots** (WoW / MoM / 12-week sparklines per dev, per project) | CEO, PM, Dev, Auditor | 4 of 5 flagged it. "Worst-case launch 14d late" without a trendline is a photograph; everyone wants a video. |
| 3 | **Push notifications** (WhatsApp/Slack — not email-only) | PM #1 LOVE, CEO | PM opens dashboard 6×/day pulling info. Wants 1 push at 9:45am. "Fix this and I trust it 4 weeks in a row, I'd stop opening the full page." |
| 4 | **"Show the receipts"** — every compass score click-throughs to raw inputs | Dev #1 LOVE, Auditor implicit | Dev: "Craft = 72 → click → 3 audited PRs, 2 unaudited, 1 reverted." Kills black-box trust problem. Without it, Dev "opens defensively, not to improve." |
| 5 | **Re-test / verify workflow** — QA signs off on close, not devs | QA, Auditor | "A dev can close my bug and the conversation dies." Needs REOPENED as a first-class status + QA verification gate before actual close. |

---

## 2. What the personas DISAGREE on (deliberate tradeoffs, not bugs)

### CEO wants MORE, Dev wants LESS
- **CEO:** runway tile, cost-per-feature, dev flight-risk signal, "what shipped to customers this week"
- **Dev:** private scratch area, "dashboards without a private layer feel like surveillance by default", no leaderboard-by-default
- **Resolution:** CEO gets business-level tiles (GMV/runway) scoped to CEO view only; Dev gets a private layer + receipt-click-throughs on their own view. Don't surface CEO-level data to devs.

### PM wants org view, Dev wants personal context
- **PM:** "16 tiny radars is decoration — give me a sortable table"; per-squad grouping
- **Dev:** "opt-in comparison with peers, not forced"
- **Resolution:** PM view gets flat sortable table option + squad grouping. Dev view stays personal + self-driven; peer comparison only on explicit opt-in.

### QA wants symmetry, Auditor wants authority
- **QA:** "Devs get per-person stats, I get nothing" — wants own metrics panel (bugs filed, regression-catch rate, avg days open)
- **Auditor:** "Blocker is a label, not a gate" — wants release-lock authority, sign-off required on close
- **Resolution:** Both valid, different shapes. Give QA parity metrics (mirror of dev cards); give Auditor release-gate + cannot-ship banner. Don't conflate the two.

### Growth matters to Dev, not to others
- **Dev:** "No skill / growth axis. Four directions, zero reward learning new things." Wants mentoring credit, code-review counts, spike/research time logged
- **CEO / PM:** never mentioned growth at all
- **Resolution:** Phase-2 growth ladder in dev view is Dev's retention lever, even if CEO doesn't ask for it. Fahad should want it for retention reasons (best devs get poached every 6 months).

---

## 3. Universal kill list (every persona or multiple personas called these out)

- **Gamified pills** (TRUE NORTH, OWNER badges). PM "feels like Duolingo streak"; Dev flags as manipulable. Kill or make them optional.
- **Emoji as data-category markers** in PM briefing. PM: "I'm managing a P&L, not running a kids' app." Replace with severity colors.
- **Placeholder hardcoded data** (devMockData, hardcoded stuckPrs). Dev: "A wrong number is worse than no number, especially on something that pays people." **Disqualifying** per Dev. Don't launch until git-sync is live.
- **"Other" category** in Auditor finding form. "Where accountability goes to die." Remove it — force bucketing.
- **Compass N/E/S/W metaphor** (Dev: "cute, but I have to think twice"). Drop the direction names, keep the radar shape.

---

## 4. Top-12 feature requests — ranked by impact × frequency

Ranking = persona count who asked × severity of their pain × ease of implementation.

| Rank | Feature | Impact | Effort | Who's asking |
|---|---|---|---|---|
| 1 | **Evidence attachments** on bugs + audits | HIGH | Medium | QA, Auditor |
| 2 | **"Show the receipts"** click-through on every compass score | HIGH | Medium | Dev, Auditor |
| 3 | **Push notifications** (WhatsApp at 9:45am) for today's absences + top slipping PR + top decision | HIGH | Medium | PM, CEO |
| 4 | **WoW / MoM / 12-week trend charts** (replace snapshot-only) | HIGH | High | All 5 |
| 5 | **Re-test workflow + REOPENED status** | HIGH | Low | QA, Auditor |
| 6 | **Release-gate / cannot-ship banner** when a blocker is open | HIGH | Medium | Auditor |
| 7 | **Revenue / GMV / runway tile** on CEO view | HIGH | Medium | CEO |
| 8 | **Per-squad grouping** + **sortable table view** on PM view | MED | Low | PM |
| 9 | **Comment thread on bugs** (QA ↔ dev inside the tool) | MED | Low | QA |
| 10 | **Code review + mentoring credit** as a compass input | MED | Medium | Dev |
| 11 | **Private scratch area** per dev | MED | Low | Dev |
| 12 | **Parity matrix view** (legacy feature list × 2.0 status) | MED | High | Auditor |

---

## 5. Top 5 risks to take seriously (things that could break the whole thing)

1. **Gaming the metric.** Dev: "Put PKR next to a score of 75 and every dev learns what game to play. I give it one quarter before someone figures out the cheat code." Mitigation: tie compass to inputs that are expensive to fake (audited PRs, not raw commit count; handoff content-length + structure, not presence).
2. **Handoff multiplier punishes quiet performers.** Dev: "I know two guys who ship like machines but write 3-word Slack updates. Under this, they get 88% and their whole score drags for *writing*." Mitigation: either (a) multiplier only kicks in if notes are missing entirely, not if they're terse; (b) let the dev show the receipts (a 2-line note that captured the work should score same).
3. **Auto-attribution of bugs is politically explosive.** Dev: "the most politically dangerous piece of this whole thing." Mitigation: `git blame` link visible on every bug attribution, not just the resulting name; dispute flow with receipts.
4. **PM expects push, gets pull.** If Fahad ships without push notifications, PM opens it Monday, closes it, uses Slack the rest of the week. Dashboard becomes shelfware by Wednesday. Mitigation: 9:45am WhatsApp push must land in Phase 1.5, not Phase 2.
5. **Auditor has no teeth.** If Fahad sells this as an audit tool internally, but "blocker" is a label a dev can toggle, the Auditor role is decorative and the first release outage proves it. Mitigation: release-gate state + cannot-ship banner + auditor-only close authority.

---

## 6. Gut-check scores (what each persona would rate today)

| Persona | Would open daily? | Biggest blocker to trust |
|---|---|---|
| CEO | Yes, Monday + Friday | No revenue/runway tile — "looks like a GitHub profile, not a business dashboard for $120k/mo burn" |
| PM | Yes, but only Mon AM + Fri PM — needs push for the other 6× daily checks | No push notifications |
| Dev | No — "open the first week out of curiosity, then avoid until performance review" | Placeholder data + no receipts behind scores |
| QA | No — would double-log in Slack because that's where the screenshot lives | No evidence attachments |
| Auditor | No trust for parity audits — "parity is a matrix, not a text field" | No release-gate + no attachments + no trends |

**3 of 5 personas would NOT open this daily in current state.** The common denominator: it shows data without proving the data. Receipts + attachments + trends fix this.

---

## 7. Concrete next actions (suggested for Fahad)

### Must ship before real-data go-live:
- Git sync wired (Dev's disqualifying concern)
- Evidence attachment on bugs + audits (QA + Auditor #1 ask)
- "Show the receipts" click-through on compass (Dev #1 ask)
- Push notifications (PM #1 ask)

### Phase 2 (after real-data proves the trust model):
- Trend charts (universal)
- Release-gate for auditor
- Revenue/runway tile for CEO
- Growth-ladder for dev retention

### Deliberately deferred:
- Gamified pills (TRUE NORTH, OWNER) can stay — but make them configurable off if any persona requests
- Mobile view (nobody specifically asked; assume desktop-first for now)
- Parity matrix (Auditor #12 — separate project-level feature)

---

**Files referenced:**
- Individual reports: `persona-ceo.md`, `persona-pm.md`, `persona-dev.md`, `persona-qa.md`, `persona-qa-auditor.md`
- Integration-bug report: `integration-bugs.md` (14 bugs, all fixed today)
- Sandbox click-through findings: `findings.md`
