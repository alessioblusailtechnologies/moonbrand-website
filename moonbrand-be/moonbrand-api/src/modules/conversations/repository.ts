import type { ConversationSummary, ConversationTurn } from '@moonbrand/shared/api/contract';

import type { Queryable } from '../../db/pool';

interface ConversationRow {
  id: string;
  brand_id: string;
  title: string;
  updated_at: Date;
  busy: boolean;
}

// busy: un turno in coda o in corso.
const SELECT_CONVERSATION = `
  select c.id, c.brand_id, c.title, c.updated_at,
    exists (
      select 1 from presenza.conversation_turns t join presenza.ai_jobs j on j.id = t.job_id
      where t.conversation_id = c.id and j.status in ('queued', 'running')
    ) as busy
  from presenza.conversations c`;

const toSummary = (row: ConversationRow): ConversationSummary => ({
  id: row.id,
  brandId: row.brand_id,
  title: row.title,
  updatedAt: row.updated_at.toISOString(),
  busy: row.busy,
});

export async function listConversations(db: Queryable, brandId: string): Promise<ConversationSummary[]> {
  const { rows } = await db.query<ConversationRow>(`${SELECT_CONVERSATION} where c.brand_id = $1 order by c.updated_at desc`, [brandId]);
  return rows.map(toSummary);
}

export async function findConversation(db: Queryable, conversationId: string): Promise<ConversationSummary | null> {
  const { rows } = await db.query<ConversationRow>(`${SELECT_CONVERSATION} where c.id = $1`, [conversationId]);
  return rows[0] ? toSummary(rows[0]) : null;
}

export async function insertConversation(db: Queryable, brandId: string, accountId: string, title: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    'insert into presenza.conversations (brand_id, account_id, title) values ($1, $2, $3) returning id',
    [brandId, accountId, title],
  );
  return rows[0].id;
}

export async function deleteConversation(db: Queryable, conversationId: string): Promise<void> {
  await db.query('delete from presenza.conversations where id = $1', [conversationId]);
}

export async function insertTurn(
  db: Queryable,
  turn: { conversationId: string; accountId: string; message: string; attachments: string[]; jobId: string },
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    'insert into presenza.conversation_turns (conversation_id, account_id, message, attachments, job_id) values ($1, $2, $3, $4, $5) returning id',
    [turn.conversationId, turn.accountId, turn.message, turn.attachments, turn.jobId],
  );
  await db.query('update presenza.conversations set updated_at = now() where id = $1', [turn.conversationId]);
  return rows[0].id;
}

// Gli allegati come percorsi: i link firmati li aggiunge il service.
export async function listTurns(db: Queryable, conversationId: string): Promise<(Omit<ConversationTurn, 'attachments'> & { attachments: string[] })[]> {
  const { rows } = await db.query<{
    id: string;
    message: string;
    attachments: string[];
    idea: { id: string; title: string } | null;
    slot: ConversationTurn['slot'];
    created_at: Date;
    job_id: string;
    kind: string;
    status: ConversationTurn['job']['status'];
    steps: ConversationTurn['job']['steps'];
    result: ConversationTurn['job']['result'];
    error: string | null;
  }>(
    `select t.id, t.message, t.attachments, t.created_at, j.id as job_id,
       case when jsonb_typeof(j.input->'idea') = 'object'
         then jsonb_build_object('id', j.input->'idea'->>'id', 'title', j.input->'idea'->>'title') end as idea,
       case when jsonb_typeof(j.input->'slot') = 'object'
         then jsonb_build_object('id', j.input->'slot'->'id', 'date', j.input->'slot'->'date', 'time', j.input->'slot'->'time',
           'channels', j.input->'slot'->'channels') end as slot, j.kind, j.status, j.steps, j.result, j.error
     from presenza.conversation_turns t join presenza.ai_jobs j on j.id = t.job_id
     where t.conversation_id = $1 order by t.created_at`,
    [conversationId],
  );
  return rows.map((row) => ({
    id: row.id,
    message: row.message,
    attachments: row.attachments,
    idea: row.idea,
    slot: row.slot,
    createdAt: row.created_at.toISOString(),
    job: { id: row.job_id, kind: row.kind, status: row.status, steps: row.steps, result: row.result, error: row.error },
  }));
}

// Il job del turno in coda o in corso, se c'è.
export async function activeJob(db: Queryable, conversationId: string): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(
    `select j.id from presenza.conversation_turns t join presenza.ai_jobs j on j.id = t.job_id
     where t.conversation_id = $1 and j.status in ('queued', 'running')
     order by t.created_at desc limit 1`,
    [conversationId],
  );
  return rows[0]?.id ?? null;
}

// La sessione di Claude da riprendere: quella dell'ultimo turno che l'ha lasciata, anche se poi è fallito.
export async function lastSession(db: Queryable, conversationId: string): Promise<string | null> {
  const { rows } = await db.query<{ session_id: string }>(
    `select j.session_id from presenza.conversation_turns t join presenza.ai_jobs j on j.id = t.job_id
     where t.conversation_id = $1 and j.session_id is not null
     order by t.created_at desc limit 1`,
    [conversationId],
  );
  return rows[0]?.session_id ?? null;
}
