import { handleRequest } from './routes';
import { sendEmail, formatAlertEmail, AlertSnapshot } from './email';

export interface Env {
  DASHBOARD_KV: KVNamespace;
  TOTP_ENCRYPTION_KEY: string;
  // TODO: consolidate the two webhook secrets below — they're duplicates from
  // parallel implementations on Mustafa + FAIZAN-DEV branches. Pick one
  // canonical name (BITBUCKET_WEBHOOK_SECRET is more explicit) and drop the
  // other in a follow-up PR. For now both coexist so neither implementation
  // breaks; routes use whichever they know about.
  //
  // Faizan's /bitbucket/webhook + /live page (FAIZAN-DEV branch):
  WEBHOOK_SECRET?: string;
  // "clone" | "webhook" | "both". Defaults to "clone" when unset.
  LIVE_FEED_MODE?: string;
  // Mustafa's /api/bitbucket-hook + /api/state.commits (Mustafa branch):
  BITBUCKET_WEBHOOK_SECRET: string;
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
