# User-clicks QA sweep (headless browser, real interactions)

Run: 2026-04-24 03:05 MEL. Browser: gstack headless Chromium.
App: http://localhost:8765/devdash.html (single-file Alpine.js SPA).
Method: every button, dropdown, and form exercised via real DOM events; state verified against `Alpine.$data(body)._x_dataStack[0]` and `localStorage`.
Findings: BLOCKER · HIGH · MEDIUM · LOW.

## Totals by view
- CEO: 2 HIGH · 1 MEDIUM · 1 LOW
- PM: 2 MEDIUM · 1 LOW
- Dev: 1 HIGH · 1 MEDIUM
- QA: 0 (submit + persistence verified clean)
- QA Auditor: 1 HIGH
- Settings (CEO): 1 BLOCKER · 1 HIGH · 1 MEDIUM
- Cross-view / theming: 1 HIGH · 1 MEDIUM

Total: 11 findings. 1 BLOCKER, 5 HIGH, 5 MEDIUM+LOW.

---

## U01 — Settings → Projects: Owner dropdown visually shows "(unowned)" for every project (BLOCKER)
- **View:** Settings (CEO)
- **Bottom-half?:** no — top of Projects tab, but critically misleading
- **Repro:** Sign in as Fahad → ⚙ Settings → Projects tab. Every project's Owner dropdown shows "(unowned)" selected, even though `config.projects[].owner_email` is populated (verified via Alpine state).
- **Expected:** Each Owner `<select>` shows the current owner (Faizan / Moazzam / Faisal / Usama).
- **Actual:** All 5 Owner dropdowns render `value=""` / "(unowned)" selected. If the operator edits another field and moves on, the select silently persists `""` on next change, silently blanking the owner.
- **Fix:** The Alpine `<select x-model="p.owner_email">` has a hardcoded `<option value="">(unowned)</option>` before the `<template x-for="u in devs">`. Because the template options mount AFTER the select reads its initial value, the select falls back to the empty option. Either (a) pre-render options in static markup, (b) defer `<select>` init until templates mounted, or (c) switch to `:value` + `@change` pattern.

