import type { Queryable } from '../../db/pool';

// Il job della chat che sta chiamando l'API con il suo token: account, brand e conversazione vengono da lì.
export interface AgentJob {
  jobId: string;
  accountId: string;
  brandId: string;
  conversationId: string;
}

// Senza identità: è il token a dire di chi è il job. Vale solo mentre il job è in corso.
export async function findAgentJob(db: Queryable, token: string): Promise<AgentJob | null> {
  const { rows } = await db.query<{ id: string; account_id: string; brand_id: string; conversation_id: string }>(
    `select id, account_id, input->>'brandId' as brand_id, input->>'conversationId' as conversation_id
     from presenza.ai_jobs where agent_token = $1 and kind = 'chat' and status = 'running'`,
    [token],
  );
  const row = rows[0];
  return row ? { jobId: row.id, accountId: row.account_id, brandId: row.brand_id, conversationId: row.conversation_id } : null;
}
