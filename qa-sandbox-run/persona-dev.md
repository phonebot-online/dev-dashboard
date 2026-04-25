# Senior Dev — Baazaar — devdash Dev view evaluation

## Who I am
Senior full-stack, 7 years in, 3 at Baazaar, checkout team (Node + React, some Laravel legacy). I ship, I review, I don't politic — and I have watched three "velocity dashboards" at Pakistani shops turn good devs into PR-farmers and then burn them out.

## What I like (don't remove)
- The self-serve absence banner with **"Sick yesterday" retroactive logging** — this is the first dashboard I have seen that assumes a sick person will not log in. That is correct, humane, and rare.
- **Dispute button on commits and on QA bugs** — I can push back without DM-ing my PM. That is dignity.
- **Handoff multiplier shown as a percentage in the compass centre** — not as a separate "discipline score" hanging off to the side like a demerit. Good placement.
- **Feature requests inline with Accept / Decline-with-reason / Ask / Set ETA / Done** — finally, a way to say "no, here is why" in the same surface where the ask lives. Threading is the right call.
- **Coaching line per direction** ("Ship one more audited PR to unlock +35k PKR") — specific, one-action, not vague "improve quality".
- **Threshold marker from Settings, not hardcoded** — means the target can be tuned per team, not imposed from on high.

## What I wish existed
- **Show me the raw inputs behind each compass score.** If Craft = 72, I want to click and see "3 audited PRs, 2 unaudited, 1 reverted." Without the audit trail I cannot trust the number or coach myself.
- **A "why did my score change" diff vs last week.** The delta arrows (+3 / -4) are there but I cannot see which commit / bug / handoff caused the move.
- **Code review / reviewing-others counts somewhere.** Right now Velocity = ship volume. I spend 6 hours a week reviewing juniors' PRs and that is invisible. That is how you kill senior reviewers.
- **Learning / spike / research time as a first-class category**, not shoehorned into "off-project". A day spent reading the payment gateway SDK is not off-project, it is the project.
- **A private scratch area** — notes to myself, questions I am chewing on, things I would not want the PM to see until I am ready. Dashboards without a private layer feel like surveillance by default.
- **Opt-in comparison with peers**, not forced. If I want to see how my Craft compares to the team median, let me. Do not rank me on a leaderboard by default.
- **Show the handoff multiplier formula.** "Full 4-section notes = full multiplier" — what counts as a section? Word count? Presence of a heading? I want the rule, not the vibe.
- **Bug attribution explanation.** If a QA bug is attributed to my code, show me the git blame line that mapped it to me. Auto-attribution is the most politically dangerous piece of this whole thing.
- **Let me annotate my own week** — "Monday lost to prod incident, Wed half-day sick (logged)." Context beats a number every time.
- **Keyboard shortcuts + a density toggle.** I am on this thing every morning; I do not want to scroll.

## What's confusing or hard to read
- Compass labels N/E/S/W with direction names — cute, but I have to think twice. Just say Velocity / Craft / Reliability / Drive and drop the compass metaphor, or drop the N/E/S/W.
- "locked (need 75)" on reward chips — need 75 of what? Score out of 100? Make it "need score 75 / current 68" so I do not have to translate.
- `Math.round(handoff_mult * 100) + '%'` in the centre of the compass — if it drops below 90% the colour goes rose. I did not know that from the UI until I read the code.
- "acts beyond queue" as the sub-label for Drive is vague. Beyond whose queue? Is accepting a CEO feature request the only way to score it, or does picking up an unowned bug also count?
- Week-over-week delta is shown with no baseline week label. +3 vs what? Last ISO week? Rolling 7d?
- Rewards panel mixes PKR amounts with "team bonus pool progress" in the same card — two different incentive models (individual vs team) stacked without a visual break.

## What's noise I'd delete
- "TRUE NORTH" badge shown twice (header and rewards card) — one is enough, preferably near the score, not as a decoration.
- Strong-direction chips inline *and* in the compass bars — pick one surface.
- "No unlocks yet — see coaching below" when nothing is unlocked. This reads as a scold. Just say "Coaching below."
- The project scope badge repeats project names that are already in the sub-line (`devViewTarget().projects.join(' + ')`) two lines down.

