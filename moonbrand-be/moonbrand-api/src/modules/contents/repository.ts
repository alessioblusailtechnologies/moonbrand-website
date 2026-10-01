import type { ChannelId } from '@moonbrand/shared/domain/brand';
import type { ChannelVariant, Content, ContentFormat, ContentStatus, ContentVisual, VideoScene } from '@moonbrand/shared/domain/content';

import type { Queryable } from '../../db/pool';

interface ContentRow {
  id: string;
  brand_id: string;
  idea_id: string | null;
  slot_id: string | null;
  conversation_id: string | null;
  title: string;
  theme_id: string | null;
  channels: ChannelId[];
  format: ContentFormat;
  variants: ChannelVariant[];
  visual: ContentVisual;
  status: ContentStatus;
  revision: number;
  created_at: Date;
  updated_at: Date;
  approved_at: Date | null;
}

const COLUMNS =
  'id, brand_id, idea_id, slot_id, conversation_id, title, theme_id, channels, format, variants, visual, status, revision, created_at, updated_at, approved_at';

const toContent = (row: ContentRow): Content => ({
  id: row.id,
  brandId: row.brand_id,
  ideaId: row.idea_id,
  slotId: row.slot_id,
  conversationId: row.conversation_id,
  title: row.title,
  themeId: row.theme_id,
  channels: row.channels,
  format: row.format,
  variants: row.variants,
  visual: row.visual,
  status: row.status,
  revision: row.revision,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
  approvedAt: row.approved_at?.toISOString() ?? null,
});

// Una bozza vuota, nella forma che legge anche social-app: la riempie il job.
const EMPTY_VISUAL: ContentVisual = { headline: '', slides: [], script: '', scenes: [], design: null, files: [] };

