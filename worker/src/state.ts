// Shared team state — persisted in KV, surfaced via /api/state.
// Each authenticated user can read/write any collection. Visibility filtering
// stays in the SPA for now (deferred concern; trusted internal team).

export const COLLECTIONS = [
  'bugs',
  'auditFindings',
  'featureRequests',
  'disputes',
  'blockers',
  'stuckPrs',
  'regressionCandidates',
  'rewardEvents',
  'payoutBatches',
  'pmAssessments',
  'clockEntries',
  'growthLog',
  'auditLog',
  'handoffs',
  'commits',
  'config',
] as const;

export type Collection = typeof COLLECTIONS[number];

export function isCollection(key: string): key is Collection {
  return (COLLECTIONS as readonly string[]).includes(key);
}

export async function getAllState(kv: KVNamespace): Promise<Record<Collection, unknown>> {
  const entries = await Promise.all(
    COLLECTIONS.map(async (k) => {
      const raw = await kv.get(`state:${k}`);
      let value: unknown = null;
      if (raw) {
        try { value = JSON.parse(raw); } catch { value = null; }
      }
      return [k, value] as const;
    })
  );
  return Object.fromEntries(entries) as Record<Collection, unknown>;
}

export async function putCollection(kv: KVNamespace, key: Collection, value: unknown): Promise<void> {
  await kv.put(`state:${key}`, JSON.stringify(value));
}

export async function clearAllState(kv: KVNamespace): Promise<void> {
  await Promise.all(COLLECTIONS.map(k => kv.delete(`state:${k}`)));
}
