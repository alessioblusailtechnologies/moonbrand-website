import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { ReferenceUploadResponse } from '@moonbrand/shared/api/contract';

import { ApiError } from '../../errors';
import type { MediaStorage } from './storage';

const MAX_BYTES = 3 * 1024 * 1024;

export const EXTENSIONS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

const SIGNATURES: Record<string, (bytes: Uint8Array) => boolean> = {
  'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/webp': (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45,
};

export const uploadSchema = z.object({ dataUri: z.string().max(5_000_000) });

export function parseImage(dataUri: string): { bytes: Uint8Array; mimeType: string } {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUri.trim());
  if (!match) throw ApiError.invalid('L’immagine deve essere un PNG, un JPEG o un WebP.');
  const [, mimeType, base64] = match;
  const bytes = new Uint8Array(Buffer.from(base64, 'base64'));
  if (bytes.byteLength > MAX_BYTES) throw new ApiError(413, 'TOO_LARGE', 'L’immagine è troppo pesante: al massimo 3 MB.');
  if (bytes.byteLength < 12 || !SIGNATURES[mimeType](bytes)) throw ApiError.invalid('Il file non è un’immagine valida.');
  return { bytes, mimeType };
}

export function registerMediaRoutes(app: FastifyInstance, storage: MediaStorage): void {
  app.post('/v1/media/references', async (request): Promise<ReferenceUploadResponse> => {
    const { bytes, mimeType } = parseImage(uploadSchema.parse(request.body).dataUri);
    const path = `${request.identity.accountId}/profilo/${randomUUID()}.${EXTENSIONS[mimeType]}`;
    try {
      await storage.upload(path, bytes, mimeType);
    } catch (error) {
      request.log.warn({ err: error }, 'caricamento del riferimento non riuscito');
      throw new ApiError(502, 'UPLOAD_FAILED', 'Non sono riuscito a salvare l’immagine. Riprova.');
    }
    const url = await storage.sign(path).catch(() => '');
    return { path, url };
  });
}
