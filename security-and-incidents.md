# devdash — Security & Incident Response

**Owner:** Fahad (CEO, Phonebot)
**Domain:** devdash.phonebot.co.uk
**Date written:** 2026-04-24
**Applies to:** All 8 users — fahad, imran, faizan, moazzam, faisal, usama, mustafa, qa (all @phonebot.com.au)
**Infrastructure:** AWS (S3 + DynamoDB + Lambda + SES + API Gateway + Secrets Manager) + Cloudflare Worker + Route 53/Cloudflare DNS

---

## 1. Threat Model

### What we are protecting

**Merit scores and signal breakdowns.** These directly affect pay, bonuses, and promotion decisions. A leaked score creates interpersonal damage. A manipulated score creates liability. The signal breakdown (which handoff entries were counted, which commits were matched) is equally sensitive — it is the evidence trail behind the number.

**Private CEO/PM notes.** Fahad and Imran upload strategic and performance notes into `uploads/fahad/` and `uploads/imran/`. These may include candid observations about individual developers that are never intended for the team to read. Exposure of these notes is a trust and employment relations risk.

**Internal commit metadata.** Git paths, file names, and commit messages in the dashboard reveal the internal architecture of live systems — what modules exist, what is being actively changed, what is broken. An attacker who can read `handoffs/` or `week-summaries/` can infer a map of the codebase without ever touching a repo.

**TOTP secrets.** Each user's TOTP secret is the only credential they have. There are no passwords. A TOTP secret at rest (encrypted in DynamoDB or S3 `global/users/`) is protected by AES-GCM with the master key. If an attacker obtains both the ciphertext and the master key, they can generate valid login codes for any user indefinitely.

**AES master key.** Stored in AWS Secrets Manager. Compromise of this key compromises every TOTP secret for every user simultaneously. This is the single highest-value credential in the system.

---

### Threat actors

**Disgruntled developer before departure.** A dev with legitimate login access, knowing they are leaving, may attempt to exfiltrate their own merit history, others' scores, or CEO notes before their account is revoked. This is the most likely threat. Mitigation: role-based API enforcement means a dev session cannot read another dev's scores or CEO uploads — even if they know the API paths.

**Competitor or phishing attack targeting Fahad or Imran.** The dashboard domain (`devdash.phonebot.co.uk`) is publicly resolvable. A targeted phishing email to Fahad could yield session cookies or trick him into scanning a fake QR code on a cloned login page. The SameSite=Strict cookie policy reduces the cookie-theft risk. TOTP provides a second layer if credentials are phished.

**Compromised developer machine.** A dev's laptop with an active session cookie could expose their dashboard view if the machine is compromised. Scope is limited to that dev's role — own handoffs, own merit score, knowledge cards. The 24-hour TTL limits the exposure window.

**Insider sabotage.** A developer with access to the codebase (not the dashboard) alters the merit scoring code or the weekly audit script to manipulate their own score upward. Mitigation: merit override requires CEO-authenticated admin action, which is logged. Score manipulation via code change would require Fahad to deploy it.

**Cloud provider outage or data loss.** DynamoDB point-in-time recovery (35 days) and S3 Glacier Deep Archive (365+ days) cover most data-loss scenarios. The primary risk is an accidental bulk delete (human error, not AWS failure).

---

### Out of scope

- Nation-state attackers. Not a realistic threat for a 8-person Australian e-commerce team.
- Physical break-in. Covered by office security, not this document.
- Vulnerability research or penetration testing by external parties. No bug bounty programme is in place.

---

## 2. Authentication and Authorization

### TOTP login (no passwords)

The dashboard has no password field. Login is email + 6-digit TOTP code from Google Authenticator. There is no "forgot password" flow, no SMS fallback, and no "remember me" option beyond the 24-hour session cookie.

This design is intentional. Passwords create a reset path that can be exploited via email compromise. TOTP with no password means an attacker who controls a user's email address still cannot log in — they need the physical phone.

The TOTP code is validated server-side in the Cloudflare Worker using the `otplib` library with a ±1 step tolerance (30-second window, meaning codes are valid for up to 90 seconds). Clock drift beyond this window causes login failure — see Playbook G for the resolution path.

### TOTP secret storage (AES-GCM encryption)

TOTP secrets are not stored in plaintext. Each secret is encrypted with AES-256-GCM:

- 12-byte random nonce generated per encryption operation
- Ciphertext + authentication tag appended
- Result base64url-encoded
- Stored in DynamoDB (`global/users/{email}.json` in S3 serves as the source of truth; DynamoDB holds the live copy)

The AES master key lives in AWS Secrets Manager under a named secret. It is never written to environment variables, never committed to code, and never passed through Lambda configuration parameters. The Cloudflare Worker retrieves it at runtime via the Secrets Manager SDK using the `TOTP_ENCRYPTION_KEY` named secret.

### Master key rotation

Rotate the master key:
- **Annually** as a scheduled maintenance task (see Section 11 checklist)
- **Immediately** upon any suspicion of compromise (see Playbook B)

Rotation procedure: generate a new key in Secrets Manager, re-encrypt all TOTP secrets using the new key, update all user records, then delete the old key version. This is a scripted operation in `totp_provision.py` — not a manual re-provisioning of every user.

