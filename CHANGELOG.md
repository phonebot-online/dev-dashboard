# devdash — Changelog

Append-only log of material changes to the dev dashboard. Newest on top.

---

## 2026-04-24 late-evening — Language-QA batch, viewer role, audit card upgrade, Faizan-handoff Parts 9-11

### Language-QA fixes (9 of 18)
- **L01** `git_sync.py` NameError (already fixed by pytest agent earlier).
- **L02** Added `timeout=60` + `encoding="utf-8"` to `subprocess.run` in `git_reader.py` so one hung/huge/LFS-prompting repo can't wedge the sync.
- **L03** `read_text(encoding="utf-8")` everywhere in `config.py` + `handoff_parser.py` — breaks silent mis-decoding on non-UTF8 platforms.
- **L04** `git_sync.sync_project()` now merges existing commit JSON before overwriting, so the webhook + cron can't clobber each other mid-day.
- **L06** `currentWeekStart()` rebuilt with local-time components (no UTC round-trip) so Sydney-local Monday no longer keys to Sunday.
- **L08** `submitOffProject()` guards `parseFloat(hours)` with `Number.isFinite` + alert; no more NaN poison into compass + reward amounts.
- **L10** `save(key)` wraps `localStorage.setItem` in try/catch with user-visible alert on quota exceed + `_storageWarnedOnce` latch. `$watch('config')` debounced 250ms.
- **L11** `JSON.parse()` on load now `console.warn`s + records `this.corruptStorageKeys[]` instead of silent swallow. Banner coming in next UI pass.
- **L15** Rotation at init: if `rewardEvents.length > 500`, archive oldest 250 to `devdash_rewardEvents_archive_<YYYY-MM>`. Same for `auditLog > 200`.

### New features
- **Viewer role** (read-only CEO view for non-dev staff — designer / CS / finance / interns). Added to VISIBILITY matrix + user role dropdown + `roleLabel/Color/Badge` helpers.
- **QA Auditor past-audit cards** — ⚖ In-dispute chip + ✓ Dispute accepted / ✕ Dispute rejected chips (dispute state was previously visible only on bug cards). Extended metric display to show `browser`, `owasp`, `risk`, `issue_type`, `lines` inline. Added per-finding delete button with confirm.
- **Schema migration** on init — old audit findings without `category` auto-migrate to `other`; old bugs get `disputed: false` default; old users get `probation_end: null` default (data-arch agent find).

### Docs
- **Faizan handoff** grew with Parts 9–11 (Fahad approved 2026-04-24):
  - **Part 9** Backup + Disaster Recovery — nightly KV dump via `kv_backup.py` cron + restore procedure.
  - **Part 10** TOTP lockout recovery — email-based one-time signed-token reset flow + routes to add in `routes.ts`.
  - **Part 11** Data export — one-click JSON dump button in Settings → System → Danger zone.
- **Phase-2 scope** Appendix C added for Retro + OKR layer (research-required before build, 10 open design questions listed).
- **Persona synthesis** written at `qa-sandbox-run/persona-findings-summary.md` — 5 Baazaar personas aggregated, opposing viewpoints flagged, top-12 features ranked.
- `reward-system-design.md` — all 11 Q-decisions locked.

### Sandbox verification tonight (via `/browse`)
- 5-week × 3-dev × 39-event reward simulation — March batch paid 705k PKR, April batch paid 1.24M PKR, dual-approval gate enforced, ledger reconciles.
- 14 integration bugs fixed + verified.
- Category migration: 3 legacy audits correctly moved to "other" category.
- Dispute lifecycle on audits end-to-end: submit → ⚖ chip → PM accept → ✓ chip + assigned_to cleared.

### Still open (documented, not built)
- 9 language-QA bugs remaining: L05 (Py tz-aware dt), L07 (ISO week formula), L09 (unlock_thresholds NaN filter), L12 (x-html → x-text), L13 (x-for index keys → stable ids), L14 (Date.now() collision), L16/L17/L18 (Worker TS).
- 6 new features Fahad approved tonight but not yet built: data export button, burnout detection chip, compass-score dispute, dispute escalation, offboarding runbook + test, AI insights wiring.
- I05 auditsForDev panel on dev view (helper exists, UI panel missing).
- Real Bitbucket webhook route in Worker.
- Manual `git_sync.py` run against phonebot-revamp repo as E2E smoke test.
- `kv_backup.py` + `kv_restore.py` scripts (specced in Faizan handoff Part 9).

