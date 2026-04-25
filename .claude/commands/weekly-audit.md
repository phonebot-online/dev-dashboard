---
description: Run the weekly dev dashboard audit — pulls commits, reads handoffs, audits code, produces per-role HTML dashboards
---

You are running the weekly dashboard audit. Follow these steps in order.
Work directory: `/Users/adminadmin/Downloads/phonebot revamp/dev dashboard/`
Runtime target: under 10 minutes.

## Step 1 — Load configs

```bash
cd "/Users/adminadmin/Downloads/phonebot revamp/dev dashboard"
python3 -c "
import json
from pathlib import Path
from scripts.dashboard.config import load_dashboard_config, load_users
cfg = load_dashboard_config(Path('dashboard.config.yaml'))
users = load_users(Path('users.yaml'))
print(json.dumps({
    'projects': [{'name': p.name, 'deadline': p.deadline, 'kickoff_date': p.kickoff_date,
                  'repos': p.repos, 'scope_docs': p.scope_docs, 'devs': p.devs,
                  'items_source': p.items_source} for p in cfg.projects],
    'uploads_repo_path': cfg.uploads_repo_path,
    'output_html_dir': cfg.output_html_dir,
    'fahad_email': cfg.fahad_email,
    'users': [{'email': u.email, 'role': u.role} for u in users],
}, indent=2))
"
```

If config loading fails, stop and report the error to the user.

## Step 2 — For each project, gather raw data

### 2a. Pull commits from all configured repos (last 7 days)

```bash
cd "/Users/adminadmin/Downloads/phonebot revamp/dev dashboard"
python3 -c "
import json
from pathlib import Path
from datetime import date, timedelta
from scripts.dashboard.git_reader import read_commits_since
from scripts.dashboard.config import load_dashboard_config

cfg = load_dashboard_config(Path('dashboard.config.yaml'))
since = (date.today() - timedelta(days=7)).isoformat()

all_commits_by_project = {}
for proj in cfg.projects:
    all_commits_by_project[proj.name] = []
    for repo in proj.repos:
        try:
            commits = read_commits_since(Path(repo), since)
            for c in commits:
                all_commits_by_project[proj.name].append({
                    'sha': c.sha, 'author_name': c.author_name, 'author_email': c.author_email,
                    'timestamp': c.timestamp, 'message': c.message, 'files_changed': c.files_changed,
                    'repo': repo,
                })
        except FileNotFoundError as e:
            print(f'WARNING: {repo}: {e}')

print(json.dumps(all_commits_by_project, indent=2, default=str))
"
```

### 2b. Read daily-handoff.md for each project

For each project, look for `daily-handoff.md` in each of the project's repos and the project workspace. Parse via:

```bash
python3 -c "
import json
from pathlib import Path
from scripts.dashboard.handoff_parser import parse_handoff_file
from datetime import date, timedelta
week_start = date.today() - timedelta(days=7)

candidates = ['/Users/adminadmin/Downloads/phonebot revamp/daily-handoff.md']
all_entries = []
for c in candidates:
    if Path(c).exists():
        entries = parse_handoff_file(Path(c))
        for e in entries:
            if e.date >= week_start:
                all_entries.append({
                    'date': e.date.isoformat(), 'author': e.author,
                    'closed': e.closed, 'in_progress': e.in_progress,
                    'open': e.open, 'off_project': e.off_project,
                    'off_project_hours': e.off_project_hours,
                })
print(json.dumps(all_entries, indent=2))
"
```

### 2c. Read scope docs

