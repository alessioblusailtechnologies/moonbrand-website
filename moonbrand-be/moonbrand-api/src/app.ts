import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import Fastify, { type FastifyServerOptions } from 'fastify';
import type pg from 'pg';

import type { Config } from './config';
import { registerErrorHandler } from './errors';
import { registerAgentRoutes } from './modules/agent/routes';
import { registerAiRoutes } from './modules/ai/routes';
import { accountExists } from './modules/auth/accounts';
import type { AuthGateway } from './modules/auth/gateway';
import { registerAuthRoutes } from './modules/auth/routes';
import type { BrandFiles } from './modules/brand-files/files';
import { registerBrandFileRoutes } from './modules/brand-files/routes';
import { registerBrandRoutes } from './modules/brands/routes';
import { registerContentRoutes } from './modules/contents/routes';
import { registerConversationRoutes } from './modules/conversations/routes';
import { registerIdeaRoutes } from './modules/ideas/routes';
import { registerMediaRoutes } from './modules/media/routes';
import { registerPlanRoutes } from './modules/plan/routes';
import { registerTranscriptionRoutes } from './modules/transcription/routes';
import { registerWelcomeRoutes } from './modules/welcome/routes';
import type { MediaStorage } from './modules/media/storage';
import { registerAuth, type VerifyToken } from './plugins/auth';

export interface AppOptions {
  logger: FastifyServerOptions['logger'];
  pool: pg.Pool;
  verifyToken: VerifyToken;
  auth: AuthGateway;
  storage: MediaStorage;
  files: BrandFiles;
  settings: Pick<Config, 'CORS_ORIGINS' | 'COOKIE_SECURE' | 'COOKIE_SAME_SITE' | 'MISTRAL_API_KEY' | 'TRANSCRIPTION_MODEL'>;
}

export function buildApp(options: AppOptions) {
  const app = Fastify({ logger: options.logger, bodyLimit: 6 * 1024 * 1024 });

  const origins = (options.settings.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins.length > 0) {
    void app.register(cors, { origin: origins, credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] });
  }
  void app.register(cookie);

  registerErrorHandler(app);
  registerAuth(app, options.verifyToken, (id) => accountExists(options.pool, id));

  app.get('/v1/health', () => ({ ok: true }));
  registerAuthRoutes(app, options.pool, options.auth, options.settings);
  registerBrandRoutes(app, options.pool, options.files, options.storage);
  registerBrandFileRoutes(app, options.files);
  registerMediaRoutes(app, options.storage);
  registerAiRoutes(app, options.pool, options.files);
  registerIdeaRoutes(app, options.pool);
  registerContentRoutes(app, options.pool, options.files);
  registerConversationRoutes(app, options.pool, options.files);
  registerPlanRoutes(app, options.pool, options.files);
  registerTranscriptionRoutes(app, options.pool, options.settings);
  registerWelcomeRoutes(app, options.pool);
  void app.register(async (scope) => registerAgentRoutes(scope, options.pool, options.files));

  return app;
}
