# AI Insights — "Input cannot be empty" (Custom endpoint) — Investigation & Fix (v3)

| | |
|---|---|
| **Date** | 2026-06-02 |
| **Branch** | `mustafa-faizan-combined` |
| **Reporter** | Fahad (CEO view) — screenshot of `devdash.phonebot.ae` |
| **Component** | `devdash.html` → AI Insights (`generateAIInsights()`) + Settings → AI |
| **Severity** | High — feature 100% broken for the Custom-endpoint provider (the one in use) |
| **Status** | Diagnosis confirmed (two models). **Hardened fix implemented in working tree, `node --check` clean (seen). Not yet proven against a live 200.** |
| **Reviews** | Claude 3-skeptic panel: PASS_WITH_CHANGES. Codex (gpt-5.5 + web search): "root cause correct; fix partially correct." Both folded into this v3. |

> **Evidence legend:** "seen" = verified by directly reading the file/code/command output this session. "review-sourced" = surfaced by a reviewer; where Codex web-verified it against z.ai docs that is noted. "not yet proven" = needs a live 200 from the real endpoint to confirm.

---

## 0. Cross-model agreement (Codex × Claude panel)

| Claim | Claude panel | Codex (gpt-5.5, web) | Status |
|---|---|---|---|
| Root cause = custom body omits `messages` → z.ai code 1214 | confirmed | confirmed (z.ai error-code docs) | **High confidence** (seen in code + both models) |
| Second bug: parser reads `data.text/content`, not `choices[0].message.content` | confirmed | confirmed | **High** (seen at `devdash.html:3994` pre-fix) |
| glm-4.6 can return answer in `reasoning_content` | flagged (review-sourced) | **web-verified** vs z.ai docs | **Corroborated by 2nd model** |
| `reasoning_content` is *reasoning*, not the answer | not stated | **flagged** — do not treat as success | **Codex correction** (changed the fix) |
| Don't cache an empty/garbled response as success; check `finish_reason` | partial (empty-string note) | **flagged** explicitly | **Codex addition** |
| `/api/coding/paas/v4/` is a restricted Coding-Plan surface | flagged (maybe) | **flagged** — likely needs `/api/paas/v4` | **Both; Codex sharpened to likely-remediation** |
| Stale UI placeholder `/v1/messages` (Anthropic-shaped) | not flagged | **flagged** (`devdash.html:2362`) | **Codex-only** (seen) |
| Custom skips key guard + fetches empty endpoint | not flagged | **flagged** (`3930`, `3958`) | **Codex-only** (seen) |
| `aiInsightsError` is dead state (no DOM binding) | flagged | not flagged | **Claude-only** (seen, confirmed) |
| `max_tokens: 1500` truncation for 4-question fan-out | flagged | not flagged | **Claude-only** |
| CORS preflight reasoning rigor | flagged | not flagged | **Claude-only** |
| Playwright `page.route` no-secret regression test | flagged | not flagged | **Claude-only** (`tests-ui/`, seen) |

**One disagreement, resolved:** the Claude panel proposed falling back to `reasoning_content` as the fix; Codex (web-verified) showed `reasoning_content` is the model's thinking, not the answer. **Resolved in Codex's favor:** for z.ai, disable thinking and parse `content`; only surface `reasoning_content` as a clearly-labelled degraded fallback, never as a claimed success.

---

## 1. Problem (symptom) — seen (screenshot)

Clicking **Generate insights now** throws:

```
AI call failed: AI API 400: {"error":{"code":"1214","message":"Input cannot be empty"}}
```

Config at failure: provider = Custom endpoint, model = `glm-4.6`, endpoint = `https://api.z.ai/api/coding/paas/v4/chat/completions`, key present, 4 prompts populated, last run never.

---

## 2. Root cause — seen (code) + corroborated by both models

The custom branch built the body as `{ model, system, user }` with **no `messages` array** (pre-fix `devdash.html:3983`, seen). z.ai chat/completions requires `messages` and ignores top-level `system`/`user`, so it returns code 1214 = "parameter not received properly" (z.ai error docs, Codex-verified).

Independently corroborated:
- 1214 is a missing-required-field error (Codex: z.ai error-code docs).
- Dummy-key curl returns 401, not 1214 → z.ai checks auth before payload, so receiving 1214 proves the key was accepted (Claude panel: live probe).
- `userPrompt` always has text (`devdash.html:3954`, seen), so empty content is not the cause.

Codex caveat (fair): "the only way to produce 1214" is **overstated** — a malformed/empty `messages` array would produce the same class of error. Diagnosis is still correct; certainty was overclaimed in v1/v2.

### Ruled out
- **Worker / Moonshot-Kimi migration:** call fetches `cfg.ai_endpoint` directly in-browser (`devdash.html:3985`/now `4001`, seen). Not involved.
- **CORS / network:** conditionally ruled out — valid only if the 400 was reproduced in-browser (a readable JSON 400 means the preflight passed). Precondition: confirm via DevTools → Network on the deployed page.

---

## 3. The fix as implemented (this working tree) — seen, `node --check` clean

Four edits in `devdash.html`, confined to `generateAIInsights()` and one Settings input. `git diff --stat`: 1 file, +40/−7 (seen). Extracted-function `node --check`: SYNTAX_OK (seen).

