# devdash integration bug sweep

Found 14 bugs. Prioritised: BLOCKER (ship-stopping) · HIGH · MEDIUM · LOW.

Methodology: traced every mutation method at devdash.html:2806-3269 against the consumers (display/filter/count helpers and `x-for`/`x-text` bindings) to confirm that state actually propagates. Flagged only places where a mutation fails to flow through to a surface that claims to reflect it, or where a surface reads state that never gets written.

---

## I01 — `regressionCandidates` never loaded from localStorage (HIGH — data loss)
- **Trigger:** CEO/PM adds or confirms a regression via `addRegression()` (line 2817) or the inline edits at lines 766/773/774.
- **Expected side effect:** Regression persists across reloads (every other array in the same file does — bugs, auditFindings, featureRequests, blockers, stuckPrs, disputes, pmAssessments).
- **Actual behavior:** `save('regressionCandidates')` writes the value to `localStorage.devdash_regressionCandidates`, but the bootstrap loop at line 2551 only reads back `['bugs','auditFindings','featureRequests','config','clockEntries','blockers','stuckPrs','disputes','pmAssessments']`. `regressionCandidates` is missing from the list, so on every reload the array resets to the two hardcoded seeds and every confirmed/edited/added regression is silently discarded.
- **File:line:** devdash.html:2551 (bootstrap list), 2817 (addRegression), 766-774 (inline edits).
- **Fix:** Add `'regressionCandidates'` to the init() bootstrap array at line 2551.
- **Test to verify fix:** Click `! confirm` on a regression, reload, verify `status: 'confirmed'` persists.

## I02 — `auditLog` is never persisted AND never restored (HIGH — compliance-log evaporation)
- **Trigger:** `saveConfig()` (line 2600) and `logSickRetro()` (line 3220) both `unshift` entries into `this.auditLog`.
- **Expected side effect:** Settings audit log is a compliance surface ("who changed what, when") — needs to survive reloads.
- **Actual behavior:** `auditLog` is initialised inline at line 2522 with 3 seed entries. No `save('auditLog')` call anywhere, and `'auditLog'` is absent from the init() bootstrap at line 2551. Every edit Fahad or Imran makes via Settings is gone the moment the tab is closed.
- **File:line:** devdash.html:2522 (state), 2600, 3220 (unshifts), 2551 (missing from bootstrap).
- **Fix:** Add `this.save('auditLog')` after each `unshift`, and add `'auditLog'` to the bootstrap array.
- **Test to verify fix:** Change any settings field, reload, confirm entry still in audit log table.

## I03 — Removing a user orphans their bugs, features, project ownership, disputes, audits (BLOCKER — cascading referential rot)
- **Trigger:** CEO/PM clicks `×` on a user row in Settings → `config.users.splice(idx, 1)` at line 1681.
- **Expected side effect:** Any state that references the removed user by email or displayName gets reconciled (reassigned, cleared, or at least surfaced as broken).
- **Actual behavior:** The splice removes only the user entry. Every downstream reference continues pointing at a dead name/email:
  - `bugs[n].assigned_to` (displayName) — bug still "assigned to Faizan", dev dropdown (line 1379) no longer contains Faizan so the select shows blank.
  - `featureRequests[n].target_dev` (displayName) — `featureRequestsForDev()` can never match again; orphan request is invisible.
  - `project.owner_email` — `ownerName()` returns '(unknown)'; `suggestDevForBug()` returns 'Unassigned' for that project's new bugs.
  - `project.contributor_emails[]` — stale email stays; `contributorsOf()` silently filters it out, hiding the referential error.
  - `disputes[n].dev` — dispute keeps the ghost dev's name; reassign dropdown (line 818) no longer contains them.
  - `auditFindings[n].assigned_to` (email) and `cc[]` — TO label renders via `userNameByEmail` which falls back to the raw email.
- **File:line:** devdash.html:1681.
- **Fix:** Replace the inline splice with a `removeUser(idx)` method that (a) nulls owner_email on projects, (b) removes from contributor_emails, (c) reassigns their bugs/features back to project owner via `suggestDevForBug()`, (d) marks disputes/audits as orphaned (`assigned_to: ''`), (e) then splices.
- **Test to verify fix:** Remove Faizan (owner of pb2 + leg). Verify pb2 now shows '(unowned)', bugs 1,2,6 are reassigned or cleared, featureRequest #1 shows unassigned.

