import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';

import type { IdeaStatusRequest } from '@moonbrand/shared/api/contract';

import { getIdeas, MORE_IDEAS, queueIdeasJob, setIdeaStatus } from './service';

const brandParams = z.object({ brandId: z.uuid('Brand non trovato.') });
const ideaParams = z.object({ ideaId: z.uuid('Idea non trovata.') });
const statusSchema = z.object({ status: z.enum(['new', 'saved', 'discarded']) }) satisfies z.ZodType<IdeaStatusRequest>;

export function registerIdeaRoutes(app: FastifyInstance, pool: pg.Pool): void {
  app.get('/v1/brands/:brandId/ideas', (request) => getIdeas(pool, request.identity, brandParams.parse(request.params).brandId));

  app.post('/v1/brands/:brandId/ideas/generate', async (request, reply) => {
    const job = await queueIdeasJob(pool, request.identity, brandParams.parse(request.params).brandId, MORE_IDEAS);
    return reply.code(202).send(job);
  });

  app.patch('/v1/ideas/:ideaId', (request) =>
    setIdeaStatus(pool, request.identity, ideaParams.parse(request.params).ideaId, statusSchema.parse(request.body).status),
  );
}
