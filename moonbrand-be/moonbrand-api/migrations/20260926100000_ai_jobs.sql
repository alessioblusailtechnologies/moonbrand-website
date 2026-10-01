-- Coda dei lavori AI: l'api inserisce la riga, il worker di moonbrand-ai la
-- prende (for update skip locked), ci scrive gli step nativi di Claude Code
-- e alla fine il risultato. locked_until è il battito del worker: una riga
-- running con lock scaduto torna prendibile.

create table presenza.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references presenza.accounts (id) on delete cascade,
  kind text not null check (kind in ('website')),
  input jsonb not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  steps jsonb not null default '[]'::jsonb,
  result jsonb,
  error text,
  attempts integer not null default 0,
  locked_until timestamptz,
  session_id text,
  cost_usd numeric,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index ai_jobs_account on presenza.ai_jobs (account_id, created_at);
create index ai_jobs_pending on presenza.ai_jobs (created_at) where status in ('queued', 'running');

alter table presenza.ai_jobs enable row level security;

create policy ai_jobs_select_own on presenza.ai_jobs
  for select to presenza_user using (account_id = presenza.current_account_id());
create policy ai_jobs_insert_own on presenza.ai_jobs
  for insert to presenza_user with check (account_id = presenza.current_account_id());

grant select, insert on presenza.ai_jobs to presenza_user;
