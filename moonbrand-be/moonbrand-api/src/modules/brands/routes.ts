import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import type pg from 'pg';

import type { CreateBrandResponse } from '@moonbrand/shared/api/contract';

import { EXAMPLES_DIR, FOLLOW_DIR, LEGACY_WORK_DIR, type BrandFiles } from '../brand-files/files';
import { FIRST_IDEAS, queueIdeasJob } from '../ideas/service';
import type { MediaStorage } from '../media/storage';
import { activeBrandSchema, brandParams, createBrandSchema, updateBrandSchema } from './schemas';
import { chooseActiveBrand, createBrand, getBrandProfile, listBrands, restyleBrand, saveBrand } from './service';

// Gli esempi scelti diventano i riferimenti da seguire, al posto di quelli di prima. Poi le generazioni
// dell'onboarding e i loro file di lavoro non servono più: lasciati lì, chi scrive i contenuti li troverebbe
// nella cartella e potrebbe prenderne lo stile. Il brand esiste già: quello che non riesce si segnala nei log.
async function adoptExamples(files: BrandFiles, brandId: string, examples: string[], log: FastifyBaseLogger): Promise<void> {
  if (examples.length > 0) {
    await files.removeDir(brandId, FOLLOW_DIR).catch((error: unknown) => log.warn({ err: error }, 'riferimenti da seguire non svuotati'));
  }
  for (const example of examples) {
    const name = example.split('/').pop() ?? '';
    await files.copy(brandId, example, `${FOLLOW_DIR}/${name}`).catch((error: unknown) => {
      log.warn({ err: error, example }, 'esempio non copiato nei riferimenti da seguire');
    });
  }
  for (const dir of [EXAMPLES_DIR, LEGACY_WORK_DIR]) {
    await files.removeDir(brandId, dir).catch((error: unknown) => {
      log.warn({ err: error, dir }, 'cartella dell’onboarding non eliminata');
    });
  }
}

export function registerBrandRoutes(app: FastifyInstance, pool: pg.Pool, files: BrandFiles, storage: MediaStorage): void {
  app.get('/v1/brands', (request) => listBrands(pool, request.identity));

  app.post('/v1/brands', async (request, reply) => {
    const body = createBrandSchema.parse(request.body);
    await files.claim(body.id, request.identity.accountId);
    const brand = await createBrand(pool, request.identity, body);
    await adoptExamples(files, body.id, body.referenceExamples ?? [], request.log);
    // Lo stile dai riferimenti e le prime idee partono subito, lato server, e insieme: si preparano anche se chi ha
    // creato il brand chiude la pagina. L'onboarding li segue fino alla fine.
    const queued = await Promise.all([
      restyleBrand(pool, request.identity, body.id).catch((error: unknown) => {
        request.log.warn({ err: error }, 'stile non messo in coda');
        return null;
      }),
      queueIdeasJob(pool, request.identity, body.id, FIRST_IDEAS).then(
        (job) => job.id,
        (error: unknown) => {
          request.log.warn({ err: error }, 'prime idee non messe in coda');
          return null;
        },
      ),
    ]);
    const response: CreateBrandResponse = { ...brand, setupJobs: queued.filter((id) => id !== null) };
    return reply.code(201).send(response);
  });

  app.get('/v1/brands/:brandId', (request) => {
    const { brandId } = brandParams.parse(request.params);
    return getBrandProfile(pool, files, storage, request.identity, brandId);
  });

  // Dal Profilo: si riscrive tutto il brand. Gli esempi solo se ne sono stati rifatti e scelti.
  app.put('/v1/brands/:brandId', async (request) => {
    const { brandId } = brandParams.parse(request.params);
    const body = updateBrandSchema.parse(request.body);
    const { brand, referencesChanged } = await saveBrand(pool, request.identity, brandId, body);
    if (body.referenceExamples?.length) await adoptExamples(files, brandId, body.referenceExamples, request.log);
    if (referencesChanged || body.referenceExamples?.length) await restyleBrand(pool, request.identity, brandId);
    return brand;
  });

  app.put('/v1/me/active-brand', async (request, reply) => {
    const { brandId } = activeBrandSchema.parse(request.body);
    await chooseActiveBrand(pool, request.identity, brandId);
    return reply.code(204).send();
  });
}