For each project, use Read tool to load each file in `scope_docs`. Use these as context for the code audit (Claude reads them to understand project context — don't paste huge docs back out).

### 2d. Read open items

If `items_source` is set (e.g., `launch-readiness-dashboard.html`), Read it and extract item IDs (R0-XX, P0-XX, P1-XX patterns). If null, derive item set from handoff CLOSED + IN PROGRESS + OPEN mentions.

## Step 3 — Read the uploads bundle

```bash
python3 -c "
import json
from pathlib import Path
from scripts.dashboard.uploads_reader import read_uploads
from scripts.dashboard.config import load_dashboard_config

cfg = load_dashboard_config(Path('dashboard.config.yaml'))
bundle = read_uploads(Path(cfg.uploads_repo_path))
print(json.dumps({
    'fahad': list(bundle.fahad.keys()),
    'pm': list(bundle.pm.keys()),
    'devs': {k: list(v.keys()) for k, v in bundle.devs.items()},
    'qa': {k: list(v.keys()) for k, v in bundle.qa.items()},
    'qa_audits': {k: list(v.keys()) for k, v in bundle.qa_audits.items()},
    'feature_requests': {k: list(v.keys()) for k, v in bundle.feature_requests.items()},
}, indent=2))
"
```

If the uploads repo folder doesn't exist yet, that's fine — the reader returns empty bundles. Note this in your final report.

## Step 4 — For each dev, audit their week

For each dev who made commits in the week window:

1. Match each commit to an open item using `scripts.dashboard.matcher.match_commit_to_items`.
2. For commits with confidence >= 0.5, audit the code — use Read tool to open the changed files and check: does the code genuinely implement what the commit message claims? Any shortcuts, missed edge cases, security issues? Write a quality score 0-100 per commit with a one-sentence audit finding.
3. Count: items closed, in progress, blocked. Handoff discipline score (0-100 based on thoroughness).
4. Count initiative (closed items not on the assigned list) and unblock events (moved another dev's blocker).
5. Compute complexity score for the week's closed items (0-100, based on file count + line-count of changes).
6. Build `MeritSignals` and compute merit via `compute_dev_merit`.
7. Compose a 2-3 sentence plain-English summary of what the dev did this week.

## Step 5 — Per-project forecast

```bash
python3 -c "
from datetime import date
from scripts.dashboard.forecast import forecast_project
# for each project, call forecast_project(items_closed=N_done, items_total=N_total, items_closed_this_week=N_week, ...)
"
```

## Step 6 — Detect stuck PRs

For each repo, check git branches that diverged from main > 2 days ago without merge (or use `gh pr list` if gh CLI is authenticated). List as stuck PRs.

## Step 7 — Assemble the full snapshot dict

Shape matches what render.py expects:

```python
snapshot = {
    "generated_at": "<now ISO>",
    "week_range": "<start> - <end>",
    "projects": [
        {
            "name": "...", "traffic_light": "...",
            "percent_complete": ..., "days_remaining": ...,
            "total_project_duration": ..., "days_of_work_required": ...,
            "forecast_launch": "...",
            "devs": [
                {"email": "...", "name": "...", "merit_total": ...,
                 "summary": "...", "commits": [...], "signals": {...},
                 "off_project_hours": ..., "off_project_entries": [...]}
            ],
            "qa_bugs": [...], "qa_audits": [...], "feature_requests": [...],
            "blockers": {"fahad": [...], "faizan_team": [...], "external": [...]},
        }
    ],
    "team_off_project_hours": ...,
    "top_performer": {"role_label": "Dev", "summary": "..."},
    "stuck_prs": [...],
    "disagreements": [...],
    "imran_actions": [...],
}
```

## Step 8 — Generate per-role HTML

```bash
python3 -c "
import json
from pathlib import Path
from scripts.dashboard.role_views import build_role_payloads
from scripts.dashboard.render import render_dashboard
from scripts.dashboard.config import load_users

users = load_users(Path('users.yaml'))
emails_by_role = {}
for u in users:
    emails_by_role.setdefault(u.role, []).append(u.email)

snapshot = {...}  # from Step 7
payloads = build_role_payloads(snapshot, emails_by_role)

output_dir = Path('output')
output_dir.mkdir(exist_ok=True)

for role in ('ceo', 'pm', 'qa', 'qa_auditor'):
    render_dashboard(payloads[role], output_dir / f'weekly-dashboard-{role}.html')

for email, payload in payloads['dev'].items():
    safe = email.replace('@', '_at_').replace('.', '_')
    render_dashboard(payload, output_dir / f'weekly-dashboard-dev-{safe}.html')

print(f'Wrote {4 + len(payloads[\"dev\"])} HTML files to {output_dir}')
"
```

## Step 9 — Archive snapshot JSON

```bash
mkdir -p dashboard-data
python3 -c "
import json
from datetime import date
from pathlib import Path
snapshot = {...}
Path(f'dashboard-data/{date.today().isoformat()}.json').write_text(json.dumps(snapshot, indent=2, default=str))
"
```

## Step 10 — Report

Print:
- "Dashboard generated. N HTML files in ./output/"
- "Projects audited: N"
- "Devs audited: N"
- "Stuck PRs: N"
- "Open QA bugs: N (HIGH severity: N)"
- "Top performer this week: <role label> (<summary>)"

If any step failed, report which and why.

## Tone

Think like a senior engineer doing a fair performance review, not a cheerleader or a hitman. If a dev had a quiet week, say so without punishing. If exceptional, say that too. Specific, not vague.
