import type pg from 'pg';

import type { IdeasJobInput } from '@moonbrand/shared/api/contract';
import type { IdeaDraft } from '@moonbrand/shared/domain/idea';

import { MAX_PER_THEME, MAX_TRENDS } from '../lib/ideas-rules';

type RawIdea = Omit<IdeaDraft, 'signal' | 'formats' | 'channels'> & { signal: { kind: IdeaDraft['signal']['kind']; label?: string; sourceUrl: string | null } };

const SOURCE_TIMEOUT_MS = 8000;

// Un trend vale solo se la sua fonte esiste: si scartano i link che non rispondono o che danno "non trovato".
// Alcuni siti rispondono 401/403/429 ai programmi: l'articolo c'è, quindi si tiene.
async function sourceExists(url: string): Promise<boolean> {
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS),
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; MoonbrandBot/1.0)' },
    });
    await response.body?.cancel().catch(() => undefined);
    return response.status < 400 || [401, 403, 405, 429].includes(response.status);
  } catch {
    return false;
  }
}

// Le idee del job finiscono tra le proposte del brand (presenza.ideas, la tabella di social-app).
// Lo schema le ha già validate; qui valgono le regole che il modello potrebbe non rispettare:
// niente doppioni su tutta la storia, un massimo per tema e per trend, trend solo con una fonte vera.
export async function saveIdeas(pool: pg.Pool, accountId: string, input: IdeasJobInput, result: unknown): Promise<number> {
  const { brandId, brand } = input;
  const { rows } = await pool.query<{ title: string }>('select title from presenza.ideas where brand_id = $1', [brandId]);
  const taken = new Set(rows.map((row) => row.title.trim().toLowerCase()));
  const perTheme = new Map<string, number>();
  let trends = 0;

  const drafts: IdeaDraft[] = [];
  for (const raw of (result as { ideas: RawIdea[] }).ideas) {
    const title = raw.title.trim().slice(0, 300);
    const key = title.toLowerCase();
    if (!title || taken.has(key)) continue;
    const themeId = brand.themes.some((theme) => theme.id === raw.themeId) ? raw.themeId : null;
    if (themeId && (perTheme.get(themeId) ?? 0) >= MAX_PER_THEME) continue;
    const isTrend = raw.signal.kind === 'trend';
    const sourceUrl = raw.signal.sourceUrl?.trim() ?? '';
    if (isTrend && (trends >= MAX_TRENDS || !(await sourceExists(sourceUrl)))) continue;

    taken.add(key);
    if (themeId) perTheme.set(themeId, (perTheme.get(themeId) ?? 0) + 1);
    if (isTrend) trends += 1;
    drafts.push({
      title,
      angleLabel: raw.angleLabel.trim().slice(0, 120),
      angle: raw.angle.trim().slice(0, 2000),
      rationale: raw.rationale.trim().slice(0, 1000),
      themeId,
      signal: {
        kind: raw.signal.kind,
        label: (raw.signal.label ?? '').trim().slice(0, 200),
        ...(isTrend && { sourceUrl: sourceUrl.slice(0, 2000) }),
      },
      // L'idea non dice come confezionarla: formato e canali si scelgono quando diventa un contenuto.
      formats: [],
      channels: [],
    });
  }

  const client = await pool.connect();
  try {
    await client.query('begin');
    for (const draft of drafts) {
      await client.query(
        `insert into presenza.ideas (brand_id, account_id, title, angle_label, angle, rationale, theme_id, signal, formats, channels)
         values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)`,
        [
          brandId,
          accountId,
          draft.title,
          draft.angleLabel,
          draft.angle,
          draft.rationale,
          draft.themeId,
          JSON.stringify(draft.signal),
          draft.formats,
          draft.channels,
        ],
      );
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  return drafts.length;
}
