# Context Management and Token Economics — devdash

**Audience:** Fahad (CEO/owner) and the engineer who builds the weekly-audit pipeline.  
**Date:** 2026-04-24  
**Why this exists:** Devdash runs weekly on Claude Max ($100/5x subscription). As the dashboard accumulates months of data across 5 projects and 8 users, naive context loading would burn through quota fast. This document defines exactly what gets loaded when, why most data stays on disk, and how Fahad stays well inside budget even a year from now.

---

## 1. What "context" means here

The word "context" is overloaded. In the Claude API it refers to the `messages` array. Here it means something different: **the set of files and data that Claude actually reads during an audit run**.

Not everything Claude *could* read. Just what it *does* read.

There are two states for any piece of data:

- **Loaded** — pulled into the audit run, present in Claude's working window, costs tokens.
- **Available on demand** — exists in storage (DynamoDB, S3, or Glacier), can be fetched mid-run if Claude asks for it, costs tokens only if actually retrieved.

The strategy is simple: default load is small and tight. Everything else stays on the shelf unless the audit needs it.

---

## 2. Default context load per weekly audit

Each project gets one audit run per week. Here is exactly what gets loaded for each project:

| Data type | Estimate | Tokens |
|---|---|---|
| Knowledge card (rolling 500-word summary) | ~650 words | ~850 tokens |
| Open items list (current sprint, unresolved) | ~100 items × ~50 tokens | ~5,000 tokens |
| This week's commits (7-day window) | ~20 commits × ~80 tokens | ~1,600 tokens |
| This week's handoff MDs | ~5 entries × ~150 tokens | ~750 tokens |
| This week's uploads (prompts, QA bugs, audits) | ~3 files × ~300 tokens | ~900 tokens |
| Audit system prompt + instructions | fixed overhead | ~500 tokens |
| **Total per project** | | **~9,600 tokens** |

Five projects at ~9,600 tokens each:

| Scale | Token load |
|---|---|
| 1 project | ~9,600 tokens |
| 5 projects (full weekly audit) | ~48,000 tokens |

**Note on Claude Max quota:** Claude Max token limits are not published by Anthropic as a hard number. Based on typical Max user behaviour, a $100/5x plan handles several hundred thousand tokens per session comfortably before hitting rate limits. The ~48K weekly audit is a small fraction of that. Estimates below are conservative.

---

## 3. What is NOT loaded by default

The following data exists in storage but does not appear in an audit run unless explicitly retrieved:

| Data | Why it's excluded | Where it lives |
|---|---|---|
| Commits older than 14 days | Already summarised into knowledge card | Warm/Cold S3 |
| Resolved bugs (closed >14 days ago) | No longer actionable | Warm S3 |
| Past quarters' merit history | Not needed for this week's scoring | Cold S3 Glacier |
| Raw scope documents (full CLAUDE.md, README) | Summarised into knowledge card | Git repo + Warm S3 |
| Other projects' data | Completely excluded — see Section 6 | Scoped by project ID |
| Architecture audit reports >30 days old | Summarised into knowledge card | Warm S3 |
| Handoff entries >14 days old | Part of knowledge card | Warm S3 |
| Full QA bug history | Only open bugs loaded | Warm S3 |

**The default vs retrieval table:**

| Item | Default (always loaded) | Retrieval (on demand) |
|---|---|---|
| Project summary | Knowledge card (500 words) | Raw source files |
| Commit history | Last 7 days | Any date range |
| Items list | Open items only | Closed items |
| Merit history | This week's signals | Past N weeks |
| Bug reports | Open + this week's new | All historical |
| Uploads | This week only | Any previous upload |
| Audit reports | This week's QA audit | Previous audits |

---

## 4. Retrieval on demand

Some audit questions require going back further. Examples:

- Regression check: "Did this bug exist before, was it fixed, and is it back?"
- Quarterly review: "How has Faizan's merit score trended over 13 weeks?"
- Specific historical question: "What was the scope decision on the checkout flow in March?"

When Claude needs more data, the retrieval path is:

