import type pg from 'pg';

import type { AiJobCreated, IdeaPreferences, IdeasJobInput, IdeasResponse } from '@moonbrand/shared/api/contract';
import type { Idea, IdeaStatus } from '@moonbrand/shared/domain/idea';

import { withIdentity, type Identity } from '../../db/identity';
import { ApiError } from '../../errors';
import { insertJob } from '../ai/repository';
import { activeIdeasJob, findBrandForIdeas, listIdeas, updateIdeaStatus } from './repository';

export const FIRST_IDEAS = 10;
export const MORE_IDEAS = 6;

// Le idee più recenti passano per titolo, per non ripetersi; il resto della storia arriva come gusti.
const RECENT_IDEAS = 30;

function preferencesOf(ideas: readonly Idea[]): IdeaPreferences {
  const decided = ideas.filter((idea) => idea.status !== 'new');
  const score = <Key extends string>(keyOf: (idea: Idea) => Key | null) => {
    const scores = new Map<Key, number>();
    for (const idea of decided) {
      const key = keyOf(idea);
      if (key) scores.set(key, (scores.get(key) ?? 0) + (idea.status === 'saved' ? 1 : -0.5));
    }
    return [...scores];
  };
  return {
    decided: decided.length,
    saved: decided.filter((idea) => idea.status === 'saved').length,
    themes: score((idea) => idea.themeId).map(([themeId, value]) => ({ themeId, score: value })),
    signals: score((idea) => idea.signal.kind).map(([kind, value]) => ({ kind, score: value })),
  };
}

export function getIdeas(pool: pg.Pool, identity: Identity, brandId: string): Promise<IdeasResponse> {
  return withIdentity(pool, identity, async (db) => {
    const brand = await findBrandForIdeas(db, brandId);
    if (!brand) throw ApiError.notFound('Brand non trovato.');
    return {
      ideas: await listIdeas(db, brandId),
      themes: brand.themes.map(({ id, name, color }) => ({ id, name, color })),
      channels: brand.context.channels,
      jobId: await activeIdeasJob(db, brandId),
    };
  });
}

// Se sta già preparando idee per questo brand, restituisce quel lavoro invece di aprirne un altro.
export function queueIdeasJob(pool: pg.Pool, identity: Identity, brandId: string, count: number): Promise<AiJobCreated> {
  return withIdentity(pool, identity, async (db) => {
    const brand = await findBrandForIdeas(db, brandId);
    if (!brand) throw ApiError.notFound('Brand non trovato.');
    const active = await activeIdeasJob(db, brandId);
    if (active) return { id: active };
    const ideas = await listIdeas(db, brandId);
    const input: IdeasJobInput = {
      brandId,
      count,
      brand: brand.context,
      recent: ideas
        .slice(0, RECENT_IDEAS)
        .map((idea) => ({ title: idea.title, status: idea.status, themeId: idea.themeId, signal: idea.signal.kind })),
      preferences: preferencesOf(ideas),
    };
    return { id: await insertJob(db, identity.accountId, 'ideas', input) };
  });
}

export function setIdeaStatus(pool: pg.Pool, identity: Identity, ideaId: string, status: IdeaStatus): Promise<Idea> {
  return withIdentity(pool, identity, async (db) => {
    const idea = await updateIdeaStatus(db, ideaId, status);
    if (!idea) throw ApiError.notFound('Idea non trovata.');
    return idea;
  });
}
