import type pg from 'pg';

import type { BrandProfile, BrandSummary, CreateBrandRequest, UpdateBrandRequest } from '@moonbrand/shared/api/contract';
import type { BrandDraft, MediaFile, Visual } from '@moonbrand/shared/domain/brand';

import { withIdentity, type Identity } from '../../db/identity';
import { ApiError } from '../../errors';
import { REFERENCES_DIR, type BrandFiles } from '../brand-files/files';
import { setActiveBrand } from '../auth/accounts';
import type { MediaStorage } from '../media/storage';
import { brandExists, findBrandDraft, insertBrand, listBrandSummaries, updateBrand } from './repository';
import { queueStyleJob } from './style';

export function listBrands(pool: pg.Pool, identity: Identity): Promise<BrandSummary[]> {
  return withIdentity(pool, identity, (db) => listBrandSummaries(db, identity.accountId));
}

export function createBrand(pool: pg.Pool, identity: Identity, { id, referenceExamples: _examples, ...draft }: CreateBrandRequest): Promise<BrandSummary> {
  const stored: BrandDraft = { ...draft, visual: storableVisual(identity.accountId, draft.visual) };
  return withIdentity(pool, identity, async (db) => {
    const brand = await insertBrand(db, identity.accountId, id, stored);
    await setActiveBrand(db, identity.accountId, brand.id);
    return brand;
  });
}

export async function getBrandProfile(
  pool: pg.Pool,
  files: BrandFiles,
  storage: MediaStorage,
  identity: Identity,
  brandId: string,
): Promise<BrandProfile> {
  const draft = await withIdentity(pool, identity, (db) => findBrandDraft(db, brandId));
  if (!draft) throw ApiError.notFound('Brand non trovato.');
  // I file di riferimento stanno nella cartella del brand, le altre immagini nello storage dell'account.
  const sign = (path: string) => (path.startsWith(`${REFERENCES_DIR}/`) ? Promise.resolve(files.url(brandId, path)) : storage.sign(path));
  return { id: brandId, draft: { ...draft, visual: await signedVisual(draft.visual, sign) } };
}

export async function saveBrand(
  pool: pg.Pool,
  identity: Identity,
  brandId: string,
  { referenceExamples: _examples, ...draft }: UpdateBrandRequest,
): Promise<{ brand: BrandSummary; referencesChanged: boolean }> {
  const stored: BrandDraft = { ...draft, visual: storableVisual(identity.accountId, draft.visual) };
  return withIdentity(pool, identity, async (db) => {
    const before = await findBrandDraft(db, brandId);
    const brand = await updateBrand(db, brandId, stored);
    if (!before || !brand) throw ApiError.notFound('Brand non trovato.');
    const paths = (visual: Visual) => (visual.references ?? []).map((file) => file.path).sort().join('\n');
    return { brand, referencesChanged: paths(before.visual) !== paths(stored.visual) };
  });
}

// Lo stile si rilegge dopo che i riferimenti sono al loro posto (vedi queueStyleJob).
export function restyleBrand(pool: pg.Pool, identity: Identity, brandId: string): Promise<string> {
  return withIdentity(pool, identity, (db) => queueStyleJob(db, identity.accountId, brandId));
}

export function chooseActiveBrand(pool: pg.Pool, identity: Identity, brandId: string): Promise<void> {
  return withIdentity(pool, identity, async (db) => {
    if (!(await brandExists(db, brandId))) throw ApiError.notFound('Brand non trovato.');
    await setActiveBrand(db, identity.accountId, brandId);
  });
}

function storableVisual(accountId: string, visual: Visual): Visual {
  const own = (file: MediaFile | null | undefined) =>
    !file?.path || file.path.startsWith(`${accountId}/`) || file.path.startsWith(`${REFERENCES_DIR}/`);
  const unsigned = (file: MediaFile): MediaFile => (file.path ? { ...file, url: '' } : file);
  return {
    ...visual,
    ...(visual.references && { references: visual.references.filter(own).map(unsigned) }),
    ...(visual.examples && {
      examples: visual.examples
        .filter((example) => own(example.file) && own(example.photo))
        .map((example) => ({ ...example, file: example.file && unsigned(example.file), ...(example.photo && { photo: unsigned(example.photo) }) })),
    }),
    ...(visual.music && { music: visual.music.filter((track) => own(track.file)).map((track) => ({ ...track, file: unsigned(track.file) })) }),
    ...(visual.line?.band?.photo && {
      line: { ...visual.line, band: { ...visual.line.band, photo: own(visual.line.band.photo) ? unsigned(visual.line.band.photo) : null } },
    }),
  };
}

// Salvati, i link sono vuoti: si firmano a ogni lettura. Un file che non si firma resta senza link.
async function signedVisual(visual: Visual, sign: (path: string) => Promise<string>): Promise<Visual> {
  const signed = async (file: MediaFile): Promise<MediaFile> => (file.path ? { ...file, url: await sign(file.path).catch(() => '') } : file);
  return {
    ...visual,
    ...(visual.references && { references: await Promise.all(visual.references.map(signed)) }),
    ...(visual.examples && {
      examples: await Promise.all(
        visual.examples.map(async (example) => ({
          ...example,
          file: example.file && (await signed(example.file)),
          ...(example.photo && { photo: await signed(example.photo) }),
        })),
      ),
    }),
    ...(visual.music && { music: await Promise.all(visual.music.map(async (track) => ({ ...track, file: await signed(track.file) }))) }),
    ...(visual.line?.band?.photo && {
      line: { ...visual.line, band: { ...visual.line.band, photo: await signed(visual.line.band.photo) } },
    }),
  };
}