## I04 — Removing a project orphans bugs / audits / feature requests referencing its name (HIGH)
- **Trigger:** CEO deletes a project via `removeProject(idx)` (line 3082).
- **Expected side effect:** Bugs/audits/feature requests either migrate, archive, or surface as orphaned.
- **Actual behavior:** The splice deletes the project record. `bugs[n].project`, `auditFindings[n].project`, `featureRequests[n].project` all still carry the deleted project *name string*. `filteredBugs()` filters by the project-id lookup → name (line 2713), so the bugs still appear under "All Projects" but cannot be filtered via any tab (the tab is gone). They survive as ghost data and will appear in counts like "HIGH bugs open" for no visible project.
- **File:line:** devdash.html:3082.
- **Fix:** On project removal, either confirm+delete related bugs/audits/features, or migrate them to a "(archived)" placeholder project.
- **Test to verify fix:** Delete "Product Page Revamp"; verify PDP stock banner bug (bug id 3) is either removed, archived, or flagged orphaned.

## I05 — Audits assigned to a dev never surface on that dev's view (HIGH — broken assignment UX)
- **Trigger:** QA Auditor submits an audit via `submitAudit()` (line 3125) with `newAudit.assigned_to = <email>` selected (dropdown at line 1499 binds email).
- **Expected side effect:** The TO dev sees "Audits on your code" on their own dev view (symmetric with "QA bugs on your code this week" at line 1227).
- **Actual behavior:** The dev view has `bugsForDev(displayName)` (line 2792) but no equivalent `auditsForDev(...)`. Audits are only visible in the QA Auditor tab. Devs are told by the form they've been routed an audit, but they'll never see it unless they navigate into the QA Auditor view (which, by VISIBILITY line 2623, they can).
- **File:line:** devdash.html:3125 (submitAudit), 1225 (dev view bug panel — no audit counterpart).
- **Fix:** Add `auditsForDev(email)` returning `this.auditFindings.filter(a => a.assigned_to === email || (a.cc||[]).includes(email))` and mirror the "QA bugs on your code" card on the dev view.
- **Test to verify fix:** Auditor submits audit TO=faizan, CC=moazzam. On Faizan's dev view, audit appears; on Moazzam's, appears as CC.

## I06 — `submitOffProject()` silently no-ops for devs not in `devMockData` (HIGH — reliability scoring corruption)
- **Trigger:** Any dev whose email isn't hardcoded into `devMockData` (line 2423) logs off-project work via the modal at line 1899.
- **Expected side effect:** Hours are added to the team off-project total; PM sees the drain on the CEO/PM briefing.
- **Actual behavior:** `submitOffProject()` at line 3240 is wrapped in `if (this.devMockData[this.currentUser.email])`. Currently seeded: faizan, moazzam, faisal, usama. Faisal-the-dev is fine, but Mustafa (qa_auditor) has a dev role exception? No — but any dev added via `addUser()` (line 3083) OR any future dev who isn't in the seed map gets ZERO feedback: form closes, newOffProject resets, nothing saved. `teamOffProjectHours()` will never reflect their drain and the PM's "team burned Xh" line (line 2938, `pmSummaryHtml`) under-reports.
- **File:line:** devdash.html:3240-3246.
- **Fix:** Either (a) initialise `devMockData[email] = this.emptyDev()` on `addUser()` and in the guard of `submitOffProject()`, or (b) move off_project_hours off of the mock and onto a per-user persisted field.
- **Test to verify fix:** Click "+ Add new user", log in as that user, log 5h off-project, confirm PM view shows 5h extra in team burned total.

## I07 — `resetConfigToDefaults()` only clears one of six localStorage keys (MEDIUM — "reset" button lies)
- **Trigger:** CEO clicks "Reset to defaults" in Settings → `resetConfigToDefaults()` at line 2592.
- **Expected side effect:** Dashboard returns to a clean-slate state (message in confirm() promises "clears projects, users, scoring, rewards — but not handoff notes, bugs, or audit findings").
- **Actual behavior:** Only `devdash_config` is removed. These keep the previous session's state and contaminate the "reset":
  - `devdash_theme`, `devdash_density` — persist cosmetic state (low impact).
  - `devdash_session` — user stays logged in against a freshly re-seeded config they may no longer exist in (if the pre-reset config had a custom user).
  - `devdash_provisioned_<email>` keys — stale provisioning flags; user who was removed-then-re-added has a pre-provisioned flag.
  - `devdash_blockers`, `devdash_stuckPrs`, `devdash_disputes`, `devdash_pmAssessments`, `devdash_clockEntries` — all unrelated to "handoff notes, bugs, audit findings" but NOT cleared either. Confirm message is misleading.
