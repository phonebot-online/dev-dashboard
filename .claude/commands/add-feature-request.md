---
description: Log an ad-hoc feature request from CEO or PM — lands in the target dev's queue on the next weekly audit
---

You are capturing an ad-hoc feature request from Fahad or Imran. Ask four questions, one at a time, collect the answers, then write a formatted markdown file to the feature-requests folder.

## Step 1 — Ask the four questions, one at a time

Ask one, wait for the answer, then ask the next. Do NOT ask them all at once.

1. **Which project?** (give them the project names from `dashboard.config.yaml` — read it first to show the list)
2. **Describe the feature in plain English.** (what does it do? no tech-speak required)
3. **Urgency?** (low / medium / high — pick one)
4. **Target dev?** (optional — their email, or leave blank for Claude to auto-assign based on code ownership at next weekly audit)

## Step 2 — Generate a filename

```
feature-requests/<project-slug>/<yyyy-mm-dd>-<short-slug>.md
```

Where:
- `<project-slug>` is the project name lowercased with spaces replaced by hyphens
- `<yyyy-mm-dd>` is today's date
- `<short-slug>` is a 2-3 word slug derived from the description

Example: `feature-requests/phonebot-2-0/2026-04-28-notify-me-button.md`

## Step 3 — Determine the uploads repo path

Read `dashboard.config.yaml` in the current workspace to find `uploads_repo_path`. Default: `/Users/adminadmin/Downloads/phonebot revamp/dev dashboard/dev-dashboard-inputs`.

Full file path: `<uploads_repo_path>/<filename from Step 2>`.

## Step 4 — Write the file

Format:

```markdown
## <yyyy-mm-dd> — Feature request from <requester> / <project-name>
Priority: <urgency>
Target dev: <email or "(auto-assign)">

<the plain-English description>
```

Where `<requester>` is determined from context — if this is Fahad's session, say "Fahad"; if Imran's, "Imran". If unclear, ask "Who is filing this — Fahad or Imran?".

## Step 5 — Show the draft and get confirmation

Show the user the exact markdown file contents + destination path. Ask: "Ready to write, or want to change anything?"

If they say ready: use the Write tool to create the file. If the parent folder doesn't exist, create it first with `mkdir -p`.

## Step 6 — Optionally commit to the shared repo

After writing, check if `<uploads_repo_path>` is a git repo (check for `.git` subdirectory). If it is, ask the user: "Commit and push this to Bitbucket now? (yes/no)"

If yes:

```bash
cd <uploads_repo_path>
git add <relative path>
git commit -m "feature request: <short description>"
git push
```

If not a git repo or user says no, just write the file locally. The next weekly audit will pick it up either way (as long as the file is in the right folder).

## Step 7 — Report

Tell the user:
- "Feature request written to <full path>"
- "Target dev: <name or 'auto-assigned'>"
- "Will appear on <target dev's dashboard | the PM view> next Monday morning after /weekly-audit runs"

## Tone

Friendly, brief. The user is filing a quick request, not writing a novel. Don't make them do ceremony. If they give a one-line description, that's enough.
