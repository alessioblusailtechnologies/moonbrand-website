import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';

import type {
  ContentScheduleRequest,
  PlanConfirmRequest,
  PlanIdeaRequest,
  PlanProposalRequest,
  SlotCreateRequest,
  SlotPatchRequest,
} from '@moonbrand/shared/api/contract';
import type { SlotDraft } from '@moonbrand/shared/domain/plan';
import { addDays, isDay, isTime } from '@moonbrand/shared/lib/dates';

import type { BrandFiles } from '../brand-files/files';
import { channelId } from '../brands/schemas';
import {
  addIdeaToPlan,
  confirmPlan,
  createSlot,
  getPlan,
  patchSlot,
  proposePlan,
  removeSlot,
  scheduleContent,
  unscheduleContent,
} from './service';

const brandParams = z.object({ brandId: z.uuid('Brand non trovato.') });
const slotParams = z.object({ slotId: z.uuid('Uscita non trovata.') });
const contentParams = z.object({ contentId: z.uuid('Contenuto non trovato.') });

export const daySchema = z.string().refine(isDay, 'Data non valida: serve AAAA-MM-GG.');
export const timeSchema = z.string().refine(isTime, 'Ora non valida: serve HH:mm.');
export const channelsSchema = z.array(channelId).min(1, 'Scegli almeno un canale.').max(5);

// Al massimo tre mesi per volta: il calendario ne mostra uno, con i bordi delle settimane.
const rangeSchema = z
  .object({ from: daySchema, to: daySchema })
  .refine(({ from, to }) => from <= to && to <= addDays(from, 92), 'Periodo non valido.');

export const planRequestSchema = z.object({
  startDate: daySchema,
  weeks: z.number().int().min(1).max(12),
  perWeek: z.number().int().min(1).max(7),
  channels: z.array(channelId).max(5).default([]),
}) satisfies z.ZodType<PlanProposalRequest, unknown>;

export const slotDraftSchema = z.object({
  date: daySchema,
  time: timeSchema,
  channels: channelsSchema,
  themeId: z.string().max(100).nullable(),
  ideaId: z.uuid().nullable(),
}) satisfies z.ZodType<SlotDraft>;

const confirmSchema = z.object({ drafts: z.array(slotDraftSchema).min(1).max(120) }) satisfies z.ZodType<PlanConfirmRequest>;

export const slotCreateSchema = z.object({
  date: daySchema,
  time: timeSchema,
  channels: channelsSchema.optional(),
  themeId: z.string().max(100).nullable().optional(),
  ideaId: z.uuid().nullable().optional(),
  contentId: z.uuid().nullable().optional(),
}) satisfies z.ZodType<SlotCreateRequest>;

export const slotPatchSchema = z.object({
  date: daySchema.optional(),
  time: timeSchema.optional(),
  channels: channelsSchema.optional(),
  themeId: z.string().max(100).nullable().optional(),
  ideaId: z.uuid().nullable().optional(),
}) satisfies z.ZodType<SlotPatchRequest>;

const ideaSchema = z.object({ ideaId: z.uuid('Idea non trovata.') }) satisfies z.ZodType<PlanIdeaRequest>;

export const scheduleSchema = z.object({ date: daySchema, time: timeSchema }) satisfies z.ZodType<ContentScheduleRequest>;

export function registerPlanRoutes(app: FastifyInstance, pool: pg.Pool, files: BrandFiles): void {
  app.get('/v1/brands/:brandId/plan', (request) => {
    const { from, to } = rangeSchema.parse(request.query);
    return getPlan(pool, files, request.identity, brandParams.parse(request.params).brandId, from, to);
  });

  app.post('/v1/brands/:brandId/plan/proposal', (request) =>
    proposePlan(pool, request.identity, brandParams.parse(request.params).brandId, planRequestSchema.parse(request.body)),
  );

  app.post('/v1/brands/:brandId/plan/confirm', async (request, reply) => {
    const created = await confirmPlan(pool, files, request.identity, brandParams.parse(request.params).brandId, confirmSchema.parse(request.body).drafts);
    return reply.code(201).send(created);
  });

  app.post('/v1/brands/:brandId/plan/ideas', async (request, reply) => {
    const slot = await addIdeaToPlan(pool, files, request.identity, brandParams.parse(request.params).brandId, ideaSchema.parse(request.body).ideaId);
    return reply.code(201).send(slot);
  });

  app.post('/v1/brands/:brandId/slots', async (request, reply) => {
    const slot = await createSlot(pool, files, request.identity, brandParams.parse(request.params).brandId, slotCreateSchema.parse(request.body));
    return reply.code(201).send(slot);
  });

  app.patch('/v1/slots/:slotId', (request) =>
    patchSlot(pool, files, request.identity, slotParams.parse(request.params).slotId, slotPatchSchema.parse(request.body)),
  );

  app.delete('/v1/slots/:slotId', async (request, reply) => {
    await removeSlot(pool, files, request.identity, slotParams.parse(request.params).slotId);
    return reply.code(204).send();
  });

  app.put('/v1/contents/:contentId/schedule', (request) => {
    const { date, time } = scheduleSchema.parse(request.body);
    return scheduleContent(pool, files, request.identity, contentParams.parse(request.params).contentId, date, time);
  });

  app.delete('/v1/contents/:contentId/schedule', async (request, reply) => {
    await unscheduleContent(pool, request.identity, contentParams.parse(request.params).contentId);
    return reply.code(204).send();
  });
}