1. **Keyword search on compressed summaries.** Each archived week has a summary blob stored in S3. Claude searches those blobs (cheap — they're small) to find the relevant time window.
2. **Pull raw file from warm tier if within 90 days.** Reads the actual handoff entry, commit, or bug report from S3.
3. **Pull from cold tier if older than 90 days.** Glacier restore takes seconds to minutes for expedited retrieval. Rarely needed.
4. **Load into a one-shot context window.** The retrieved data is appended to the current run's context. It is not cached between runs.

Retrieval is triggered either by Claude deciding it needs the data, or by the user pressing "load more context" (see Section 5).

---

## 5. User-triggered "load more context"

Per-project, in the dashboard settings, there is a manual override. Before loading extra data, the system shows a preview:

```
Project: Phonebot 2.0
You're about to load 4 weeks of historical commits + closed items.
Estimated addition: ~12,400 tokens (~9% of typical weekly session quota).
This will slow the audit by 30-60 seconds.
Continue?  [Yes]  [No]
```

The token estimate is calculated before the fetch, not after. If the user says no, the audit runs on the default load. If yes, the additional data is pulled from warm storage and appended to the context for that project's run only — it does not persist to the next run.

This exists so Fahad can choose when a deeper look is worth the cost, without it happening automatically every week.

---

## 6. Context pollution prevention

Project A's audit must never see Project B's data. This is enforced at the storage layer, not just at the query layer.

Each piece of data is tagged at write time with a `project_id`. DynamoDB partition keys are `{project_id}#{data_type}`. S3 keys follow `devdash/{project_id}/hot/...`, `devdash/{project_id}/warm/...`, etc.

When the audit runner fetches data for Phonebot 2.0, it constructs queries that include the project_id as a mandatory filter. There is no "get all data across all projects" query in the codebase — only "get data for project X."

At the Claude layer, the context builder assembles a separate payload per project and runs each project's audit independently. The outputs are combined only at the rendering stage, after audit is complete. A dev working on two projects gets separate audit results for each — they do not bleed into each other.

---

## 7. Cache layers

Recomputing the same thing twice in one week wastes quota. These computations are memoized:

| Computation | Cache duration | Invalidation trigger |
|---|---|---|
| Knowledge card | 7 days | New commits or handoff entries in that project |
| Open items list | 24 hours | Items closed or new items added |
| Dev merit history (all weeks) | Until new weekly audit completes | Weekly audit completion |
| Commit-to-item match results | 24 hours | New commit pushed |
| Project metrics (forecast, % complete) | 24 hours | Items updated |
| Per-role HTML payloads | Until next audit run | Audit completion |

Cache is stored in DynamoDB with a TTL field. On audit start, the runner checks: "does a valid cache entry exist for this computation?" If yes, it reads from cache instead of recomputing. If no, it runs the computation and writes the result to cache.

The knowledge card cache check is the most important one. If no project data has changed since last week's card was generated, the card is reused as-is and no Claude call is made to regenerate it. This alone saves ~2,000-3,000 tokens per unchanged project per week.

---

## 8. Knowledge card in detail

**What it is:** A 500-word rolling summary of "where this project is right now." Think of it as a well-written status brief that captures current sprint focus, key blockers, recent decisions, which items closed last week, what's at risk, and who is leading which areas.

**How it's built:** Once per week, a Claude call ingests:
- Last week's knowledge card (so the new card is an *update*, not a rewrite from scratch)
- Last week's commits (parsed list, not full diffs)
- Last week's handoff entries
- Any new scope decisions or architecture changes uploaded this week

Output is one new 500-word card. The old card is archived to warm storage. The new card replaces it as the project's active context anchor.

**Why it works:** 500 words is ~650-850 tokens. An engineer who has been on the project for three months has accumulated hundreds of commit messages, dozens of handoff entries, multiple architecture docs. Reading all of that raw is 50,000-100,000 tokens. The knowledge card collapses that to 650 tokens with minimal information loss for weekly audit purposes. Claude reading the card knows roughly what the project team knows — not every detail, but enough to score merit, flag regressions, and assess forecast accurately.

**Failure mode:** If the card generation call produces a card that drifts from reality (e.g., it hallucinates that a feature is complete when it isn't), the card becomes a liability rather than an asset. Detection: the weekly audit's commit-to-items matching will surface anomalies (items marked done but no commits referencing them). When drift is detected, the card is flagged and rebuilt from scratch on the next run — pulling the last 4 weeks of raw handoffs and commits to regenerate a clean card. This probably happens quarterly at most.

**Card rebuild cost:** One-off — about 15,000-20,000 tokens for the rebuild call. Acceptable as an exception.

---

## 9. Token budget numbers

### Claude Max quota estimate

Claude Max $100/5x is not publicly spec'd in token counts. Based on observed Max user behaviour, the practical session limit is in the range of 150,000-300,000 tokens before rate limiting kicks in, with a generous daily allowance. These estimates are conservative.

### Devdash weekly budget

| Run type | Tokens per run | Runs per month | Monthly total |
|---|---|---|---|
| Weekly audit (5 projects) | ~48,000 | 4 | ~192,000 |
| Knowledge card regeneration (5 projects) | ~4,000 per project | 4 (weekly) | ~80,000 |
| Daily lightweight pull (check for new items only) | ~2,000 | ~20 (weekdays) | ~40,000 |
| Regression checks (triggered, ~2/month) | ~20,000 per check | 2 | ~40,000 |
| Quarterly review (once per quarter, amortised monthly) | ~80,000 | 0.33 | ~27,000 |
| **Total devdash monthly** | | | **~379,000** |

### Headroom for Fahad's own Claude usage

If the monthly session budget is ~600,000-800,000 tokens (conservative estimate for $100/5x), devdash consumes roughly 50-60% of that. Fahad has 40-50% remaining for his own work — architecture questions, writing, code review, etc. If devdash grows to 10 projects, total audit tokens roughly double to ~760,000/month, which would eat the full budget. At that scale, the retrieval-only strategy becomes mandatory and the daily pull frequency should drop.

---

## 10. Long-timeline growth model

| Stage | Data volume | Per-audit load | Risk |
|---|---|---|---|
| Day 0 (now) | 1 project, ~50 open items, no history | ~9,600 tokens | None |
| Month 1 | 5 projects, ~100 items each, 4 weeks of handoffs | ~48,000 tokens | Low — well within budget |
| Month 3 | 5 projects, ~150 items each, 12 weeks archived, ~60 closed bugs | ~48,000 tokens (unchanged — tiering works) | Medium — knowledge cards must be accurate or audit quality degrades |
| Month 6 | 5 projects, some scope changes, ~300 archived commits per project, merit history 26 weeks deep | ~48,000-52,000 tokens (slight growth from richer items list) | Medium — cold storage costs small money (~$1-2/mo S3 Glacier); no token risk if tiering holds |
| Month 12 | 5 projects, ~600 archived commits per project, 4 quarterly reviews done, team changes possible | ~52,000-58,000 tokens | Low-medium — biggest risk is knowledge card drift on long-running projects; schedule a manual card audit at 12 months |

**Key observation:** the weekly audit token load is bounded by the current-week data window, not by total accumulated history. As long as the tiering rules are enforced, a 12-month-old codebase costs roughly the same to audit per week as a 1-month-old one.

---

## 11. Specific answers to Fahad's worries

**"60 days in, Claude burns through tokens looking at stale context."**

It won't, because stale data never enters the default load. The 14-day hot tier holds only active data. Anything older is in warm S3 and only appears if explicitly retrieved. The knowledge card ensures Claude still *knows* about that older history — it just doesn't load it raw. At day 60, the audit context for any project is still ~9,600 tokens, same as day 1.

**"Who decides what's loaded?"**

Two layers:
1. Static rules in `dashboard.config.yaml` (you set the hot-tier window, the max items count, etc.). These are the defaults every run uses.
2. Claude decides per-run if extra retrieval is needed. If Claude is asked to do a regression check and the knowledge card mentions a related fix from week 3, Claude requests that specific week's commit data. It doesn't pull everything — it asks for what it needs.

Fahad can override both by using the "load more context" button on a per-project basis.

**"I don't want to burn through API usage."**

Devdash doesn't use the Claude API directly — it runs inside Claude Max sessions, which is a flat subscription. There is no per-token billing. The concern is quota exhaustion (hitting the session or daily rate limit), not a surprise invoice. The tiering + knowledge card approach keeps weekly audit usage well within the safe zone. The daily pull is deliberately lightweight (items-only, no full audit) to preserve quota for the weekly run.

---

## 12. Context-load logic — code reference

This is what the audit runner does. Not a full implementation — enough for an engineer to know what to build.

**Python — context builder:**

```python
# scripts/dashboard/context_builder.py

from dataclasses import dataclass, field
from typing import Optional
from datetime import datetime, timedelta

CACHE_TTL_SECONDS = {
    "knowledge_card": 7 * 86400,
    "open_items":     86400,
    "commits_this_week": 86400,
}

@dataclass
class AuditContext:
    project_id: str
    knowledge_card: str           # ~650 tokens
    open_items: list              # ~5,000 tokens
    commits_this_week: list       # ~1,600 tokens
    handoff_entries_this_week: list  # ~750 tokens
    uploads_this_week: list       # ~900 tokens
    extra: list = field(default_factory=list)  # on-demand additions


def build_audit_context(project_id: str, storage, cache, run_date: datetime) -> AuditContext:
    week_start = run_date - timedelta(days=7)

    # Knowledge card — check cache first
    card = cache.get(f"knowledge_card:{project_id}")
    if not card:
        card = storage.hot.get_knowledge_card(project_id)
        cache.set(f"knowledge_card:{project_id}", card, ttl=CACHE_TTL_SECONDS["knowledge_card"])

    # Open items — check cache
    open_items = cache.get(f"open_items:{project_id}")
    if not open_items:
        open_items = storage.hot.get_open_items(project_id)
        cache.set(f"open_items:{project_id}", open_items, ttl=CACHE_TTL_SECONDS["open_items"])

    # This week's data — always fresh (small, cheap)
    commits = storage.hot.get_commits(project_id, since=week_start)
    handoffs = storage.hot.get_handoff_entries(project_id, since=week_start)
    uploads = storage.hot.get_uploads(project_id, since=week_start)

    return AuditContext(
        project_id=project_id,
        knowledge_card=card,
        open_items=open_items,
        commits_this_week=commits,
        handoff_entries_this_week=handoffs,
        uploads_this_week=uploads,
    )


def fetch_on_demand(ctx: AuditContext, query: str, storage, weeks_back: int = 4) -> AuditContext:
    """Called mid-audit if Claude needs more history."""
    results = storage.warm.keyword_search(ctx.project_id, query, weeks_back=weeks_back)
    ctx.extra.extend(results)
    return ctx
```

**TypeScript — context preview (for "load more" button):**

```typescript
// worker/src/contextPreview.ts

interface ContextAddition {
  label: string;
  estimatedTokens: number;
  dataType: string;
  weeksBack: number;
}

async function estimateContextAddition(
  projectId: string,
  kv: KVNamespace,
  weeksBack: number
): Promise<ContextAddition> {
  // Read a metadata record, not the full data
  const meta = await kv.get(`meta:${projectId}:warm:${weeksBack}w`, { type: "json" }) as {
    commit_count: number;
    handoff_count: number;
    upload_count: number;
  } | null;

  if (!meta) {
    return { label: "No additional data found", estimatedTokens: 0, dataType: "none", weeksBack };
  }

  const tokens =
    meta.commit_count * 80 +
    meta.handoff_count * 150 +
    meta.upload_count * 300;

  return {
    label: `${weeksBack} weeks of commits, handoffs, and uploads`,
    estimatedTokens: tokens,
    dataType: "warm",
    weeksBack,
  };
}

function renderContextPreviewPrompt(addition: ContextAddition, weeklyQuotaEstimate = 48000): string {
  const pct = ((addition.estimatedTokens / weeklyQuotaEstimate) * 100).toFixed(1);
  return [
    `This will add ~${addition.estimatedTokens.toLocaleString()} tokens`,
    `(approx ${pct}% of weekly audit quota).`,
    `Data: ${addition.label}.`,
    `Continue?`,
  ].join(" ");
}
```

**Weekly audit runner — simplified orchestration:**

```python
# In .claude/commands/weekly-audit.md (executed by Claude Code)

for project in config.projects:
    ctx = build_audit_context(project.id, storage, cache, today)

    # Claude reads ctx and produces audit result
    audit_result = claude_audit(ctx)

    # If Claude flagged need for historical data
    if audit_result.needs_history:
        ctx = fetch_on_demand(ctx, audit_result.history_query, storage)
        audit_result = claude_audit(ctx)  # re-run with extra context

    # Rebuild knowledge card with this week's additions
    new_card = claude_generate_knowledge_card(
        previous_card=ctx.knowledge_card,
        new_commits=ctx.commits_this_week,
        new_handoffs=ctx.handoff_entries_this_week,
    )
    storage.hot.save_knowledge_card(project.id, new_card)
    cache.invalidate(f"knowledge_card:{project.id}")

    results.append(audit_result)
```

---

## Storage tier reference

| Tier | Storage | Age range | Read cost | Write cost |
|---|---|---|---|---|
| Hot | DynamoDB | 0-14 days | ~$0.25/million reads | ~$1.25/million writes |
| Warm | S3 Standard | 15-90 days | ~$0.004/1,000 requests | ~$0.023/GB |
| Cold | S3 Glacier | 90+ days | ~$0.01/GB/month + restore fee | ~$0.004/GB |

At devdash's data volumes (5 projects, 8 users, weekly cadence), total storage cost across all tiers is under $5/month for the first year. Storage is not the constraint — token quota is.

---

*Document owner: Fahad. Last updated: 2026-04-24. Review when project count exceeds 7 or team size exceeds 12.*
