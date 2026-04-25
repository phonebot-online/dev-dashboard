---
description: Generate a one-page performance review per dev for the last 13 weeks — for bonus, raise, promotion decisions
---

You are generating quarterly performance reviews from the last 13 weekly audit archives. One HTML file per dev. Fahad reads each, edits in ~10 minutes, delivers.

Work directory: `/Users/adminadmin/Downloads/phonebot revamp/dev dashboard/`

## Step 1 — Load the last 13 weekly JSON archives

```bash
cd "/Users/adminadmin/Downloads/phonebot revamp/dev dashboard"
ls -1t dashboard-data/*.json 2>/dev/null | head -13
```

If fewer than 13 archives exist (the dashboard is less than 13 weeks old), use however many are available and note that in each review ("based on N weeks of data, less than a full quarter").

Read each JSON. Each archive has per-project devs with signals + merit_total + off_project_hours + commit count + handoff summary.

## Step 2 — Compute aggregates per dev across the window

For each dev (only role=dev — QA and QA Auditor are excluded from merit-scored reviews in v1), compute:

- `avg_merit` — average of weekly merit_total
- `trend` — "rising" / "flat" / "declining" based on linear slope of weekly merit_total over the window
- `green_weeks` — count of consecutive weeks the dev ended green (merit_total >= 70 and target hit)
- `total_items_closed` — sum across the window
- `total_off_project` — sum of off_project_hours
- `total_unblocks` — sum of unblocked_others count
- `qa_bugs_caused` — count of QA-attributed bugs on their commits

## Step 3 — Compose the narrative

For each dev, produce:

- **`summary_paragraph`** — 2-3 sentences describing how the dev performed this quarter. Specific, not generic.
- **`strengths`** — list of 3 concrete observations. Reference specific items they shipped, patterns, trends. Example:
  - GOOD: "Shipped R0-07, R0-09, R0-10 in back-to-back weeks with zero rework"
  - GOOD: "Cleared 4 blockers for Moazzam and Faisal, often picking up items outside assigned queue"
  - BAD: "Great team player"
  - BAD: "Delivers on time"
- **`growth_areas`** — 2 concrete, actionable observations. Example:
  - GOOD: "Quality signal dips after long off-project weeks — split long tasks across two weeks to avoid rushing"
  - GOOD: "Zero unblock events in the last 4 weeks — worth checking in on how work is being distributed"
  - BAD: "Could communicate more"
- **`recommendation`** — pick ONE:
  - "Promote / bonus eligible"
  - "Meeting expectations"
  - "At risk — needs check-in"
  - "Below expectations"

Be honest. Don't inflate. Don't deflate. Fahad reads these; if they're sycophantic or bitter, he'll know.

## Step 4 — Render one HTML file per dev

```python
from pathlib import Path
from jinja2 import Environment, FileSystemLoader, select_autoescape

env = Environment(
    loader=FileSystemLoader("scripts/dashboard/templates"),
    autoescape=select_autoescape(["html"]),
)
template = env.get_template("quarterly-review.html.j2")

for dev_data in per_dev_aggregates:
    html = template.render(
        dev_name=dev_data["name"],
        quarter_label=dev_data["quarter_label"],   # e.g. "Q2 2026 (Apr - Jun)"
        generated_at=<now>,
        summary_paragraph=dev_data["summary_paragraph"],
        avg_merit=round(dev_data["avg_merit"], 1),
        trend=dev_data["trend"],
        green_weeks=dev_data["green_weeks"],
        total_items_closed=dev_data["total_items_closed"],
        total_off_project=dev_data["total_off_project"],
        total_unblocks=dev_data["total_unblocks"],
        qa_bugs_caused=dev_data["qa_bugs_caused"],
        strengths=dev_data["strengths"],
        growth_areas=dev_data["growth_areas"],
        recommendation=dev_data["recommendation"],
    )
    safe = dev_data["email"].replace("@", "_at_").replace(".", "_")
    Path(f"output/quarterly-review-{safe}-{dev_data['quarter_slug']}.html").write_text(html)
```

## Step 5 — Report

Print:
- "Quarterly reviews generated for N devs: <list of filenames>"
- "Recommendations breakdown: X promote-eligible, Y meeting-expectations, Z at-risk, W below"
- "Location: <workspace>/output/"

## Tone

Fair, observant, specific. Not a cheerleader. Not a hitman. Think of yourself as a senior manager who has watched the dev's work for 13 weeks. Fahad relies on this for bonus/promotion decisions — get it right.
