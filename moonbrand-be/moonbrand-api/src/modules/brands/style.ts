import type { StyleJobInput } from '@moonbrand/shared/api/contract';

import type { Queryable } from '../../db/pool';
import { insertJob } from '../ai/repository';

// Lo stile del brand lo legge dai riferimenti il job style, una volta sola: a fine onboarding, quando i riferimenti
// cambiano e, per i brand nati prima, al primo lavoro che lo userebbe. Poi è nel CLAUDE.md di ogni job.

async function activeStyleJob(db: Queryable, brandId: string): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(
    `select id from presenza.ai_jobs
     where kind = 'style' and input->>'brandId' = $1 and status in ('queued', 'running')
     order by created_at desc limit 1`,
    [brandId],
  );
  return rows[0]?.id ?? null;
}

// Riferimenti appena cambiati: un job già in coda potrebbe leggere quelli di prima, quindi se ne mette un altro.
export function queueStyleJob(db: Queryable, accountId: string, brandId: string): Promise<string> {
  return insertJob(db, accountId, 'style', { brandId } satisfies StyleJobInput);
}

// Per un brand che non ha ancora lo stile (null): il job parte una volta e chi lo ha chiesto va avanti senza aspettarlo.
export async function ensureStyleJob(db: Queryable, accountId: string, brandId: string, style: string | null): Promise<void> {
  if (style !== null || (await activeStyleJob(db, brandId))) return;
  await queueStyleJob(db, accountId, brandId);
}