### Session cookies

Session tokens are 32 bytes of cryptographically random data generated by `os.urandom(32)` and hex-encoded. They carry no embedded claims (not JWT). A stolen token cannot be decoded to extract role or identity — it is a random opaque handle.

Cookie attributes: `HttpOnly; Secure; SameSite=Strict; Max-Age=86400`

- `HttpOnly`: JavaScript cannot read the cookie. XSS cannot steal the session.
- `Secure`: Cookie is never sent over HTTP.
- `SameSite=Strict`: Cookie is not sent on cross-origin requests. CSRF without a token is prevented.
- `Max-Age=86400`: 24-hour TTL. After 24 hours the browser discards the cookie.

The corresponding DynamoDB session record also has a TTL of 86400 seconds. Logout immediately deletes the DynamoDB record, invalidating the token even if the cookie persists on the client.

### Role-based access control

Roles are enforced at the Lambda API layer. The Cloudflare Worker validates the session and routes the request, but data authorization (which records a given role may read) is checked in the Lambda handler before any S3 or DynamoDB call is made.

The visibility matrix:

| Role | Own data | Other dev data | All merit scores | CEO/PM notes | Audit logs |
|---|---|---|---|---|---|
| CEO (Fahad) | Full | Full | Full (raw) | Full | Full |
| PM (Imran) | Full | Full | Tiers only | Own uploads | No |
| Dev (4 devs) | Own handoffs + own merit | Knowledge card only | No | No | No |
| QA (junior) | Assigned project QA findings | No | No | No | No |
| QA Auditor (Mustafa) | Full (all projects) | Full (all projects) | Tiers only | No | No |

"Tiers only" means Exceptional / Solid / Developing / At Risk. Raw scores and signal breakdowns are CEO-only.

Client-side role filtering (hiding menu items, greying tabs) is a UX convenience. It is not a security control. A developer who removes the role check in their browser JavaScript still gets a 403 from the API.

### Login rate limiting

The `/auth/login` endpoint is rate-limited to 5 attempts per minute per IP at the Cloudflare Worker layer. After 5 failures, subsequent requests from that IP receive a 429 for 60 seconds. Brute-force of a 6-digit TOTP code within a 30-second window is effectively impossible within this limit.

Every login attempt — successful or failed — is logged to the application audit log with: timestamp, email attempted, IP, result (success / wrong_code / unknown_user / rate_limited).

---

## 3. Data at Rest and in Transit

### Encryption at rest

**S3 (devdash-data bucket):** All objects encrypted using SSE-KMS with a customer-managed key (CMK). CMK ownership gives Fahad a CloudTrail-logged audit trail of every key usage. The CMK is not the same key as the TOTP master key in Secrets Manager — these are separate key materials for separate purposes.

S3 bucket policy enforces `aws:SecureTransport: true`, rejecting any request not made over TLS regardless of IAM permissions.

Public access is fully blocked on the bucket. No pre-signed URLs are issued. All data access goes through Lambda function calls.

**DynamoDB (devdash table):** Encrypted at rest using the same KMS CMK. DynamoDB TTL handles automatic deletion of expired session records and hot-tier data older than 14–30 days (configurable in `global/retention-config.json`).

**CloudTrail logs (devdash-audit-logs bucket):** Separate encrypted S3 bucket. Lambda roles have read access to the primary data bucket but not to the audit-logs bucket. Fahad's admin IAM role has read access. This separation means a compromised Lambda execution role cannot tamper with or read its own audit trail.

### Encryption in transit

TLS 1.2 minimum enforced across all paths:

- **Browser → Cloudflare Worker:** TLS terminated at Cloudflare's edge. Cloudflare manages the TLS certificate for `devdash.phonebot.co.uk`.
- **Cloudflare Worker → Lambda function URLs:** HTTPS only. Lambda function URLs do not accept plain HTTP.
- **Lambda → S3 / DynamoDB / Secrets Manager:** AWS SDK uses HTTPS by default. S3 bucket policy rejects non-TLS calls.
- **Lambda → SES:** TLS via AWS SDK.
- **CloudFront → S3 (if used for static asset delivery):** HTTPS-only origin policy.

---

## 4. IAM Roles and Least Privilege

No long-lived AWS access keys exist for production operations. All runtime access is via IAM roles attached to Lambda functions. Fahad's personal AWS credentials are used only for initial provisioning and emergency override, never for day-to-day operations.

### Lambda execution roles

**devdash-lambda-audit**
- Read and write access to `s3://devdash-data/projects/*`
- Read and write to DynamoDB `devdash` table (specific tables only, not `*`)
- Publish via SES (to pre-verified sender only)
- Read from Secrets Manager: `devdash/totp-master-key` only
- No KMS admin rights (cannot create, rotate, or delete keys)
- No CloudTrail write access

**devdash-lambda-read**
- Read-only access to `s3://devdash-data/projects/*/knowledge-card.md` and specific DynamoDB metadata keys
- Used by the context-loading endpoint
- Cannot write to S3 or DynamoDB
- Cannot access Secrets Manager

