import { createSecretKey } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';

import type { Config } from '../config';
import type { Identity } from '../db/identity';
import { ApiError } from '../errors';

declare module 'fastify' {
  interface FastifyRequest {
    identity: Identity;
  }
}

export type VerifyToken = (token: string) => Promise<{ sub?: string }>;
export type AccountExists = (accountId: string) => Promise<boolean>;

const PUBLIC_FILES = '/v1/files/';
// Le rotte dei tool della chat hanno il loro accesso, con il token del job (modules/agent).
const AGENT_ROUTES = '/v1/agent/';
const PUBLIC_ROUTES = new Set(['/v1/health', '/v1/auth/sign-up', '/v1/auth/sign-in', '/v1/auth/refresh', '/v1/auth/sign-out']);

export function supabaseVerifier(config: Pick<Config, 'SUPABASE_URL' | 'SUPABASE_JWT_SECRET'>): VerifyToken {
  if (config.SUPABASE_JWT_SECRET) {
    const secret = createSecretKey(Buffer.from(config.SUPABASE_JWT_SECRET));
    return async (token) => (await jwtVerify(token, secret, { audience: 'authenticated' })).payload;
  }
  const jwks = createRemoteJWKSet(new URL('/auth/v1/.well-known/jwks.json', config.SUPABASE_URL));
  return async (token) => (await jwtVerify(token, jwks, { audience: 'authenticated' })).payload;
}

export function registerAuth(app: FastifyInstance, verify: VerifyToken, accountExists: AccountExists): void {
  app.decorateRequest('identity');

  app.addHook('preValidation', async (request) => {
    if (request.method === 'OPTIONS') return;
    const route = request.url.split('?')[0] ?? '';
    if (PUBLIC_ROUTES.has(route) || route.startsWith(PUBLIC_FILES) || route.startsWith(AGENT_ROUTES)) return;

    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw ApiError.unauthenticated();

    let sub: string | undefined;
    try {
      ({ sub } = await verify(header.slice('Bearer '.length)));
    } catch {
      throw ApiError.unauthenticated('Sessione scaduta: accedi di nuovo.');
    }
    if (!sub) throw ApiError.unauthenticated();
    if (!(await accountExists(sub))) throw ApiError.forbidden('NO_ACCOUNT', 'Questa email non ha ancora un account: registrati.');
    request.identity = { accountId: sub };
  });
}
