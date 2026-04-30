import { handleRequest } from './routes';
import { sendEmail, formatAlertEmail, AlertSnapshot } from './email';

export interface Env {
  DASHBOARD_KV: KVNamespace;
  TOTP_ENCRYPTION_KEY: string;
  // Optional. When unset, /bitbucket/webhook returns 404 and /live is hidden.
  // Set via: wrangler secret put WEBHOOK_SECRET
  WEBHOOK_SECRET?: string;
  // "clone" | "webhook" | "both". Defaults to "clone" when unset.
  // Set via: wrangler secret put LIVE_FEED_MODE
  LIVE_FEED_MODE?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },

  async scheduled(event: ScheduledController, env: Env): Promise<void> {
    // Pull the current alert snapshot written by the weekly-audit script.
    const raw = await env.DASHBOARD_KV.get('alerts:latest');
    if (!raw) {
      // No alerts snapshot yet — weekly-audit hasn't run. Nothing to do.
      return;
    }

    let alerts: AlertSnapshot;
    try {
      alerts = JSON.parse(raw) as AlertSnapshot;
    } catch {
      console.error('alerts:latest is not valid JSON, skipping');
      return;
    }

    const email = formatAlertEmail(alerts);
    if (!email) {
      // No triggers — all clear.
      return;
    }

    try {
      await sendEmail({
        to: 'fahad@phonebot.com.au',
        subject: email.subject,
        body: email.body,
      });
    } catch (e) {
      console.error('Email send failed:', e);
      // Don't rethrow — cron will retry tomorrow.
    }
  },
};