**(a) Endpoint guard** (after the existing key guard, ~`devdash.html:3931-3932`):
```js
// custom: API key is optional (local unauthenticated endpoints OK), but the endpoint URL is required.
if (cfg.ai_provider === 'custom' && !(cfg.ai_endpoint || '').trim()) { alert('Custom endpoint URL missing. Add it in Settings → AI.'); return; }
```
Key stays optional for custom on purpose (local llama/Ollama). Addresses Codex "fetches empty endpoint" / no validation.

**(b) Request body → OpenAI-shaped + z.ai-scoped `thinking:disabled`** (custom branch):
```js
const customBody = {
  model: cfg.ai_model,
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ],
  max_tokens: 1500,
};
let customHost = '';
try { customHost = new URL(endpoint).hostname; } catch (_) {}
if (/(^|\.)z\.ai$/i.test(customHost)) customBody.thinking = { type: 'disabled' };
body = JSON.stringify(customBody);
```
`thinking` is sent **only** for z.ai hosts, so OpenRouter/Together/Ollama/etc. are unaffected. Fixes the 400 and routes glm-4.6 output to `content`.

**(c) Parser: content-first, reasoning_content as labelled degraded, no-cache-on-empty + finish_reason**:
```js
const finishReason = data.choices?.[0]?.finish_reason;
// anthropic → (data.content?.[0]?.text||'').trim(); openai → (choices[0].message.content||'').trim();
// custom:
const m = data.choices?.[0]?.message;
insights = (m?.content || '').trim();
if (!insights && (m?.reasoning_content || '').trim()) {
  insights = '[no final answer returned — showing model reasoning]\n\n' + m.reasoning_content.trim();
}
// then, for all providers:
if (!insights) {
  throw new Error('AI returned no usable text' + (finishReason ? ' (finish_reason: ' + finishReason + ')' : '') + '. Raw: ' + JSON.stringify(data).slice(0, 200));
}
```
A blank/garbled response now **throws → no cache** (was: cached `JSON.stringify(data)` as "success"). `reasoning_content` is surfaced only with an explicit "not the final answer" label. Addresses Codex findings #1 and #2.

> **Design choice (not a vendor fact):** when `content` is empty but `reasoning_content` is present, we show the labelled reasoning rather than hard-failing. Codex leaned toward treating that as an error. The label keeps it honest (not claimed as the answer) while still giving the CEO something. Reasonable people could pick the stricter throw-always; flagged so it can be changed.

**(d) UI label/placeholder** (`devdash.html:2361-2362`, seen): label now reads "Custom endpoint — OpenAI-compatible /chat/completions"; placeholder changed from the Anthropic-shaped `https://api.example.com/v1/messages` to `https://api.z.ai/api/paas/v4/chat/completions` (the general z.ai endpoint, not the coding one). Addresses Codex "stale UI contract."

---

## 4. Still open — needs a live call to close (not yet proven)

1. **Real 200 with readable prose.** Code shape is correct and syntax-clean, but neither model could prove glm-4.6 returns prose in `content` (vs reasoning) or that the endpoint accepts the call, without a live request. **Verify:** reload deployed page → Settings → AI → Generate insights now → expect no 400 and readable prose (not a JSON blob, not a `[showing model reasoning]` block).
2. **Endpoint surface.** Codex (web-verified): the general OpenAI-compatible endpoint is `https://api.z.ai/api/paas/v4`, and `/coding/paas/v4` is for supported coding tools — a browser dashboard is not one. The placeholder now nudges to `/api/paas/v4`, but the configured `cfg.ai_endpoint` is **not** auto-rewritten (user owns it). If the live call 4xx's on plan/quota, switch the endpoint to `/api/paas/v4`. A plan/quota 4xx is a **distinct** failure from the 1214 payload error, not a regression.

---

## 5. Verify (observe, don't infer)

- **Live click test** (above) is the gate. Do not call the fix "working" until a 200 + readable prose is seen.
- **Optional throwaway curl** (no committed secret): test the new body against `coding/paas/v4`; if rejected, try `paas/v4`.
- **Repeatable regression test (net-new, no AI secret):** `tests-ui/devdash-ui.spec.mjs` (seen; Playwright ^1.47, drives a deployed target via `SECRETS.DEVDASH_URL`, seen). Add `page.route('**/chat/completions', ...)` to assert the outgoing body has a non-empty `messages` array (Change b) and return a canned `{choices:[{message:{content:'…'}}]}` to prove the panel renders prose (Change c). Additive — no AI scaffolding exists today (seen).

---

## 6. Risk & rollback

- **Risk:** low. Confined to `generateAIInsights()` + one Settings input. `anthropic`/`openai` request branches untouched; their parser branches were tightened to also not-cache-empty (strict improvement). No data model / storage / worker changes.
- **Rollback:** single change in one file → `git checkout devdash.html` (uncommitted) or `git revert <sha>` (after commit).

---

## 7. Deferred / should-consider

- **`*.md` is gitignored** (`.gitignore:36`, seen) → this doc is not tracked unless force-added. Decide whether the team wants design docs in-repo.
- **`aiInsightsError` is dead state** (seen: declared/reset/set at `3323/3941/4035`, zero DOM bindings). Failures still use blocking `alert()`. Wiring in-panel errors is net-new.
- **`max_tokens: 1500`** may truncate the 3rd/4th answer of the 4-question fan-out. Raise it for custom or accept as a known limit.
- **Dedup** `openai` + `custom` branches — but they now differ (z.ai `thinking`, reasoning fallback), so not a clean merge.
- **Settings help text** could state the z.ai general-vs-coding endpoint distinction explicitly.