export async function insertContent(
  db: Queryable,
  draft: { brandId: string; accountId: string; ideaId: string; title: string; themeId: string | null; channels: ChannelId[]; format: ContentFormat },
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into presenza.contents (brand_id, account_id, idea_id, title, theme_id, channels, format, variants, visual)
     values ($1, $2, $3, $4, $5, $6, $7, '[]'::jsonb, $8::jsonb) returning id`,
    [draft.brandId, draft.accountId, draft.ideaId, draft.title, draft.themeId, draft.channels, draft.format, JSON.stringify(EMPTY_VISUAL)],
  );
  return rows[0].id;
}

// Un contenuto scritto nella chat: nasce già completo, con l'id scelto prima per la sua cartella.
export async function insertChatContent(
  db: Queryable,
  content: Pick<Content, 'id' | 'brandId' | 'conversationId' | 'slotId' | 'title' | 'channels' | 'format' | 'variants' | 'visual'> & { accountId: string },
): Promise<void> {
  await db.query(
    `insert into presenza.contents (id, brand_id, account_id, conversation_id, slot_id, title, channels, format, variants, visual)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb)`,
    [
      content.id,
      content.brandId,
      content.accountId,
      content.conversationId,
      content.slotId,
      content.title,
      content.channels,
      content.format,
      JSON.stringify(content.variants),
      JSON.stringify(content.visual),
    ],
  );
}

// Riscrive un contenuto dalla chat: torna bozza, con una revisione in più.
export async function rewriteContent(
  db: Queryable,
  content: Pick<Content, 'id' | 'title' | 'channels' | 'format' | 'variants' | 'visual'>,
): Promise<void> {
  await db.query(
    `update presenza.contents set title = $2, channels = $3, format = $4, variants = $5::jsonb, visual = $6::jsonb,
       revision = revision + 1, status = 'draft', approved_at = null, updated_at = now()
     where id = $1`,
    [content.id, content.title, content.channels, content.format, JSON.stringify(content.variants), JSON.stringify(content.visual)],
  );
}

export async function listConversationContents(db: Queryable, conversationId: string): Promise<Content[]> {
  const { rows } = await db.query<ContentRow>(
    `select ${COLUMNS} from presenza.contents where conversation_id = $1 order by created_at`,
    [conversationId],
  );
  return rows.map(toContent);
}

export async function findContent(db: Queryable, contentId: string): Promise<Content | null> {
  const { rows } = await db.query<ContentRow>(`select ${COLUMNS} from presenza.contents where id = $1`, [contentId]);
  return rows[0] ? toContent(rows[0]) : null;
}

export async function listContents(db: Queryable, brandId: string): Promise<Content[]> {
  const { rows } = await db.query<ContentRow>(`select ${COLUMNS} from presenza.contents where brand_id = $1 order by updated_at desc`, [brandId]);
  return rows.map(toContent);
}

export async function setContentStatus(db: Queryable, contentId: string, status: ContentStatus): Promise<Content | null> {
  const { rows } = await db.query<ContentRow>(
    `update presenza.contents set status = $2, approved_at = case when $2 = 'approved' then now() else null end
     where id = $1 returning ${COLUMNS}`,
    [contentId, status],
  );
  return rows[0] ? toContent(rows[0]) : null;
}

// Il copione di un video corretto a mano: il resto del contenuto non cambia, e torna bozza.
export async function setContentScript(db: Queryable, contentId: string, script: string, scenes: VideoScene[]): Promise<Content | null> {
  const { rows } = await db.query<ContentRow>(
    `update presenza.contents
       set visual = visual || jsonb_build_object('script', $2::text, 'scenes', $3::jsonb), status = 'draft', approved_at = null, updated_at = now()
     where id = $1 returning ${COLUMNS}`,
    [contentId, script, JSON.stringify(scenes)],
  );
  return rows[0] ? toContent(rows[0]) : null;
}

// Il testo di un canale corretto a mano: gli altri canali non cambiano, e il contenuto torna bozza.
export async function setContentVariants(db: Queryable, contentId: string, variants: ChannelVariant[]): Promise<Content | null> {
  const { rows } = await db.query<ContentRow>(
    `update presenza.contents set variants = $2::jsonb, status = 'draft', approved_at = null, updated_at = now()
     where id = $1 returning ${COLUMNS}`,
    [contentId, JSON.stringify(variants)],
  );
  return rows[0] ? toContent(rows[0]) : null;
}

// I canali cambiati senza riscrivere niente: un canale tolto (con il suo testo e i file che servivano solo a lui),
// o aggiunto al copione di un video, che non ha ancora testi né file. Lo stato non cambia: non c'è niente di nuovo da approvare.
export async function setContentChannels(
  db: Queryable,
  contentId: string,
  channels: ChannelId[],
  variants: ChannelVariant[],
  files: ContentVisual['files'],
): Promise<Content | null> {
  const { rows } = await db.query<ContentRow>(
    `update presenza.contents
       set channels = $2, variants = $3::jsonb, visual = visual || jsonb_build_object('files', $4::jsonb), updated_at = now()
     where id = $1 returning ${COLUMNS}`,
    [contentId, channels, JSON.stringify(variants), JSON.stringify(files ?? [])],
  );
  return rows[0] ? toContent(rows[0]) : null;
}

export async function bumpRevision(db: Queryable, contentId: string): Promise<void> {
  await db.query(`update presenza.contents set revision = revision + 1, status = 'draft', approved_at = null where id = $1`, [contentId]);
}

// I lavori in corso sui contenuti di un brand, per contenuto.
export async function activeContentJobs(db: Queryable, brandId: string): Promise<Map<string, string>> {
  const { rows } = await db.query<{ id: string; content_id: string }>(
    `select id, input->>'contentId' as content_id from presenza.ai_jobs
     where kind in ('content', 'content-edit', 'content-video') and input->>'brandId' = $1 and status in ('queued', 'running')
     order by created_at`,
    [brandId],
  );
  return new Map(rows.map((row) => [row.content_id, row.id]));
}

// L'ultima sessione di Claude che ha lavorato sul contenuto: un ritocco la riprende.
export async function lastContentSession(db: Queryable, contentId: string): Promise<string | null> {
  const { rows } = await db.query<{ session_id: string }>(
    `select session_id from presenza.ai_jobs
     where kind in ('content', 'content-edit', 'content-video') and input->>'contentId' = $1 and status = 'done' and session_id is not null
     order by finished_at desc limit 1`,
    [contentId],
  );
  return rows[0]?.session_id ?? null;
}
