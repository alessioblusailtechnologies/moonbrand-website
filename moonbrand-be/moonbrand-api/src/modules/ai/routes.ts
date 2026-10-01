import type { FastifyInstance } from 'fastify';
import type pg from 'pg';

import type { BrandFiles } from '../brand-files/files';
import { jobParamsSchema, visualEditJobSchema, visualJobSchema, websiteJobSchema } from './schemas';
import { getJob, queueVisualEditJob, queueVisualJob, queueWebsiteJob } from './service';

export function registerAiRoutes(app: FastifyInstance, pool: pg.Pool, files: BrandFiles): void {
  app.post('/v1/ai/website', async (request, reply) => {
    const job = await queueWebsiteJob(pool, request.identity, websiteJobSchema.parse(request.body));
    return reply.code(202).send(job);
  });

  app.post('/v1/ai/visual', async (request, reply) => {
    const job = await queueVisualJob(pool, files, request.identity, visualJobSchema.parse(request.body));
    return reply.code(202).send(job);
  });

  app.post('/v1/ai/visual/edit', async (request, reply) => {
    const job = await queueVisualEditJob(pool, files, request.identity, visualEditJobSchema.parse(request.body));
    return reply.code(202).send(job);
  });

  app.get('/v1/ai/jobs/:id', (request) => getJob(pool, files, request.identity, jobParamsSchema.parse(request.params).id));
}
