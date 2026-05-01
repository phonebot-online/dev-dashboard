// Bitbucket Cloud webhook helpers.
// Receives signed push events, parses them into our canonical Commit shape
// (mirroring scripts/dashboard/git_reader.Commit so the Python pipeline can
// later consume the same KV data), and merges them into state:commits.

export interface CanonicalCommit {
  sha: string;             // git hash
  message: string;         // commit subject + body
  author_name: string;     // parsed from "Name <email>"
  author_email: string;    // lowercased
  timestamp: string;       // ISO-8601
  project: string;         // resolved from repo full_name -> config.projects mapping; '' if unmapped
  repo: string;            // Bitbucket repo full_name (workspace/slug)
  branch: string;          // change.new.name
  audited: boolean;        // false at ingest; QA/QA-Auditor flips later
}

const MAX_COMMITS = 500;
const FOURTEEN_DAYS_MS = 14 * 86400 * 1000;

// HMAC-SHA256 signature verification. Bitbucket Cloud sends the header as
//   X-Hub-Signature: sha256=<hex>
// We accept either the bare hex digest or the prefixed form. Constant-time compare.
export async function verifySignature(body: string, signatureHeader: string, secret: string): Promise<boolean> {
  if (!signatureHeader || !secret) return false;
  const expected = signatureHeader.startsWith('sha256=') ? signatureHeader.slice(7) : signatureHeader;
  if (!/^[0-9a-f]+$/i.test(expected)) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  const computed = Array.from(new Uint8Array(sigBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return constantTimeEqual(computed, expected.toLowerCase());
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

// "Name <email@host>" -> {name, email}. Bitbucket gives raw author strings.
function parseAuthor(raw: string): { name: string; email: string } {
  if (!raw) return { name: '', email: '' };
  const m = raw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim(), email: m[2].toLowerCase().trim() };
  // Fallback: bare email or bare name
  if (raw.includes('@')) return { name: '', email: raw.toLowerCase().trim() };
  return { name: raw.trim(), email: '' };
}

// Parse a Bitbucket Cloud push payload. Many shapes — branch push, tag push,
// branch creation/deletion, force-push. Only accept "branch" pushes that
// actually have commits. Filter out anything older than 14 days.
//
// Reference: https://support.atlassian.com/bitbucket-cloud/docs/event-payloads/#Push
export function parsePushEvent(payload: any, repoToProject: Record<string, string>): CanonicalCommit[] {
  if (!payload || typeof payload !== 'object') return [];
  const repoFullName = String(payload?.repository?.full_name || '').trim();
  const project = repoToProject[repoFullName] || '';

  const out: CanonicalCommit[] = [];
  const seenShas = new Set<string>();
  const cutoff = Date.now() - FOURTEEN_DAYS_MS;

  const changes = Array.isArray(payload?.push?.changes) ? payload.push.changes : [];
  for (const change of changes) {
    // Only branch updates carry commits. Tag pushes / branch deletes don't.
    const newRef = change?.new;
    if (!newRef || newRef.type !== 'branch') continue;
    const branch = String(newRef.name || '');

    const commits = Array.isArray(change.commits) ? change.commits : [];
    for (const c of commits) {
      const sha = String(c?.hash || '').trim();
      if (!sha || seenShas.has(sha)) continue;

      const tsRaw = String(c?.date || '');
      const ts = tsRaw ? new Date(tsRaw) : null;
      if (!ts || isNaN(ts.getTime()) || ts.getTime() < cutoff) continue;

      const { name, email } = parseAuthor(String(c?.author?.raw || ''));

      out.push({
        sha,
        message: String(c?.message || '').trim(),
        author_name: name,
        author_email: email,
        timestamp: ts.toISOString(),
        project,
        repo: repoFullName,
        branch,
        audited: false,
      });
      seenShas.add(sha);
    }
  }

  return out;
}

// Append + dedupe by sha, keep newest first, cap at MAX_COMMITS.
export function mergeCommits(existing: CanonicalCommit[] | null, incoming: CanonicalCommit[]): CanonicalCommit[] {
  const seen = new Set<string>();
  const merged: CanonicalCommit[] = [];

  // Newest first: incoming first, then existing.
  for (const c of incoming) {
    if (c.sha && !seen.has(c.sha)) {
      seen.add(c.sha);
      merged.push(c);
    }
  }
  for (const c of existing || []) {
    if (c.sha && !seen.has(c.sha)) {
      seen.add(c.sha);
      merged.push(c);
    }
  }
  // Sort by timestamp desc so older entries naturally fall off when capped.
  merged.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  return merged.slice(0, MAX_COMMITS);
}
