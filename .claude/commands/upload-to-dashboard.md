---
description: Upload any markdown/text file to the shared dev-dashboard-inputs repo, into the right slot for your role
---

Any team member (CEO, PM, Dev, QA, QA Auditor) can drop arbitrary context into the dashboard via this command. The dashboard reads these files on the next weekly audit and surfaces them on the relevant views.

## Step 1 — Determine the destination slot

Ask: **Which slot are you uploading to?**

Options:
- `fahad-uploads` (CEO's slot — strategic notes, custom prompts, cross-reference docs)
- `pm-uploads` (Imran's slot — independent assessments, observations, custom prompts)
- `dev-uploads/<your-name>` (a dev's slot — off-project writeups, long notes, prompt responses)
- `qa-findings/<project-name>` (QA bug reports — grouped by project)
- `qa-audits/<project-name>` (QA Auditor deep-dive audits — grouped by project)
- `feature-requests/<project-name>` (ad-hoc feature intake — prefer the `/add-feature-request` slash command instead)

If the user picks `dev-uploads`, `qa-findings`, `qa-audits`, or `feature-requests`, ask a follow-up: which dev name / which project.

## Step 2 — Ask for content

**How would you like to provide the content?**
- "paste" — paste markdown/text directly
- "file" — point me at an existing file on your Mac and I'll copy it

If "paste": ask for the content (they may want multi-line; if so say "paste and hit enter, then type END on its own line").

If "file": ask for the path. Read the file.

## Step 3 — Ask for a filename

Suggest a format: `<yyyy-mm-dd>-<short-slug>.md`.

Example: `2026-04-28-checkout-parity-audit.md`.

Ask the user: "Use <suggested name>, or give me a different name?"

## Step 4 — Determine the full destination path

Read `dashboard.config.yaml` in the current workspace to find `uploads_repo_path`. Default: `/Users/adminadmin/Downloads/phonebot revamp/dev dashboard/dev-dashboard-inputs`.

Full path: `<uploads_repo_path>/<slot>/[<subfolder>/]<filename>`

## Step 5 — Show the plan, get confirmation

Show:
- Destination path
- First ~10 lines of content
- File size (approximate char count)

Ask: "Ready to upload? (yes / change it)"

## Step 6 — Write the file

`mkdir -p` the destination folder if it doesn't exist. Then Write the content to the path.

## Step 7 — Optionally commit + push

If `<uploads_repo_path>` is a git repo, ask: "Commit and push this to Bitbucket so the dashboard picks it up?"

If yes:

```bash
cd <uploads_repo_path>
git add <relative path>
git commit -m "upload: <short description>"
git push
```

## Step 8 — Report

- "Uploaded to <full path>"
- "Size: <N> characters"
- "Will be read by the dashboard on the next weekly audit"

## Tone

Friendly, quick. This is a "drop a file" operation, not a workflow approval. Minimise prompts where defaults are obvious.
