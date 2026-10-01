-- Job visual-edit: modifica degli esempi riprendendo la sessione Claude Code della generazione.
alter table presenza.ai_jobs drop constraint ai_jobs_kind_check;
alter table presenza.ai_jobs add constraint ai_jobs_kind_check check (kind in ('website', 'visual', 'visual-edit'));
