import type { Readable } from 'node:stream';

import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';

import type { ChatAttachmentUpload, ChatMessageRequest } from '@moonbrand/shared/api/contract';

import { ATTACHMENTS_DIR, type BrandFiles } from '../brand-files/files';
import { uploadSchema } from '../media/routes';
import {
  getConversation,
  getConversations,
  removeConversation,
  sendMessage,
  startConversation,
  stopTurn,
  uploadAttachment,
  uploadVideoAttachment,
  type ChatMessage,
} from './service';

const brandParams = z.object({ brandId: z.uuid('Brand non trovato.') });
const conversationParams = z.object({ conversationId: z.uuid('Conversazione non trovata.') });

const MAX_ATTACHMENTS = 10;
const attachmentPath = new RegExp(`^${ATTACHMENTS_DIR}/[0-9a-f-]{36}\\.(png|jpg|webp|mp4)$`);

// Il testo può mancare se ci sono allegati: «ecco le foto del salone» è anche solo tre immagini. O se c'è l'idea da cui partire.
const messageSchema = z
  .object({
    message: z.string().trim().max(8000, 'Il messaggio è troppo lungo.'),
    attachments: z
      .array(z.string().regex(attachmentPath, 'Allegato non valido.'))
      .max(MAX_ATTACHMENTS, `Al massimo ${MAX_ATTACHMENTS} allegati per messaggio.`)
      .default([]),
    ideaId: z.uuid('Idea non trovata.').optional(),
    slotId: z.uuid('Uscita non trovata.').optional(),
  })
  .refine(
    (body) => body.message.length > 0 || body.attachments.length > 0 || body.ideaId !== undefined || body.slotId !== undefined,
    'Scrivi un messaggio.',
  ) satisfies z.ZodType<
  ChatMessage,
  ChatMessageRequest
>;

export function registerConversationRoutes(app: FastifyInstance, pool: pg.Pool, files: BrandFiles): void {
  app.get('/v1/brands/:brandId/conversations', (request) => getConversations(pool, request.identity, brandParams.parse(request.params).brandId));

  app.post('/v1/brands/:brandId/conversations', async (request, reply) => {
    const { brandId } = brandParams.parse(request.params);
    const created = await startConversation(pool, request.identity, brandId, messageSchema.parse(request.body));
    return reply.code(202).send(created);
  });

  app.post('/v1/brands/:brandId/attachments', async (request, reply) => {
    const { brandId } = brandParams.parse(request.params);
    const { dataUri } = uploadSchema.parse(request.body) satisfies ChatAttachmentUpload;
    return reply.code(201).send(await uploadAttachment(files, request.identity, brandId, dataUri));
  });

  // Il video arriva così com'è, non in JSON: il corpo della richiesta passa a pezzi fino al disco.
  void app.register(async (scope) => {
    scope.addContentTypeParser('*', (_request, payload, done) => done(null, payload));
    scope.post('/v1/brands/:brandId/attachments/video', async (request, reply) => {
      const { brandId } = brandParams.parse(request.params);
      return reply.code(201).send(await uploadVideoAttachment(files, request.identity, brandId, request.body as Readable));
    });
  });

  app.get('/v1/conversations/:conversationId', (request) =>
    getConversation(pool, files, request.identity, conversationParams.parse(request.params).conversationId),
  );

  app.post('/v1/conversations/:conversationId/messages', async (request, reply) => {
    const { conversationId } = conversationParams.parse(request.params);
    const created = await sendMessage(pool, request.identity, conversationId, messageSchema.parse(request.body));
    return reply.code(202).send(created);
  });

  app.post('/v1/conversations/:conversationId/stop', async (request, reply) => {
    await stopTurn(pool, request.identity, conversationParams.parse(request.params).conversationId);
    return reply.code(204).send();
  });

  app.delete('/v1/conversations/:conversationId', async (request, reply) => {
    await removeConversation(pool, request.identity, conversationParams.parse(request.params).conversationId);
    return reply.code(204).send();
  });
}
