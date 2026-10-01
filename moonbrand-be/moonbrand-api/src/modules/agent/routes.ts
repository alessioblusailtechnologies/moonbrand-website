import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';

import type { AgentContentRequest, AgentIdeaRequest } from '@moonbrand/shared/api/contract';

import { ApiError } from '../../errors';
import type { BrandFiles } from '../brand-files/files';
import { channelId } from '../brands/schemas';
import { sceneSchema } from '../contents/routes';
import { channelsSchema, daySchema, slotCreateSchema, slotPatchSchema } from '../plan/routes';
import { createAgentSlots, listAgentPlan, patchAgentSlot, proposeAgentPlan, removeAgentSlot } from './plan';
import { findAgentJob, type AgentJob } from './repository';
import { createAgentContent, createAgentIdea, getAgentContent, listAgentContents, listAgentIdeas, updateAgentContent } from './service';

declare module 'fastify' {
  interface FastifyRequest {
    agent: AgentJob;
  }
}

const contentParams = z.object({ contentId: z.uuid('Contenuto non trovato.') });
const slotParams = z.object({ slotId: z.uuid('Uscita non trovata: usa l’id di piano_leggi.') });

const planQuerySchema = z.object({ from: daySchema.optional(), to: daySchema.optional() });

const proposalSchema = z.object({
  startDate: daySchema.optional(),
  weeks: z.number().int().min(1).max(12),
  perWeek: z.number().int().min(1).max(7).optional(),
  channels: channelsSchema.optional(),
});

const slotsSchema = z.object({ uscite: z.array(slotCreateSchema).min(1).max(60) });

const contentSchema = z.object({
  slotId: z.uuid('Uscita non valida: usa l’id di piano_leggi.').optional(),
  title: z.string().trim().min(1).max(300),
  format: z.enum(['post', 'carousel', 'article', 'video']),
  channels: z.array(channelId).min(1).max(5),
  variants: z
    .array(z.object({ channel: channelId, text: z.string().trim().min(1).max(5000), hashtags: z.array(z.string().max(100)).max(30) }))
    .min(1),
  headline: z.string().max(200),
  slides: z.array(z.object({ title: z.string().max(200), body: z.string().max(1000) })).max(10),
  script: z.string().max(4000).optional(),
  scenes: z.array(sceneSchema).max(100).optional(),
  // Il tool chiede al massimo 500 caratteri; qui c'è margine, perché un salvataggio non fallisca per una frase lunga.
  layout: z.string().max(1000).optional(),
  files: z
    .array(
      z.object({
        file: z.string().min(1).max(300),
        role: z.enum(['cover', 'slide', 'video', 'document']),
        index: z.number().int().min(0).max(20),
        aspect: z.enum(['4:5', '1:1', '9:16', '16:9', '1.91:1']),
      }),
    )
    .min(1)
    .max(32),
}) satisfies z.ZodType<AgentContentRequest>;

const ideaSchema = z.object({
  title: z.string().trim().min(1).max(300),
  angleLabel: z.string().max(120),
  angle: z.string().max(2000),
  rationale: z.string().max(1000),
  themeId: z.string().nullable(),
}) satisfies z.ZodType<AgentIdeaRequest>;

// Chi chiama è Claude: l'errore dice per filo e per segno cosa correggere.
function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw ApiError.invalid(z.prettifyError(parsed.error));
  return parsed.data;
}

// Le rotte dei tool della chat. Niente sessione dell'utente: il token del job (Authorization: Job <token>)
// dice account, brand e conversazione, e vale solo mentre il job è in corso.
export async function registerAgentRoutes(app: FastifyInstance, pool: pg.Pool, files: BrandFiles): Promise<void> {
  app.decorateRequest('agent');

  app.addHook('preValidation', async (request) => {
    const header = request.headers.authorization;
    if (!header?.startsWith('Job ')) throw ApiError.unauthenticated('Manca il token del lavoro.');
    const job = await findAgentJob(pool, header.slice('Job '.length));
    if (!job) throw ApiError.unauthenticated('Il lavoro di questo token non è in corso.');
    request.agent = job;
  });

  app.get('/v1/agent/contents', (request) => listAgentContents(pool, request.agent));

  app.get('/v1/agent/contents/:contentId', (request) => getAgentContent(pool, request.agent, contentParams.parse(request.params).contentId));

  app.post('/v1/agent/contents', async (request, reply) => {
    const saved = await createAgentContent(pool, files, request.agent, parse(contentSchema, request.body));
    return reply.code(201).send(saved);
  });

  app.put('/v1/agent/contents/:contentId', (request) =>
    updateAgentContent(pool, files, request.agent, contentParams.parse(request.params).contentId, parse(contentSchema, request.body)),
  );

  app.get('/v1/agent/plan', (request) => listAgentPlan(pool, files, request.agent, parse(planQuerySchema, request.query)));

  app.post('/v1/agent/plan/proposal', (request) => proposeAgentPlan(pool, request.agent, parse(proposalSchema, request.body)));

  app.post('/v1/agent/slots', async (request, reply) => {
    const created = await createAgentSlots(pool, files, request.agent, parse(slotsSchema, request.body).uscite);
    return reply.code(201).send(created);
  });

  app.patch('/v1/agent/slots/:slotId', (request) =>
    patchAgentSlot(pool, files, request.agent, slotParams.parse(request.params).slotId, parse(slotPatchSchema, request.body)),
  );

  app.delete('/v1/agent/slots/:slotId', (request) => removeAgentSlot(pool, files, request.agent, slotParams.parse(request.params).slotId));

  app.get('/v1/agent/ideas', (request) => listAgentIdeas(pool, request.agent));

  app.post('/v1/agent/ideas', async (request, reply) => {
    const saved = await createAgentIdea(pool, request.agent, parse(ideaSchema, request.body));
    return reply.code(201).send(saved);
  });
}
