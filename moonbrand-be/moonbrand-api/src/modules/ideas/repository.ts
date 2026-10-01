import type { BrandContext } from '@moonbrand/shared/api/contract';
import {
  currentVoiceCard,
  type ChannelId,
  type Channels,
  type Identity,
  type Positioning,
  type Theme,
  type Voice,
} from '@moonbrand/shared/domain/brand';
import type { Idea, IdeaDraft, IdeaStatus } from '@moonbrand/shared/domain/idea';
import { slotStatus, type SlotStatus } from '@moonbrand/shared/domain/plan';
import { addDays, planNow } from '@moonbrand/shared/lib/dates';

import type { Queryable } from '../../db/pool';

interface IdeaRow {
  id: string;
  brand_id: string;
  title: string;
  angle_label: string;
  angle: string;
  rationale: string;
  theme_id: string | null;
  signal: Idea['signal'];
  formats: Idea['formats'];
  channels: ChannelId[];
  status: IdeaStatus;
  decided_at: Date | null;
  created_at: Date;
}

const COLUMNS = 'id, brand_id, title, angle_label, angle, rationale, theme_id, signal, formats, channels, status, decided_at, created_at';

const toIdea = (row: IdeaRow): Idea => ({
  id: row.id,
  brandId: row.brand_id,
  title: row.title,
  angleLabel: row.angle_label,
  angle: row.angle,
  rationale: row.rationale,
  themeId: row.theme_id,
  signal: row.signal,
  formats: row.formats,
  channels: row.channels,
  status: row.status,
  decidedAt: row.decided_at?.toISOString() ?? null,
  createdAt: row.created_at.toISOString(),
});

export async function listIdeas(db: Queryable, brandId: string): Promise<Idea[]> {
  const { rows } = await db.query<IdeaRow>(`select ${COLUMNS} from presenza.ideas where brand_id = $1 order by created_at desc`, [brandId]);
  return rows.map(toIdea);
}

export async function updateIdeaStatus(db: Queryable, ideaId: string, status: IdeaStatus): Promise<Idea | null> {
  const { rows } = await db.query<IdeaRow>(
    `update presenza.ideas set status = $2, decided_at = case when $2 = 'new' then null else now() end
     where id = $1 returning ${COLUMNS}`,
    [ideaId, status],
  );
  return rows[0] ? toIdea(rows[0]) : null;
}

// Quante impaginazioni recenti vedono i job, per non ripeterle.
const RECENT_LAYOUTS = 6;
// Quanti giorni di piano vedono i job, da oggi.
const PLAN_DAYS = 14;

export interface BrandForIdeas {
  context: BrandContext;
  themes: Theme[];
}

export async function findBrandForIdeas(db: Queryable, brandId: string): Promise<BrandForIdeas | null> {
  const { rows } = await db.query<{ identity: Identity; positioning: Positioning; channels: Channels; themes: Theme[]; voice: Voice; style_guide: string | null }>(
    'select identity, positioning, channels, themes, voice, style_guide from presenza.brands where id = $1',
    [brandId],
  );
  const row = rows[0];
  if (!row) return null;
  const channels = (Object.keys(row.channels) as ChannelId[]).filter((id) => row.channels[id]?.selected);
  const layouts = await db.query<BrandContext['layouts'][number]>(
    `select title, format, visual->>'layout' as layout from presenza.contents
     where brand_id = $1 and coalesce(visual->>'layout', '') <> ''
     order by updated_at desc limit $2`,
    [brandId, RECENT_LAYOUTS],
  );
  const now = planNow();
  const upcoming = await db.query<{
    id: string;
    date: string;
    time: string;
    channels: ChannelId[];
    status: SlotStatus;
    theme_id: string | null;
    idea_id: string | null;
    content_status: 'draft' | 'approved' | null;
    title: string | null;
  }>(
    `select s.id, s.publish_date::text as date, s.publish_time as time, coalesce(c.channels, s.channels) as channels, s.status,
       s.theme_id, s.idea_id, c.status as content_status, coalesce(c.title, i.title, s.content_title) as title
     from presenza.slots s
       left join presenza.contents c on c.slot_id = s.id
       left join presenza.ideas i on i.id = s.idea_id
     where s.brand_id = $1 and s.publish_date between $2::date and $3::date
     order by s.publish_date, s.publish_time`,
    [brandId, now.date, addDays(now.date, PLAN_DAYS - 1)],
  );
  const plan = upcoming.rows.map((slot) => ({
    id: slot.id,
    date: slot.date,
    time: slot.time,
    channels: slot.channels,
    status: slotStatus({ status: slot.status, date: slot.date, time: slot.time, ideaId: slot.idea_id }, slot.content_status ? { status: slot.content_status } : null, now),
    theme: row.themes.find((theme) => theme.id === slot.theme_id)?.name ?? null,
    title: slot.title,
  }));
  return {
    themes: row.themes,
    context: {
      identity: row.identity,
      positioning: row.positioning,
      channels: channels.length > 0 ? channels : ['instagram'],
      themes: row.themes.map(({ id, name, weight }) => ({ id, name, weight })),
      voice: currentVoiceCard(row.voice),
      style: row.style_guide,
      layouts: layouts.rows,
      plan,
    },
  };
}

export async function activeIdeasJob(db: Queryable, brandId: string): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(
    `select id from presenza.ai_jobs
     where kind = 'ideas' and input->>'brandId' = $1 and status in ('queued', 'running')
     order by created_at desc limit 1`,
    [brandId],
  );
  return rows[0]?.id ?? null;
}

export async function insertIdea(db: Queryable, brandId: string, accountId: string, draft: IdeaDraft): Promise<Idea> {
  const { rows } = await db.query<IdeaRow>(
    `insert into presenza.ideas (brand_id, account_id, title, angle_label, angle, rationale, theme_id, signal, formats, channels)
     values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10) returning ${COLUMNS}`,
    [brandId, accountId, draft.title, draft.angleLabel, draft.angle, draft.rationale, draft.themeId, JSON.stringify(draft.signal), draft.formats, draft.channels],
  );
  return toIdea(rows[0]);
}

export async function findIdea(db: Queryable, ideaId: string): Promise<Idea | null> {
  const { rows } = await db.query<IdeaRow>(`select ${COLUMNS} from presenza.ideas where id = $1`, [ideaId]);
  return rows[0] ? toIdea(rows[0]) : null;
}