---

## 2026-04-24 evening — Reward system MVP, Growth Track, 14 integration fixes, PM lockdown, dispute lifecycle wired

### New features
- **Reward system MVP** — `rewardEvents[]` + `payoutBatches[]` schemas; monthly payout cycle with configurable `payout_day` (1–28); "Compose this week's rewards" button (Settings → Rewards) seeds events idempotently; payout modal with event checklist + dual-approval (CEO + PM checkboxes, both required when `require_dual_approval: true`); "Payout due today" green banner fires on `payout_day` with total pending amount; rewards history panel on dev view (this week / this month / last month / lifetime + expandable per-event list); silent receipt (history visible, no push); Danger-zone **Reset reward history** button (two confirms, wipes `rewardEvents` + `payoutBatches`, keeps settings).
- **Reward policy locked — 11 decisions:** monthly cadence / pro-rated absence / forfeit on termination / owner_decides team-pool split / dual approval required / silent receipt with history / banner+push on payout_day / flexible growth-bonus rule / strict owner-ship-on-deadline / no clawback / no streak bonus.
- **Growth Track card (dev view)** — three panels: (1) Growth focus this week — weakest direction + micro-challenge + 3 learning resources + Mark-done; (2) Streaks & milestones — handoff streak, challenges done, personal best, True North countdown; (3) Write-up clarity — lints latest handoffs for vague phrases / missing sections / short word count. **"✎ Polish a note" modal** — paste draft, get issues list + suggested rewrite.
- **PM bug queue locked down** — severity badge and status chip are read-only with tooltips ("Severity owned by QA · Status owned by dev · You can reassign only"). Assignee remains the only PM-editable field.
- **Dispute lifecycle properly wired** — `submitDispute()` now marks `bug.disputed = true` + `dispute_id`, and records the *attributed* dev (not the disputing party); blue **⚖ In dispute** chip renders on bug/audit cards while open. `resolveDispute('accepted')` clears `disputed` + re-routes bug to project owner via `suggestDevForBug`. `reassignDispute()` moves assignment + clears `disputed`. `resolveDispute('rejected')` clears `disputed`, attribution stands.
- **Safe user removal** — `removeUser()` confirm dialog enumerates every cascade (owner_email cleared, contributor lists, open bugs + features reassigned to project owner, disputes marked resolved_by="user removed", pending rewards voided per `termination_rule`). All reconciled atomically; audit log records the summary.
- **Safe project removal** — `removeProject()` archives bugs / audits / feature requests by renaming project tag to `(archived: <name>)` instead of orphaning them; audit log records counts.

### Integration fixes (14)
- **I01** `regressionCandidates` bootstrapped with seed items + persistence.
- **I02** `auditLog[]` persisted to localStorage; survives reloads.
- **I03 (BLOCKER)** `removeUser()` now reconciles bugs / features / disputes / audits / blockers / projects / rewards in one pass — no more orphans.
- **I04** `removeProject()` archives orphans rather than deleting silently.
- **I05** `auditsForDev(email)` helper added; audit feed on dev view no longer crashes on missing assignee.
- **I06** `submitOffProject()` falls back to `currentUser` for non-seed devs (logging off-project from new accounts works).
- **I07** `resetConfigToDefaults()` confirm text is accurate; clears session state + `provisioned` flag; no more half-reset limbo.
- **I08** `reassignDispute()` filters by `status === 'active'` so archived devs aren't suggestable.
- **I09** `suggestDevForBug()` skips absent owners, falls through to contributors; no more auto-routing bugs to someone on vacation.
- **I10** `resolveDispute('accepted')` routes bug back to project owner (not just clearing attribution).
- **I11** Compass SVGs use CSS vars instead of hardcoded colors — themes work on all three modes.
- **I12** `.pulse` keyframe added (decision-inbox bell was styled but not animating).
- **I13** `submitDispute()` attributes the bug to the dev the bug *is on*, not the disputing party (bug: devs were previously disputing into their own name).
- **I14** `pendingOnCeo(projectName)` accepts an optional project scope; per-project CEO views count decision debt correctly.

