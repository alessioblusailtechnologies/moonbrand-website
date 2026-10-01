import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';

import type { ContentChannelRequest, ContentEditRequest, ContentScriptRequest, ContentVariantRequest, CreateContentRequest } from '@moonbrand/shared/api/contract';
import type { VideoScene } from '@moonbrand/shared/domain/content';

import type { BrandFiles } from '../brand-files/files';
import { channelId } from '../brands/schemas';
import {
  addContentChannel,
  changeContentStatus,
  createContent,
  editContent,
  generateContentVideo,
  getContent,
  listBrandContents,
  regenerateContent,
  removeContentChannel,
  saveContentScript,
  saveContentVariant,
} from './service';

const ideaParams = z.object({ ideaId: z.uuid('Idea non trovata.') });
const brandParams = z.object({ brandId: z.uuid('Brand non trovato.') });
const contentParams = z.object({ contentId: z.uuid('Contenuto non trovato.') });
const channelParams = contentParams.extend({ channel: channelId });

const createSchema = z.object({
  format: z.enum(['post', 'carousel', 'article', 'video']),
  channels: z.array(channelId).min(1, 'Scegli almeno un canale.').max(5),
}) satisfies z.ZodType<CreateContentRequest>;

const editSchema = z.object({
  instruction: z.string().trim().min(3, 'Scrivi cosa cambiare.').max(2000),
}) satisfies z.ZodType<ContentEditRequest>;

const variantSchema = z.object({
  text: z.string().trim().min(1, 'Il testo non può essere vuoto.').max(5000),
  hashtags: z.array(z.string().max(100)).max(30),
}) satisfies z.ZodType<ContentVariantRequest>;

const channelSchema = z.object({ channel: channelId }) satisfies z.ZodType<ContentChannelRequest>;

export const sceneSchema = z.object({
  seconds: z.number().positive('Ogni inquadratura dura qualche secondo.').max(600),
  shot: z.string().trim().max(2000),
  source: z.enum(['clip', 'photo', 'user', 'graphics']),
  onScreen: z.string().trim().max(1000),
  voice: z.string().trim().max(2000),
}) satisfies z.ZodType<VideoScene>;

const scriptSchema = z.object({
  script: z.string().max(4000),
  scenes: z.array(sceneSchema).min(1, 'Il copione ha almeno un’inquadratura.').max(100),
}) satisfies z.ZodType<ContentScriptRequest>;

export function registerContentRoutes(app: FastifyInstance, pool: pg.Pool, files: BrandFiles): void {
  app.post('/v1/ideas/:ideaId/content', async (request, reply) => {
    const created = await createContent(pool, request.identity, ideaParams.parse(request.params).ideaId, createSchema.parse(request.body));
    return reply.code(202).send(created);
  });

  app.get('/v1/brands/:brandId/contents', (request) =>
    listBrandContents(pool, files, request.identity, brandParams.parse(request.params).brandId),
  );

  app.get('/v1/contents/:contentId', (request) => getContent(pool, files, request.identity, contentParams.parse(request.params).contentId));

  app.post('/v1/contents/:contentId/edit', async (request, reply) => {
    const job = await editContent(pool, request.identity, contentParams.parse(request.params).contentId, editSchema.parse(request.body).instruction);
    return reply.code(202).send(job);
  });

  app.post('/v1/contents/:contentId/regenerate', async (request, reply) => {
    const job = await regenerateContent(pool, request.identity, contentParams.parse(request.params).contentId);
    return reply.code(202).send(job);
  });

  app.put('/v1/contents/:contentId/script', (request) =>
    saveContentScript(pool, files, request.identity, contentParams.parse(request.params).contentId, scriptSchema.parse(request.body)),
  );

  app.post('/v1/contents/:contentId/video', async (request, reply) => {
    const job = await generateContentVideo(pool, request.identity, contentParams.parse(request.params).contentId);
    return reply.code(202).send(job);
  });

  app.put('/v1/contents/:contentId/variants/:channel', (request) => {
    const { contentId, channel } = channelParams.parse(request.params);
    return saveContentVariant(pool, files, request.identity, contentId, channel, variantSchema.parse(request.body));
  });

  // Aggiungere un canale può voler dire un job: la risposta dice quale, se c'è.
  app.post('/v1/contents/:contentId/channels', async (request, reply) => {
    const added = await addContentChannel(pool, files, request.identity, contentParams.parse(request.params).contentId, channelSchema.parse(request.body).channel);
    return reply.code(added.jobId ? 202 : 200).send(added);
  });

  app.delete('/v1/contents/:contentId/channels/:channel', (request) => {
    const { contentId, channel } = channelParams.parse(request.params);
    return removeContentChannel(pool, files, request.identity, contentId, channel);
  });

  app.post('/v1/contents/:contentId/approve', (request) =>
    changeContentStatus(pool, files, request.identity, contentParams.parse(request.params).contentId, 'approved'),
  );

  app.post('/v1/contents/:contentId/reopen', (request) =>
    changeContentStatus(pool, files, request.identity, contentParams.parse(request.params).contentId, 'draft'),
  );
}
