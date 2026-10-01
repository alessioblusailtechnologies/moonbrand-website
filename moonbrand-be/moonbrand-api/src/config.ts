import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

const optional = z.preprocess((value) => (value === '' ? undefined : value), z.string().min(1).optional());
const flag = z.preprocess((value) => value === 'true' || value === '1', z.boolean());

const schema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_JWT_SECRET: optional,
  DATABASE_URL: z.string().min(1),
  MEDIA_BUCKET: z.string().min(1).default('presenza-media'),
  BRANDS_DIR: optional,
  FILES_SECRET: optional,
  API_PORT: z.coerce.number().int().default(3012),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CORS_ORIGINS: optional,
  COOKIE_SECURE: flag.default(false),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  // La dettatura nella casella dell'assistente, con Voxtral di Mistral: senza chiave il microfono dice che non è configurato.
  MISTRAL_API_KEY: optional,
  TRANSCRIPTION_MODEL: z.string().min(1).default('voxtral-mini-latest'),
});

export type Config = z.infer<typeof schema>;

let cache: Config | undefined;

export function config(): Config {
  if (!cache) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
      throw new Error(`Configurazione non valida: ${fields}`);
    }
    cache = parsed.data;
  }
  return cache;
}

// Stessa profondità di dist/server.mjs: il default resta moonbrand/moonbrand-brands anche dopo la build.
export function brandsDir(settings: Pick<Config, 'BRANDS_DIR'>): string {
  return path.resolve(settings.BRANDS_DIR ?? fileURLToPath(new URL('../../../moonbrand-brands', import.meta.url)));
}
