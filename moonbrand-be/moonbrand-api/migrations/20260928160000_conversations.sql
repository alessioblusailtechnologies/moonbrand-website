-- La chat con il brand: tante conversazioni, ognuna una sessione di Claude nella
-- cartella del brand. Ogni messaggio è un turno con il suo job chat, che riprende
-- la sessione del turno prima. I tool della chat chiamano l'API con il token del
-- job (agent_token), valido solo finché il job è in corso.

create table presenza.conversations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references presenza.accounts (id) on delete cascade,
  brand_id uuid not null references presenza.brands (id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conversations_brand on presenza.conversations (brand_id, updated_at desc);

create table presenza.conversation_turns (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references presenza.conversations (id) on delete cascade,
  account_id uuid not null references presenza.accounts (id) on delete cascade,
  message text not null,
  job_id uuid not null references presenza.ai_jobs (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index conversation_turns_conversation on presenza.conversation_turns (conversation_id, created_at);

alter table presenza.conversations enable row level security;
alter table presenza.conversation_turns enable row level security;

create policy conversations_own on presenza.conversations
  for all to presenza_user
  using (account_id = presenza.current_account_id())
  with check (account_id = presenza.current_account_id());
create policy conversation_turns_own on presenza.conversation_turns
  for all to presenza_user
  using (account_id = presenza.current_account_id())
  with check (account_id = presenza.current_account_id());

grant select, insert, update, delete on presenza.conversations to presenza_user;
grant select, insert on presenza.conversation_turns to presenza_user;

-- Il contenuto salvato dalla chat ricorda la conversazione in cui è nato.
alter table presenza.contents add column conversation_id uuid references presenza.conversations (id) on delete set null;

alter table presenza.ai_jobs add column agent_token text unique;
alter table presenza.ai_jobs drop constraint ai_jobs_kind_check;
alter table presenza.ai_jobs add constraint ai_jobs_kind_check check (kind in ('website', 'visual', 'visual-edit', 'ideas', 'content', 'content-edit', 'chat'));
