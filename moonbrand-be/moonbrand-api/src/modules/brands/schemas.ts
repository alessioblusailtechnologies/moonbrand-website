import { z } from 'zod';

import type { CreateBrandRequest, UpdateBrandRequest } from '@moonbrand/shared/api/contract';

import type {
  BrandDraft,
  BrandLine,
  BrandVideo,
  Channels,
  Identity,
  MediaFile,
  Positioning,
  References,
  Theme,
  Visual,
  VisualExample,
  Voice,
} from '@moonbrand/shared/domain/brand';

const text = (max: number) => z.string().max(max);

export const channelId = z.enum(['linkedin', 'instagram', 'facebook', 'tiktok', 'x']);

export const identity = z.object({
  kind: z.enum(['person', 'company', 'client']),
  name: text(200),
  role: text(200),
  company: text(200),
  sector: text(200),
  site: text(300),
  pitch: text(2000),
}) satisfies z.ZodType<Identity>;

export const positioning = z.object({
  goals: z.array(text(200)).max(20),
  audiences: z.array(text(200)).max(20),
  postsPerWeek: z.number().int().min(0).max(21),
}) satisfies z.ZodType<Positioning>;

const channelState = z.object({ selected: z.boolean(), handle: text(200).nullable() });

const channels = z.object({
  linkedin: channelState,
  instagram: channelState,
  facebook: channelState,
  tiktok: channelState,
  x: channelState,
}) satisfies z.ZodType<Channels>;

const themes = z
  .array(
    z.object({
      id: z.string().min(1).max(100),
      name: text(120),
      weight: z.number().int().min(0).max(100),
      level: z.enum(['often', 'sometimes', 'rarely']).optional(),
      color: text(40),
    }),
  )
  .max(6) satisfies z.ZodType<Theme[]>;

export const voiceCard = z.object({
  version: z.number().int().min(0),
  createdAt: text(40),
  source: z.enum(['pasted', 'history', 'recording']),
  sourceLabel: text(200),
  register: text(2000),
  rhythm: text(2000),
  lexicon: text(2000),
  avoid: text(2000),
});

const voice = z.object({
  cards: z.array(voiceCard).max(50),
}) satisfies z.ZodType<Voice>;

const mediaFile = z.object({ path: text(500).nullable(), url: text(4000) }) satisfies z.ZodType<MediaFile>;

const cardText = z.object({
  kicker: text(200),
  headline: text(400),
  body: text(1000),
  value: text(60),
  items: z.array(z.object({ title: text(200), body: text(400) })).max(10),
  author: text(200),
});

const example = z.object({
  channel: channelId,
  aspect: z.enum(['4:5', '1:1', '9:16', '1.91:1']),
  page: z.object({ templateId: text(60), custom: text(60).optional(), text: cardText }),
  file: mediaFile.nullable(),
  photo: mediaFile.nullable().optional(),
  photoDescription: text(1000).optional(),
}) satisfies z.ZodType<VisualExample>;

const lineFont = z.object({ font: text(60), weight: z.number().int().min(100).max(1000), italic: z.boolean() });

const line = z.object({
  from: z.array(text(500)).max(6).optional(),
  templates: z
    .array(
      z.object({
        id: text(60),
        name: text(120),
        use: text(600),
        fields: z.array(text(20)).max(8),
        photo: z.boolean(),
        html: text(20_000),
        css: text(30_000),
      }),
    )
    .max(8)
    .optional(),
  fonts: z
    .array(z.object({ family: text(80), weights: z.array(z.number().int().min(100).max(900)).max(9), italic: z.boolean() }))
    .max(6)
    .optional(),
  photo: z.enum(['band', 'block', 'full']).optional(),
  inset: z.boolean().optional(),
  kicker: z.boolean().optional(),
  footer: z.enum(['rule', 'mark', 'none']).optional(),
  anchor: z.enum(['center', 'top', 'bottom']).optional(),
  ground: text(20),
  accent: text(20),
  voice: lineFont,
  title: lineFont,
  label: lineFont.extend({ spaced: z.boolean() }),
  text: lineFont,
  signature: text(200),
  address: text(200),
  band: z.object({ description: text(1000), photo: mediaFile.nullable() }).nullable(),
  rubrics: z.array(z.object({ name: text(100), about: text(400) })).max(6),
  copy: z.array(text(400)).max(8),
}) satisfies z.ZodType<BrandLine>;

const video = z.object({
  real: text(1000),
  generated: text(1000),
  shots: z.array(text(300)).max(10),
  look: text(1000),
  sound: text(600),
}) satisfies z.ZodType<BrandVideo>;

const visual = z.object({
  logoUri: text(3_000_000).nullable(),
  palette: z.object({
    id: text(200),
    name: text(200),
    colors: z.tuple([text(40), text(40), text(40), text(40)]),
    origin: z.enum(['preset', 'site', 'custom']),
  }),
  imageStyle: z.enum(['flat-geometric', 'desaturated-photo', 'natural-photo', 'text-only']),
  typography: z.enum(['inter', 'archivo', 'space-grotesk', 'manrope', 'fraunces', 'dm-serif', 'playfair', 'ibm-plex']).default('inter'),
  signature: z.boolean(),
  references: z.array(mediaFile).max(6).optional(),
  notes: text(2000).optional(),
  direction: z.object({ summary: text(600), photoStyle: text(1500) }).nullable().optional(),
  line: line.nullable().optional(),
  examples: z.array(example).max(5).optional(),
  video: video.nullable().optional(),
  music: z
    .array(
      z.object({
        id: text(60),
        mood: text(120),
        bpm: z.number().min(40).max(220),
        seconds: z.number().min(3).max(600),
        file: mediaFile,
      }),
    )
    .max(8)
    .optional(),
}) satisfies z.ZodType<Visual>;

const references = z.object({
  profiles: z.array(text(300)).max(50),
  sources: z.array(z.object({ label: text(200), enabled: z.boolean() })).max(30),
  milestones: z
    .array(z.object({ id: z.string().min(1).max(100), label: text(200), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
    .max(50),
}) satisfies z.ZodType<References>;

export const brandDraftSchema = z.object({
  identity,
  positioning,
  channels,
  themes,
  voice,
  visual,
  references,
}) satisfies z.ZodType<BrandDraft>;

export const activeBrandSchema = z.object({ brandId: z.uuid('Brand non trovato.') });

const referenceExamples = z
  // Nella cartella della generazione (esempi/<job>/) o, per le bozze di prima, direttamente in esempi.
  .array(z.string().regex(/^esempi\/([0-9a-f-]{36}\/)?[A-Za-z0-9._-]+\.(png|jpg)$/, 'Esempio non valido.'))
  .max(30)
  .optional();

export const createBrandSchema = brandDraftSchema.extend({
  id: z.uuid('Brand non valido.'),
  referenceExamples,
}) satisfies z.ZodType<CreateBrandRequest>;

export const updateBrandSchema = brandDraftSchema.extend({ referenceExamples }) satisfies z.ZodType<UpdateBrandRequest>;

export const brandParams = z.object({ brandId: z.uuid('Brand non valido.') });
