import type pg from 'pg';

import type {
  AiJob,
  AiJobCreated,
  VisualEditJobInput,
  VisualEditJobRequest,
  VisualJobRequest,
  VisualReading,
  WebsiteJobRequest,
} from '@moonbrand/shared/api/contract';
import { exampleChannels } from '@moonbrand/shared/domain/catalog';

import { withIdentity, type Identity } from '../../db/identity';
import { ApiError } from '../../errors';
import type { BrandFiles } from '../brand-files/files';
import { findExamplesJob, findJob, insertJob } from './repository';

export function queueWebsiteJob(pool: pg.Pool, identity: Identity, request: WebsiteJobRequest): Promise<AiJobCreated> {
  return withIdentity(pool, identity, async (db) => ({ id: await insertJob(db, identity.accountId, 'website', request) }));
}

export async function queueVisualJob(pool: pg.Pool, files: BrandFiles, identity: Identity, request: VisualJobRequest): Promise<AiJobCreated> {
  await files.claim(request.brandId, identity.accountId);
  // Gli esempi sono solo per i primi canali scelti: il job ricorda quelli, e una modifica lavora sugli stessi.
  const input: VisualJobRequest = { ...request, brand: { ...request.brand, channels: exampleChannels(request.brand.channels) } };
  return withIdentity(pool, identity, async (db) => ({ id: await insertJob(db, identity.accountId, 'visual', input) }));
}

export async function queueVisualEditJob(pool: pg.Pool, files: BrandFiles, identity: Identity, request: VisualEditJobRequest): Promise<AiJobCreated> {
  const previous = await withIdentity(pool, identity, (db) => findExamplesJob(db, request.jobId));
  if (!previous?.brandId || !previous.channels) throw ApiError.notFound('Esempi non trovati.');
  if (previous.status !== 'done' || !previous.sessionId) throw ApiError.conflict('NOT_EDITABLE', 'Questi esempi non sono ancora pronti da modificare.');
  await files.claim(previous.brandId, identity.accountId);
  const input: VisualEditJobInput = {
    brandId: previous.brandId,
    dir: previous.dir,
    sessionId: previous.sessionId,
    channels: previous.channels,
    instruction: request.instruction,
    fromJobId: request.jobId,
  };
  return withIdentity(pool, identity, async (db) => ({ id: await insertJob(db, identity.accountId, 'visual-edit', input) }));
}

export function getJob(pool: pg.Pool, files: BrandFiles, identity: Identity, jobId: string): Promise<AiJob> {
  return withIdentity(pool, identity, async (db) => {
    const found = await findJob(db, jobId);
    if (!found) throw ApiError.notFound('Lavoro non trovato.');
    return found.brandId ? withExampleUrls(found.job, found.brandId, files) : found.job;
  });
}

// Gli esempi stanno nella cartella del brand: il worker scrive il percorso, qui si firma il link.
function withExampleUrls(job: AiJob, brandId: string, files: BrandFiles): AiJob {
  const result = job.result as VisualReading | null;
  if (!result?.examples) return job;
  // Una rigenerazione riscrive gli stessi file: l'id del job nel link evita che il browser mostri quelli vecchi dalla cache.
  const url = (file: string) => `${files.url(brandId, file)}&v=${job.id}`;
  return { ...job, result: { examples: result.examples.map((example) => ({ ...example, url: url(example.file) })) } };
}
