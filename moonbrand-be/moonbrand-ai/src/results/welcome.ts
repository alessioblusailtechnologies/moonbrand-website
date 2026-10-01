import type pg from 'pg';

import type { WelcomeJobInput } from '@moonbrand/shared/api/contract';
import { DAY_PARTS, WELCOME_ICONS, type Greeting, type WelcomeSuggestion } from '@moonbrand/shared/domain/welcome';

import { cleanText, GREETINGS_PER_PART, MAX_DRAFT, MAX_GREETING, MAX_LABEL, SUGGESTIONS } from '../lib/welcome-rules';

interface RawWelcome {
  greetings: { part: string; text: string }[];
  suggestions: { icon: string; label: string; draft: string }[];
}

// Il benvenuto del job va nel brand, al posto di quello di prima. Lo schema l'ha già validato; qui valgono le regole
// che il modello potrebbe non rispettare: niente emoji, lunghezze, doppioni. Se nel frattempo è finito un job chiesto
// dopo, vale quello.
export async function saveWelcome(pool: pg.Pool, jobId: string, input: WelcomeJobInput, result: unknown): Promise<void> {
  const raw = result as RawWelcome;
  const seen = new Set<string>();
  const perPart = new Map<string, number>();
  const greetings: Greeting[] = [];
  for (const item of raw.greetings) {
    const text = cleanText(item.text, MAX_GREETING);
    const part = DAY_PARTS.find((value) => value === item.part);
    if (!text || !part || seen.has(text.toLowerCase()) || (perPart.get(part) ?? 0) >= GREETINGS_PER_PART) continue;
    seen.add(text.toLowerCase());
    perPart.set(part, (perPart.get(part) ?? 0) + 1);
    greetings.push({ part, text });
  }
  const suggestions: WelcomeSuggestion[] = [];
  for (const item of raw.suggestions) {
    const label = cleanText(item.label, MAX_LABEL);
    const draft = cleanText(item.draft, MAX_DRAFT);
    const icon = WELCOME_ICONS.find((value) => value === item.icon) ?? 'sparkle';
    if (!label || !draft || suggestions.some((other) => other.label === label)) continue;
    // Il draft aperto resta aperto: lo spazio in fondo è quello dove si continua a scrivere.
    suggestions.push({ icon, label, draft: /\s$/.test(item.draft) ? `${draft} ` : draft });
  }
  if (suggestions.length > SUGGESTIONS) suggestions.length = SUGGESTIONS;
  if (greetings.length === 0 && suggestions.length === 0) throw new Error('Nessun saluto e nessuno spunto utilizzabile.');

  await pool.query(
    `insert into presenza.brand_welcome (brand_id, account_id, day, fingerprint, greetings, suggestions, job_created_at)
     select $1, account_id, $2::date, $3, $4::jsonb, $5::jsonb, created_at from presenza.ai_jobs where id = $6
     on conflict (brand_id) do update set
       account_id = excluded.account_id, day = excluded.day, fingerprint = excluded.fingerprint, greetings = excluded.greetings,
       suggestions = excluded.suggestions, job_created_at = excluded.job_created_at, generated_at = now()
     where presenza.brand_welcome.job_created_at < excluded.job_created_at`,
    [input.brandId, input.day, input.fingerprint, JSON.stringify(greetings), JSON.stringify(suggestions), jobId],
  );
}
