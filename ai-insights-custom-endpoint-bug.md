# AI Insights — "Input cannot be empty" (Custom endpoint) — Investigation & Fix (v4)

| | |
|---|---|
| **Date** | 2026-06-02 |
| **Branch** | `mustafa-faizan-combined` |
| **Reporter** | Fahad (CEO view) — screenshot of `devdash.phonebot.ae` |
| **Component** | `devdash.html` → AI Insights (`generateAIInsights()`) + Settings → AI |
| **Severity** | High — feature 100% broken for the Custom-endpoint provider (the one in use) |
| **Status** | **FIXED + live-200 PROVEN (seen).** Real call to `…/coding/paas/v4` returned HTTP 200 with readable `message.content`. Smoke test 13/13. |
| **Reviews** | Claude 3-skeptic panel (PASS_WITH_CHANGES) + Codex gpt-5.5/web ("root cause correct; fix partially correct") + a live z.ai call. |

> **Evidence legend:** "seen" = verified by directly reading the file/code/command output this session. "review-sourced" = surfaced by a reviewer (Codex web-verification noted where it applies). "live" = proven by a real call to z.ai (see §1).

---

## 1. Live-200 result (seen — this is the ground truth)

Ran the fixed request body against the real z.ai API with Fahad's key via `tests-ui/live-zai-check.mjs` (`node --env-file=.env ...`; key gitignored, never printed):

| Endpoint | Result (seen) |
|---|---|
| `https://api.z.ai/api/coding/paas/v4/chat/completions` (the configured one) | **HTTP 200**, 3.7s, `finish_reason: stop`, **`message.content` present (107 chars)**, `reasoning_content`: none |
| `https://api.z.ai/api/paas/v4/chat/completions` (the "general" endpoint) | **HTTP 429**, code `1113` `"Insufficient balance or no resource package. Please recharge."` |

Rendered output the dashboard would show (seen): *"The **Demo** project is at risk because 40% complete with only 12 days remaining suggests a velocity issue."*

What this proves / overturns:
- **Fix works end-to-end** against the real endpoint — 200 + readable prose. ✅
- **glm-4.6 returned the answer in `message.content`, not `reasoning_content`** (with `thinking:{type:'disabled'}` sent). Content-first parse is correct; the thinking-disable does its job. ✅
- **The `/coding/paas/v4` endpoint is the RIGHT one for this account.** Codex (review-sourced) recommended switching to `/api/paas/v4`; the live call shows that endpoint returns 429 insufficient-balance for this account (its package is on the Coding plan). So the configured coding endpoint is correct, not a risk. ❌ (the "switch to /paas/v4" remediation is refuted for this account.)

---

## 2. Root cause — seen (code) + corroborated by both models + live

Pre-fix, the custom branch built the body as `{ model, system, user }` with **no `messages` array** (pre-fix `devdash.html:3983`, seen). z.ai chat/completions requires `messages` and ignores top-level `system`/`user`, so it returned code 1214 = "parameter not received properly".

Corroboration: z.ai error docs map 1214 to a missing-required-field error (Codex, web). A dummy-key curl returns 401, not 1214 → z.ai checks auth before payload, so 1214 proves the key was accepted (Claude panel, live probe). `userPrompt` always has text (`devdash.html:3954`, seen). Codex caveat (fair): "the only way to produce 1214" was overstated — a malformed/empty `messages` array errors the same way.

Ruled out: worker/Moonshot-Kimi migration (call is direct browser→`cfg.ai_endpoint`, seen); CORS (a readable JSON 400/200 came back, so the request reaches z.ai — now confirmed by the live 200).

---

## 3. The fix as shipped — seen, `node --check` clean, smoke 13/13, live 200

Edits in `devdash.html`, confined to `generateAIInsights()` + one Settings input.

**(a) Endpoint guard** (~`devdash.html:3931-3932`): custom requires an endpoint URL up front; API key stays optional (local llama/Ollama).

**(b) OpenAI-shaped body + z.ai-scoped `thinking:disabled`** (custom branch): `{ model, messages:[system,user], max_tokens:1500 }`, plus `thinking:{type:'disabled'}` **only** when `new URL(endpoint).hostname` matches `*.z.ai`. Other custom endpoints (OpenRouter/Together/Ollama) are unaffected. Live-proven to return `content`.

**(c) Content-first parser, labelled reasoning fallback, no-cache-on-empty + finish_reason**: reads `choices[0].message.content`; surfaces `reasoning_content` only as a clearly-labelled degraded block; **throws (no cache)** on empty/garbled responses, recording `finish_reason`.

**(d) UI** (`devdash.html:2361-2362`, seen): label → "Custom endpoint — OpenAI-compatible /chat/completions"; placeholder → `https://api.z.ai/api/coding/paas/v4/chat/completions` (the endpoint that actually returns 200 for this Coding-plan account; the general `/api/paas/v4` returns 429 for it — see §1). Was the Anthropic-shaped `/v1/messages`.

---

## 4. Tests

- **Unit/logic smoke** — `tests-ui/ai-insights-smoke.mjs` (committed). Extracts the real `generateAIInsights()` source and runs it against a stubbed fetch. **13/13 pass (seen):** z.ai content render, `reasoning_content` degraded fallback, empty→no-cache+alert+finish_reason, non-z.ai host omits `thinking`, missing-endpoint guard. Run: `node tests-ui/ai-insights-smoke.mjs`.
- **Live-200** — `tests-ui/live-zai-check.mjs` (reads key from gitignored `.env`, never logs/commits it). See §1. Run: `node --env-file=.env tests-ui/live-zai-check.mjs`.

---

## 5. Risk & rollback

- **Risk:** low. Confined to `generateAIInsights()` + one Settings input. `anthropic`/`openai` request branches untouched (their parsers were tightened to also not-cache-empty — strict improvement). No data model / storage / worker changes.
- **Rollback:** `git revert` the fix commit(s).

---

## 6. Deferred / should-consider (non-blocking)

- **`*.md` is gitignored** (`.gitignore:36`, seen); this doc is force-added as a deliberate exception.
- **`aiInsightsError` is dead state** (seen: declared/reset/set at `3323/3941/4035`, zero DOM bindings). Failures still use blocking `alert()`. In-panel error display is net-new.
- **`max_tokens: 1500`** may truncate the 3rd/4th answer of the 4-question fan-out (live test used 1 short prompt → 107 chars, well under). Raise for custom or accept as a known limit.
- **General-API users** (not on a Coding plan) should use `/api/paas/v4`; this deployment's account uses `/coding/paas/v4` (live-confirmed). A note in the Settings help text would prevent confusion.
