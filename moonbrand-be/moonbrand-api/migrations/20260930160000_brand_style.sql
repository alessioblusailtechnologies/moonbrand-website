-- Lo stile del brand letto una volta dai riferimenti (job style), invece che a ogni contenuto.
-- null: non ancora letto; stringa vuota: il brand non ha riferimenti.
alter table presenza.brands add column style_guide text;

alter table presenza.ai_jobs drop constraint ai_jobs_kind_check;
alter table presenza.ai_jobs add constraint ai_jobs_kind_check check (kind in ('website', 'visual', 'visual-edit', 'ideas', 'content', 'content-edit', 'content-video', 'chat', 'style'));
