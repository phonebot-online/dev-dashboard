# Adding the Bitbucket webhook + Live Activity feed to an existing deploy

**Audience:** someone who already has the `dev-dashboard` repo cloned, already has
`wrangler` connected to their Cloudflare account, and already has the worker
deployed (e.g. `https://devdash.mustafa-78e.workers.dev/`) with the **old `main`
branch code**. TOTP login already works.

This doc walks through the **delta only** — what to do to add the webhook
functionality from the `FAIZAN-DEV` branch on top of a working deploy.

---

## What you'll have when finished

Two new endpoints on your existing worker:

| Endpoint | Purpose |
|---|---|
| `POST https://devdash.mustafa-78e.workers.dev/bitbucket/webhook` | Receives signed Bitbucket push events, stores them in KV |
| `GET https://devdash.mustafa-78e.workers.dev/live` | Login-gated page showing the latest 100 commits in real time |

The existing `/`, `/login`, `/logout`, audit dashboard, TOTP — all unchanged.

---

## Total time

About 10 minutes. No new accounts, no new tools, no new dependencies.

---

## Step 1 · Switch to the FAIZAN-DEV branch

From the repo root (`dev-dashboard/`):

```bash
# Make sure your working tree is clean first
git status

# Pull latest + checkout the feature branch
git fetch origin
git checkout FAIZAN-DEV
git pull origin FAIZAN-DEV
```

