import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';

import { getWelcome } from './service';

const brandParams = z.object({ brandId: z.uuid('Brand non trovato.') });

export function registerWelcomeRoutes(app: FastifyInstance, pool: pg.Pool): void {
  app.get('/v1/brands/:brandId/welcome', (request) => getWelcome(pool, request.identity, brandParams.parse(request.params).brandId));
}
