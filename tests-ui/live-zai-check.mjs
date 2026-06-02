// Live-200 check for the AI Insights fix against the REAL z.ai endpoint.
// Builds the same request body the fixed devdash.html sends (messages + thinking:disabled
// for z.ai hosts), POSTs to BOTH the coding and general endpoints, and reports status +
// whether the answer lands in message.content vs reasoning_content.
//
// Run (key loaded from .env, never printed):
//   node --env-file=.env tests-ui/live-zai-check.mjs
//
// The API key is read from process.env.ZAI_API_KEY and is never logged or committed.

const KEY = process.env.ZAI_API_KEY;
const MODEL = process.env.ZAI_MODEL || 'glm-4.6';
if (!KEY || !KEY.trim()) {
  console.error('ZAI_API_KEY is empty. Put your key in .env (ZAI_API_KEY=...) then run:');
  console.error('  node --env-file=.env tests-ui/live-zai-check.mjs');
  process.exit(2);
}

const ENDPOINTS = [
  'https://api.z.ai/api/coding/paas/v4/chat/completions', // the one configured in the screenshot
  'https://api.z.ai/api/paas/v4/chat/completions',        // the general OpenAI-compatible endpoint
];

const systemPrompt = 'You are a senior engineering manager reviewing a weekly dev-team dashboard. Be terse and specific. Answer in 1-2 sentences.';
const userPrompt = 'Dashboard snapshot:\n' + JSON.stringify({ projects: [{ name: 'Demo', percent_complete: 40, days_remaining: 12 }], bugs_open: 3 }, null, 2)
  + '\n\nAnswer these questions:\nWhich project is most at risk of missing its deadline and why? Quote the exact percent_complete and days_remaining.';

function bodyFor(endpoint) {
  const b = {
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: 1500,
  };
  let host = '';
  try { host = new URL(endpoint).hostname; } catch (_) {}
  if (/(^|\.)z\.ai$/i.test(host)) b.thinking = { type: 'disabled' }; // matches devdash.html fix
  return b;
}

async function probe(endpoint) {
  const started = Date.now();
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY },
      body: JSON.stringify(bodyFor(endpoint)),
    });
    const ms = Date.now() - started;
    const text = await res.text();
    let data = null; try { data = JSON.parse(text); } catch (_) {}
    console.log('\n=== ' + endpoint + ' ===');
    console.log('HTTP ' + res.status + '  (' + ms + 'ms)');
    if (!res.ok) {
      console.log('ERROR BODY: ' + text.slice(0, 300));
      return;
    }
    const m = data?.choices?.[0]?.message;
    const finish = data?.choices?.[0]?.finish_reason;
    const content = (m?.content || '').trim();
    const reasoning = (m?.reasoning_content || '').trim();
    console.log('finish_reason: ' + (finish ?? '(none)'));
    console.log('message.content present: ' + (content ? 'YES (' + content.length + ' chars)' : 'NO'));
    console.log('message.reasoning_content present: ' + (reasoning ? 'YES (' + reasoning.length + ' chars)' : 'NO'));
    // What the fixed parser would render (content first, then labelled reasoning):
    const rendered = content || (reasoning ? '[no final answer returned — showing model reasoning]\n\n' + reasoning : '');
    console.log('--- what devdash would render (first 400 chars) ---');
    console.log(rendered ? rendered.slice(0, 400) : '(empty — fix would THROW and not cache)');
  } catch (e) {
    console.log('\n=== ' + endpoint + ' ===');
    console.log('NETWORK/FETCH ERROR: ' + e.message);
  }
}

(async () => {
  console.log('Model: ' + MODEL + '  (key length ' + KEY.trim().length + ', not shown)');
  for (const ep of ENDPOINTS) await probe(ep);
  console.log('\nDone. A 200 with message.content present on either endpoint = live-200 gap closed.');
})();