- **File:line:** devdash.html:2592-2596.
- **Fix:** Either (a) explicitly list keys to clear (session + provisioned_* so the user is logged out and re-provisioned against fresh config), or (b) update the confirm() message to truthfully list what is and isn't reset.
- **Test to verify fix:** Remove Fahad, add a replacement CEO, reset to defaults. Verify behavior matches the confirm() text.

## I08 — Reassigning a dispute allows reassignment to currently-inactive dev (MEDIUM)
- **Trigger:** PM picks a dev from the "Reassign to…" dropdown at line 818 → `reassignDispute(id, newDev)`.
- **Expected side effect:** Only currently-active devs appear as options (matches bug-assignee dropdown at line 1379 which filters `status === 'active'`).
- **Actual behavior:** Line 818 filters only `role === 'dev' && displayName !== d.dev`. A dev whose status was set to 'inactive' in Settings is still in the list, and reassigning a dispute to them sets `bug.assigned_to` to a name that will never appear in the normal bug-assignee dropdown or in `devs` (which also filters status). The bug becomes stuck on an inactive assignee.
- **File:line:** devdash.html:818.
- **Fix:** Add `&& x.status === 'active'` to the filter.
- **Test to verify fix:** Set Usama to inactive, file a dispute as Faizan, verify Usama is absent from the reassign dropdown.

## I09 — `markSelfAbsent` does not remove dev from assignee dropdowns / feature-request target list (MEDIUM)
- **Trigger:** Dev marks themselves sick/vacation via the buttons at line 881-884.
- **Expected side effect:** QA submitting a new bug during the dev's absence won't auto-route to them; PM filing a feature request won't target them; at minimum the assignee dropdown shows the absence state.
- **Actual behavior:** `markSelfAbsent` only updates `user.absence`. The bug-assignee dropdown (line 1379), the feature-request target_dev select (line 1893), and `suggestDevForBug()` (line 2961 — picks by project owner regardless of absence) all continue to hand work to the absent dev. The PM view dev-card shows an absence badge (line 646) but the work-routing surfaces do not.
- **File:line:** devdash.html:3203, 2961 (suggestDevForBug), 1379, 1893.
- **Fix:** Either skip absent owners in `suggestDevForBug()` (fall through to a contributor) or render "(on vacation until X)" next to the displayName in assignee dropdowns.
- **Test to verify fix:** Mark Faizan on vacation, submit a Phonebot 2.0 bug from QA view, verify it doesn't land on Faizan OR displays a visible warning.

## I10 — `resolveDispute(id, 'accepted')` does not reopen / reroute the bug — it just clears the assignee (MEDIUM)
- **Trigger:** PM accepts a dispute ("dev is right") via line 814.
- **Expected side effect:** The bug should either (a) go back to triage for reassignment, (b) be closed as invalid, or (c) be re-routed to the project owner. At minimum the bug's `status` should move off `in_progress`.
- **Actual behavior:** `resolveDispute` at line 2822 clears `bug.assigned_to = ''` but leaves `bug.status` unchanged (still `open` or `in_progress`). The bug appears in "Bugs submitted" with an empty assignee field, invisible to every `bugsForDev(name)` call (no dev has name `''`). The bug becomes ownerless and fails to reappear in any PM-facing "needs triage" surface because no such surface exists.
- **File:line:** devdash.html:2822-2836.
- **Fix:** On `outcome === 'accepted'`, either set `bug.assigned_to = this.suggestDevForBug(bug.project)` (auto-route back to project owner) or introduce a `status: 'needs_triage'` and surface those in QA view.
- **Test to verify fix:** Dispute + accept the bug currently assigned to Usama; verify it routes back to Usama (project owner) or appears in a triage queue.

