# Senior QA Lead / Test Auditor — Baazaar — devdash QA Auditor view evaluation

## Who I am
Senior QA Lead at Baazaar — ~30 devs, 4 QAs under me, ISTQB certified, ten years in this game across two prior companies. My job is not to click buttons; it is to own release sign-off, hold the "move fast" crowd accountable with evidence, and say "no" when "no" is the right answer.

## What I like (don't remove)
- Category-specific metric fields — performance asks for actual vs target, security asks for OWASP code, code_quality asks for file + lines. That structure alone keeps junior QAs from filing vague "site is slow" noise.
- Parity as a first-class category. For a 1.0 → 2.0 cutover this is the single most important audit lens; most dashboards bury parity under "bug."
- Blocker severity exists and is labelled "ship stopper." That is the word I need to see in writing.
- TO/CC email-style routing — I can loop in the PM and CEO on a blocker without the dev being able to say "I didn't know."
- OWASP A01–A10 dropdown. Forces the category to be named, which is what an external auditor will ask for.
- Inline status (open / in progress / closed) on each past finding, with filter by category + status. I can pull "all open blockers in security" in two clicks.

## What I wish existed
- A hard release-gate flag: "this finding blocks release X.Y" tied to a named release, with a dashboard-level "cannot ship" banner until closed. Right now "blocker" is a label, not a gate.
- Evidence attachments — screenshots, HAR files, Lighthouse JSON, curl output. A finding without evidence is a complaint.
- Re-test / verification workflow. When a dev marks "closed," I need a "pending QA verification" state before it actually closes, with auditor sign-off captured.
- Trend charts for performance metrics over time (LCP week-over-week per page). One LCP=4.2s number is a snapshot; trend is the audit.
- Baseline / target config per project (LCP budget, TTFB budget, WCAG level) so "target" isn't typed in by hand every time and drift is detectable.
- Regression linkage — a regression finding should reference the original ticket / finding ID so I can prove "this bug came back" with a chain, not a memory.
- Parity matrix view — legacy feature list on one axis, 2.0 status on the other. One URL field in a form does not give me a parity audit.
- CVSS score field on security findings (not just "Critical/High/Medium/Low"). External auditors ask for CVSS vectors.
- Export to PDF / CSV for a named release or date range. I need to hand this to the CEO or to an external reviewer.
- A "re-opened count" on every finding. Three re-opens on the same bug is a dev-quality signal I currently cannot surface.

## What's confusing or hard to read
- "Accessibility," "SEO," "cross_browser," "other" show no category-specific fields. They fall back to the plain narrative — inconsistent with performance / security where structure is enforced.
- Severity ("blocker") and Security risk ("Critical") are separate fields with no rule linking them. I can file an OWASP A01 Critical at Medium severity and the form accepts it.
- "Auto-route fallback" label is quiet — easy to submit without realising TO is empty and it fell through to a guessed owner.
- The past-findings card mixes project, days-ago, TO, CC on one small grey line. At volume (50+ findings) this gets noisy fast.
- "Target" on performance is free text — someone will type "2.5s" one day and "2500" the next. No units enforced.

## What's noise I'd delete
- "Other" category. Forces people to pick a real bucket; "other" is where accountability goes to die.
- Free-text "Viewport" field when a Device is already chosen — the device implies the viewport. Pick one.
- The CC checkbox wall shows everyone across pm/ceo/dev/qa/qa_auditor. At 30+ devs this is a wall of checkboxes; give me groups ("@all-devs," "@leadership").

## Where my authority falls short (gate-keeping / veto gaps)
- No release object to attach findings to. "Blocker" is a word, not a lock. A PM can merge around me.
- No sign-off signature on closure. Anyone with access can flip status to "closed" — there is no "closed by QA auditor" field.
- No SLA clock on blockers. If a blocker sits open 14 days nothing escalates.
- No link to a specific commit / PR / deploy. I can't say "this finding is against build #4471" — so my audit can't be tied to the artefact.
- No read-only evidence trail. Status drops down freely; the dev who owns it can mark their own blocker "closed" without me seeing the transition history.

## Trend / history gaps
- No week-over-week or release-over-release counts (findings opened, closed, re-opened).
- No per-dev quality signal — how many blockers has Dev X generated this quarter vs closed on first pass.
- No mean-time-to-close by severity.
- No regression rate (closed findings that were re-opened).
- No baseline drift chart — LCP on /checkout over 12 weeks. Without it, "performance is degrading" is an opinion.

## My top 3 complaints (direct, as if venting to a fellow senior QA)
1. I cannot actually block a release with this — "blocker" is a tag, not a gate. A dev can mark their own blocker "closed" and nobody is the wiser. That is not an audit tool, that is a suggestion box.
2. No evidence attachments. We are auditing an e-comm stack and I cannot attach a HAR, a screenshot, or a Lighthouse report. Every finding is going to be "he said / she said."
3. Snapshots, not trends. I can file that LCP is 4.2s today. I cannot show it was 2.8s last month. Without the trend, the engineering team will always argue it is a one-off.

## One feature that would make me LOVE it
Tie every audit finding to a named release candidate. Each release has a state — "open," "audit-locked," "shipped." Any finding marked blocker against an audit-locked release flips the release to "cannot ship" on the global dashboard until I — not the dev, not the PM — sign off on closure with a timestamped auditor signature. Closure requires a re-test note and an optional evidence attachment. Re-opened findings auto-increment a counter that feeds a per-dev quality score. That turns this screen from a bug list into the actual release gate, and my veto becomes a fact in the system instead of a Slack message.

## Audit evidence chain
- No artefact linkage (commit SHA / build ID / deploy timestamp) on findings — audits must be anchored to a specific build to hold up.
- No immutable history on status changes (who flipped open → closed, when).
- No attachment store for HAR / screenshots / scan output — evidence must live with the finding.
- No export for external review (PDF / CSV by release or date range).

## Gut-check score
- Authority (1-5): 2 — "Can I actually block a bad release with this?" — No. Blocker is a label; there is no lock on ship.
- Evidence quality (1-5): 2 — Structured fields per category is good; no attachments, no artefact linkage, no immutable trail drags it down.
- Trend visibility (1-5): 1 — It is a list of cards. No charts, no baselines, no week-over-week. Pure snapshot tool.
- Would I trust it for parity audits against legacy: No. Parity is a matrix, not a text field. I would need a legacy-feature checklist with 2.0 status per row before I would sign off on a cutover with this.
