-- Claude Code riporta il costo di tutta la sessione, anche quando un job ne riprende una (i turni della chat, i
-- ritocchi): quel totale va in session_cost_usd, e cost_usd è solo la parte del job, cioè il totale meno quello del job
-- prima nella stessa sessione.
alter table presenza.ai_jobs add column session_cost_usd numeric;

-- Le generazioni dei tool (immagini, clip, voce, musica) con il job che le ha chieste. units e unit sono quello che il
-- servizio conta (crediti, caratteri, token); cost_usd solo quando il servizio lo dice, altrimenti null.
alter table presenza.ai_usage
  add column job_id uuid references presenza.ai_jobs (id) on delete set null,
  add column units numeric,
  add column unit text,
  alter column cost_usd drop not null,
  alter column cost_usd drop default;
create index ai_usage_job_id_idx on presenza.ai_usage (job_id);
