-- I job salvati prima di session_cost_usd hanno in cost_usd il totale della sessione: il totale passa in
-- session_cost_usd e cost_usd diventa la parte del job. Facoltativa, corregge solo i costi già salvati; si applica dopo
-- 20260930090000_ai_costs.
update presenza.ai_jobs set session_cost_usd = cost_usd where session_id is not null and session_cost_usd is null;

update presenza.ai_jobs j
set cost_usd = j.session_cost_usd - p.before
from (
  select id, max(session_cost_usd) over (partition by session_id order by created_at rows between unbounded preceding and 1 preceding) as before
  from presenza.ai_jobs
  where session_id is not null
) p
where p.id = j.id and p.before is not null and j.session_cost_usd >= p.before;