### Infrastructure
- **Git sync scaffolded** — `scripts/dashboard/git_sync.py` written. Pulls daily commits from every project's repos; writes per-day JSON; idempotent on re-run; emits `_sync-report` with counts + errors.

### Verification
- **Sandbox re-verified end-to-end** — 14 `/browse` test runs. Reward simulation: 5 weeks × 3 devs × 39 events. March batch paid 705k PKR, April batch paid 1.24M PKR; ledger reconciles, dual-approval gates enforced, audit log captures every action.

---

## 2026-04-24 — Project detail modal, PKR currency, absence flow, density + collapse

### New features
- **Project detail modal (CEO + PM)** — clicking any project card opens a modal with build %, launch-readiness %, team, scope (IN/OUT), phases with progress bars, tickable readiness checklist, risks, links, repos. `✎ Edit` toggle makes every field inline-editable (phases, readiness items, risks, links all have add/remove buttons). Footer has "Filter dashboard to this project" shortcut.
- **PM Projects grid** — PM view now has the same clickable project grid as CEO, opening the same detail modal. Each card also has a "Filter" button for direct filtering.
- **Clickable dev cards** — CEO "Standout this week" card and all PM dev cards now click-through to that dev's full view. Old "View profile →" button is still there for clarity.
- **Developer absence flow** — every user has `absence: { type, until, note }`. Dev view has a self-serve banner: "🤒 Sick today" / "🏖️ Vacation (prompts for return date)" / "⏸ Other (prompts for date + note)" / "I'm back". PM dev cards show an absence badge. CEO view gets a "Out today / this week" callout panel (only appears when someone is absent).
- **PKR currency (configurable)** — Settings → Rewards has a Currency dropdown (PKR/AUD/USD/GBP/EUR/INR/AED). Default PKR. `formatMoney()` renders PKR-friendly (`35k`, `1.8L`). Default reward amounts scaled to PKR (35k / 180k / 25k / 350k).
- **Auto-QR flow** — adding a new user in Settings → Users pops an auto-QR card at the top (copy-link + dismiss). Every existing user row has a "QR" button to re-show the QR anytime.
- **Density toggle** — top-nav `≡/☰` button switches comfortable ↔ compact density site-wide (applies via `.density-compact` CSS class on body).
- **Collapsible sections** — CEO Portfolio and PM Projects sections now have ▾/▸ toggle headers.
- **Reset to defaults** — Settings → System has a new Danger zone card with "Reset all settings to defaults" button (clears `devdash_config` localStorage and reloads; bugs/audits/handoff preserved).

### Schema additions
- `projects[]`: `scope_in`, `scope_out`, `phases[]`, `readiness[]`, `risks[]`, `links[]`.
- `users[]`: `absence: { type, until, note }`.
- `rewards`: `currency`.
- `auditFindings[]`: `category`, `severity`, `assigned_to`, `cc[]`, plus category-specific fields (url, metric, actual, target, device, viewport, browser, file, issue_type, lines, owasp, risk).
- `bugs[]`: `device`, `browser`, `url`, `reproducible`, `steps`, `expected_actual`.

### QA & QA Auditor views
- **QA view upgrade** — device (desktop/tablet/mobile) + browser (Chrome/Safari/Firefox/Edge/iOS Safari/Android Chrome) + URL + reproducible (always/sometimes/once) + steps + expected-vs-actual fields on the bug form.
- **QA Auditor rebuilt** — 10 categories (performance, responsive, code_quality, security OWASP, accessibility, seo, regression, parity, cross_browser, other), severity (blocker/high/medium/low), category-specific metric fields (e.g. performance gets URL + metric + actual + target; security gets OWASP category + risk). Email-like routing: TO (assigned dev dropdown) + CC (checkbox multi-select across PM/CEO/other devs/QAs). Category + status filters on the findings list. Inline status dropdown on past audits. TO/CC headers shown on each audit card.