**devdash-lambda-auth**
- Read access to `s3://devdash-data/global/users/*` (to retrieve encrypted TOTP secrets)
- Write access to DynamoDB `SESSION#*` keys only (to create/delete sessions)
- Read from Secrets Manager: `devdash/totp-master-key` only
- No project data access

**devdash-admin** (Fahad's personal AWS IAM role — not attached to any Lambda)
- Full access to `s3://devdash-data/*`
- Full DynamoDB access for the `devdash` table
- Secrets Manager full access for `devdash/*` namespace
- CloudTrail read access for the audit-logs bucket
- MFA required to assume this role

### AWS root account and IAM users

MFA is required on the AWS root account and on any IAM users in the Phonebot AWS account. The root account is used only for billing and emergency recovery. All operational access uses IAM roles.

---

## 5. Audit Logging

### CloudTrail

CloudTrail is enabled with data events on the `devdash-data` S3 bucket. Every GetObject, PutObject, and DeleteObject call is logged with: timestamp, IAM principal, source IP, request parameters, and response code. Logs are written to `devdash-audit-logs` in a separate S3 bucket.

This means: if a merit score is ever disputed, Fahad can pull the CloudTrail log and see exactly when the record was written, by which Lambda execution role, and confirm no manual modification occurred outside the normal audit Lambda.

### Application audit log

A separate append-only JSONL file at `s3://devdash-data/global/audit-log.jsonl` records application-level events:

- Every login attempt (email, IP, timestamp, result)
- Every logout
- Every Settings change (who changed what, old value, new value, timestamp)
- Every user provision or deactivation
- Every manual merit score override (who, which dev, which week, old score, new score, reason)
- Every admin data deletion

Audit log entries are written by Lambda with a conditional append (not overwrite). The Lambda execution role does not have permission to delete or overwrite objects in the audit log prefix — only to append new objects.

### Retention

Both CloudTrail logs and the application audit log are retained for 1 year by default, governed by `global/retention-config.json`. Fahad can extend this. Shortening below 1 year requires an explicit decision and update to this document.

### What is not logged

Merit scores that are computed (not manually overridden) are not logged per-entry in the audit log — they are written to `merit-history/` in S3, and CloudTrail captures the S3 write. Manual overrides are explicitly logged in the application audit log with the reason field.

---

## 6. Secrets Management

### Inventory of secrets

| Secret | Location | Rotation frequency |
|---|---|---|
| TOTP AES master key | AWS Secrets Manager: `devdash/totp-master-key` | Annually (mandatory), immediately on compromise |
| Cloudflare API token (Worker deploys) | AWS Secrets Manager: `devdash/cloudflare-api-token` | Quarterly |
| Route 53 / DNS API credentials (if separate from Cloudflare) | AWS Secrets Manager: `devdash/route53-credentials` | Quarterly |
| SES SMTP credentials (if not using IAM role) | AWS Secrets Manager: `devdash/ses-credentials` | Quarterly |

### Rules

No secrets in source code. No secrets in Lambda environment variables (environment variables are visible in the Lambda console to anyone with IAM Lambda:GetFunctionConfiguration — use Secrets Manager SDK instead). No secrets in `wrangler.toml` or `dashboard.config.yaml`. No secrets in git history.

If a secret is accidentally committed to git: rotate it immediately, then remove it from git history using `git filter-repo`. The rotation is the priority; the git cleanup is secondary.

### Emergency key rotation

If the TOTP master key is suspected compromised, follow Playbook B. The rotation script in `totp_provision.py` handles re-encryption of all TOTP secrets using the new key without requiring users to re-scan QR codes (the underlying TOTP secrets do not change — only their encrypted storage changes). If the TOTP secrets themselves are compromised (the decrypted values were exposed), all users must re-scan new QR codes.

---

## 7. Data Classification and Retention

### Classification tiers

**Public**
Static assets: dashboard logo, CSS, HTML shell, login page markup. No access control required. Served via Cloudflare edge.

**Internal**
Project names, feature request titles, bug report titles and severity levels, project traffic light statuses, week summary bullet points. Visible to all authenticated users (with role-appropriate filtering). Not published externally.

**Sensitive**
Merit scores (raw and tier), compass values, reward amounts, dev performance trend data, signal breakdowns. CEO-only for raw scores. Aggregated tiers visible to PM and QA Auditor. Never visible to other developers. This data directly affects pay and employment decisions.

**Highly sensitive**
TOTP secrets (even in encrypted form), AES master key, private CEO/PM upload notes, contract information if uploaded, salary data if uploaded. Access restricted to the systems that operationally require them. No human access during normal operation — the master key is fetched at runtime by Lambda, not read by any person during a normal login.

### Retention schedule

| Tier | Age | Storage class | Action |
|---|---|---|---|
| Hot | 0–14 days | DynamoDB | TTL auto-deletes |
| Warm | 15–90 days | S3 Standard-IA | S3 Lifecycle transition from Standard |
| Cold | 91–365 days | S3 Glacier Deep Archive | S3 Lifecycle transition from IA |
| Expired | 365+ days | — | S3 Lifecycle expires objects |

Exception: `merit-history/` compressed summary JSONs are retained permanently as employment records even after the 365-day expiry of raw files.

Retention durations are configurable in `global/retention-config.json` without touching infrastructure. Changes take effect on the next S3 Lifecycle evaluation cycle (up to 24 hours).

### Developer departure — data lifecycle

On departure, a developer's account is archived (not deleted). Their historical data — compass history, handoffs, merit records — remains accessible to Fahad for reference, handover, and employment record purposes.

- Day 0: Account status set to `archived`. Login disabled. All active sessions revoked.
- Day 0–90: Read-only archive. Data follows standard retention schedule. No access changes.
- Day 90: Full purge available on Fahad's explicit request (requires TOTP-confirmed admin action). This is irreversible.
- Permanent: The compressed merit summary JSON (`merit-history-summary.json`) is kept indefinitely as an employment record even after a full purge request.

### GDPR-style deletion (Australian Privacy Principles)

A `DELETE /admin/users/{email}` endpoint performs a full purge: deletes all S3 objects under that user's prefix, removes their DynamoDB records, logs the deletion event to CloudTrail. This requires Fahad's TOTP confirmation and is irreversible. The endpoint is available but not triggered automatically at any point.

---

## 8. Privacy Considerations

### Australian Privacy Principles

Phonebot is subject to the Australian Privacy Act 1988 and the Australian Privacy Principles (APP) if annual turnover exceeds $3M or if it falls within another trigger category (health service provider, etc.). Even below the threshold, APP compliance is best practice and avoids risk.

Merit scoring constitutes automated decision-making about employment. This has specific implications:

1. **Disclosure at engagement.** Employment contracts and contractor agreements should include an explicit clause: "Your performance is tracked via the devdash system, which collects your daily handoff notes, commit activity, and quality audit results. This data is used to compute a weekly merit score that influences bonus and promotion decisions."

2. **Transparency.** Each developer can view their own compass history, merit scores, and signal breakdowns at any time via `GET /merit/{own-email}/current`. This is enforced at the API layer.

3. **Right to dispute.** Developers can flag disputed merit findings via the existing dispute flow. Disputes are logged and visible to Fahad. Fahad can issue a manual override with a documented reason.

4. **Right of access.** On request, any team member can be provided a full export of their personal data. This is a manual admin action (S3 prefix export) but should be completed within 30 days of request.

5. **Right to erasure.** On departure, the standard archive procedure applies. Full purge is available after 90 days on explicit written request.

6. **Data minimisation.** The dashboard does not collect personal data beyond what is needed for performance tracking: email, role, TOTP credential, handoff notes, commit metadata, QA findings. No location data. No device identifiers beyond IP addresses in login logs.

### Internal team communication

Before the dashboard goes live, every team member should be informed:
- What data is collected about them
- Who can see it (role matrix above)
- How merit scores are computed (reference to `dashboard.config.yaml` scoring weights)
- How to dispute a score
- What happens to their data when they leave

This briefing should be documented and acknowledged in writing (email or WhatsApp acknowledgment is sufficient for the initial team).

---

## 9. Incident Response Playbooks

### How to use these playbooks

Contact channel for all incidents: **WhatsApp, not email.** Email could be the compromised channel. All notifications to affected users during a security incident go via WhatsApp. In-person communication if WhatsApp is also suspected compromised.

Incident severity levels used below:
- **P0** — Active breach or complete service loss. Act immediately.
- **P1** — Suspected breach or partial service loss. Act within 1 hour.
- **P2** — Degraded functionality, no breach. Act within 24 hours.

---

### Playbook A: Suspected TOTP compromise (account takeover)

**Severity:** P0 if active, P1 if suspected

**Symptoms**
- User reports they did not perform a login that appears in the audit log
- Login from an unexpected geographic IP (visible in audit log)
- Unusual API activity (e.g., a dev role querying endpoints outside their normal pattern)
- User's phone was lost or stolen (see also Playbook G)

**Immediate actions (do within 15 minutes)**

1. Open AWS Console → DynamoDB → `devdash` table. Filter `pk = SESSION#*` records where `email = {affected user}`. Delete all matching records. This revokes all active sessions for that user immediately.
2. Alternatively, call `DELETE /admin/users/{email}/sessions` (admin API) with TOTP confirmation.
3. The user is now locked out — they cannot log in with the old TOTP secret until re-provisioned.

**Investigation (do in parallel with step 3 above)**

4. Pull audit log: `GET /admin/audit-log?email={affected-user}&limit=50`. Review last 50 actions by that user.
5. Pull CloudTrail: filter by `devdash-lambda-auth` role, time window of the suspicious login. Confirm source IP and user agent.
6. Check if any S3 reads of sensitive paths (`merit-history/`, `uploads/fahad/`) occurred under that session.
7. Determine whether the compromise is at the TOTP secret level or the session cookie level.

**If TOTP secret is compromised (attacker had access to the secret, not just a session cookie)**

8. Rotate the TOTP secret for the affected user: `POST /admin/provision-user` with the same email. This generates a new TOTP secret, encrypts it with the current master key, overwrites the DynamoDB and S3 records.
9. Generate a new QR code and send it to the user via WhatsApp (not email).
10. User scans the new QR in Google Authenticator. Old entry in Authenticator will no longer work — advise them to delete it.

**If session cookie was stolen (TOTP secret itself is not known to attacker)**

11. Session revocation in step 1 is sufficient. User logs in normally with their existing Authenticator entry after investigation is complete.

**Escalation: if AES master key is suspected compromised**

12. If the source of the TOTP secret exposure appears to be a Secrets Manager access anomaly (check CloudTrail for `secretsmanager:GetSecretValue` calls from unexpected principals), escalate to Playbook B immediately. Do not wait.

**Notification**

- Notify the affected user via WhatsApp: "We detected unusual activity on your devdash account. Your access has been temporarily suspended. We'll send you a new login QR shortly."
- Notify Fahad if the affected user is not Fahad.
- Do not send details over email during the active investigation window.

**Post-incident**

13. Document: what was accessed, from where, how the compromise occurred.
14. If merit scores or CEO notes were accessed: assess employment relations impact, consider informing affected parties.
15. Update this playbook if a gap in procedure was identified.

---

### Playbook B: AES master key compromise

**Severity:** P0

**Symptoms**
- Multiple users report unexpected logins simultaneously
- CloudTrail shows `secretsmanager:GetSecretValue` calls for `devdash/totp-master-key` from a principal that is not `devdash-lambda-auth` or `devdash-lambda-audit`
- An IAM misconfiguration was identified that temporarily exposed the Lambda execution role to external principals
- A developer's laptop was confirmed compromised and they had AWS credentials cached locally

**Immediate actions (do within 30 minutes)**

1. In AWS Secrets Manager: rotate the TOTP master key immediately. Create a new secret version. The old version becomes `AWSPREVIOUS`.
2. Run `totp_provision.py --rotate-master-key` (or the equivalent admin script). This fetches the new key, re-encrypts every user's TOTP secret, and writes updated records to DynamoDB and S3. The underlying TOTP secrets do not change — only their encrypted wrapper.
3. In DynamoDB: delete all `SESSION#*` records across all users. Every user is now logged out.
4. Set the old secret version to `DEPRECATED` status in Secrets Manager. Lambda will now use the new version.

**User communication**

5. Send a WhatsApp message to all 8 users (group or individual): "devdash is undergoing an emergency maintenance update. You will need to log in again when it comes back up. Your Google Authenticator app still works — no new QR needed unless we tell you otherwise."
6. If WhatsApp itself is suspected as a channel (unlikely but possible): call Fahad directly, then use Signal or in-person.

**If TOTP secrets themselves were decrypted and exposed (not just the ciphertext)**

7. This means the attacker had the old master key and used it. All TOTP secrets must be considered compromised.
8. Provision new TOTP secrets for all 8 users: run `totp_provision.py --reprovision-all`.
9. Generate 8 new QR codes.
10. Distribute QR codes to each user individually via WhatsApp or in-person. Do not email them.
11. Each user scans the new QR in Google Authenticator, deletes the old entry, and logs in.
12. This process takes approximately 2 hours if users are available immediately.

**Investigation**

13. Pull CloudTrail for the 48-hour window before the anomaly was detected. Identify every call to `secretsmanager:GetSecretValue` for the affected secret.
14. Identify the IAM principal for each call. Expected principals: `devdash-lambda-auth`, `devdash-lambda-audit`. Any other principal is the compromise vector.
15. If the vector is an IAM misconfiguration: revoke the misconfigured permissions, run an IAM policy audit (see Section 11).
16. If the vector is a compromised developer laptop: identify which developer, isolate their IAM credentials if they had any, proceed with password/key rotation for that developer's non-dashboard accounts.

**Post-incident**

17. Confirm all 8 users can log in successfully.
18. Confirm Lambda functions are operating normally (run a test audit trigger).
19. Document the full incident timeline. Update IAM policies if a gap was found.

---

### Playbook C: Dashboard won't load (service outage)

**Severity:** P1 (complete outage) or P2 (partial)

**Symptoms**
- Users report 500 errors, blank page, or login page not rendering
- Fahad cannot access devdash.phonebot.co.uk

**Diagnosis checklist (work top to bottom)**

1. **AWS status page** — check https://health.aws.amazon.com for ap-southeast-2 incidents. If AWS is down in the region, move to the bottom of this list.
2. **Cloudflare Worker** — check Cloudflare Dashboard → Workers → devdash → Real-time Logs. Is the Worker receiving requests? Is it throwing errors?
   - If the Worker is failing: check that `TOTP_ENCRYPTION_KEY` secret is still present (`wrangler secret list`). Check for recent Worker deployments that may have introduced a bug.
3. **Cloudflare KV** — confirm the KV namespace exists and contains the expected keys. Run `wrangler kv:key list --binding DASHBOARD_KV`. If KV is empty, the weekly audit push may have failed.
4. **Route 53 / Cloudflare DNS** — confirm DNS resolves. Run `nslookup devdash.phonebot.co.uk`. Confirm the A record points correctly and the Cloudflare proxy is active.
5. **API Gateway / Lambda** — if the login works but data endpoints fail, check Lambda logs in CloudWatch for the failing function. Common causes: cold-start timeout, DynamoDB throttling, S3 permission error.
6. **DynamoDB throttling** — check DynamoDB console → devdash table → Metrics → Throttled requests. If throttling, switch the table to on-demand capacity mode temporarily.

**Restoration**

- If a recent Worker deployment broke login: run `wrangler rollback` to the previous version.
- If Lambda is crashing: check CloudWatch Logs for the stack trace. If it is a code bug, fix and redeploy. If it is an IAM permission error, check that Lambda execution roles have not drifted.
- If KV cache is empty: re-run the weekly audit manually (`/weekly-audit` from Fahad's Claude Code session) to repopulate.

**Communication**

7. Inform the team via WhatsApp with an ETA if known: "devdash is down — we're investigating. ETA [X minutes/hours]. No data has been lost."
8. Note: the Cloudflare Worker caches the last-generated HTML in KV with a 7-day TTL. If the Worker itself is running, users can still see the cached last-known state even if S3/Lambda is unreachable.

---

### Playbook D: Daily email digest not arriving

**Severity:** P2

**Symptoms**
- Fahad does not receive the daily summary email at expected time
- No SES bounce/complaint notifications either

**Diagnosis**

1. Check Cloudflare Worker logs at the scheduled cron time. Is the cron trigger firing?
2. Check that `alerts:latest` exists in KV (`wrangler kv:key get --binding DASHBOARD_KV alerts:latest`). If missing, the weekly audit push did not include alerts — re-run `/weekly-audit`.
3. Check SES console in ap-southeast-2:
   - Is `devdash@devdash.phonebot.co.uk` verified as a sender identity?
   - Is the account in sandbox mode? (Sandbox mode only allows sending to verified email addresses. `fahad@phonebot.com.au` must be verified or the account must be production-approved.)
   - Check the sending statistics dashboard — is the bounce rate above 5% or complaint rate above 0.1%? SES auto-pauses sending at these thresholds.
4. Check Lambda logs (if email is sent via a Lambda rather than the Worker) for execution errors.

**Restoration**

- If SES sandbox: request production access via AWS Support. In the meantime, verify `fahad@phonebot.com.au` as a receiving address in SES.
- If bounce rate threshold hit: review the recipient list for invalid addresses. Remove bouncing addresses. Request SES sending reinstatement via AWS Support.
- If the Lambda crashed mid-send: fix the error, then manually trigger the digest Lambda to send the missed email.
- Manually trigger: call `POST /audit/trigger` from the admin panel, or invoke the Lambda directly from AWS Console with a test event.

---

### Playbook E: Weekly audit crashed mid-run

**Severity:** P2

**Context:** The `/weekly-audit` slash command runs from Fahad's MacBook via Claude Code. It is a long-running operation (5–10 minutes). If it crashes partway through, some projects will have updated data and some will not.

**Symptoms**
- `/weekly-audit` output shows an error or incomplete project list
- Dashboard shows fresh data for some projects but stale data for others

**Diagnosis**

1. Check which projects completed. The audit logs to stdout and writes a progress marker in S3. Check `s3://devdash-data/global/audit-state.json` for the list of completed projects.
2. Identify the failure point from the Claude Code output (which project, which step).

**Restoration**

3. If the crash is a recoverable script error (e.g., a missing handoff file, a git repo not accessible): fix the upstream issue (re-clone the repo, confirm the handoff file path), then re-run with the `--resume` flag: `/weekly-audit --resume`. The `--resume` flag reads `audit-state.json` and skips already-completed projects.
4. If the script itself has a bug:
   - Identify the bug from the stack trace.
   - Fix the relevant Python file in `scripts/dashboard/`.
   - Run the affected test: `python3 -m pytest tests/dashboard/test_{module}.py -v`
   - Re-run the full suite: `python3 -m pytest tests/dashboard/ -v`
   - Commit the fix: `git commit -m "fix(dashboard): {description}"`
   - Re-run the audit: `/weekly-audit --resume`
5. If the failure is an AWS error (Lambda timeout, DynamoDB throttle, S3 write failure): check CloudWatch Logs for the specific Lambda. The dead-letter queue retries the failed Lambda invocation up to 3 times automatically. If all retries fail, SES sends an error alert to Fahad.

---

### Playbook F: Data loss in DynamoDB

**Severity:** P1 if recent and active, P2 if discovered later

**Symptoms**
- User reports missing merit scores, missing project metadata, or missing session records
- Dashboard shows blank or zeroed-out data that was previously populated

**Diagnosis**

1. Check DynamoDB console → devdash table → Backups. Confirm point-in-time recovery (PITR) is enabled. PITR covers the last 35 days with 1-second granularity.
2. Confirm whether the loss is in DynamoDB hot tier only, or also in S3 warm/cold. S3 is the source of truth for all data older than 14–30 days.

**Restoration**

3. For data still within PITR window: restore the DynamoDB table to a point in time before the deletion. In AWS Console → DynamoDB → devdash → Backups → Restore to point in time. Name the restored table `devdash-restored-{timestamp}`.
4. Export the specific affected records from the restored table (use AWS Data Export or a targeted scan with the affected `pk`/`sk` values).
5. Write those records back to the live `devdash` table.
6. Delete the `devdash-restored-*` table to avoid ongoing charges.
7. For merit history specifically: S3 `merit-history/` contains the authoritative copies. Re-import from S3 if DynamoDB records were lost.

**Post-incident**

8. Identify the cause: code bug that issued an unintended delete? Manual accident in AWS Console? Lambda permission scope too wide? Address the cause before re-opening normal operations.
9. If cause was a Lambda with excessively broad DynamoDB delete permissions: tighten the IAM policy immediately.

---

### Playbook G: Developer lost their phone (TOTP broken)

**Severity:** P2 (service disruption for one user, no security risk if handled correctly)

**Process**

1. Affected developer contacts Fahad or Imran via WhatsApp: "I lost my phone — I can't log into devdash."
2. Fahad opens devdash → Settings → Users → [developer's email] → Reset TOTP.
3. This calls `POST /admin/provision-user` for the affected email. A new TOTP secret is generated, encrypted, and stored. The old secret is overwritten.
4. A new QR code PNG is generated and returned as base64.
5. Fahad sends the QR code to the developer via WhatsApp direct message (not email, not a group chat).
6. Developer installs Google Authenticator on their new device (or uses a backup device), scans the QR code.
7. Developer logs in normally. The 6-digit code rotates every 30 seconds as expected.
8. Log the re-provisioning event: the admin API writes it to the application audit log automatically.

**Important:** Do not email the QR code. The QR code is equivalent to a password for this system. WhatsApp with end-to-end encryption is the safe channel. In-person delivery is the safest option if the developer is on-site.

---

### Playbook H: Developer leaves the company

**Severity:** P2 (planned, not an incident — but handle within 24 hours of departure date)

**Process**

1. Fahad opens devdash Settings → Users → [departing developer's email] → Set status: `archived`.
2. This triggers:
   - All active sessions for that email revoked (DynamoDB `SESSION#*` records deleted)
   - `users/{email}.json` in S3 updated: `status: archived, archived_at: {timestamp}`
   - Login attempts for that email will return "Account not active"
3. Data is not deleted. All historical handoffs, merit records, and commit references remain accessible to Fahad for reference and handover.
4. Generate a final summary JSON if needed: `POST /admin/users/{email}/export` — produces a ZIP of all their data in S3.
5. Update `users.yaml` locally and `dashboard.config.yaml` if they were the assigned dev on a project. Re-run `/weekly-audit` to reflect the team change.

**Restoration if departure was a mistake (e.g., wrong email archived)**

6. Fahad opens Settings → Users → [email] → Set status: `active`. Sessions do not auto-restore — the developer will need to log in fresh. Their TOTP Authenticator entry still works (secret was not rotated during archival). If they also lost their phone in the same period, combine with Playbook G.

**90-day full purge (optional, on explicit request)**

7. If the departed developer requests full data deletion under privacy rights, and 90 days have passed since their departure:
8. Fahad initiates `DELETE /admin/users/{email}` with TOTP confirmation.
9. All S3 objects under `global/users/{email}*` and all project handoff/upload files attributed to that email are deleted.
10. The compressed `merit-history-summary.json` (the employment record) is retained permanently — it does not contain raw handoff text or private notes, only the merit scores and tiers.
11. DynamoDB records for that email are deleted.
12. CloudTrail logs the deletion event.

---

### Playbook I: Suspected insider sabotage (merit score manipulation)

**Severity:** P1

**Symptoms**
- Fahad or Imran notices a merit score that seems inconsistent with observed work quality
- An unexpected entry appears in the application audit log for a Settings change or merit override
- A developer appears to have submitted an unusually high volume of handoff entries in a short window just before the audit run (score inflation attempt via handoff stuffing)

**Investigation**

1. Pull the application audit log: `GET /admin/audit-log?limit=100`. Filter for `event_type: merit_override` and `event_type: settings_change`.
2. If an unauthorized merit override occurred: check `who` field in the log. Only Fahad's session should be able to execute `PUT /merit/{email}/{week}`. If a different session triggered it, treat as account compromise and follow Playbook A for the session owner.
3. If the score appears inflated by handoff stuffing: compare the timestamps of handoff submissions (`handoffs/` S3 objects) against the developer's normal submission pattern (CloudTrail `PutObject` events). Bulk uploads in a short window are a red flag.
4. Pull the signal breakdown for the suspect score: `GET /merit/{email}/current` as Fahad. Review which handoff entries were counted and the weighting applied.

**Mitigation**

5. If manipulation is confirmed: issue a manual override with a corrected score and document the reason clearly in the `override_reason` field. This creates an auditable record.
6. Address with the developer directly. The audit log and signal breakdown are the evidence base.
7. If access to the admin API was misused by a non-admin: treat as a critical auth bug, not just a policy issue. Fix the API authorization check, deploy the fix, and audit what else that session accessed.
8. Note: Settings changes (e.g., changing compass weighting) require a CEO session. Any change to scoring configuration is automatically logged. A developer cannot alter the scoring weights without Fahad's session.

---

### Playbook J: AWS region outage (ap-southeast-2)

**Severity:** P1 for full outage, P2 for partial degradation

**Symptoms**
- All Lambda endpoints return 503 or time out
- DynamoDB reads fail
- S3 access fails
- Cloudflare Worker may still serve cached HTML (KV is Cloudflare-side, not AWS)

**Immediate**

1. Check the AWS Service Health Dashboard at https://health.aws.amazon.com. Confirm whether ap-southeast-2 is affected and what the estimated restoration time is.
2. Inform the team via WhatsApp: "devdash is down due to an AWS outage in Sydney. No action required — we're waiting for AWS to restore service. Your data is safe."

**What still works during an AWS outage**

- The Cloudflare Worker serves the last-generated HTML payload from Cloudflare KV (7-day cache TTL). Users can log in and see the most recent snapshot. TOTP validation runs in the Worker using the cached encrypted secrets from KV — this does not call AWS at login time.
- Email alerts (MailChannels via Worker cron) may still send if the payload is in KV.

**What does not work**

- Any upload operation (handoffs, QA findings, feature requests) — Lambda is unreachable.
- Weekly audit trigger — Lambda is unreachable.
- Admin operations (provision user, revoke session server-side).

**Phase 1 limitation**

The dashboard runs in a single region (ap-southeast-2). There is no cross-region failover in Phase 1. If ap-southeast-2 is down for more than a few hours, the dashboard is read-only at best.

**Phase 2 addition (planned)**

Cross-region DynamoDB Global Tables replication to a second region (eu-west-2 or ap-south-1) and S3 Cross-Region Replication to a secondary bucket. This is an acceptable cost increase ($5–10/month) for a Phase 2 milestone. The DR drill in Section 11 will validate the restore path before this is needed in a real incident.

---

## 10. Compliance and Contracts

### Employment contracts

Every developer's contract (and any contractor agreement) should include an explicit clause covering:

1. **Performance monitoring disclosure.** "Your work activity, including daily handoff notes, commit metadata, and quality review results, is collected and processed by devdash, an internal performance dashboard. This data is used to produce a weekly merit score that informs bonus payments and promotion decisions."
2. **Data access rights.** "You may view your own merit scores, signal breakdowns, and submission history at any time through the dashboard."
3. **Data retention.** "On departure, your data is archived for up to 12 months for reference purposes and employment record retention, after which it is deleted unless a shorter period is requested."
4. **Access revocation.** "Dashboard access is revoked within 24 hours of employment or contract termination."
5. **NDA coverage.** "The dashboard, its data, and all content accessed through it (including other projects' names, status, and outputs) are covered by the existing NDA."

### NDA coverage

The NDA covers: source code, internal data, prompts uploaded to the dashboard, merit scores, CEO/PM notes, and any other content accessed via devdash. Accessing another user's data (even if technically possible due to a bug) is a contract breach, not just a policy violation.

### Access revocation SLA

Dashboard access is revoked within 24 hours of departure. This is enforced operationally via Playbook H. The contract clause creates a legal obligation that mirrors the technical control.

### Annual policy review

This document is reviewed annually by Fahad. At each review:
- Confirm threat model is still accurate (team size, data types, threat landscape)
- Confirm all team members have acknowledged the performance monitoring disclosure
- Confirm audit log retention period is appropriate
- Update any changed infrastructure details

---

## 11. Security Checklist (Recurring)

### On every new user added

- [ ] TOTP provisioned via `totp_provision.py`, new QR code distributed privately (WhatsApp or in-person, not email)
- [ ] Role confirmed correct in `users.yaml` and DynamoDB
- [ ] User informed: what is collected, who sees it, how to dispute a score
- [ ] Performance monitoring disclosure acknowledged (contract clause or written acknowledgment)
- [ ] Test login confirmed working before distributing QR

### On every departure

- [ ] Account status set to `archived` in admin panel within 24 hours
- [ ] Active sessions revoked (confirm via audit log — no new login events after archival)
- [ ] Handoff responsibilities re-assigned to another dev if needed
- [ ] `users.yaml` and `dashboard.config.yaml` updated
- [ ] Final data export generated and stored if needed for handover

### Monthly

- [ ] Review audit log for anomalies: unexpected logins, off-hours admin actions, bulk S3 reads
- [ ] Check CloudTrail for `secretsmanager:GetSecretValue` calls from unexpected principals
- [ ] Confirm Lambda execution roles have not drifted (no new policy attachments)

### Quarterly

- [ ] Rotate Cloudflare API token (`devdash/cloudflare-api-token` in Secrets Manager)
- [ ] Rotate Route 53 / DNS API credentials if applicable
- [ ] Review IAM policies for all three Lambda execution roles — confirm least-privilege has not drifted
- [ ] Check SES sending limits and bounce/complaint rates
- [ ] Confirm DynamoDB PITR is still enabled on the `devdash` table

### Annually

- [ ] Rotate AES master key (`devdash/totp-master-key`): generate new key, re-encrypt all TOTP secrets via `totp_provision.py --rotate-master-key`, verify all 8 users can still log in
- [ ] DR drill: simulate data loss in DynamoDB, verify PITR restore works end-to-end, confirm data integrity after restore
- [ ] Review this document in full. Update threat model, playbooks, and contact methods as team changes
- [ ] Team acknowledgment: confirm all current team members have read the performance monitoring disclosure
- [ ] Confirm Glacier Deep Archive retrieval still works (test-retrieve one old snapshot, verify it is readable)

---

*End of document. Last reviewed: 2026-04-24 by Fahad (CEO, Phonebot). Next review due: 2027-04-24.*
