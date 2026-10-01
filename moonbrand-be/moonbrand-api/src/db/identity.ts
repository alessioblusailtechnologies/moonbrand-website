import type pg from 'pg';

export interface Identity {
  accountId: string;
}

export async function withIdentity<T>(pool: pg.Pool, identity: Identity, fn: (client: pg.ClientBase) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const claims = JSON.stringify({ sub: identity.accountId, role: 'presenza_user' });
    await client.query("select set_config('request.jwt.claims', $1, true)", [claims]);
    await client.query('set local role presenza_user');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
