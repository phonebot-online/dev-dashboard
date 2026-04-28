# Builds & Sprints

Per-project Scrum and SDLC tooling. Surfaces inside the project detail modal — open any project card on the CEO or PM dashboard to find the **Sprints** and **Builds & releases** sections.

## Where it lives

- UI: `devdash.html` — project detail modal, between the Phases and Readiness-checklist sections.
- Data: `config.projects[].sprints[]` and `config.projects[].builds[]`.
- Persistence: `localStorage` key `devdash_config`, written via `saveConfig()` on every mutation.
- Helpers: defined in the Alpine `data()` block alongside `addPhase` / `addReadinessItem`.

Existing projects are unaffected — both arrays lazy-init to `[]` the first time you click "+ New".

---

## Sprints

A sprint is a timeboxed iteration with a goal and a backlog of tasks scored in story points. Modeled on Jira / Azure Boards / Linear conventions.

### Sprint fields

| Field | Type | Notes |
|---|---|---|
| `id` | number | Stable, generated via `nextId()`. |
| `name` | string | Auto-defaults to `Sprint N`. |
| `goal` | string | Single-line objective. Shown with a 🎯 prefix on the summary row. |
| `start_date` | YYYY-MM-DD | Defaults to today. |
| `end_date` | YYYY-MM-DD | Defaults to today + 14 days. |
| `status` | enum | `planning` · `active` · `review` · `completed` · `cancelled` |
| `tasks` | array | See task model below. |
| `_expanded` | boolean | UI-only — controls the collapse state of the sprint card. |

### Task fields

| Field | Type | Notes |
|---|---|---|
| `id` | number | Stable. |
| `title` | string | What the task is. |
| `assignee_email` | string | Empty = unassigned. Dropdown lists active devs. |
| `priority` | enum | `low` · `medium` · `high` |
| `story_points` | number | Whole numbers only by convention; the input accepts any non-negative number. |
| `status` | enum | `todo` · `in_progress` · `in_review` · `done` |

### Sprint workflow

1. **Plan** — click **+ New sprint**. A 2-week timebox is created in `planning` status.
2. **Set goal + add tasks** — expand the sprint, write a goal, click **+ Add task** for each work item, score them in points.
3. **Start** — flip status to `active`. The progress bar (points-done / points-total) lights up as tasks move to `done`.
4. **Review** — flip to `review` when work is done but waiting on demo / sign-off.
5. **Close** — flip to `completed`. Cancelled sprints (rolled back) use `cancelled`.

Status colors:

| Status | Color |
|---|---|
| `planning` | grey |
| `active` | green |
| `review` | blue |
| `completed` | purple |
| `cancelled` | red |

### Sprint helpers

- `addSprint(project)` — creates a 2-week sprint, default name `Sprint N`, calls `saveConfig()`.
- `removeSprint(project, idx)` — confirm dialog, then splice + save.
- `addSprintTask(sprint)` — appends a default task and saves.
- `removeSprintTask(sprint, idx)` — splice + save.
- `sprintPointsTotal(sprint)` / `sprintPointsDone(sprint)` — sums.
- `sprintProgressPct(sprint)` — `done / total * 100`, rounded; returns `0` if no points.
- `sprintStatusColor(status)` — returns `{ bg, fg }` for the pill.

---

## Builds & releases

A build is a versioned release targeting a specific environment, with optional release notes and a link back to one or more sprints.

### Build fields

| Field | Type | Notes |
|---|---|---|
| `id` | number | Stable. |
| `version` | string | Semver-ish (e.g. `0.2.0`). Auto-suggested by bumping the previous build's minor segment. |
| `name` | string | Optional human label (e.g. "Checkout hotfix"). |
| `environment` | enum | `dev` · `staging` · `production` |
| `status` | enum | `planning` · `in_progress` · `released` · `failed` |
| `release_date` | YYYY-MM-DD | Defaults to today. |
| `branch` | string | Branch or tag name. Defaults to `main`. |
| `release_notes` | string | Free-text changelog. |
| `related_sprint_ids` | array of sprint ids | Multi-select. Older single-link builds may have `related_sprint_id` (singular) — readers normalize via `buildSprintIds()`. |
| `_expanded` | boolean | UI-only. |

### Build workflow

1. **Plan** — click **+ New build**. Version auto-bumps from the previous build's minor segment (`0.1.0` → `0.2.0`); rename if shipping a major or patch.
2. **Pick environment + status** — start in `dev` / `planning`, promote through `staging` / `in_progress`, finish in `production` / `released`.
3. **Link sprints** — tick the sprint(s) that contributed work to this release. Multiple sprints are common for production rollups.
4. **Notes + branch** — record what's in the build and which branch / tag was deployed.
5. **Failed?** — flip status to `failed` if the deploy didn't complete; notes should record what broke.

Environment colors:

| Environment | Color |
|---|---|
| `dev` | blue |
| `staging` | amber |
| `production` | green |

Status colors:

| Status | Color |
|---|---|
| `planning` | grey |
| `in_progress` | amber |
| `released` | green |
| `failed` | red |

### Build helpers

- `addBuild(project)` — creates a build with auto-bumped version, calls `saveConfig()`.
- `removeBuild(project, idx)` — confirm dialog, then splice + save.
- `_suggestNextVersion(project)` — bumps the minor version of the last build; returns `0.1.0` for first build.
- `buildSprintIds(build)` — returns the array of sprint ids, normalizing legacy `related_sprint_id`.
- `toggleBuildSprint(build, sprintId)` — adds/removes a sprint id; migrates away from the legacy singular field on first edit.
- `buildSprintNames(build, project)` — comma-joined display string for the summary row.
- `buildStatusColor(status)` / `buildEnvColor(env)` — pill colors.

---

## Persistence notes

- Every helper that mutates sprints or builds calls `saveConfig()` immediately, which writes the entire `config` object to `localStorage` under `devdash_config`.
- A debounced `$watch('config', ...)` in `init()` provides a backstop second write 250ms later — safe even if a helper is added without an explicit save.
- `migrateConfig()` does **not** touch `sprints` or `builds`; both arrays default to `[]` lazily in the helpers, so old projects stay untouched until you click "+ New".

## Reactivity gotcha

The task assignee `<select>` uses `x-model` rather than `:value` + `@change` because its options come from a `<template x-for>`. With `:value`, Alpine sets the select's value before the dynamic options finish rendering, the browser falls back to the first option (Unassigned), and the saved assignee appears to "reset" on reopen. `x-model` retries the value-set after children update, fixing the issue. Static-option selects (status, priority, environment) keep the `:value` pattern because all options exist at evaluation time.
