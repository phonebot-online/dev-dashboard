/**
 * Send an email via MailChannels free HTTP API.
 * Cloudflare Workers can use MailChannels without auth for outbound email.
 *
 * Docs: https://support.mailchannels.com/hc/en-us/articles/4565898358413
 */

export interface EmailPayload {
  to: string;
  subject: string;
  body: string;
  from?: string;
  fromName?: string;
}

export async function sendEmail(payload: EmailPayload): Promise<void> {
  const from = payload.from || 'devdash@devdash.phonebot.co.uk';
  const fromName = payload.fromName || 'devdash';

  // L17 FIX — add AbortController timeout so a hung MailChannels socket doesn't burn the Worker's 30s CPU budget.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch('https://api.mailchannels.net/tx/v1/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: payload.to }] }],
        from: { email: from, name: fromName },
        subject: `[devdash] ${payload.subject}`,
        content: [{ type: 'text/plain', value: payload.body }],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`MailChannels send failed: ${res.status} ${errBody}`);
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      throw new Error(`MailChannels timed out after 10s — alert queued for retry`);
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * L17 FIX — retry wrapper with KV-backed dead-letter queue. Call this from the scheduled()
 * handler instead of sendEmail() directly. Failed alerts go to `alerts:failed:<date>` KV key
 * so the next day's cron can retry without losing the notification.
 */
export async function sendEmailWithRetry(
  payload: EmailPayload,
  kv: KVNamespace,
  opts: { maxRetries?: number; dateKey?: string } = {},
): Promise<{ ok: boolean; attempts: number; error?: string }> {
  const maxRetries = opts.maxRetries ?? 2;
  const dateKey = opts.dateKey || new Date().toISOString().slice(0, 10);
  let lastError: string | undefined;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      await sendEmail(payload);
      return { ok: true, attempts: i + 1 };
    } catch (e) {
      lastError = (e as Error).message;
      if (i < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, i)));
      }
    }
  }
  // All retries exhausted — write to dead-letter so tomorrow's cron retries
  try {
    const existingRaw = await kv.get(`alerts:failed:${dateKey}`);
    const existing = existingRaw ? JSON.parse(existingRaw) : [];
    existing.push({ payload, last_error: lastError, failed_at: new Date().toISOString() });
    await kv.put(`alerts:failed:${dateKey}`, JSON.stringify(existing));
  } catch (kvErr) {
    console.error('dead-letter KV write failed', kvErr);
  }
  return { ok: false, attempts: maxRetries + 1, error: lastError };
}

/**
 * Daily alert digest. Reads the latest CEO dashboard metadata from KV
 * and sends one email IF any of these conditions trigger:
 *   - stuck PRs > 0
 *   - severity-HIGH open QA bugs
 *   - disagreement flags from PM assessment
 */
export interface AlertSnapshot {
  stuck_prs: Array<{ repo: string; pr_id: number; days_stuck: number; waiting_on: string }>;
  high_qa_bugs: Array<{ project: string; summary: string; days_since: number }>;
  disagreements: Array<{ project: string; note: string }>;
  generated_at: string;
}

export function formatAlertEmail(alerts: AlertSnapshot): { subject: string; body: string } | null {
  const hasStuckPrs = alerts.stuck_prs.length > 0;
  const hasHighBugs = alerts.high_qa_bugs.length > 0;
  const hasDisagreements = alerts.disagreements.length > 0;

  if (!hasStuckPrs && !hasHighBugs && !hasDisagreements) {
    return null;
  }

  const lines: string[] = [];
  lines.push(`devdash daily alert — ${alerts.generated_at}`);
  lines.push('');

  if (hasStuckPrs) {
    lines.push(`STUCK PRs (${alerts.stuck_prs.length}):`);
    for (const pr of alerts.stuck_prs) {
      lines.push(`  • PR #${pr.pr_id} in ${pr.repo} — ${pr.days_stuck} days, waiting on ${pr.waiting_on}`);
    }
    lines.push('');
  }

  if (hasHighBugs) {
    lines.push(`OPEN HIGH-SEVERITY QA BUGS (${alerts.high_qa_bugs.length}):`);
    for (const b of alerts.high_qa_bugs) {
      lines.push(`  • [${b.project}] ${b.summary} — reported ${b.days_since} days ago`);
    }
    lines.push('');
  }

  if (hasDisagreements) {
    lines.push(`PM-vs-DASHBOARD DISAGREEMENTS (${alerts.disagreements.length}):`);
    for (const d of alerts.disagreements) {
      lines.push(`  • [${d.project}] ${d.note}`);
    }
    lines.push('');
  }

  const parts: string[] = [];
  if (hasStuckPrs) parts.push(`${alerts.stuck_prs.length} stuck PR${alerts.stuck_prs.length === 1 ? '' : 's'}`);
  if (hasHighBugs) parts.push(`${alerts.high_qa_bugs.length} HIGH bug${alerts.high_qa_bugs.length === 1 ? '' : 's'}`);
  if (hasDisagreements) parts.push(`${alerts.disagreements.length} disagreement${alerts.disagreements.length === 1 ? '' : 's'}`);

  return {
    subject: parts.join(' + '),
    body: lines.join('\n'),
  };
}
