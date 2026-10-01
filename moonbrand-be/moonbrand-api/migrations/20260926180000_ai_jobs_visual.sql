-- Job visual: esempi di post generati dai file di riferimento del brand.
alter table presenza.ai_jobs drop constraint ai_jobs_kind_check;
alter table presenza.ai_jobs add constraint ai_jobs_kind_check check (kind in ('website', 'visual'));
