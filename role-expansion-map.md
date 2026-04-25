# Role Expansion Map — 5 dashboard roles vs a real software house

The dashboard today flattens ~15 real software-house roles into 5 buckets (CEO, PM, Dev, QA, QA Auditor). This doc maps what got compressed, what each role **actually does** outside our context, and which options/features/modals we haven't built yet.

---

## Standard roles in a software house (independent of phonebot)

| Role | What they do | Key stakeholders |
|---|---|---|
| **CEO / Founder** | Strategy, investors, P&L, hiring, go/no-go, external PR, culture | Board, investors, exec team, big customers, legal |
| **COO** | Day-to-day ops, process, finance-adjacent, cross-team glue | CEO, Eng, Finance, HR |
| **CTO** | Tech strategy, architecture, build-vs-buy, tech hiring, tech-debt, security posture | CEO, VP Eng, heads of PM / Design |
| **VP Engineering / Eng Director** | Delivery, team health, roadmap, performance reviews | CTO, EMs, PMs, Finance |
| **Engineering Manager** | 1:1s, growth plans, PIPs, team capacity, sprint health | VP Eng, devs, PMs |
| **Tech Lead / Staff Eng** | Architecture, code-review gatekeeper, mentoring, unblocking | EM, devs, PM |
| **Product Manager** | User research, backlog, specs, prioritization, metrics | CEO, devs, design, sales, customers |
| **Product Designer / UX** | Wireframes, design system, user testing, accessibility | PM, devs, customers |
| **UI Designer** | Visual polish, component design, motion, brand | PM, Product Designer, devs |
| **Backend Dev** | Services, APIs, databases | TL, DevOps, PM |
| **Frontend Dev** | UI, state, perf, a11y implementation | TL, Design, PM |
| **Mobile Dev** | iOS / Android / RN | TL, PM, QA |
| **DevOps / SRE / Platform** | CI/CD, infra, monitoring, incidents, on-call | CTO, devs, Security |
| **Security Engineer** | Threat model, pen test, compliance (GDPR, SOC2), secret rotation | CTO, DevOps, legal |
| **Data Engineer / Analytics** | Pipelines, warehouse, dashboards | PM, Eng |
| **QA (manual)** | Exploratory testing, bug reporting | Dev, PM, QA Lead |
| **QA Automation** | Test suites, CI integration | DevOps, devs |
| **QA Lead / Audit** | Strategy, coverage, release go/no-go, regression | VP Eng, PM, CEO |
| **Support / CS** | Tickets, escalations, feedback loop | Customers, PM, dev |
| **Project / Delivery Manager** | Timelines, dependencies, risk registers, status reports | PM, Eng, execs |
| **Scrum Master** | Ceremonies, impediments, velocity | PM, devs |
| **Release Manager** | Release train, rollback plans | Dev, DevOps, PM |
| **Technical Writer** | API docs, runbooks, user docs | PM, devs |
| **HR / People Ops** | Hiring, performance, onboarding | CEO, EM |
| **Finance / Bookkeeper** | Payroll, invoices, reward payouts | CEO |
| **Legal** | Contracts, compliance | CEO |

---

## How our 5 dashboard roles compress the above

| Dashboard role | Absorbs | What that means in practice |
|---|---|---|
| **CEO** | CEO + CTO + VP Eng + Finance + Legal | Every strategic + tech + money + legal call funnels to one inbox. Decision debt accumulates fast. |
| **PM** | PM + Project Mgr + Scrum Master + Release Mgr + partial Tech Lead | One person owns backlog, delivery, ceremonies, releases, dependency traffic. |
| **Dev** | Backend + Frontend + Full-stack + Mobile + partial DevOps + partial Security + partial Designer | Devs do everything downstream of a spec — incl. infra, security patches, UI polish when no designer exists. |
| **QA** | Manual QA + QA Automation | Both exploratory testing and test-suite maintenance. |
| **QA Auditor** | Senior QA + Release gatekeeper + Performance auditor + partial Security + partial Compliance | Weekly / go-no-go / performance / code-quality / security audits all roll up here. |

**Absent from the dashboard entirely:**
- **Designer** — no view, no modal, no slot. Mockups and design reviews live in files/Slack.
- **DevOps / SRE** — alerts, deploys, incidents invisible. Dev handles ad-hoc.
- **Customer Support** — escalations from customers aren't surfaced to devs at all.
- **HR / People Ops** — 1:1 notes, PIPs, hiring pipeline invisible.
- **Finance** — reward payouts land in the reward totals but no cashflow / runway / per-dev cost.

---

## Missing features per existing role (gap list)

