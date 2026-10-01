-- La chat: le foto allegate a un messaggio (percorsi nella cartella del brand)
-- e lo stop di un turno. L'API segna cancel_requested; il worker, che lo
-- controlla ogni secondo, ferma Claude e chiude il job come stopped.

alter table presenza.conversation_turns add column attachments text[] not null default '{}';

alter table presenza.ai_jobs add column cancel_requested boolean not null default false;
alter table presenza.ai_jobs drop constraint ai_jobs_status_check;
alter table presenza.ai_jobs add constraint ai_jobs_status_check check (status in ('queued', 'running', 'done', 'failed', 'stopped'));
