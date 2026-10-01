import pg from 'pg';

pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

export type Queryable = Pick<pg.ClientBase, 'query'>;

export function createPool(url: string): pg.Pool {
  const local = url.includes('localhost') || url.includes('127.0.0.1');
  return new pg.Pool({ connectionString: url, ...(local ? {} : { ssl: { rejectUnauthorized: false } }), max: 10 });
}
