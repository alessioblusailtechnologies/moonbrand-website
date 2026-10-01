-- Il benvenuto dell'assistente per brand: i saluti e gli spunti del giorno, scritti dal job welcome.
-- day: il giorno (a Roma) per cui valgono; fingerprint: lo stato del brand da cui nascono, che se cambia li fa rifare.
-- job_created_at: quando è stato chiesto il job che li ha scritti, perché uno chiesto prima non sovrascriva uno più nuovo.
create table presenza.brand_welcome (
  brand_id uuid primary key references presenza.brands (id) on delete cascade,
  account_id uuid not null references presenza.accounts (id) on delete cascade,
  day date not null,
  fingerprint text not null,
  greetings jsonb not null,
  suggestions jsonb not null,
  job_created_at timestamptz not null,
  generated_at timestamptz not null default now()
);

alter table presenza.brand_welcome enable row level security;

create policy brand_welcome_own on presenza.brand_welcome
  for select to presenza_user
  using (account_id = presenza.current_account_id());

grant select on presenza.brand_welcome to presenza_user;

alter table presenza.ai_jobs drop constraint ai_jobs_kind_check;
alter table presenza.ai_jobs add constraint ai_jobs_kind_check check (kind in ('website', 'visual', 'visual-edit', 'ideas', 'content', 'content-edit', 'content-video', 'chat', 'style', 'welcome'));