### CEO
Currently: portfolio health, decision debt, standout-of-week, off-project drain, 4 stat tiles.
**Missing:**
- Board/investor monthly digest composer (auto-draft from the week's audit)
- Runway / cash-burn dashboard (cost per project, per dev, per month)
- Capacity planner — dev-hours available vs committed roadmap
- Hiring pipeline (open roles, stage, candidate)
- Customer escalation triage inbox
- 1:1 note tracker per direct report
- Quarterly OKR surface
- Contractor status (rate, renewal, performance)
- Compliance status (Privacy Act, breach log)
- Expense approval queue

### PM
Currently: morning briefing, dev cards, bug queue, project grid, feature requests, PM assessments, disputes (submit only).
**Missing:**
- Sprint planning view (committed vs capacity)
- Backlog grooming (priority + estimate + dep)
- Dependency graph (who blocks whom)
- Release calendar (per project)
- Risk register (formal, mitigation + owner per risk — `project.risks[]` exists but is bullet-list only)
- Retro / postmortem tracker
- Incident log (P0/P1 in prod)
- SLA tracker
- Release notes draft
- Dispute resolution UI (submit works, approve/reject/reassign doesn't)
- Stakeholder comms log

### Dev
Currently: compass, commits, queue, rewards, off-project log, feature requests targeted at them, self-serve absence.
**Missing:**
- Code review queue (PRs I need to review + PRs awaiting my review)
- On-call rotation
- Incident response (alerts → runbook links)
- Tech-debt personal log
- Learning / skill log
- Time-tracking per project (currently half-built)
- Commit-to-ticket linker
- 1:1 prep notes
- PTO balance
- Equipment / license requests

### QA
Currently: bug submit + bug list (just made interactive).
**Missing:**
- Test case library (regression suite, manual checklist per project)
- Device farm availability
- Test-environment status (is staging up? DB seeded?)
- Screenshot / video evidence upload
- Test plan per release
- Acceptance-criteria feed (read-only from PM)
- Bug verification queue (devs mark fixed → QA retests)
- Release sign-off toggle
- Comments thread on bugs (QA ↔ dev)
- Duplicate-bug marker

### QA Auditor
Currently: 10-category finding form with TO/CC routing + filters + inline status.
**Missing:**
- Go / no-go release checklist per project (gate = all items green)
- Audit schedule / cadence indicator
- Test-coverage rollup across projects
- Performance benchmark history (LCP / TTFB trends per release)
- Accessibility audit log
- Security audit log (OWASP coverage matrix)
- Code-quality trend (complexity, dup, dead code)
- Dev-level coaching ("Faizan's craft has dropped 12 pts over 4 weeks — investigate")
- Regression register (known resurfaced bugs)
- Release sign-off / veto
- Compliance checklist (Privacy Act / GDPR applicability per project)
- Time logging (senior QA hours per audit, currently invisible)

---

## What I'm actually building NOW (high impact / low invasion)

Not all 50+ items above. The ones that close concrete loops in the existing UI:

1. **Dev: Code-review queue** — "PRs you need to review · N" + "Your PRs awaiting review · N" card in dev view. Data seed from stuckPrs + a new `reviewQueue` placeholder.
2. **QA: Bug verification queue** — when a dev sets a bug to `closed`, it moves to a QA "verify fix" list. QA confirms or reopens.
3. **QA Auditor: Go/no-go release checklist per project** — surface `project.readiness[]` on the QA Auditor view with sign-off + veto buttons. Green checklist → project eligible for release sign-off.
4. **Bug comments thread** — simple append-only thread on each bug (QA ↔ dev loop, the #1 gap flagged earlier).
5. **Bug → duplicate-of-id marker** — prevents duplicate clutter.

Flagged for phase 2 (documented, not built yet): everything else in the gap lists above + the 4 missing roles (Designer / DevOps / Support / HR).

---

## Roles to add in phase 2 (if they earn their weight)

**Designer view** — slot for mockups per project, design-review checklist, design-system token editor. Only if Phonebot actually hires a designer; currently devs self-design.

**DevOps view** — alert feed, deploy log, incident post-mortems, on-call rota. Only if infra work grows beyond one person handling it part-time.

**Customer Support view** — ticket escalation inbox that routes to dev queue or PM. Only when Phonebot 2.0 goes live and real customer volume hits.

**HR / People Ops view** — hiring pipeline, 1:1 notes per direct report, PIP tracker. Only when team grows past ~10 or Fahad stops handling people ops personally.

All four are **mergeable into CEO + PM views with sub-tabs** if adding new top-level roles feels heavy. Recommend sub-tabs over new roles unless a dedicated person is hired.

---

## Integrating devdash into phonebot CMS

Four paths with effort estimates:

| Path | Effort | What | Pros | Cons |
|---|---|---|---|---|
| **A: iframe embed** | 1-2 days | Keep devdash at `devdash.phonebot.co.uk`, iframe into CMS admin | Ships this week; no rewrite | Double login; no data flow CMS ↔ devdash |
| **B: Laravel + Livewire** | 1-2 weeks | Port Alpine → Livewire; Python worker writes to Phonebot DB | Native to stack; unified auth; role-leakage blocker closes | ~1900 lines of Alpine state → server-side |
| **C: Next.js in phonebot-hq** | 1-2 weeks | Port as a page in HQ repo; API routes call Python | Modern stack; shares HQ auth | HQ ≠ CMS if they're separate |
| **D: Headless API** | 2-3 weeks | Python → REST/GraphQL; multiple frontends consume | Max flexibility; 3 frontends possible | Premature unless you have 2+ real consumers |

### Prerequisites for ALL paths
1. Replace `devMockData` + hardcoded arrays (`stuckPrs`, `regressionCandidates`, `blockers`) with real data sources.
2. Kill the decorative `tryLogin()` — enforce real TOTP or CMS SSO.
3. Migrate from localStorage → proper DB (schema in `dev-handoff.md` + `data-architecture.md`).
4. Fix the `x-html` XSS in `pmSummaryHtml()`.
5. Add `schema_version` + merit characterisation tests so scores can't silently drift.

### Recommendation
**Path B** if devdash lives in CMS long-term — devs know the stack, auth unifies, role-leakage closes naturally.
**Path A** if you want it live next week — converts to Path B later.
Skip **Path D** until you have 2+ serious consumers.
