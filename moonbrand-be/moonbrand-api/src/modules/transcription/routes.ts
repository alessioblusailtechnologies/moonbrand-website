import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';

import type { TranscriptionResponse } from '@moonbrand/shared/api/contract';

import type { Config } from '../../config';
import { withIdentity } from '../../db/identity';
import { ApiError } from '../../errors';
import { findBrandForIdeas } from '../ideas/repository';
import { biasTerms, transcribe } from './voxtral';

const brandParams = z.object({ brandId: z.uuid('Brand non trovato.') });

// Qualche minuto di voce in Opus sta in pochi MB: oltre, meglio registrare in più riprese.
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

// La dettatura: l'audio registrato dal browser arriva così com'è (Content-Type audio/*) e torna come testo.
// I nomi del brand vanno a Voxtral come termini da riconoscere. Ogni trascrizione finisce in ai_usage, con i secondi di audio.
export function registerTranscriptionRoutes(app: FastifyInstance, pool: pg.Pool, settings: Pick<Config, 'MISTRAL_API_KEY' | 'TRANSCRIPTION_MODEL'>): void {
  void app.register(async (scope) => {
    scope.addContentTypeParser(/^audio\//, { parseAs: 'buffer', bodyLimit: MAX_AUDIO_BYTES }, (_request, body, done) => done(null, body));

    scope.post('/v1/brands/:brandId/transcriptions', async (request): Promise<TranscriptionResponse> => {
      const { brandId } = brandParams.parse(request.params);
      const apiKey = settings.MISTRAL_API_KEY;
      if (!apiKey) throw new ApiError(503, 'TRANSCRIPTION_NOT_CONFIGURED', 'La dettatura non è configurata: manca MISTRAL_API_KEY.');
      const bytes = request.body;
      if (!Buffer.isBuffer(bytes) || bytes.length === 0) throw ApiError.invalid('Non è arrivato nessun audio.');
      const brand = await withIdentity(pool, request.identity, (db) => findBrandForIdeas(db, brandId));
      if (!brand) throw ApiError.notFound('Brand non trovato.');
      const { identity } = brand.context;

      const started = Date.now();
      const model = settings.TRANSCRIPTION_MODEL;
      const record = (outcome: 'ok' | 'failed', seconds: number | null, error?: string) =>
        pool
          .query(
            `insert into presenza.ai_usage (account_id, brand_id, task, model, outcome, error, duration_ms, units, unit)
             values ($1, $2, 'transcription', $3, $4, $5, $6, $7, 'secondi audio')`,
            [request.identity.accountId, brandId, model, outcome, error ?? null, Date.now() - started, seconds],
          )
          .catch((failure: unknown) => request.log.warn({ failure }, 'trascrizione non registrata'));
      try {
        const audio = { bytes, type: (request.headers['content-type'] ?? 'audio/webm').split(';')[0] };
        const transcript = await transcribe(apiKey, model, audio, biasTerms([identity.name, identity.company ?? ''].filter(Boolean)));
        await record('ok', transcript.seconds);
        return { text: transcript.text };
      } catch (error) {
        await record('failed', null, error instanceof Error ? error.message : String(error));
        throw error instanceof ApiError ? error : new ApiError(502, 'TRANSCRIPTION_FAILED', 'La trascrizione non è riuscita: riprova.');
      }
    });
  });
}
