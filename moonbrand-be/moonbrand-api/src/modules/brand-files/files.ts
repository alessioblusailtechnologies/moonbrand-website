import { createHmac, timingSafeEqual } from 'node:crypto';
import { createReadStream, createWriteStream, type ReadStream } from 'node:fs';
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import type pg from 'pg';

import { brandsDir, type Config } from '../../config';
import { ApiError } from '../../errors';

export const REFERENCES_DIR = 'file-riferimento';
export const FOLLOW_DIR = 'riferimenti-da-seguire';
// Gli esempi dell'onboarding, una cartella per generazione; LEGACY_WORK_DIR è dove finivano i file di lavoro prima.
export const EXAMPLES_DIR = 'esempi';
export const LEGACY_WORK_DIR = 'lavoro';
// Le foto allegate ai messaggi della chat.
export const ATTACHMENTS_DIR = 'allegati';

// Chi ha aperto la cartella di un brand non ancora creato: il brand nasce
// nella bozza dell'onboarding e sul DB arriva solo alla fine.
const OWNER_FILE = '.account';

// Una cartella e uno o più livelli sotto; nessun segmento inizia col punto, quindi niente "..".
const RELATIVE_PATH = /^[a-z0-9-]+(\/[A-Za-z0-9_-][A-Za-z0-9._-]*)+$/;
// Una cartella al primo livello del brand.
const DIR_NAME = /^[a-z0-9-]+$/;

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.pdf': 'application/pdf',
};

// Un file da mandare a pezzi: i video si scorrono chiedendo solo la parte che serve (Range).
export interface OpenFile {
  size: number;
  contentType: string;
  stream(start: number, end: number): ReadStream;
}

export interface BrandFiles {
  claim(brandId: string, accountId: string): Promise<void>;
  save(brandId: string, relativePath: string, bytes: Uint8Array): Promise<void>;
  // Scrive un file man mano che arriva, senza tenerlo in memoria; oltre maxBytes si ferma e lo toglie.
  saveStream(brandId: string, relativePath: string, stream: Readable, maxBytes: number): Promise<void>;
  // Il percorso sul disco, per gli strumenti che lavorano sui file (ffmpeg).
  localPath(brandId: string, relativePath: string): string;
  remove(brandId: string, relativePath: string): Promise<void>;
  removeDir(brandId: string, dir: string): Promise<void>;
  copy(brandId: string, from: string, to: string): Promise<void>;
  open(brandId: string, relativePath: string): Promise<OpenFile>;
  url(brandId: string, relativePath: string): string;
  verify(brandId: string, relativePath: string, signature: string): boolean;
}

export function localBrandFiles(pool: pg.Pool, config: Pick<Config, 'BRANDS_DIR' | 'FILES_SECRET' | 'SUPABASE_SERVICE_ROLE_KEY'>): BrandFiles {
  const root = brandsDir(config);
  const secret = config.FILES_SECRET ?? config.SUPABASE_SERVICE_ROLE_KEY;

  const brandDir = (brandId: string) => path.join(root, brandId);
  const filePath = (brandId: string, relativePath: string) => {
    if (!RELATIVE_PATH.test(relativePath)) throw ApiError.invalid('Percorso del file non valido.');
    return path.join(brandDir(brandId), relativePath);
  };
  const sign = (brandId: string, relativePath: string) => createHmac('sha256', secret).update(`${brandId}/${relativePath}`).digest('base64url');

  return {
    async claim(brandId, accountId) {
      const { rows } = await pool.query<{ account_id: string }>('select account_id from presenza.brands where id = $1', [brandId]);
      if (rows[0]) {
        if (rows[0].account_id !== accountId) throw ApiError.forbidden('NOT_YOUR_BRAND', 'Questo brand non è tuo.');
        return;
      }
      const marker = path.join(brandDir(brandId), OWNER_FILE);
      const owner = await readFile(marker, 'utf8').catch(() => null);
      if (owner === null) {
        await mkdir(brandDir(brandId), { recursive: true });
        await writeFile(marker, accountId);
      } else if (owner.trim() !== accountId) {
        throw ApiError.forbidden('NOT_YOUR_BRAND', 'Questo brand non è tuo.');
      }
    },
    async save(brandId, relativePath, bytes) {
      const target = filePath(brandId, relativePath);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, bytes);
    },
    async saveStream(brandId, relativePath, stream, maxBytes) {
      const target = filePath(brandId, relativePath);
      await mkdir(path.dirname(target), { recursive: true });
      let size = 0;
      const limit = new Transform({
        transform(chunk: Buffer, _encoding, done) {
          size += chunk.length;
          done(size > maxBytes ? ApiError.invalid(`Il file supera ${Math.round(maxBytes / 1024 ** 3)} GB.`) : null, chunk);
        },
      });
      await pipeline(stream, limit, createWriteStream(target)).catch(async (error: unknown) => {
        await rm(target, { force: true });
        throw error;
      });
    },
    localPath(brandId, relativePath) {
      return filePath(brandId, relativePath);
    },
    async remove(brandId, relativePath) {
      await rm(filePath(brandId, relativePath), { force: true });
    },
    async removeDir(brandId, dir) {
      if (!DIR_NAME.test(dir)) throw ApiError.invalid('Cartella non valida.');
      await rm(path.join(brandDir(brandId), dir), { recursive: true, force: true });
    },
    async copy(brandId, from, to) {
      const target = filePath(brandId, to);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(filePath(brandId, from), target);
    },
    async open(brandId, relativePath) {
      const target = filePath(brandId, relativePath);
      const info = await stat(target).catch(() => null);
      if (!info?.isFile()) throw ApiError.notFound('File non trovato.');
      return {
        size: info.size,
        contentType: CONTENT_TYPES[path.extname(target).toLowerCase()] ?? 'application/octet-stream',
        stream: (start, end) => createReadStream(target, { start, end }),
      };
    },
    url(brandId, relativePath) {
      return `/v1/files/${brandId}/${relativePath}?sig=${sign(brandId, relativePath)}`;
    },
    verify(brandId, relativePath, signature) {
      const expected = Buffer.from(sign(brandId, relativePath));
      const given = Buffer.from(signature);
      return expected.length === given.length && timingSafeEqual(expected, given);
    },
  };
}
