// Smoke test for the AI Insights custom-endpoint fix (devdash.html generateAIInsights()).
// Runs the REAL method source extracted from devdash.html against a stubbed fetch.
// No CDN, no login, no API key. Node 22+.  Run: node tests-ui/ai-insights-smoke.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.join(__dirname, '..', 'devdash.html');

// --- Extract the real generateAIInsights() method text from devdash.html ---
const src = fs.readFileSync(HTML, 'utf8');
const sigIdx = src.indexOf('async generateAIInsights() {');
const nextIdx = src.indexOf('exportAllData() {', sigIdx);
if (sigIdx < 0 || nextIdx < 0) { console.error('FATAL: could not locate generateAIInsights in devdash.html'); process.exit(2); }
let slice = src.slice(sigIdx, nextIdx);
slice = slice.slice(0, slice.lastIndexOf('}') + 1); // trim back to the method's closing brace
const methodSource = slice.replace('async generateAIInsights', 'async function genFn'); // method -> function expr

let results = [];
function check(name, cond, detail) { results.push({ name, ok: !!cond, detail: detail || '' }); }

// --- Build a fake Alpine component `this` with everything the method touches ---
function makeThis(cfg) {
  return {
    config: { system: cfg, projects: [{ id: 'p1', name: 'Proj', traffic_light: 'green', percent_complete: 50, forecast_launch: '2026-07' }] },
    devs: [{ displayName: 'Dev', compass: { velocity: 1 }, handoff_mult: 1, off_project_hours: 0, items_closed: 1, summary: 's' }],
    bugs: [], auditFindings: [], disputes: [], stuckPrs: [], regressionCandidates: [], rewardEvents: [],
    auditLog: [],
    aiInsightsCache: null, aiInsightsLoading: false, aiInsightsError: null,
    currentUser: { displayName: 'Tester' },
    currentWeekStart: () => '2026-06-01',
    daysRemainingFor: () => 30,
    projectTrafficLight: (p) => p?.traffic_light || 'green',
    projectPercentComplete: (p) => p?.percent_complete ?? 50,
    save() {},
    nextId: () => 1,
  };
}

// --- Stub browser globals ---
let lastAlert = null;
globalThis.alert = (m) => { lastAlert = String(m); };
globalThis.confirm = () => true; // never block on cache prompt

let captured = null; // { url, headers, bodyObj }
function installFetch(responder) {
  globalThis.fetch = async (url, opts) => {
    captured = { url, headers: opts.headers, bodyObj: JSON.parse(opts.body) };
    return responder();
  };
}
const okJson = (obj) => ({ ok: true, status: 200, async json() { return obj; }, async text() { return JSON.stringify(obj); } });

// Compile the extracted method once.
let genFn;
eval(methodSource.replace('async function genFn', 'genFn = async function')); // assign to outer genFn

async function run(cfg, responder) {
  captured = null; lastAlert = null;
  installFetch(responder);
  const ctx = makeThis(cfg);
  await genFn.call(ctx);
  return ctx;
}

const zaiCoding = 'https://api.z.ai/api/coding/paas/v4/chat/completions';
const base = { ai_provider: 'custom', ai_model: 'glm-4.6', ai_api_key: 'test-key', ai_cache_hours: 24, ai_prompts: 'Q1\nQ2', ai_endpoint: zaiCoding };

(async () => {
  // Scenario 1: z.ai host, normal content -> renders prose, body has messages + thinking
  {
    const ctx = await run({ ...base }, () => okJson({ choices: [{ message: { content: 'CEO-READY INSIGHT' }, finish_reason: 'stop' }] }));
    check('S1 request body has messages array (2 items, system+user)',
      Array.isArray(captured?.bodyObj?.messages) && captured.bodyObj.messages.length === 2 &&
      captured.bodyObj.messages[0].role === 'system' && captured.bodyObj.messages[1].role === 'user',
      JSON.stringify(captured?.bodyObj?.messages?.map(m => m.role)));
    check('S1 request body has NO legacy system/user top-level fields',
      captured?.bodyObj && !('user' in captured.bodyObj) && !('system' in captured.bodyObj));
    check('S1 z.ai host => thinking:{type:"disabled"} sent',
      captured?.bodyObj?.thinking && captured.bodyObj.thinking.type === 'disabled',
      JSON.stringify(captured?.bodyObj?.thinking));
    check('S1 renders content as insights', ctx.aiInsightsCache?.insights === 'CEO-READY INSIGHT', ctx.aiInsightsCache?.insights);
    check('S1 no error', ctx.aiInsightsError === null);
  }

  // Scenario 2: empty content + reasoning_content -> labelled degraded fallback
  {
    const ctx = await run({ ...base }, () => okJson({ choices: [{ message: { content: '', reasoning_content: 'MODEL THINKING TEXT' }, finish_reason: 'stop' }] }));
    const ins = ctx.aiInsightsCache?.insights || '';
    check('S2 reasoning_content surfaced as labelled degraded',
      ins.startsWith('[no final answer returned') && ins.includes('MODEL THINKING TEXT'), ins.slice(0, 60));
  }

  // Scenario 3: empty content + no reasoning -> throws, NOT cached, alert shown w/ finish_reason
  {
    const ctx = await run({ ...base }, () => okJson({ choices: [{ message: { content: '' }, finish_reason: 'length' }] }));
    check('S3 empty response NOT cached as success', !ctx.aiInsightsCache?.insights, ctx.aiInsightsCache?.insights || '(none)');
    check('S3 alert fired with finish_reason', /no usable text/.test(lastAlert || '') && /finish_reason: length/.test(lastAlert || ''), lastAlert);
    check('S3 aiInsightsError set', typeof ctx.aiInsightsError === 'string' && ctx.aiInsightsError.length > 0, ctx.aiInsightsError);
  }

  // Scenario 4: non-z.ai custom host (OpenRouter) -> NO thinking field, content renders
  {
    const ctx = await run({ ...base, ai_endpoint: 'https://openrouter.ai/api/v1/chat/completions' },
      () => okJson({ choices: [{ message: { content: 'OR OK' }, finish_reason: 'stop' }] }));
    check('S4 non-z.ai host => thinking NOT sent', captured?.bodyObj && !('thinking' in captured.bodyObj), JSON.stringify(captured?.bodyObj?.thinking));
    check('S4 content still renders', ctx.aiInsightsCache?.insights === 'OR OK');
  }

  // Scenario 5: empty endpoint -> guarded, fetch never called, alert shown
  {
    const ctx = await run({ ...base, ai_endpoint: '' }, () => { throw new Error('fetch should not be called'); });
    check('S5 empty endpoint => fetch NOT called', captured === null);
    check('S5 endpoint-missing alert shown', /Custom endpoint URL missing/.test(lastAlert || ''), lastAlert);
  }

  // --- Report ---
  let pass = 0, fail = 0;
  for (const r of results) { console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : '   <-- ' + r.detail}`); r.ok ? pass++ : fail++; }
  console.log(`\n${pass}/${pass + fail} checks passed`);
  process.exit(fail ? 1 : 0);
})();
