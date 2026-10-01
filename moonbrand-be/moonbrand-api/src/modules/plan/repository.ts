import type { ChannelId } from '@moonbrand/shared/domain/brand';
import type { PlanSlot, SlotDraft, SlotOrigin, SlotStatus } from '@moonbrand/shared/domain/plan';

import type { Queryable } from '../../db/pool';

// Le uscite stanno in presenza.slots, la tabella di social-app: data (date) e ora (HH:mm) a Roma, senza fuso.
// La data si legge come testo, così il driver non la sposta nel fuso del processo.

interface SlotRow {
  id: string;
  brand_id: string;
  publish_date: string;
  publish_time: string;
  channels: ChannelId[];
  theme_id: string | null;
  idea_id: string | null;
  content_title: string | null;
  status: SlotStatus;
  origin: SlotOrigin;
  created_at: Date;
}

const COLUMNS = 'id, brand_id, publish_date::text as publish_date, publish_time, channels, theme_id, idea_id, content_title, status, origin, created_at';

const toSlot = (row: SlotRow): PlanSlot => ({
  id: row.id,
  brandId: row.brand_id,
  date: row.publish_date,
  time: row.publish_time,
  channels: row.channels,
  themeId: row.theme_id,
  ideaId: row.idea_id,
  contentTitle: row.content_title,
  status: row.status,
  origin: row.origin,
  createdAt: row.created_at.toISOString(),
});

// Le uscite del brand, in ordine; from e to (compresi) limitano il periodo.
export async function listSlots(db: Queryable, brandId: string, range: { from?: string; to?: string } = {}): Promise<PlanSlot[]> {
  const { rows } = await db.query<SlotRow>(
    `select ${COLUMNS} from presenza.slots
     where brand_id = $1 and ($2::date is null or publish_date >= $2::date) and ($3::date is null or publish_date <= $3::date)
     order by publish_date, publish_time, created_at`,
    [brandId, range.from ?? null, range.to ?? null],
  );
  return rows.map(toSlot);
}

export async function findSlot(db: Queryable, slotId: string): Promise<PlanSlot | null> {
  const { rows } = await db.query<SlotRow>(`select ${COLUMNS} from presenza.slots where id = $1`, [slotId]);
  return rows[0] ? toSlot(rows[0]) : null;
}

export async function insertSlot(
  db: Queryable,
  slot: SlotDraft & { brandId: string; accountId: string; status: SlotStatus; origin: SlotOrigin; contentTitle: string | null },
): Promise<PlanSlot> {
  const { rows } = await db.query<SlotRow>(
    `insert into presenza.slots (brand_id, account_id, publish_date, publish_time, channels, theme_id, idea_id, content_title, status, origin)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning ${COLUMNS}`,
    [slot.brandId, slot.accountId, slot.date, slot.time, slot.channels, slot.themeId, slot.ideaId, slot.contentTitle, slot.status, slot.origin],
  );
  return toSlot(rows[0]);
}

export async function updateSlot(
  db: Queryable,
  slotId: string,
  slot: Pick<PlanSlot, 'date' | 'time' | 'channels' | 'themeId' | 'ideaId' | 'contentTitle' | 'status'>,
): Promise<PlanSlot | null> {
  const { rows } = await db.query<SlotRow>(
    `update presenza.slots
       set publish_date = $2, publish_time = $3, channels = $4, theme_id = $5, idea_id = $6, content_title = $7, status = $8
     where id = $1 returning ${COLUMNS}`,
    [slotId, slot.date, slot.time, slot.channels, slot.themeId, slot.ideaId, slot.contentTitle, slot.status],
  );
  return rows[0] ? toSlot(rows[0]) : null;
}

// Lo stato salvato segue quello del contenuto, perché anche social-app lo legga giusto. Una pubblicata resta tale.
export async function storeSlotStatus(db: Queryable, slotId: string, status: SlotStatus): Promise<void> {
  await db.query(`update presenza.slots set status = $2 where id = $1 and status <> 'published'`, [slotId, status]);
}

// Togliere un'uscita stacca il suo contenuto (on delete set null), che resta tra i Contenuti.
export async function deleteSlot(db: Queryable, slotId: string): Promise<void> {
  await db.query('delete from presenza.slots where id = $1', [slotId]);
}

// Il contenuto entra nell'uscita e, se non ce l'ha, prende la sua idea.
export async function setContentSlot(db: Queryable, contentId: string, slotId: string): Promise<void> {
  await db.query(
    'update presenza.contents set slot_id = $2, idea_id = coalesce(idea_id, (select idea_id from presenza.slots where id = $2)) where id = $1',
    [contentId, slotId],
  );
}

// I titoli delle idee delle uscite.
export async function ideaTitles(db: Queryable, ideaIds: string[]): Promise<Map<string, string>> {
  if (ideaIds.length === 0) return new Map();
  const { rows } = await db.query<{ id: string; title: string }>('select id, title from presenza.ideas where id = any($1::uuid[])', [ideaIds]);
  return new Map(rows.map((row) => [row.id, row.title]));
}

// Le idee già nel piano, in qualsiasi data: non si propongono di nuovo.
export async function plannedIdeaIds(db: Queryable, brandId: string): Promise<Set<string>> {
  const { rows } = await db.query<{ idea_id: string }>('select idea_id from presenza.slots where brand_id = $1 and idea_id is not null', [brandId]);
  return new Set(rows.map((row) => row.idea_id));
}
