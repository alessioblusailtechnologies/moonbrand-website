import { createHash } from 'node:crypto';

import type { FastifyBaseLogger } from 'fastify';
import type pg from 'pg';

import type { BrandContext, WelcomeJobInput, WelcomeResponse, WelcomeSignals } from '@moonbrand/shared/api/contract';
import { planNow } from '@moonbrand/shared/lib/dates';

import { withIdentity, type Identity } from '../../db/identity';
import type { Queryable } from '../../db/pool';
import { ApiError } from '../../errors';
import { insertJob } from '../ai/repository';
import { findAccount } from '../auth/accounts';
import { findBrandForIdeas } from '../ideas/repository';
import { activeWelcomeJob, brandsToWelcome, findSignals, findWelcome, lockWelcome } from './repository';

// Saluti e spunti si rifanno ogni giorno e, durante il giorno, quando il brand cambia (un'uscita, una bozza, un'idea
// tenuta): al massimo ogni REFRESH_MINUTES, perché ogni cambio non valga un job.
const REFRESH_MINUTES = 20;

// Lo stato del brand da cui nascono: le conversazioni restano fuori, una nuova non basta a rifarli.
function fingerprintOf(brand: BrandContext, signals: WelcomeSignals): string {
  const { recentChats: _chats, ...rest } = signals;
  const state = {
    identity: brand.identity,
    positioning: brand.positioning,
    themes: brand.themes,
    voice: brand.voice?.register ?? null,
    plan: brand.plan.map((slot) => [slot.id, slot.date, slot.time, slot.status, slot.title]),
    ...rest,
  };
  return createHash('sha1').update(JSON.stringify(state)).digest('hex');
}

// Il benvenuto di oggi, se c'è; se manca o il brand è cambiato, il job che lo riscrive parte e la risposta lo dice.
async function welcome(db: Queryable, accountId: string, brandId: string): Promise<WelcomeResponse> {
  await lockWelcome(db, brandId);
  const brand = await findBrandForIdeas(db, brandId);
  const signals = await findSignals(db, brandId);
  if (!brand || !signals) throw ApiError.notFound('Brand non trovato.');
  const day = planNow().date;
  const stored = await findWelcome(db, brandId);
  const fresh = stored?.day === day ? stored : null;
  const fingerprint = fingerprintOf(brand.context, signals);
  let jobId = await activeWelcomeJob(db, brandId);
  const changed = fresh && fresh.fingerprint !== fingerprint && Date.now() - fresh.generatedAt.getTime() > REFRESH_MINUTES * 60_000;
  if (!jobId && (!fresh || changed)) {
    const account = await findAccount(db, accountId);
    const input: WelcomeJobInput = { brandId, day, fingerprint, name: account?.name ?? '', brand: brand.context, signals };
    jobId = await insertJob(db, accountId, 'welcome', input);
  }
  return { greetings: fresh?.greetings ?? [], suggestions: fresh?.suggestions ?? [], jobId };
}

export function getWelcome(pool: pg.Pool, identity: Identity, brandId: string): Promise<WelcomeResponse> {
  return withIdentity(pool, identity, (db) => welcome(db, identity.accountId, brandId));
}

// Il giro del mattino: dalle MORNING a Roma, i brand usati negli ultimi ACTIVE_DAYS giorni trovano il benvenuto di oggi
// già pronto quando si apre la chat. Più processi dell'API insieme non raddoppiano i job (lockWelcome).
const MORNING = '05:00';
const ACTIVE_DAYS = 14;
const MORNING_CHECK_MS = 15 * 60_000;

export function scheduleMorningWelcome(pool: pg.Pool, log: FastifyBaseLogger): () => void {
  let running = false;
  const round = async () => {
    const now = planNow();
    if (running || now.time < MORNING) return;
    running = true;
    try {
      for (const { brandId, accountId } of await brandsToWelcome(pool, now.date, ACTIVE_DAYS)) {
        await withIdentity(pool, { accountId }, (db) => welcome(db, accountId, brandId)).catch((error: unknown) =>
          log.warn({ err: error, brandId }, 'benvenuto del mattino non messo in coda'),
        );
      }
    } catch (error) {
      log.warn({ err: error }, 'giro del mattino non riuscito');
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void round(), MORNING_CHECK_MS);
  void round();
  return () => clearInterval(timer);
}
