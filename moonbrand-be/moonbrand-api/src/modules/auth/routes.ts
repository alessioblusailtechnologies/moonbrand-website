import type { FastifyInstance, FastifyReply } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';

import { PASSWORD_MIN, REFRESH_COOKIE, type Session } from '@moonbrand/shared/api/contract';

import type { Config } from '../../config';
import { ApiError } from '../../errors';
import type { AuthGateway } from './gateway';
import { me, signIn, signUp, type AuthResult } from './service';

const email = z.email('Scrivi un indirizzo email valido.').max(320);
const password = z.string().min(PASSWORD_MIN, `La password deve avere almeno ${PASSWORD_MIN} caratteri.`).max(200);

const signUpSchema = z.object({ name: z.string().trim().min(1, 'Scrivi il tuo nome.').max(200), email, password });
const signInSchema = z.object({ email, password: z.string().min(1).max(200) });

const REFRESH_MAX_AGE = 30 * 24 * 60 * 60;

export function registerAuthRoutes(
  app: FastifyInstance,
  pool: pg.Pool,
  gateway: AuthGateway,
  cookie: Pick<Config, 'COOKIE_SECURE' | 'COOKIE_SAME_SITE'>,
): void {
  const cookieOptions = { httpOnly: true, secure: cookie.COOKIE_SECURE, sameSite: cookie.COOKIE_SAME_SITE, path: '/v1/auth' } as const;

  const startSession = (reply: FastifyReply, result: AuthResult, status = 200) => {
    reply.setCookie(REFRESH_COOKIE, result.refreshToken, { ...cookieOptions, maxAge: REFRESH_MAX_AGE });
    const session: Session = { accessToken: result.accessToken, expiresIn: result.expiresIn, account: result.account };
    return reply.code(status).send(session);
  };

  app.post('/v1/auth/sign-up', async (request, reply) =>
    startSession(reply, await signUp(pool, gateway, signUpSchema.parse(request.body)), 201),
  );

  app.post('/v1/auth/sign-in', async (request, reply) => startSession(reply, await signIn(pool, gateway, signInSchema.parse(request.body))));

  app.post('/v1/auth/refresh', async (request, reply) => {
    const token = request.cookies[REFRESH_COOKIE];
    const tokens = token ? await gateway.refresh(token) : null;
    if (!tokens) {
      reply.clearCookie(REFRESH_COOKIE, cookieOptions);
      throw ApiError.unauthenticated('Sessione scaduta: accedi di nuovo.');
    }
    reply.setCookie(REFRESH_COOKIE, tokens.refreshToken, { ...cookieOptions, maxAge: REFRESH_MAX_AGE });
    return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn };
  });

  app.post('/v1/auth/sign-out', async (request, reply) => {
    const header = request.headers.authorization;
    if (header?.startsWith('Bearer ')) await gateway.signOut(header.slice('Bearer '.length));
    reply.clearCookie(REFRESH_COOKIE, cookieOptions);
    return reply.code(204).send();
  });

  app.get('/v1/me', (request) => me(pool, request.identity));
}
