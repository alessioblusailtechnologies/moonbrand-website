import type { WelcomeSignals } from '@moonbrand/shared/api/contract';
import type { Milestone, Positioning } from '@moonbrand/shared/domain/brand';
import { occasionsBetween, type Greeting, type WelcomeSuggestion } from '@moonbrand/shared/domain/welcome';
import { addDays, planNow, startOfWeek } from '@moonbrand/shared/lib/dates';

import type { Queryable } from '../../db/pool';

// Quanti giorni avanti guardano ricorrenze e date del brand.
const AHEAD_DAYS = 7;
const RECENT_DRAFTS = 5;
const RECENT_IDEAS = 5;
const RECENT_CHATS = 5;

export interface StoredWelcome {
  day: string;
  fingerprint: string;
  greetings: Greeting[];
  suggestions: WelcomeSuggestion[];
  generatedAt: Date;
}

export async function findWelcome(db: Queryable, brandId: string): Promise<StoredWelcome | null> {
  const { rows } = await db.query<{ day: string; fingerprint: string; greetings: Greeting[]; suggestions: WelcomeSuggestion[]; generated_at: Date }>(
    'select day, fingerprint, greetings, suggestions, generated_at from presenza.brand_welcome where brand_id = $1',
    [brandId],
  );
  const row = rows[0];
  return row ? { day: row.day, fingerprint: row.fingerprint, greetings: row.greetings, suggestions: row.suggestions, generatedAt: row.generated_at } : null;
}

export async function activeWelcomeJob(db: Queryable, brandId: string): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(
    `select id from presenza.ai_jobs
     where kind = 'welcome' and input->>'brandId' = $1 and status in ('queued', 'running')
     order by created_at desc limit 1`,
    [brandId],
  );
  return rows[0]?.id ?? null;
}

// Due richieste insieme per lo stesso brand (la pagina e il giro del mattino) mettono in coda un job solo.
export async function lockWelcome(db: Queryable, brandId: string): Promise<void> {
  await db.query(`select pg_advisory_xact_lock(hashtext('welcome:' || $1))`, [brandId]);
}

export async function findSignals(db: Queryable, brandId: string): Promise<WelcomeSignals | null> {
  const brand = await db.query<{ positioning: Positioning; milestones: Milestone[] | null }>(
    `select positioning, refs->'milestones' as milestones from presenza.brands where id = $1`,
    [brandId],
  );
  const row = brand.rows[0];
  if (!row) return null;
  const now = planNow();
  const until = addDays(now.date, AHEAD_DAYS);
  const weekStart = startOfWeek(now.date);

  // Una data del brand vale se cade in questi giorni o se ne cade l'anniversario.
  const milestones = (row.milestones ?? []).flatMap((milestone) => {
    if (milestone.date >= now.date && milestone.date <= until) return [{ label: milestone.label, date: milestone.date, anniversary: false }];
    if (milestone.date >= now.date) return [];
    const years = [now.date.slice(0, 4), until.slice(0, 4)].map((year) => `${year}${milestone.date.slice(4)}`);
    const next = years.find((date) => date >= now.date && date <= until);
    return next ? [{ label: milestone.label, date: next, anniversary: true }] : [];
  });

  const week = await db.query<{ planned: number }>(
    `select count(*)::int as planned from presenza.slots s
     where s.brand_id = $1 and s.publish_date between $2::date and $3::date
       and (s.idea_id is not null or s.status = 'published' or exists (select 1 from presenza.contents c where c.slot_id = s.id))`,
    [brandId, weekStart, addDays(weekStart, 6)],
  );
  const published = await db.query<{ last: string | null }>(
    `select max(s.publish_date)::text as last from presenza.slots s
       left join presenza.contents c on c.slot_id = s.id
     where s.brand_id = $1
       and (s.status = 'published' or (c.status = 'approved' and s.publish_date::text || 'T' || left(s.publish_time::text, 5) < $2))`,
    [brandId, `${now.date}T${now.time}`],
  );
  const drafts = await db.query<{ title: string; updated_at: Date }>(
    `select title, updated_at from presenza.contents where brand_id = $1 and status = 'draft' order by updated_at desc limit $2`,
    [brandId, RECENT_DRAFTS],
  );
  const ideas = await db.query<{ title: string }>(
    `select i.title from presenza.ideas i
     where i.brand_id = $1 and i.status = 'saved'
       and not exists (select 1 from presenza.slots s where s.idea_id = i.id)
       and not exists (select 1 from presenza.contents c where c.idea_id = i.id)
     order by i.decided_at desc nulls last limit $2`,
    [brandId, RECENT_IDEAS],
  );
  const chats = await db.query<{ title: string }>(
    'select title from presenza.conversations where brand_id = $1 order by updated_at desc limit $2',
    [brandId, RECENT_CHATS],
  );

  return {
    occasions: occasionsBetween(now.date, until),
    milestones,
    week: { planned: week.rows[0]?.planned ?? 0, target: row.positioning.postsPerWeek },
    lastPublished: published.rows[0]?.last ?? null,
    drafts: drafts.rows.map((draft) => ({ title: draft.title, updatedAt: draft.updated_at.toISOString() })),
    savedIdeas: ideas.rows.map((idea) => idea.title),
    recentChats: chats.rows.map((chat) => chat.title),
  };
}

// I brand da preparare al mattino: senza il benvenuto di oggi, e usati di recente (aperti o con un accesso).
// Se il job di oggi è già fallito il giro non lo ripete: ci riprova la chat, quando si apre.
export async function brandsToWelcome(db: Queryable, day: string, activeDays: number): Promise<{ brandId: string; accountId: string }[]> {
  const { rows } = await db.query<{ brand_id: string; account_id: string }>(
    `select b.id as brand_id, b.account_id from presenza.brands b
       join presenza.accounts a on a.id = b.account_id
       left join presenza.brand_welcome w on w.brand_id = b.id
     where (w.day is null or w.day < $1::date)
       and (w.generated_at > now() - make_interval(days => $2) or a.last_sign_in_at > now() - make_interval(days => $2))
       and not exists (
         select 1 from presenza.ai_jobs j
         where j.kind = 'welcome' and j.input->>'brandId' = b.id::text and j.input->>'day' = $1 and j.status = 'failed'
       )`,
    [day, activeDays],
  );
  return rows.map((row) => ({ brandId: row.brand_id, accountId: row.account_id }));
}