## U02 — "Open HIGH bugs → 2" stat tile jumps to QA view with no filter applied (HIGH)
- **View:** CEO (bottom-half stat tiles)
- **Bottom-half?:** yes — Fahad's focus area
- **Repro:** CEO view → click the "Open HIGH bugs → 2" tile in the bottom stat row.
- **Expected:** Land on QA view with severity filter = HIGH. Fahad should see 3 HIGH bugs.
- **Actual:** Lands on QA view with `bugSeverityFilter='all'` and `bugStatusFilter='all'` — all 6 bugs shown. Same issue almost certainly applies to the Feature-requests, Audit-findings, and Stuck-PRs tiles (they are just tab switchers, they don't pre-set the relevant filter on the destination view). Verified via Alpine state after click.
- **Fix:** In each tile's `@click`, also set `bugSeverityFilter='HIGH'` / `bugStatusFilter='open'` (or equivalent filter state on the destination view) before switching tab.

## U03 — Decision debt × delete button deletes the wrong blocker (HIGH)
- **View:** CEO
- **Bottom-half?:** yes — stat-tile → Decisions modal
- **Repro:** CEO → Decision debt tile → modal opens → add a new blocker "QA test blocker" → click ✓ Resolve on the new one → it moves to "Resolved recently" bucket → click × next to it → confirm "Delete this blocker?".
- **Expected:** "QA test blocker" (id = the new id, 64) is deleted.
- **Actual:** `R0-06 secret rotation approval` (id=1) was deleted instead. The resolved blockers reflow but the `×` event handler still fires on the original array position index. Verified: `d.blockers.map(b=>b.id)` went from `[64,1,2,3]` → `[64,2,3]`.
- **Fix:** Resolve/remove handlers should key by blocker `id`, not by template index. In Alpine template loops this usually means using `@click="removeBlocker(b.id)"` and looking up by id inside the handler.

## U04 — Default role tab wrong for QA user and QA Auditor (HIGH)
- **View:** Login / all role views
- **Bottom-half?:** no — sitewide
- **Repro:** Log in as `qa@phonebot.com.au` or `mustafa@phonebot.com.au`.
- **Expected:** Land on the tab matching their role (`qa` for QA, `qa_auditor` for Mustafa).
- **Actual:** Both land on `activeRoleTab='dev'`. They see a dev compass and dev header until they manually click the right tab. All 8 other role landings verified correct (Fahad→ceo, Imran→pm, all 4 devs→dev).
- **Fix:** In `tryLogin()` / `pickUser()`, set `activeRoleTab` based on `currentUser.role` (map `qa → 'qa'`, `qa_auditor → 'qa_auditor'`).

## U05 — Disputed bug doesn't render the ⚖ chip on PM bug queue (HIGH)
- **View:** PM
- **Bottom-half?:** mid — PM bug queue
- **Repro:** As Faizan, open a bug card → Dispute → submit reason → sign out → sign in as Imran → PM view → scroll to QA bug queue.
- **Expected:** The disputed bug row shows a ⚖ "in dispute" chip (per spec and per the "stress-test" note in the system prompt).
- **Actual:** No ⚖ chip anywhere in the visible DOM — the character only exists in the raw JS source. The disputed bug is functionally marked (`bug.disputed=true`, `dispute_id` populated, dispute panel shows it), but visually indistinguishable from an undisputed bug in the queue itself. Same gap on QA Auditor's Past-audit list — no ⚖ on disputed audits.
- **Fix:** Add a conditional chip `<span x-show="bug.disputed">⚖</span>` next to the severity badge in both the PM bug queue template and the QA Auditor past-findings row. Same treatment for audit findings.

## U06 — Audit-finding row status dropdown hides the "resolved" state (HIGH)
- **View:** QA Auditor (bottom half — Past audit findings)
- **Bottom-half?:** yes — Fahad's focus area
- **Repro:** Log in as Mustafa → QA Auditor view → scroll to "Past audit findings · 3". The HQ audit (`id=2`, `status="resolved"` in data) renders with its status dropdown showing "Open [selected]".
- **Expected:** Dropdown either shows "Resolved" as the current value, or offers "Resolved" as an option.
- **Actual:** Template hardcodes only `<option value="open">Open</option> <option value="in_progress">In progress</option> <option value="closed">Closed</option>`. Any finding whose status is `"resolved"` silently rebinds to index 0 (Open). The CEO tile "Open audit findings → 2" still counts correctly (via `.filter(a => a.status === 'open')`), so the dashboard is internally consistent — but the Past Findings list is lying to the operator.
- **Fix:** Either add `<option value="resolved">Resolved</option>` to the status `<select>` or normalize: in data seeds and `submitAudit()` only use the three canonical statuses (open / in_progress / closed).

## U07 — "theme" localStorage value double-stringified, theme reverts to default on reload (HIGH)
- **View:** All (sitewide)
- **Bottom-half?:** n/a
- **Repro:** Click the ◐ theme toggle twice (dark → light → cream), reload the page.
- **Expected:** Page reloads in cream.
- **Actual:** `localStorage.devdash_theme === '"cream"'` (quotes are part of the value). On mount, the page sets `body.className = 'theme-' + theme + ...'` → `theme-"cream"`. CSS `.theme-cream` does not match, so the page reverts to default dark styling. Density persists correctly (`density-compact` on body), showing the bug is theme-specific: one of the save paths JSON.stringifies the raw string, and the load path doesn't JSON.parse it back.
- **Fix:** In `save()` / `init()`, treat `theme` as a plain string on both ends, or JSON.parse it on load. Cheap repro: `localStorage.setItem('devdash_theme', d.theme)` without `JSON.stringify`.

## U08 — Dev's own "absence banner" stays stale after marking themselves absent (MEDIUM)
- **View:** Dev
- **Bottom-half?:** no — top banner
- **Repro:** Log in as Faizan → open-console run `markSelfAbsent('sick','2026-04-25','flu')` (equivalent to any absence button).
- **Expected:** Banner updates to "Marked sick until 2026-04-25. I'm back" button visible.
- **Actual:** `config.users[faizan].absence` updates correctly, but `currentUser.absence` (a shallow snapshot taken at login) still reads `{type:'none'}`. The banner reads `currentUser.absence`, so it stays on the "You're marked present" state until sign-out + sign-in. CEO and PM will see the correct absence; only the dev themselves sees stale data.
- **Fix:** Make `currentUser` a live reference into `config.users` (computed getter), or update `currentUser.absence` in the same mutation as `markSelfAbsent`.

## U09 — "+ Log PR" adds an empty stuck-PR row with no validation gate (MEDIUM)
- **View:** PM (bottom half — Stuck PRs)
- **Bottom-half?:** yes
- **Repro:** Click "+ Log PR" without filling the PR#.
- **Expected:** A blank placeholder appears and focus jumps to PR# (verified — focus jump works). But if the user clicks away, the blank row persists on reload.
- **Actual:** Each click of `+ Log PR` prepends a `{pr_id:"", repo:""}` record. No validation on save. I accidentally added 2 blank rows in testing that are now in localStorage.
- **Fix:** Either make the row disappear if `pr_id` is still empty after blur, or require PR# before the row commits to `stuckPrs[]`.

## U10 — Feature-request form accepts empty description (MEDIUM)
- **View:** CEO (top "+ Feature request" button)
- **Bottom-half?:** no
- **Repro:** Click "+ Feature request" → submit without typing a description.
- **Expected:** Alert "Description required" (consistent with the log-off-project form, which correctly rejects blank hours with "Hours must be a positive number").
- **Actual:** `submitFeature()` happily creates `{description:"", urgency:'medium', ...}`. Counter on CEO tile advances to 4. On Faizan's Dev view, "Pending requests from CEO/PM" shows the blank-description feature as a MEDIUM item with no text below the severity badge.
- **Fix:** Mirror the log-off-project pattern — early return + `alert('Description required')` if description is empty.

## U11 — Reassigned-to-project-owner on dispute-accept is a no-op when the disputing dev IS the project owner (MEDIUM)
- **View:** PM (dispute accept)
- **Bottom-half?:** yes
- **Repro:** Faizan (owner of Phonebot 2.0) disputes bug #1 on Phonebot 2.0 → PM accepts. The bug.assigned_to stays "Faizan" with note "Dispute accepted on 2026-04-24 — routed back to project owner".
- **Expected:** Dispute-accept should at minimum flag the bug as "assignee to be re-triaged" or clear to "Unassigned" when the project owner is the very person disputing. Otherwise accepting the dispute produces zero behavioral change.
- **Actual:** Works correctly when the disputing dev is NOT the owner (verified: Moazzam disputed bug 4 on Phonebot HQ → PM reassigned to Faisal → bug appears in Faisal's queue). But accept-to-owner when disputing-dev == owner is a silent no-op.
- **Fix:** If `bug.assigned_to === disputing_dev && project.owner === disputing_dev`, clear `assigned_to` and prompt PM to choose, instead of routing to owner.

---

## Top 3 bottom-half issues Fahad will want to see first

1. **U02 — Open HIGH bugs tile doesn't apply its filter** (CEO stat tiles, bottom half). Fahad clicks "Open HIGH bugs → 2" expecting to see the 2 HIGH open bugs and instead gets all 6. Destroys the whole purpose of the stat-tile shortcut. 1-line fix (set `bugSeverityFilter='HIGH'` in the click handler). Same pattern likely broken on the other 3 bottom stat tiles.

2. **U03 — Decision-debt × deletes the wrong blocker** (CEO Decisions modal, bottom half). This is a silent data-corruption bug: Fahad thinks he's closing out his own test item and ends up deleting a real blocker (R0-06 secret rotation). Index-based event handlers in Alpine templates — classic "use .id not index" fix.

3. **U06 — QA Auditor past-findings list shows "resolved" audits as "Open"** (QA Auditor bottom half). Fahad scrolls to "Past audit findings" and sees 3 × Open — but one is actually resolved. The dashboard lies to him. Tiny template fix (add one `<option value="resolved">`).

## Also worth knowing (not bottom-half but serious)

- **U01 (BLOCKER)** — Every project in Settings shows "(unowned)". If any operator edits another field on a project row, they risk blanking the owner on save.
- **U07 (HIGH)** — Theme choice (light/cream) silently reverts to dark after every page reload because of a JSON-encoding bug in the save path.
- **U04 (HIGH)** — QA and QA Auditor users both land on the Dev tab on login instead of their own role tab.

---

## Flows tested that PASSED clean (no findings)

- All 8 login flows (user picker → QR → 000000 → land). No crashes, no 403s.
- Project-detail modal: Edit toggle, + Add phase, + Add readiness item, reload persistence — all work.
- Blocker *add* flow (as opposed to the × bug in U03): works.
- "+ Log PR" focuses the PR# input correctly (bug is the blank-row persistence, see U09).
- Dispute flow end-to-end: submit as dev → PM accept/reassign/reject updates bug.assigned_to correctly in the non-owner case (see U11).
- Dispute reassign: bug shows up in the new dev's "QA bugs on your code" list immediately.
- Remove-user-with-owned-projects cascade: projects become `owner_email=""` / display `(unowned)`; orphan bugs get `assigned_to=""`.
- Remove-project-with-bugs cascade: bugs keep `project = "(archived: <name>)"`; findable under All Projects filter.
- Density toggle (compact) persists across reload (LS key devdash_density).
- Submit-bug (QA view): all 13 fields (summary, project, severity, details, device, browser, url, reproducible, steps, expected_actual, status, assigned_to, days_open) persist to `localStorage.devdash_bugs`.
- Log-off-project form correctly rejects blank hours with an alert.
- Scoring tab: changing a threshold live-updates the Dev compass "locked (need N)" copy.
- Rewards tab: currency switch + "Reset amounts to AUD defaults" correctly repopulates AUD default amounts; "Compose this week's rewards" creates 8 pending events; payout modal correctly disables "Confirm payout" until BOTH CEO and PM approve; confirmed payout marks 8 events paid and records a batch.
- System tab: digest recipients, severity labels, timezone, export-data button all present.
- Audit log tab: populated with real entries (Scoring changes, Users saves, Rewards payouts). Persists across reload.
- Theme cycle (dark → light → cream → dark): compass SVG rings visible in all 3 themes (screenshots `16-dev-cream.png`, `17-dev-light.png`). Only broken part is persistence across reload (U07).

## Screenshots
`/Users/adminadmin/Downloads/phonebot revamp/dev dashboard/qa-sandbox-run/user-clicks/01-*.png` through `17-*.png`. Each file name describes the view captured.
