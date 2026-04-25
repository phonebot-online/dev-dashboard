---
description: Log off-project / interruption work — appends a formatted OFF-PROJECT line to daily-handoff.md
---

A dev was pulled off their assigned project (legacy site fire-fighting, customer escalation, DNS emergency, etc.). This command logs that time so it shows up on the dashboard and adjusts the dev's merit score (their weekly target is reduced proportional to off-project hours).

## Step 1 — Ask four questions, one at a time

Wait for each answer before asking the next.

1. **What interrupted you?** (short description, e.g., "legacy phonebot.com.au hack investigation")
2. **Which project did you pause?** (e.g., "Phonebot 2.0")
3. **Estimated hours spent on the interruption?** (numeric, e.g., 3 or 1.5)
4. **Done or ongoing?** (pick one)

## Step 2 — Find daily-handoff.md

Look for `daily-handoff.md` in the current project's workspace. Typical locations:
- `./daily-handoff.md` (if you're in the project root)
- `/Users/adminadmin/Downloads/phonebot revamp/daily-handoff.md` (main Phonebot workspace)

If none exists, ask the user where their daily handoff file lives, or offer to create one.

## Step 3 — Identify or create today's entry

Read the handoff file. Look for an entry header matching today's date:

```
## YYYY-MM-DD HH:MM — <author> / <context>
```

If today's entry exists, append the OFF-PROJECT line to it (check if OFF-PROJECT already exists — if so, append a new bullet; if not, add the section).

If today's entry does NOT exist yet, add a new entry header + an OFF-PROJECT section at the top of the file.

## Step 4 — Format the line

```
OFF-PROJECT: <what> (~<hours>h). <optional short detail>. <done|ongoing>.
```

Example:

```
OFF-PROJECT: legacy phonebot.com.au hack investigation (~3h). Locked down admin, rotated OpenCart passwords. Ongoing — will revisit Monday.
```

## Step 5 — Show the diff and confirm

Before writing, show the user exactly what will be added to the file (as a diff). Ask: "Looks right? (yes / change it)"

If yes, use Edit or Write to update the file.

## Step 6 — Report

- "Logged <hours>h off-project work to daily-handoff.md"
- "Your merit score target for this week will be reduced accordingly on the next /weekly-audit"

## Tone

Fast, no ceremony. Dev is interrupting their fire-fighting to log this; don't make it a chore.
