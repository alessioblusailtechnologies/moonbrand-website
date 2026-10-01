-- Job content-photos: riempie gli slot foto di un contenuto con le foto caricate o generate.
alter table presenza.ai_jobs drop constraint ai_jobs_kind_check;
alter table presenza.ai_jobs add constraint ai_jobs_kind_check check (kind in ('website', 'visual', 'visual-edit', 'ideas', 'content', 'content-edit', 'content-photos'));