## I11 — Compass SVGs have hardcoded `rgba(255,255,255,...)` + `#0b0d13` colours that break light/cream themes (MEDIUM — cosmetic but visible)
- **Trigger:** User clicks theme toggle → `cycleTheme()` at line 3278 switches between dark/light/cream.
- **Expected side effect:** The compass rings, axes, threshold marker, and value-dot strokes all switch to theme-appropriate colours (the `--border`, `--border-strong`, `--bg-soft` variables exist for this).
- **Actual behavior:** 22 call-sites use `rgba(255,255,255,...)` directly for rings/axes, and value-dot strokes use literal `#0b0d13` (dark-theme background). In light or cream theme the rings become near-invisible white lines on a near-white background, and the value dots get an aggressive dark ring that looks pasted on.
- **File:line:** devdash.html:629-633 (PM mini-compass), 935-950 (dev-view big compass), 1268-1269 (dev picker mini-compasses).
- **Fix:** Replace hardcoded rgba with `var(--border)` / `var(--border-strong)` and replace `stroke="#0b0d13"` with `stroke="var(--bg-soft)"`. The CSS vars already differ per theme.
- **Test to verify fix:** Toggle to cream theme and compare compass legibility side-by-side with dark.

## I12 — `class="pulse"` on live clock-in indicator references a non-existent CSS rule (LOW)
- **Trigger:** Dev clocks in → UI renders `<span class="dot dot-green pulse"></span>` at line 303.
- **Expected side effect:** The green dot pulses while the user is clocked in, conveying live state.
- **Actual behavior:** No `@keyframes pulse` and no `.pulse` rule exists in the file (only `antenna-pulse`, `clockpulse`, `decision-inbox-pulse`). The dot is static.
- **File:line:** devdash.html:303.
- **Fix:** Either define `.pulse { animation: clockpulse 2s ease-in-out infinite; }` (reuse existing keyframe) or drop the class.
- **Test to verify fix:** Clock in as a dev, observe the dot animating.

## I13 — `submitDispute` sets `dispute.dev = currentUser.displayName` but PM dispute card + reassign dropdown trust it as the originally-assigned dev (LOW — edge case)
- **Trigger:** PM (role `pm`) opens a dev's view via `devViewSelected` and clicks "Dispute" on a bug attributed to that dev → `submitDispute()` at line 3255 stores `dev: this.currentUser.displayName` (= the PM's name).
- **Expected side effect:** The dispute records the *disputing party*, which for devs disputing their own bugs happens to also be the assignee — so it collapses into a useful value. But the PM using the dispute flow on behalf of a dev records the PM's name, breaking the reassign dropdown's filter at line 818 (`x.displayName !== d.dev`) — it would exclude the PM from the reassign list even though the PM isn't actually the assignee.
- **File:line:** devdash.html:3255.
- **Fix:** Either (a) scope the Dispute button to only the assignee of the item (hide from PM), or (b) record `dev: bug.assigned_to` at the point of dispute so the PM view's "reassign to anyone except the currently-attributed dev" logic is correct.
- **Test to verify fix:** As Imran (PM) viewing Faizan's dev page, dispute bug #1 (assigned to Faizan). Reassign dropdown on that dispute should exclude Faizan, not Imran.

## I14 — `pmSummaryHtml()` decision-count is project-scoped but the CEO tile + mascot always use the unscoped `pendingOnCeo()` (LOW — inconsistency)
- **Trigger:** PM filters to a single project → `pmSummaryHtml()` at line 2894 narrows decisions to `b.project === proj?.name || !b.project`; meanwhile, the CEO decision-debt tile (line 523, 528) and the mascot ticker (line 3395) keep calling the unscoped `pendingOnCeo()`.
- **Expected side effect:** When a project is selected, all decision-counters on screen should show the same number (project-scoped), or they should all be unscoped. Mixing the two across the same viewport is jarring.
- **Actual behavior:** PM briefing says "2 decisions waiting on Fahad for this project"; the decision-inbox pill top-right still says "5". Both numbers are correct, but the inconsistency invites trust loss ("which one is right?").
- **File:line:** devdash.html:411-417 (nav pill), 523-534 (CEO tile), 3395 (mascot), 2893-2895 (scoped calc in pmSummaryHtml).
- **Fix:** Refactor into a single `pendingOnCeo(projectName?)` that accepts an optional scope arg, have all call sites pass `this.activeProject === 'all' ? null : currentProj?.name`.
- **Test to verify fix:** Select "Phonebot 2.0" tab, verify mascot + decision-inbox + CEO tile + PM briefing all agree.
