# devdash language-specific QA sweep

Stack covered: Alpine.js + JS frontend (`devdash.html`), Python engine (`scripts/dashboard/*.py`), TypeScript Worker (`worker/src/*.ts`).
Scope: bugs + data-integrity flaws. Cyber security explicitly OUT.
Found 18 bugs. Severity split: BLOCKER 4 · HIGH 7 · MEDIUM 5 · LOW 2.

---

## L01 — `git_sync.run_sync` calls undefined `load_config` — nightly cron dies every time (BLOCKER)
- **Language:** Python
- **Location:** `scripts/dashboard/git_sync.py:25,96`
- **What's wrong:** The module imports `load_dashboard_config` (line 25) but calls `load_config(config_path)` at line 96. `load_config` is never defined or imported. `NameError` on the first cron fire.
- **Data-loss impact:** The 06:00 "backstop" sync never runs. Every repo that missed a webhook delivery during the day stays unsynced — commit snapshots in `output/commits/` will be silently incomplete. The "sync twice on the same day produces the same output" claim in the docstring is untested because it never actually runs.
- **Fix:** Change line 25 to `from scripts.dashboard.config import load_dashboard_config as load_config` — or rename the call at line 96.
- **Test to verify:** `python3 -m scripts.dashboard.git_sync --dry-run` against a tiny repo; exit code 0, `_sync-report.json` written.

## L02 — `read_commits_since` has no subprocess timeout (BLOCKER)
- **Language:** Python
- **Location:** `scripts/dashboard/git_reader.py:30-33`
- **What's wrong:** `subprocess.run([...git log...], cwd=repo_path, capture_output=True, text=True, check=True)` — no `timeout=`. If the repo is huge, has an LFS credential prompt, or network-mounted via SMB, this blocks forever. Cloudflare cron running this will wedge the whole sync.
- **Data-loss impact:** One slow repo stalls the entire multi-project sync. No partial results written because `_sync-report.json` is only written after *all* projects complete.
- **Fix:** Add `timeout=60` to the `subprocess.run` call and catch `subprocess.TimeoutExpired` alongside the existing exception handler.
- **Test to verify:** Point a project at a fake repo with a `post-checkout` hook that `sleep 120`; assert sync returns within 70s with that repo in `repos_failed`.

## L03 — Python `read_text()` without `encoding=` corrupts non-UTF8 handoff files (HIGH)
- **Language:** Python
- **Location:** `scripts/dashboard/config.py:45,80`; `scripts/dashboard/handoff_parser.py:33`
- **What's wrong:** `Path(path).read_text()` uses the platform default encoding (cp1252 on Windows cron, UTF-8 on macOS/Linux). When the dashboard runs on a Windows runner, any handoff with `—`, emoji, or non-ASCII names (`García`, `Müller`) either raises `UnicodeDecodeError` or silently mis-decodes, breaking the regex match at line 28 of handoff_parser.py and *skipping the entire entry*.
- **Data-loss impact:** Whole handoff entries disappear from the parsed output — CLOSED items never get matched to commits, devs look underperforming on the dashboard for a week they actually shipped.
- **Fix:** `Path(path).read_text(encoding="utf-8")` in all three call sites.
- **Test to verify:** Write a handoff file containing `## 2026-04-24 21:00 — García` and a body line with an em-dash; assert `parse_handoff_file()` returns 1 entry on every platform.

