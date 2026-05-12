# Bitbucket webhook + Live activity feed

This adds an **optional** real-time activity feed alongside the existing clone-based
audit dashboard. It is fully additive — when not configured, nothing changes.

## What it does

- `POST /bitbucket/webhook` on the worker — Bitbucket pushes commits here in real time.
- `GET /live` on the worker — session-gated page showing the most recent 100 events.
- The clone-based audit (Sunday `/weekly-audit`) keeps running exactly as before.
- If you run **both**, divergence between the live feed and the audit is itself a forge signal.

## Modes

The mode is set on the worker via `LIVE_FEED_MODE`:

| Mode | Webhook accepted? | `/live` page? | Clone audit? |
|---|---|---|---|
| `clone` (default) | no (404) | no (404) | yes — current behavior |
| `webhook` | yes | yes | no — operator chooses not to run pipeline |
| `both` | yes | yes | yes |

`clone` and `webhook`/`both` are decided on the worker side. Whether the clone
audit *actually runs* is a separate operator choice (run `/weekly-audit` or not).

## One-time setup

### 1 · Generate a webhook secret (any random string)

```bash
# On any machine
openssl rand -hex 32
# copy the output
```

### 2 · Set wrangler secrets

```bash
cd worker
wrangler secret put WEBHOOK_SECRET
# paste the random string

wrangler secret put LIVE_FEED_MODE
# value: clone | webhook | both
```

### 3 · Update `dashboard.config.yaml` to match

Edit the `live_feed.mode` field so the YAML and the wrangler secret agree (the YAML
is informational — the worker reads the secret, not the file).

### 4 · Add the webhook in Bitbucket (per repo)

For each repo in `dashboard.config.yaml` → `projects[].repos`:

1. Repo → **Settings** → **Webhooks** → **Add webhook**
2. **Title**: `devdash live feed`
3. **URL**: `https://devdash.phonebot.co.uk/bitbucket/webhook`
4. **Secret**: paste the same string used for `WEBHOOK_SECRET`
5. **Triggers**: check **Repository push**
6. Save

Push a test commit. Visit `https://devdash.phonebot.co.uk/live` — the commit should
appear within seconds.

## Disabling

Either:

- Unset `WEBHOOK_SECRET`: `wrangler secret delete WEBHOOK_SECRET` — webhook returns 404
- Or set `LIVE_FEED_MODE=clone` — both webhook and `/live` return 404

Either action makes the worker behave exactly like before this branch.

## What's NOT included

- No new Python pipeline modules. The audit pipeline is untouched.
- No changes to the Jinja main dashboard template or `devdash.html`.
- No client-side polling. `/live` is a server-rendered page; refresh to see new events.

## Caveats

- **Webhook payloads have no diffs.** They contain commit metadata only. The clone-based
  audit is the only path that catches whitespace inflation, big-diff merit gaming, etc.
- **Webhooks miss force-push history.** A rewritten branch loses old commits from the
  feed. The clone audit (with `git fetch`) sees them.
- **Events older than the rolling window are dropped.** Default cap is 100. Edit
  `EVENTS_MAX` in `worker/src/routes.ts` to change.
- **Read-modify-write on KV** — webhook arrival rate is low so this is fine; not
  designed for high-volume monorepos.
