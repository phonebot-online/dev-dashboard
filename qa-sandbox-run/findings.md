# devdash — Sandbox click-through findings

Logged-in user: Fahad (CEO) · URL: http://localhost:8765/devdash.html · Session: 2026-04-24 evening

Findings numbered F001+. Each finding: what I clicked, what I expected, what actually happened, severity (blocker / high / medium / low / nit), fix proposed.

---

## F001 — Density toggle doesn't persist across reload (MEDIUM) — FIXED
- **What I did:** `a.density = 'compact'` → class updated to `density-compact` correctly.
- **Then:** checked `localStorage.getItem('devdash_density')` → returned `null`.
- **Expected:** density to persist the same way theme does.
- **Fix applied:** added `savedDensity` read on init + `$watch('density', v => localStorage.setItem('devdash_density', v))`. Re-verified: reload → `density='compact'` restored, body class `theme-light density-compact`. ✅

## F003 — PM Monday morning briefing respects project filter — VERIFIED
- **Test:** set `activeProject = 'pb2' / 'hq' / 'mob'` and called `pmSummaryHtml()`.
- **pb2 scope:** `"On Phonebot 2.0 — at risk at 42% · forecast ..."` ✅
- **hq scope:** `"On Phonebot HQ — on track at 58% · forecast May 18..."` ✅
- **mob scope:** `"On Mobile App MVP — at risk at 22% · forecast ..."` ✅
- **all scope:** `"Three things on the table today — starting with Legacy Maintenance"` — portfolio-wide wording correctly returns ✅.
- Earlier Fahad-flagged bug (briefing said "Legacy Maintenance" while filtered to Phonebot 2.0) is now fixed + confirmed end-to-end.

## F007 — Dispute submission does NOT flag the bug as disputed (HIGH)
- Dev clicks Dispute on a bug → dispute row created in `disputes[]` — fine.
- The bug itself is UNTOUCHED: `bug.disputed = no flag, bug.dispute_id = none`. UI has no "⚖ in dispute" chip.
- Consequence: nobody looking at the bug list knows it's being disputed.
- Fix: `submitDispute()` must set `bug.disputed = true, bug.dispute_id = <id>` and render a chip on the bug card.

## F008 — QA + QA Auditor have zero visibility into disputes (MEDIUM)
- Only PM view shows "Open disputes from devs" card.
- QA who filed the bug has NO way to see if a dev disputed their attribution.
- QA Auditor who filed an audit has NO way to see if a dev disputed their finding.
- Fix: add "Disputes on items you filed" card to QA + QA Auditor views (read-only, shows dev + reason + PM outcome).

## F009 — Accepting a dispute does NOT clear the bug's assigned_to (HIGH)
- PM clicks ✓ Accept (meaning "dev is right, attribution was wrong").
- `dispute.status = 'accepted'` set correctly ✅
- But `bug.assigned_to` still equals the disputing dev's name.
- Consequence: bug stays on disputing dev's "QA bugs on your code" list forever.
- Fix: when `outcome === 'accepted'`, clear `bug.assigned_to = ''` and `bug.disputed = false`.

## F010 — Reassigning a dispute does NOT move the bug to the new dev (HIGH)
- PM reassigns dispute to Usama.
- `dispute.dev = 'Usama', dispute.reassigned_from = 'Faizan', dispute.status = 'reassigned'` set correctly ✅
- But `bug.assigned_to` stays 'Faizan'.
- Check: `onFaizan: 1 bug, onUsama: 0 bugs` → totally wrong.
- Fix: when reassigning, update `bug.assigned_to = newDev` + clear `bug.disputed`.

## F004 — Dispute flow end-to-end (real button clicks) — VERIFIED (but with F007-F010 gaps above)
- Dev clicks `Dispute` on a commit card → modal opens with `type/itemId/itemLabel` pre-populated ✅
- Fill `reason` + `submitDispute()` → modal closes, dispute in `disputes[]` with `status='open'` ✅
- PM view shows disputes card, `✓ Accept` button visible ✅
- Click Accept → `status='accepted', resolved_by='Fahad'` ✅
- Reject / Reassign buttons wired the same way (verified via JS earlier)

## F005 — Settings CRUD + scoring threshold propagation — VERIFIED
- Add project via Settings → Projects → new row appears, `removeProject()` cleans up ✅
- Add user → `pendingQrEmail` populated, auto-QR card shows on Users tab ✅
- Change `config.scoring.directions.velocity.threshold` 75 → 80 → Faizan velocity 78 no longer in `strongDirections()` ✅ (threshold from Settings flows to live scoring logic)
- Rewards currency PKR → USD → `resetRewardAmounts()` sets USD-appropriate amounts (pool=1500 USD), restored to PKR after ✅
- Theme cycle (dark → light → cream → dark) ✅
- Clock-in / Clock-out buttons work, `clockEntries[todayKey()]` records start+end ✅
- Log off-project modal → submit → devMockData off_project_hours increments ✅
- Sign out → `currentUser = null`, session cleared ✅

## F006 — Scope_in edit via UI input (not JS dispatch) — VERIFIED
- Earlier failed test was a bad test (JS synthetic events don't trigger Alpine x-model write-back).
- Real keyboard fill via `$B fill @e31 ...` persisted correctly: modified in memory, persisted through close/reopen, persisted to localStorage. ✅

## F002 — Reset-to-defaults button correctness — VERIFIED
- **Test:** Mutated `projects[0].name = 'MUTATED NAME'`, `percent_complete = 99`. Seeded bugs + audits + a dispute.
- **Action:** called `resetConfigToDefaults()` with `dialog-accept` on the confirm.
- **Post-reset state:** project name back to 'Phonebot 2.0', percent back to 42 ✅; 7 bugs preserved ✅; 4 audits preserved ✅; 1 dispute preserved ✅. Matches Danger-zone button's contract exactly.

## F002 — Confirmed working (no action)
- Decisions modal open/close + state reset ✅
- Project detail modal open + edit toggle + close + state reset ✅
- Bug form: all 11 fields (device/browser/url/reproducible/steps/expected_actual/details) persist to `devdash_bugs` localStorage ✅
- Audit form: OWASP + risk + CC[] multi-recipient all persist to `devdash_auditFindings` ✅
- Feature request: accept + ETA + thread chain all persist ✅
- Dispute resolve: sets status + resolved_at + resolved_by ✅
- Per-project compass: Faizan HQ {68,95,57,91} vs MOB {65,91,44,72} — deterministic per (dev, project) ✅
- Contributor multi-select: toggleContributor → project.contributor_emails updates → sortedDevsForPm() returns new dev ✅
- Absence flow: set on user → appears in CEO "Out today" callout ✅
- Auto-QR: addUser() → pendingQrEmail set → qrUrlFor() returns valid otpauth URL ✅
- Theme persistence: localStorage.devdash_theme = 'light' survives reload ✅
- Bugs + audits + featureRequests + disputes + blockers + stuckPrs + regressionCandidates all preserved after reload ✅

