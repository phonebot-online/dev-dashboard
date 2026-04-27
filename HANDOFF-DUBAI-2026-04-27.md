# Handoff — Sydney iMac → Dubai iMac
**Written:** 2026-04-27 · **Repo:** github.com/phonebot-online/dev-dashboard

## TL;DR for Dubai iMac
Just clone and resume:
```bash
cd ~/Downloads
git clone https://github.com/phonebot-online/dev-dashboard.git
cd dev-dashboard
```
GitHub `main` is now the source of truth. The Sydney iMac's working tree was 3-way merged into it on 2026-04-27; nothing on the Sydney side was lost.

## What landed in commit `de5d8b4`
Single sync commit on top of `3ef1124`. Includes:

### Code (hardening fixes that lived only on Sydney)
- `worker/src/email.ts` — **L17 FIX**: AbortController 10s timeout for MailChannels so a hung socket doesn't burn the Worker's CPU budget.
- `worker/src/totp.ts` — **L16 FIX**: corrected base64url padding (`(4 - len%4) % 4` instead of over-padding), 28-byte minimum length check, decrypt error includes user email for debugging.
- `scripts/dashboard/git_sync.py` — **L05 FIX**: tz-aware "today" slug via `ZoneInfo`, so the Melbourne/Karachi cron output isn't off-by-one when the runner is UTC.

### `devdash.html` — 3-way merge (ancestor 778008f)
All 31 fix labels preserved. Both sides' work is now in one file:
- Sydney-only fixes pulled in: **L07, L12, L13, L14, U04, U07, U08, U09, U10, U11**
- GitHub-only fixes preserved: **C2, H4, H5, HONESTY, M1, SYS** (the Apr 25 hardening pass)

12 conflicts resolved by hand. Notable resolutions:
| Conflict | Resolution |
|---|---|
| Project Owner dropdown | Kept Sydney's `:selected` per-option pattern (U01 BLOCKER fix, QA-verified) over the `setProjectOwner()` helper from the GitHub side. |
| localStorage persistence list | Kept BOTH `aiInsightsCache` and `devMockData`. |
| `_idCounter` (L14) vs `_inFlight` (M1) | Kept BOTH — they're independent properties. |
| Reward composition (compose/teamPool) | Took the GitHub side wholesale because it adds GROWTH-1 / OWNER-1 / POOL-1 logic the Sydney side doesn't have. The local function-scoped `let nextId` counter is a separate concern from the global L14 `nextId()` — both kept. |
| `addBlocker`, `addRegression`, `submitFeature`, `submitOffProject`, `submitPmAssessment` | Composed: kept `_guard()` from GitHub + `this.nextId()` from Sydney + each side's per-handler validation/persistence. |

Sanity checks passed: 0 conflict markers, 968 `{` / 968 `}`, 214 `<template>` / 214 `</template>`, 3 real `<script>` tags balanced.

### Docs and QA evidence
- `MORNING-BRIEF-2026-04-25.md`, `offboarding-runbook.md` — Sydney-only docs.
- `qa-sandbox-run/` — full directory: 27 screenshots from QA personas + `user-clicks-qa.md` + `user-clicks-verify/` subfolder with the U01–U11 verification screenshots.

### Things deliberately NOT pushed
- `.pytest_cache/`, `.DS_Store`, `output/` — build artifacts / OS junk.
- The Sydney parent repo's `.git/` history (the parent repo at `/Users/adminadmin/Downloads/phonebot revamp/` tracked dev-dashboard files at the wrong path level — see *Why we didn't reuse the Sydney repo* below).

## Repo layout you'll see in Dubai
```
~/Downloads/dev-dashboard/      # the cloned repo, root-level files
├── devdash.html                # the merged SPA
├── README.md
├── CHANGELOG.md                # has Apr 25/26 hardening + needs Apr 27 sync entry (see Open Items)
├── dashboard.config.yaml
├── users.yaml
├── scripts/dashboard/*.py
├── tests/dashboard/*.py
├── worker/src/*.ts
├── qa-sandbox-run/
└── HANDOFF-DUBAI-2026-04-27.md   ← this file
```