### Fixes
- **Theme system now actually works** — `.glass`, `.card`, `.card-hover`, `.tab-btn`, `.proj-btn`, `input/select/textarea`, `button.primary/secondary`, `.scrollable-thumb`, `.progress-track`, `.quote-footer` all use CSS variables. Three themed gradient vars (`--grad-banner`, `--grad-dev`, `--grad-compass`) with matching classes replace the 3 inline dark gradients that used to stay black on light/cream themes.
- **CEO Distribution panel** — renamed to "Portfolio health"; now shows portfolio-wide stats when `activeProject='all'`, switches to per-project status/%/forecast/days-remaining when a single project is selected. Was stagnant before.
- **PM contributor propagation** — comma-separated email input replaced with checkbox multi-select of active devs (no more silent typos). `$watch('config', ..., { deep: true })` auto-saves every field edit — the "Save changes" buttons are now redundant safety nets.
- **Stale localStorage masking defaults** — `migrateConfig(defaults)` merges missing fields from shipped defaults into any cached config without overwriting user edits. Also re-pulls shipped `scope_in/scope_out/phases/readiness/risks/links` if the user had them blank.
- **Users tab affordances** — `!bg-transparent !border-transparent` classes removed from user row inputs; role/status/email/hours are now visibly editable.
- **Per-project compass** — dev view `devViewTarget()` and PM view `sortedDevsForPm()` now return project-scoped versions when `activeProject != 'all'`. Compass numbers shift deterministically per `(dev, project)` via email+project char-sum hash. Commits filter by project prefix. Badge on dev view header shows "On: <Project>" vs "All projects".

### Personality pass
- **Role-specific punchy greetings** — `greeting()` + `greetingSpark()` now rotate 5 role-specific lines per day. CEO: "👑 The buck stops at your inbox"; Dev: "⚡ Your compass is your story. Ship something small today"; QA Auditor: "🧐 Five sharp findings > fifty filler ones"; PM: "📬 Decision debt grows like office plants nobody waters."
- **PM Monday morning summary** rewritten from dry stats into a tactical briefing: lead sentence routes on worst traffic light, emoji-tagged bullets for HIGH bugs / stuck PRs / at-risk devs / decision debt / disagreements / regressions, standout + off-project blurb, rotating italic closing line ("Your job is to remove rocks from the path, not put new ones there").

### New skills (invokable via `/`)
- `/devdash-daily` — end-of-day dev helper (<60s); picks project, pulls today's commits, asks 4 questions, appends CLOSED/IN PROGRESS/OPEN/OFF-PROJECT to `daily-handoff.md`, prints PM-pasteable summary.
- `/devdash-audit` — weekly CEO/PM audit pipeline; loads config → git log per repo → handoff parser → uploads reader → matcher → merit → forecast → renders per-role HTML to `output/YYYY-WW/`.
- `/devdash-git-sync` — one-time setup for Bitbucket webhook + daily cron; writes `scripts/dashboard/git_sync.py` + `git-sync-README.md`.

### Known blockers (from QA audit — do NOT deploy to public URL without addressing)
- `tryLogin()` accepts any 6-digit code — only the Cloudflare/AWS Worker enforces real TOTP.
- Role leakage via DevTools — Settings tab + peer compass + bonus amounts visible to any client.
- XSS in `pmSummaryHtml()` via `x-html` + interpolated `displayName`.
- `worker/wrangler.toml` has `<FILL_AFTER_KV_CREATE>` placeholder.
- Zero tests for `devdash.html` Alpine logic, `worker/src/*.ts`, or malformed handoff-input paths.

### Deferred
- Alternative CEO dashboard layout toggle (tabled until later).
- Archive mechanism (soft-hide closed bugs + closed audits).
- Collapsible sections beyond CEO Portfolio + PM Projects.

---

## 2026-04-24 earlier — Initial scope expansion + v2 spec

See `daily-handoff.md` entries 00:00 through 18:05 for Tasks 1–21 (foundation → Cloudflare Worker scaffold → TOTP provisioning → Worker auth + email cron → KV push → helper slash commands → operator README). 53/53 pytest tests pass at that point.

## 2026-04-23 — v1 spec + plan committed

See `2026-04-23-dev-dashboard-design.md` + `2026-04-23-dev-dashboard-plan.md`.
