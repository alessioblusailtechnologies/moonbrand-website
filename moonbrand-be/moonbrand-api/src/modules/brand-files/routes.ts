import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { ReferenceUploadResponse } from '@moonbrand/shared/api/contract';

import { ApiError } from '../../errors';
import { EXTENSIONS, parseImage, uploadSchema } from '../media/routes';
import { REFERENCES_DIR, type BrandFiles } from './files';

const brandParams = z.object({ brandId: z.uuid('Brand non valido.') });
const referenceParams = brandParams.extend({ name: z.string().regex(/^[A-Za-z0-9_-][A-Za-z0-9._-]*$/, 'File non valido.') });
const fileParams = brandParams.extend({ '*': z.string().min(1) });
const fileQuery = z.object({ sig: z.string().min(1) });

// Un solo intervallo, nelle tre forme bytes=10-20, bytes=10- e bytes=-20 (gli ultimi 20 byte); senza Range, null.
function parseRange(header: string | undefined, size: number): { start: number; end: number } | 'invalid' | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === '' && match[2] === '')) return 'invalid';
  const start = match[1] === '' ? Math.max(0, size - Number(match[2])) : Number(match[1]);
  const end = match[1] === '' || match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  return start > end || start >= size ? 'invalid' : { start, end };
}

export function registerBrandFileRoutes(app: FastifyInstance, files: BrandFiles): void {
  app.post('/v1/brands/:brandId/references', async (request): Promise<ReferenceUploadResponse> => {
    const { brandId } = brandParams.parse(request.params);
    const { bytes, mimeType } = parseImage(uploadSchema.parse(request.body).dataUri);
    await files.claim(brandId, request.identity.accountId);
    const path = `${REFERENCES_DIR}/${randomUUID()}.${EXTENSIONS[mimeType]}`;
    await files.save(brandId, path, bytes);
    return { path, url: files.url(brandId, path) };
  });

  app.delete('/v1/brands/:brandId/references/:name', async (request, reply) => {
    const { brandId, name } = referenceParams.parse(request.params);
    await files.claim(brandId, request.identity.accountId);
    await files.remove(brandId, `${REFERENCES_DIR}/${name}`);
    return reply.code(204).send();
  });

  // Pubblica: un <img> o un <video> non può mandare il token, il link è firmato.
  // Con Range manda solo il pezzo chiesto: serve ai video per partire subito e per spostarsi avanti e indietro.
  app.get('/v1/files/:brandId/*', async (request, reply) => {
    const { brandId, '*': path } = fileParams.parse(request.params);
    const { sig } = fileQuery.parse(request.query);
    if (!files.verify(brandId, path, sig)) throw ApiError.notFound('File non trovato.');
    const file = await files.open(brandId, path);
    reply.header('content-type', file.contentType).header('cache-control', 'private, max-age=3600').header('accept-ranges', 'bytes');
    if (file.size === 0) return reply.header('content-length', 0).send('');
    const range = parseRange(request.headers.range, file.size);
    if (range === 'invalid') return reply.code(416).header('content-range', `bytes */${file.size}`).send();
    const { start, end } = range ?? { start: 0, end: file.size - 1 };
    if (range) reply.code(206).header('content-range', `bytes ${start}-${end}/${file.size}`);
    return reply.header('content-length', end - start + 1).send(file.stream(start, end));
  });
}