## Open items for Dubai session

1. **Smoke-test the merged `devdash.html`.** Open it in a browser and walk through each role tab. Specifically verify:
   - Settings → Projects: Owner dropdown renders correctly (U01 BLOCKER fix).
   - Settings → System: "Wipe ALL dashboard data" button works (HONESTY FIX).
   - PM bug queue: disputed bugs show ⚖ chip (U05).
   - Audit status dropdown has "resolved" option (U06).
   - Theme persists correctly across reloads in cream/light (U07).
   - Off-project hours survive reload (C2 FIX × U08 — both fixes touch this area).
   - Submit-feature requires non-empty description (U10) AND is single-flight (M1).
   - Reward events fire growth/owner/pool bonuses on the right thresholds (GROWTH-1 / OWNER-1 / POOL-1).

2. **Update CHANGELOG.md** with a 2026-04-27 entry summarizing this merge sync (currently the CHANGELOG stops at the 2026-04-25/26 hardening pass).

3. **The `setProjectOwner()` helper** referenced in the GitHub-side owner-dropdown — I kept the Sydney version of the dropdown since U01 BLOCKER was QA-verified, but if `setProjectOwner()` is referenced anywhere else in the file it will be a dead reference. Grep `setProjectOwner` and remove the helper if it's now orphaned, OR re-thread the dropdown through it if it does extra work the Sydney version doesn't.

4. **pytest run.** Sydney side reported 58/58 green. From Dubai: `cd dev-dashboard && pip install -r requirements.txt && python -m pytest tests/`.

5. **AWS deploy.** Pre-launch hardening is the reason the GitHub side made the C2/H4/H5/HONESTY/M1/SYS fixes. The bundle is now ready; deploy step is whatever the README/operator-guide describes.

## Why we didn't reuse the Sydney repo

The Sydney working dir is at `/Users/adminadmin/Downloads/phonebot revamp/dev dashboard/` but its enclosing git repo is rooted one level up at `/Users/adminadmin/Downloads/phonebot revamp/`. Tracked paths look like `dev dashboard/scripts/...`. The GitHub repo's tracked paths are root-level (`scripts/...`). The two histories cannot be merged with a normal `git merge --allow-unrelated-histories` because the path prefixes don't match.

So instead: cloned GitHub fresh as a sibling (`/Users/adminadmin/Downloads/phonebot revamp/dev-dashboard-repo/`), copied the Sydney working-tree changes into it, did the 3-way devdash.html merge, committed, pushed. The Sydney parent repo still has its 23-commit local history if you ever need to inspect it, but it's no longer the source of truth.

For Dubai: just clone fresh from GitHub. Don't try to reproduce the parent-repo layout.

## Files changed in `de5d8b4`
```
M  devdash.html                              (3-way merged, +422/-77 vs GitHub HEAD)
M  scripts/dashboard/git_sync.py             (+18/-2 — L05 FIX)
M  worker/src/email.ts                       (+24/-9 — L17 FIX)
M  worker/src/totp.ts                        (+34/-9 — L16 FIX)
A  MORNING-BRIEF-2026-04-25.md
A  offboarding-runbook.md
A  qa-sandbox-run/01-login.png … 70-past-audits-after-fix.png   (17 persona screenshots)
A  qa-sandbox-run/user-clicks-qa.md
A  qa-sandbox-run/user-clicks-verify/*.png   (10 verification screenshots)
A  qa-sandbox-run/user-clicks/*.png          (17 click-through screenshots)
```

## If something looks wrong on Dubai
- `git log --oneline -5` should show `de5d8b4 sync: merge local Apr 24...` at the top.
- The merge ancestor was clone commit `778008f` (Initial commit). If you want to re-derive any conflict resolution, that's the base.
- The Sydney parent repo at `/Users/adminadmin/Downloads/phonebot revamp/` is still on disk on the Sydney machine (not pushed anywhere) — it has the original development history if you ever need to reconstruct intent.