## Things that feel like surveillance or gamification (the red flags)
- **Rewards threshold at a score of 75** tied to a PKR payout per direction — this is the exact shape of the gamified productivity traps that killed morale at two other shops I worked at. Once money is on the line, people optimise for the metric, not the work. Craft = 75 will become "approve each other's PRs fast, mark audited, move on."
- **Handoff multiplier as a *multiplier* on everything else** — so a bad week of handoff notes can wipe out a week of real shipping. That is a discipline tax, and it will punish the devs who are heads-down solving something hard and are bad at writing but good at coding.
- **Auto-attributed QA bugs to a dev** without transparent blame mapping + only a "Dispute" button as the escape valve — disputes are adversarial by default, and senior devs will dispute, juniors will silently eat the hit.
- **"Acts beyond queue" (Drive)** rewarding accepting CEO/PM feature requests. That is *exactly* the metric that turns your best people into yes-men. The dev who pushes back and says "we should not build this" loses Drive points for being right.

## My top 3 complaints (direct, as if venting to another dev friend)
1. "Yaar, the compass is tied to cash. The second you put PKR next to a score of 75, every dev in the team will learn exactly what game to play. I give it one quarter before someone figures out the cheat code and the PM wonders why Craft went up and bugs also went up."
2. "The handoff multiplier is a trap for quiet performers. I know two guys on my team who ship like machines but write three-word Slack updates. Under this, they get a 88% multiplier and their whole score gets dragged down for *writing*. That is not what we are paying them for."
3. "The commits list and queue are placeholder hardcoded data — the whole dashboard is a skin on top of no real git sync yet. Do not launch this until it is wired to Bitbucket/GitHub. A wrong number is worse than no number, especially on something that pays people."

## One feature that would make me LOVE it (or hate it less)
Give every score a **"show me the receipts"** click-through. I click Craft = 72 and I see the exact 6 PRs in that window, each with audited/unaudited, reverts, and the QA bugs attributed to them, with git links. I click handoff = 92% and I see which days were full notes vs partial, with the actual notes inline. No black box. If the number is defensible, show the defence. If it is not defensible, it should not be on this page. The day I can audit my own score end-to-end without asking my PM, I will stop treating this thing as a threat.

## Self-improvement / learning — what's missing
- **No "what would move this number" simulator.** I want a little "if you ship one more audited PR this week, Craft → 78, unlocks 35k PKR." The coaching line hints at it but does not let me plan.
- **No skill / growth axis at all.** Four directions, zero of them are "learned a new thing" or "picked up a harder problem." Everything rewards throughput.
- **No reading / docs / spike log.** A senior should be doing 10–20% deep-dive time. Nowhere to log it, nowhere to credit it.
- **No mentoring credit.** If I unblock three juniors this week, that should show up somewhere that is not "Drive" (which is CEO-request-shaped).
- **No per-direction historical trend.** Delta is week-over-week only; I want a 12-week sparkline so I can see my own arc.

## Gut-check score
- Signal fairness (1-5): **2** — it measures what is visible (commits, PRs, bug counts, handoff note presence) and calls that performance. It misses review labour, mentoring, spikes, and pushback. Worse, the inputs are placeholder right now.
- Motivating vs punishing (1-5): **2** — PKR-per-threshold + multiplier on handoff discipline = classic gameable structure. Best case: mild motivation. Worst case: optimisation behaviour within a quarter.
- Respectful (1-5): **3** — self-serve absence, dispute buttons, decline-with-reason — these are respect-shaped features. But auto-attribution of bugs + money tied to a 75 threshold + a handoff multiplier on everything tips it back toward "tracked."
- Would I willingly open this each morning: **No — not in its current form.** I would open it the first week out of curiosity and then avoid it until performance review season, at which point I would open it defensively, not to improve. Strip the PKR-per-threshold mechanic, show the receipts behind every number, and give me a private layer — then yes.
