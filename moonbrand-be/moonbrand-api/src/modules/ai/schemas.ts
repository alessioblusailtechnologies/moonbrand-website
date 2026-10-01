import { z } from 'zod';

import type { VisualEditJobRequest, VisualJobRequest, WebsiteJobRequest } from '@moonbrand/shared/api/contract';

import { channelId, identity, positioning, voiceCard } from '../brands/schemas';

export const websiteJobSchema = z.object({
  site: z.string().trim().min(3, 'Scrivi l’indirizzo del sito.').max(300),
}) satisfies z.ZodType<WebsiteJobRequest>;

export const visualJobSchema = z.object({
  brandId: z.uuid('Brand non valido.'),
  brand: z.object({
    identity,
    positioning,
    channels: z.array(channelId).min(1, 'Scegli almeno un canale.').max(5),
    themes: z.array(z.string().max(200)).max(20),
    voice: voiceCard.nullable(),
    palette: z.array(z.string().max(20)).max(8),
    notes: z.string().max(2000),
  }),
}) satisfies z.ZodType<VisualJobRequest>;

export const jobParamsSchema = z.object({ id: z.uuid('Lavoro non trovato.') });

export const visualEditJobSchema = z.object({
  jobId: z.uuid('Esempi non trovati.'),
  instruction: z.string().trim().min(3, 'Scrivi cosa cambiare.').max(2000),
}) satisfies z.ZodType<VisualEditJobRequest>;