You should now see these files:
- `worker/src/routes.ts` — new webhook + `/live` handlers (you'll see the new code if you scroll past `handleLogout`)
- `worker/src/index.ts` — new optional env keys
- `WEBHOOK-SETUP.md` — short-form setup doc
- `dashboard.config.yaml` — informational `live_feed:` block

If the checkout fails because you have local changes, either commit them or stash:

```bash
git stash push -m "pre-faizan-dev"
git checkout FAIZAN-DEV
# later: git stash pop
```

---

## Step 2 · Generate your webhook secret

This is a random string used to verify Bitbucket push events are real. You'll
share it between Cloudflare (your worker) and Bitbucket (each repo). Save it —
you can't recover it later.

```bash
openssl rand -hex 32
```

Copy the output. Example value: `a1b2c3d4e5f6...` (64 hex chars).

If you don't have `openssl` on Windows, any password manager that generates
random strings works. Aim for ≥32 chars, alphanumeric.

---

## Step 3 · Set the two new wrangler secrets

```bash
cd worker

# Webhook secret — paste the value from step 2 when prompted
npx wrangler secret put WEBHOOK_SECRET

# Mode — type one of: clone | webhook | both
npx wrangler secret put LIVE_FEED_MODE
```

For mode, **`both`** is the recommended setting:
- Clone audit keeps running like today
- Webhooks accepted, `/live` page exposed
- Divergence between the two is itself a forge signal

(Pick `clone` if you only want to provision the secret but keep the feature
disabled — webhook returns 404, `/live` returns 404. Pick `webhook` if you
plan to skip the clone audit pipeline entirely.)

Verify both are set:

```bash
npx wrangler secret list
# expect to see (at least): TOTP_ENCRYPTION_KEY, WEBHOOK_SECRET, LIVE_FEED_MODE
```

---

## Step 4 · Deploy

```bash
npx wrangler deploy
```

Expected output ends with:
```
Uploaded devdash (~10 sec)
Deployed devdash triggers (~2 sec)
  https://devdash.mustafa-78e.workers.dev
Current Version ID: <some-uuid>
```

Your deployed URL stays the same. The KV namespace stays the same. Existing
TOTP users stay logged-in-able.

---

## Step 5 · Smoke test the webhook with a fake payload

Create a file `worker/test-webhook.py`:

```python
import hashlib, hmac, json, sys, urllib.request

# Paste the WEBHOOK_SECRET from step 2 here:
SECRET = "PASTE-YOUR-SECRET-HERE"
URL = "https://devdash.mustafa-78e.workers.dev/bitbucket/webhook"

payload = {
    "repository": {"full_name": "kuztech/test-repo"},
    "push": {"changes": [{
        "new": {"name": "main"},
        "commits": [{
            "hash": "abc123def456",
            "date": "2026-04-30T10:30:00+00:00",
            "message": "test: webhook smoke",
            "author": {"raw": "Mustafa <mustafa@phonebot.com.au>"},
        }],
    }]},
}
body = json.dumps(payload).encode()
sig = "sha256=" + hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest()

req = urllib.request.Request(URL, data=body, headers={
    "Content-Type": "application/json",
    "X-Hub-Signature": sig,
    "X-Event-Key": "repo:push",
    "User-Agent": "Bitbucket-Webhooks/2.0",
})
try:
    with urllib.request.urlopen(req) as r:
        print(f"HTTP {r.status} — {r.read().decode()}")
except urllib.error.HTTPError as e:
    print(f"HTTP {e.code} — {e.read().decode()}")
```

Run it:
```bash
cd worker
python test-webhook.py
```

**Expected:** `HTTP 200 — {"ok":true,"stored":1}`

If you get `HTTP 403 — error code: 1010` it means Cloudflare's bot defense
blocked the request. The `User-Agent` header above should prevent this — make
sure you didn't strip it.

If you get `HTTP 401 — Bad signature`, the secret in the Python script doesn't
match the wrangler secret. Re-paste exactly.

If you get `HTTP 404 — Not Found`, either `LIVE_FEED_MODE` isn't set or it's
set to `clone`. Re-run step 3 with mode `both`.

---

## Step 6 · See the event on /live

1. Open `https://devdash.mustafa-78e.workers.dev/`
2. Log in with your TOTP code
3. Navigate to `https://devdash.mustafa-78e.workers.dev/live`
4. You should see the fake commit from step 5 in the table

If the page shows the login form instead of events, your session expired —
log in again at `/` first.

---

## Step 7 · Connect a real Bitbucket repo

This is when the feature becomes useful — actual pushes show up live.

Pick a repo (start with one to test, then expand):

1. Bitbucket → repo → **Repository settings** → **Webhooks** → **Add webhook**
2. Fill in:
   - **Title**: `devdash live feed` (anything you want)
   - **URL**: `https://devdash.mustafa-78e.workers.dev/bitbucket/webhook`
   - **Secret**: the same value you used in step 2
   - **Status**: Active
   - **SSL/TLS Verification**: leave on
   - **Triggers**: under "Repository", check **Push** (only)
3. Save

Test it:
```bash
# In a clone of that Bitbucket repo:
git commit --allow-empty -m "webhook test"
git push
```

Refresh `https://devdash.mustafa-78e.workers.dev/live` — your commit should
appear within a few seconds.

If it doesn't, check Bitbucket's delivery log:
- Repo → Settings → Webhooks → click your webhook → **View requests**
- Recent deliveries should show `200` response codes
- A `401` means your Bitbucket secret doesn't match `WEBHOOK_SECRET`
- A `404` means the worker mode is `clone` — re-set `LIVE_FEED_MODE` to `both`

Repeat for each repo you want tracked.

---

## Daily operation

Once configured, there's nothing to maintain. Pushes arrive in real time, the
events list rolls over after 100 events (oldest dropped). The clone-based
audit (your weekly Sunday `/weekly-audit` flow) keeps running independently
and is unaffected.

---

## Disabling

If you want to turn the feature off without redeploying:

```bash
cd worker
echo "clone" | npx wrangler secret put LIVE_FEED_MODE
```

That immediately makes `/bitbucket/webhook` and `/live` return 404. Bitbucket
will start failing webhook deliveries — that's harmless, it just retries a few
times then stops.

To remove entirely:
```bash
npx wrangler secret delete WEBHOOK_SECRET
npx wrangler secret delete LIVE_FEED_MODE
git checkout main
npx wrangler deploy
```

---

## Reference: troubleshooting matrix

| Symptom | Most likely cause | Fix |
|---|---|---|
| `wrangler deploy` fails: "Could not resolve crypto" | Missing nodejs_compat flag | Add `compatibility_flags = ["nodejs_compat"]` to `wrangler.toml` under the compatibility_date line |
| Webhook returns `404` | `LIVE_FEED_MODE` is `clone` or unset | Re-run step 3 with mode `both` |
| Webhook returns `401 Bad signature` | Secret mismatch | Confirm Bitbucket secret == `WEBHOOK_SECRET` value |
| Webhook returns `403 / 1010` | Cloudflare blocking the User-Agent | Real Bitbucket UA isn't blocked. Only the local Python test script needs the spoofed UA header. |
| `/live` shows login form | No active session | Log in at `/` first |
| `/live` shows but events table empty | Webhook never delivered | Check Bitbucket → Settings → Webhooks → View requests |
| Events delivered but stale | KV is eventually consistent (~60 sec global) | Wait, refresh, or hit a different region |
| Events fall off the list | Rolling window cap (100 events) | Edit `EVENTS_MAX` in `worker/src/routes.ts` and redeploy |

---

## What not to do

- **Don't commit your `WEBHOOK_SECRET`** to the repo. The `test-webhook.py`
  file with the secret embedded should stay local — add it to `.gitignore` if
  you want a permanent copy.
- **Don't share the secret in Slack / email screenshots.** Anyone with the
  secret can submit fake events to your `/live` feed.
- **Don't put the worker on a custom domain without rotating the secret.**
  If you change deployed URLs, generate a new secret and update Bitbucket.
- **Don't deploy from `FAIZAN-DEV` directly to production-critical
  infrastructure** without a test pass first. The branch is reviewed but
  hasn't been through a full PR cycle.

---

## Files this branch added or changed

- `worker/src/index.ts` — added `WEBHOOK_SECRET?` and `LIVE_FEED_MODE?` to the
  `Env` interface (both optional; absence = feature disabled)
- `worker/src/routes.ts` — added two route handlers + HMAC verify helper +
  Bitbucket payload parser + `/live` HTML renderer (~210 new lines)
- `dashboard.config.yaml` — added an informational `live_feed:` block
- `WEBHOOK-SETUP.md` — short-form setup doc (this is the long-form one)

Nothing else changed. Pipeline (`scripts/dashboard/*.py`), Jinja templates,
`devdash.html`, tests — all untouched.
