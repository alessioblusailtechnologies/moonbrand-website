import type { BrandSummary } from '@moonbrand/shared/api/contract';
import type { BrandDraft, BrandKind } from '@moonbrand/shared/domain/brand';

import type { Queryable } from '../../db/pool';

interface SummaryRow {
  id: string;
  kind: BrandKind;
  name: string;
  logo_uri: string | null;
  color: string | null;
}

const SUMMARY = `id, identity->>'kind' as kind, identity->>'name' as name, visual->>'logoUri' as logo_uri,
  visual->'palette'->'colors'->>0 as color`;

const toSummary = (row: SummaryRow): BrandSummary => ({
  id: row.id,
  kind: row.kind,
  name: row.name,
  logoUri: row.logo_uri,
  color: row.color ?? '#2F3452',
});

export async function listBrandSummaries(db: Queryable, accountId: string): Promise<BrandSummary[]> {
  const { rows } = await db.query<SummaryRow>(`select ${SUMMARY} from presenza.brands where account_id = $1 order by created_at`, [
    accountId,
  ]);
  return rows.map(toSummary);
}

export async function brandExists(db: Queryable, brandId: string): Promise<boolean> {
  const { rowCount } = await db.query('select 1 from presenza.brands where id = $1', [brandId]);
  return (rowCount ?? 0) > 0;
}

export async function insertBrand(db: Queryable, accountId: string, brandId: string, draft: BrandDraft): Promise<BrandSummary> {
  const { rows } = await db.query<SummaryRow>(
    `insert into presenza.brands (id, account_id, identity, positioning, channels, themes, voice, visual, refs)
     values ($9, $1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb)
     returning ${SUMMARY}`,
    [
      accountId,
      JSON.stringify(draft.identity),
      JSON.stringify(draft.positioning),
      JSON.stringify(draft.channels),
      JSON.stringify(draft.themes),
      JSON.stringify(draft.voice),
      JSON.stringify(draft.visual),
      JSON.stringify(draft.references),
      brandId,
    ],
  );
  return toSummary(rows[0]);
}

export async function findBrandDraft(db: Queryable, brandId: string): Promise<BrandDraft | null> {
  const { rows } = await db.query<BrandDraft>(
    'select identity, positioning, channels, themes, voice, visual, refs as "references" from presenza.brands where id = $1',
    [brandId],
  );
  return rows[0] ?? null;
}

export async function updateBrand(db: Queryable, brandId: string, draft: BrandDraft): Promise<BrandSummary | null> {
  const { rows } = await db.query<SummaryRow>(
    `update presenza.brands set identity = $2::jsonb, positioning = $3::jsonb, channels = $4::jsonb, themes = $5::jsonb,
       voice = $6::jsonb, visual = $7::jsonb, refs = $8::jsonb
     where id = $1
     returning ${SUMMARY}`,
    [
      brandId,
      JSON.stringify(draft.identity),
      JSON.stringify(draft.positioning),
      JSON.stringify(draft.channels),
      JSON.stringify(draft.themes),
      JSON.stringify(draft.voice),
      JSON.stringify(draft.visual),
      JSON.stringify(draft.references),
    ],
  );
  return rows[0] ? toSummary(rows[0]) : null;
}