## L04 — `git_sync` re-overwrites per-day JSON, clobbering webhook-delivered commits (HIGH)
- **Language:** Python
- **Location:** `scripts/dashboard/git_sync.py:72-82`
- **What's wrong:** The cron writes `YYYY-MM-DD-<slug>.json` as a full overwrite each run. If the Bitbucket webhook has already written commits into that same file earlier in the day, the 06:00 backstop re-reads `git log --since=yesterday` and silently overwrites the file. There's no merge-with-existing step and no lock — two writes to the same file race if the webhook fires during cron.
- **Data-loss impact:** Commits that the webhook captured in-flight (e.g. a commit pushed after 06:00 which the cron's `git fetch` may or may not see) can disappear from the snapshot. The dedupe inside a single run doesn't rescue cross-run data.
- **Fix:** Read the existing file first, merge commit lists by SHA, then overwrite. Or use atomic append-only logs and aggregate at read-time.
- **Test to verify:** Pre-write `output/commits/2026-04-24-<slug>.json` with SHAs A and B; run sync that finds SHAs B and C; assert output contains A, B, C.

## L05 — `datetime.now()` without tz — day boundary race in git_sync (MEDIUM)
- **Language:** Python
- **Location:** `scripts/dashboard/git_sync.py:98,100`
- **What's wrong:** `since_dt = datetime.now() - timedelta(days=since_days)` and `today = datetime.now().strftime("%Y-%m-%d")` use the process's local tz. If the Cloudflare runner is UTC and the Fahad-configured tz is Australia/Melbourne, the "today" slug name disagrees with the dev's calendar day for up to 11 hours, causing two rows in the dashboard for the same work day.
- **Data-loss impact:** Commits attributed to the wrong calendar day; weekly forecast's "items closed this week" double-counts or under-counts at day boundaries.
- **Fix:** Pull tz from the config (`config.system.timezone`) and do `datetime.now(zoneinfo.ZoneInfo(tz))`.
- **Test to verify:** Mock `datetime.now()` to return 2026-04-24 23:30 UTC with `tz=Australia/Melbourne`; assert `today` == `2026-04-25`.

## L06 — `currentWeekStart()` mutates `Date` via `setDate` — wrong key near month start (HIGH)
- **Language:** JS
- **Location:** `devdash.html:3200-3205`
- **What's wrong:** 
  ```js
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff)).toISOString().slice(0, 10);
  ```
  `d.setDate(diff)` mutates `d` and returns a number (timestamp), not a Date — `new Date(number)` happens to work, but if `diff` goes negative (e.g. today is Mon Apr 5, `day=1`, `diff=5`) the logic still works in-month but is fragile. Worse: `toISOString()` converts to UTC, so for a Sydney-local Monday before 10:00 UTC+10, `toISOString()` returns the **previous Sunday** as the week key.
- **Data-loss impact:** Reward events get written with `week_start` set to a date that doesn't match the Monday the dev worked. `rewardsThisWeek()` filters by exact equality on `week_start`, so **the event is silently invisible until next week**. Dev thinks they earned nothing.
- **Fix:** Build the key from local-time components, no UTC conversion: ``${y}-${m}-${d}`` from `d.getFullYear()` / `getMonth()+1` / `getDate()`.
- **Test to verify:** Mock `Date` to Sydney Monday 08:00 local = Sun 22:00 UTC; assert `currentWeekStart()` returns the *Sydney* Monday date, not the Sunday.

## L07 — `_weekKey()` ISO week calc wrong across year boundary (MEDIUM)
- **Language:** JS
- **Location:** `devdash.html:3363-3368`
- **What's wrong:** The formula `Math.ceil((((d - oneJan) / 86400000) + oneJan.getDay() + 1) / 7)` is not the ISO 8601 week number. For dates in late Dec / early Jan, it produces W53 or W01 incorrectly (e.g. Jan 1 on a Thursday should be W01 but this formula returns W01 *or* W53 depending on what the first-of-year weekday is).
- **Data-loss impact:** `challengeDoneThisWeek()` keys growth-log entries by `{email}-{year}-Wxx`. Around Jan 1 the key can collide with last week's key or skip a week — dev sees "already marked done" when they haven't, or loses a week's growth log.
- **Fix:** Use the actual ISO formula (Thursday-anchored) or swap to `currentWeekStart()` as the single source of truth (keyed by the Monday date).
- **Test to verify:** Assert `_weekKey(new Date('2026-01-01'))` matches the ISO 8601 week number from a reference implementation (e.g. `date-fns/getISOWeek`).

## L08 — `submitOffProject`: `parseFloat(undefined)` poisons dev hours with NaN (HIGH)
- **Language:** JS
- **Location:** `devdash.html:4138`
- **What's wrong:** `this.devMockData[email].off_project_hours = (this.devMockData[email].off_project_hours || 0) + parseFloat(this.newOffProject.hours);` — if the form is submitted with `hours` blank (the default state after `newOffProject = { ... hours: '', ... }`), `parseFloat('')` returns `NaN`. `0 + NaN = NaN`. The dev's `off_project_hours` becomes `NaN` **permanently** because `(NaN || 0)` is `0` on next submit — so subsequent adds *reset* to just that amount, hiding the NaN. But the reliability formula uses this value directly: `1.0 - (NaN / 40)` = `NaN` → merit score = `NaN` → HTML renders literal string "NaN%" in the compass.
- **Data-loss impact:** A single empty-hours submission silently corrupts one dev's compass for the week. Harder: reliability score going to NaN can propagate into reward-event `amount` calculations (`Math.round(perDir * factor)` where factor is NaN → NaN amount).
- **Fix:** Guard: `const h = parseFloat(this.newOffProject.hours); if (!Number.isFinite(h) || h <= 0) { alert('Enter positive hours'); return; }`
- **Test to verify:** Submit off-project form with blank hours; assert `devMockData[email].off_project_hours` stays numeric and the submit is rejected with a user-visible message.

## L09 — `unlock_thresholds` text-input `parseInt` without NaN filter (MEDIUM)
- **Language:** JS
- **Location:** `devdash.html:1882`
- **What's wrong:** `@change="config.rewards.unlock_thresholds = $event.target.value.split(',').map(s => parseInt(s.trim()))"` — if the user types `"30, , 70"` or `"30,abc,70"`, you get `[30, NaN, 70]`. These survive into `config` (auto-persisted by the `$watch`) and later crash the unlock calculation.
- **Data-loss impact:** Corrupt config persists across reloads. Team-pool unlock logic silently breaks.
- **Fix:** `.map(s => parseInt(s.trim(), 10)).filter(Number.isFinite)`.
- **Test to verify:** Paste `"30, , 70"` into the input; assert `config.rewards.unlock_thresholds` is `[30, 70]`, not `[30, NaN, 70]`.

## L10 — `config` deep `$watch` + `Alpine.reactive` proxy — silent persistence on every keystroke, no quota handling (HIGH)
- **Language:** JS
- **Location:** `devdash.html:3000-3002,3057`
- **What's wrong:** `this.$watch('config', () => localStorage.setItem('devdash_config', JSON.stringify(this.config)), { deep: true })` fires on every nested write — every keystroke in a scope_in textarea serialises the entire `config` object (which includes every project, user, phase, etc.) and writes to localStorage. Two problems: (a) no `try/catch` around `setItem`, so on quota exceeded (`QuotaExceededError`) the write throws, Alpine silently eats it, and subsequent mutations are lost without the user knowing; (b) serialising the whole config on every keystroke is O(n²) for long text fields.
- **Data-loss impact:** A dev typing a long scope_in block or adding many phases pushes localStorage past the 5 MB limit. All writes from that point are silently dropped. User closes the tab and their edits are gone.
- **Fix:** Wrap in `try { localStorage.setItem(...) } catch (e) { this.storageFull = true; alert('Browser storage full — export and clear audit log'); }`. Debounce the save (250 ms). Consider splitting config save from bugs/audits save.
- **Test to verify:** Mock `localStorage.setItem` to throw `QuotaExceededError`; assert a visible warning is shown to the user, not silently swallowed.

## L11 — `catch (e) {}` on localStorage JSON.parse — corrupt keys leave stale defaults silently (MEDIUM)
- **Language:** JS
- **Location:** `devdash.html:2990,2995`
- **What's wrong:** Two `try { this[key] = JSON.parse(s); } catch (e) {}` blocks. If a localStorage key (`devdash_rewardEvents`) is corrupt — truncated by a quota-exceed mid-write, or tampered with — it's silently dropped and the defaults take over. The dev sees their reward history disappear with no warning.
- **Data-loss impact:** Months of reward events can vanish if a single key is truncated. No recovery path; no `console.warn`; no user-facing badge.
- **Fix:** `catch (e) { console.warn('Corrupt localStorage key devdash_' + key, e); this.storageCorrupt = this.storageCorrupt || []; this.storageCorrupt.push(key); }` and render a banner when `storageCorrupt.length`.
- **Test to verify:** Manually set `localStorage.setItem('devdash_rewardEvents', '{[invalid')`; reload; assert a banner warns the user and `rewardEvents` falls back to seed data.

## L12 — `x-html` on `compassCoaching` / `handoffCoaching` / `growthFocus().challenge` — user-driven HTML injection (HIGH)
- **Language:** JS
- **Location:** `devdash.html:1046,1063,1085,1133`
- **What's wrong:** These `x-html` expressions call helper functions that embed values derived from `config.scoring.directions[k].label` and `dev.compass` scores. Most content is static template literals, but `writeupAnalysis(dev)` returns HTML strings based on `dev.handoff_mult`. If a malicious config value sneaks in via the settings tab (CEO edits direction.label to `<img src=x onerror=alert(1)>`), it renders unescaped. Out-of-scope per instructions (not "cyber security"), but this **also** breaks layout/data-integrity: any `<` in a scope_in field typed through settings renders as HTML, not text, and the user doesn't know why the page is blank.
- **Data-loss impact:** Layout corruption only. Not data loss per se, but makes data unreadable.
- **Fix:** Swap `x-html` for `x-text` wherever the content is plain strings. For the few places that genuinely need `<strong>` injection, build the DOM via `x-html` only from hard-coded template pieces, never from `config.*` fields.
- **Test to verify:** Set `config.scoring.directions.velocity.label = 'A<b>B'`; render dev view; assert the `<b>` shows as text, not rendered tag.

## L13 — Alpine `x-for :key="phIdx"` / `:key="riIdx"` / `:key="lnIdx"` — index keying, reorder-on-splice bugs (MEDIUM)
- **Language:** JS
- **Location:** `devdash.html:2372,2412,2439,2464`
- **What's wrong:** `template x-for="(ph, phIdx) in (projectDetail().phases || [])" :key="phIdx"`. When the user removes phase index 1 (`removePhase(project, 1)`), Alpine thinks every remaining phase from index 2+ is "the same item at that index" and repaints their input bindings onto the wrong objects. Users have reported this pattern losing the last item's edits after a delete.
- **Data-loss impact:** Editing phase text and then deleting an earlier phase can silently overwrite the wrong phase's name because the input field that was bound to index-3's object is now bound to index-2's object with index-3's pending text.
- **Fix:** Give each phase/readiness/link/risk a stable `id` (e.g. `Date.now() + Math.random()`) when created and use `:key="ph.id"`.
- **Test to verify:** In a project with phases A, B, C, type "X" into B, click delete on A before blurring; assert that C's name is unchanged and the pending edit to B either lands on B or is discarded — never lands on C.

## L14 — `Date.now()` as ID generator — collision in bursts (LOW)
- **Language:** JS
- **Location:** `devdash.html:3060,3171,3186,3283,3931,3976,4112,4128,4146,4153,4164` (many)
- **What's wrong:** IDs come from `Date.now()` (or `Date.now() + Math.random()` in two spots). Clicking "resolve" and "submit" within the same millisecond — realistic for scripted users or auto-composer loops — produces duplicate IDs. `composeAllWeeklyRewards` runs in a tight loop over devs and each `composeWeeklyRewards(dev)` generates up to 5 events with `Date.now() + Math.random()`, but the non-rewards call sites (line 3060 `auditLog.unshift`, line 3931 project creation) use bare `Date.now()`.
- **Data-loss impact:** Duplicate audit-log IDs break any "find by id" logic (resolve-dispute uses `find(x => x.id === id)` — the first match wins, the second is orphaned and un-resolvable).
- **Fix:** Monotonic counter stored on the Alpine root: `nextId() { return ++this._idCounter; }` seeded from `Math.max(...all known IDs) + 1` at init.
- **Test to verify:** In a `for (let i=0; i<100; i++) this.auditLog.unshift({id: Date.now(), ...})` loop, assert all 100 ids are unique.

## L15 — `rewardEvents` and `auditLog` grow unbounded — years-of-history quota bomb (HIGH)
- **Language:** JS
- **Location:** `devdash.html:2993,3339` (rewardEvents); throughout (auditLog)
- **What's wrong:** There's no rotation, archive, or size cap on these arrays. Every weekly audit appends 5 events × 5 devs = 25 events per week = ~1,300 per year. Over 3 years that's 3,900 events — each ~250 bytes when serialised = ~1 MB just for rewards. Audit log grows faster (every settings change, every resolve, every submit). Combined with the full `config` and bugs/audits serialised on every keystroke, the browser hits 5 MB quota within the first year and writes start failing silently (see L10).
- **Data-loss impact:** Silent localStorage quota exhaustion. All new writes get dropped; user thinks they saved a setting, they didn't.
- **Fix:** At init, if `rewardEvents.length > 500`, archive the oldest half to `devdash_rewardEvents_archive_<year>` (or better, to the Worker KV). Same pattern for `auditLog` — cap at 200 entries, move the rest to cold storage.
- **Test to verify:** Seed `rewardEvents` with 3 years of synthetic events; reload; assert either the array was pruned or a "archive rotation needed" banner fired.

## L16 — Worker `decryptSecret` base64 padding logic off-by-one for 0-padding case (MEDIUM)
- **Language:** TS
- **Location:** `worker/src/totp.ts:25-26`
- **What's wrong:** 
  ```ts
  const padded = b64 + '==='.slice((b64.length + 3) % 4);
  ```
  Intent: pad to multiple of 4. For `b64.length % 4 === 0` (no padding needed), `(0+3) % 4 = 3`, so `'==='.slice(3)` = `''` — correct. For `%4 === 1` (invalid base64, but still possible if input was truncated), `(1+3) % 4 = 0`, slice gives `'==='` — produces a string with 2 trailing `=`, which `atob` accepts but decodes junk. There's no error path for genuinely corrupt input; `atob` throws `InvalidCharacterError` which is caught by the outer `try/catch` in routes.ts and becomes "Cannot decrypt credential" — correct-ish, but the user has no way to recover and no log tells Fahad which user's secret is corrupt.
- **Data-loss impact:** A KV key corrupted by an interrupted `worker_push` write is indistinguishable from a key-mismatch. Fahad cannot diagnose.
- **Fix:** Validate base64url length before decode (`raw.length >= 12 + 16` minimum for nonce + GCM tag). Log the user email on decrypt failure so Fahad knows which TOTP to re-provision.
- **Test to verify:** Pass a deliberately-truncated encrypted string; assert routes.ts logs the email (not just "Cannot decrypt credential").

## L17 — `sendEmail` has no timeout, no retry back-off — stuck cron on MailChannels outage (LOW)
- **Language:** TS
- **Location:** `worker/src/email.ts:20-34`
- **What's wrong:** `await fetch('https://api.mailchannels.net/tx/v1/send', ...)` — no `AbortController` timeout. Cloudflare Workers have a 30 s CPU limit but `fetch` counts as wall-clock — a hung MailChannels socket can burn the entire scheduled handler budget. On failure the code throws; the outer `try/catch` in `index.ts` logs and swallows — but the alert is lost for the day. No backoff / retry-next-hour.
- **Data-loss impact:** Daily alert email fails silently — Fahad doesn't see a stuck PR for 24 hours.
- **Fix:** Add 10-second AbortController timeout. On non-2xx, store the alert payload to `alerts:failed:<date>` so the next day's handler can retry.
- **Test to verify:** Mock fetch to hang 60s; assert `sendEmail` rejects within 11s and the alert is queued to KV for retry.

## L18 — `verifyTotp` accepts `window: 1` but no replay prevention — code reuse within 30s (LOW)
- **Language:** TS
- **Location:** `worker/src/totp.ts:4,6-8`
- **What's wrong:** `authenticator.options = { step: 30, digits: 6, window: 1 }` — any given 6-digit code is valid for ~90 s (previous, current, next step). There's no KV entry recording "this code was already consumed for this user" — so an attacker who sniffs one code can log in as many times as they want within ~90s. Out of scope per your "no cyber" rule, but the session-write side has a legit integrity angle: **two legitimate tabs logging in within 30 s create two `session:<token>` entries for the same user** (because each login hits `createSession` → new token). No single-active-session enforcement. If a dev logs in on mobile then desktop, both stay valid simultaneously — fine by design, but `deleteSession(token)` on one tab leaves the other live. Fine for this tool; worth flagging.
- **Data-loss impact:** None directly. Informational.
- **Fix:** Optional — add `last_session_for:<email>` KV and invalidate the previous token on new login if single-session is desired.
- **Test to verify:** Two sequential logins produce two valid sessions; logging out of one doesn't kill the other — confirm this matches product intent before "fixing".
