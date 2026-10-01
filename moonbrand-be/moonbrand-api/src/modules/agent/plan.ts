import type pg from 'pg';

import type { SlotCreateRequest, SlotPatchRequest, SlotView } from '@moonbrand/shared/api/contract';
import { SLOT_STATUS_LABELS, type PlanRequest } from '@moonbrand/shared/domain/plan';
import { addDays, formatWeekdayShort, planNow } from '@moonbrand/shared/lib/dates';

import { withIdentity } from '../../db/identity';
import type { Queryable } from '../../db/pool';
import { ApiError } from '../../errors';
import type { BrandFiles } from '../brand-files/files';
import { findBrandForIdeas, listIdeas } from '../ideas/repository';
import { findSlot, listSlots } from '../plan/repository';
import { createSlotIn, patchSlotIn, proposeIn, removeSlotIn, slotViews, type PlanScope } from '../plan/service';
import type { AgentJob } from './repository';

// Il piano per i tool della chat: le stesse regole della sezione Piano, sul brand del job.

function scopeOf(db: Queryable, files: BrandFiles, agent: AgentJob): PlanScope {
  return { db, files, brandId: agent.brandId, accountId: agent.accountId };
}

async function themeNames(db: Queryable, brandId: string): Promise<Map<string, string>> {
  const brand = await findBrandForIdeas(db, brandId);
  return new Map((brand?.themes ?? []).map((theme) => [theme.id, theme.name]));
}

// Quello che Claude vede di un'uscita: quando, dove, a che punto è e cosa ha.
function describe(slot: SlotView, themes: Map<string, string>) {
  return {
    id: slot.id,
    date: slot.date,
    day: formatWeekdayShort(slot.date),
    time: slot.time,
    channels: slot.channels,
    status: slot.status,
    statusLabel: SLOT_STATUS_LABELS[slot.status],
    theme: slot.themeId ? (themes.get(slot.themeId) ?? null) : null,
    idea: slot.idea,
    content: slot.content && { id: slot.content.id, title: slot.content.title, format: slot.content.format, status: slot.content.status },
  };
}

async function slotOf(db: Queryable, agent: AgentJob, slotId: string) {
  const slot = await findSlot(db, slotId);
  if (!slot || slot.brandId !== agent.brandId) throw ApiError.notFound('Uscita non trovata in questo brand.');
  return slot;
}

export function listAgentPlan(pool: pg.Pool, files: BrandFiles, agent: AgentJob, range: { from?: string; to?: string }) {
  return withIdentity(pool, { accountId: agent.accountId }, async (db) => {
    const from = range.from ?? planNow().date;
    const to = range.to ?? addDays(from, 27);
    const [slots, themes] = await Promise.all([listSlots(db, agent.brandId, { from, to }), themeNames(db, agent.brandId)]);
    return { from, to, today: planNow().date, slots: (await slotViews(db, files, agent.brandId, slots)).map((slot) => describe(slot, themes)) };
  });
}

// Una proposta, senza salvarla: le uscite si creano poi con uscite_crea, anche ritoccate.
export function proposeAgentPlan(pool: pg.Pool, agent: AgentJob, request: Partial<PlanRequest> & { weeks: number }) {
  return withIdentity(pool, { accountId: agent.accountId }, async (db) => {
    const brand = await findBrandForIdeas(db, agent.brandId);
    if (!brand) throw ApiError.notFound('Brand non trovato.');
    const { drafts } = await proposeIn(db, agent.brandId, {
      startDate: request.startDate ?? addDays(planNow().date, 1),
      weeks: request.weeks,
      perWeek: request.perWeek ?? Math.max(1, Math.min(7, brand.context.positioning.postsPerWeek || 3)),
      channels: request.channels ?? [],
    });
    const ideas = new Map((await listIdeas(db, agent.brandId)).map((idea) => [idea.id, idea.title]));
    const themes = new Map(brand.themes.map((theme) => [theme.id, theme.name]));
    return {
      drafts: drafts.map((draft) => ({
        ...draft,
        day: formatWeekdayShort(draft.date),
        theme: draft.themeId ? (themes.get(draft.themeId) ?? null) : null,
        idea: draft.ideaId ? { id: draft.ideaId, title: ideas.get(draft.ideaId) ?? '' } : null,
      })),
    };
  });
}

export function createAgentSlots(pool: pg.Pool, files: BrandFiles, agent: AgentJob, requests: SlotCreateRequest[]) {
  return withIdentity(pool, { accountId: agent.accountId }, async (db) => {
    const scope = scopeOf(db, files, agent);
    const themes = await themeNames(db, agent.brandId);
    const created = [];
    for (const [index, request] of requests.entries()) {
      try {
        created.push(describe(await createSlotIn(scope, request), themes));
      } catch (error) {
        // Tutte o nessuna: l'errore dice quale uscita correggere.
        if (error instanceof ApiError) throw ApiError.invalid(`Uscita ${index + 1} (${request.date} ${request.time}): ${error.message}`);
        throw error;
      }
    }
    return { created };
  });
}

export function patchAgentSlot(pool: pg.Pool, files: BrandFiles, agent: AgentJob, slotId: string, request: SlotPatchRequest) {
  return withIdentity(pool, { accountId: agent.accountId }, async (db) => {
    const slot = await slotOf(db, agent, slotId);
    return describe(await patchSlotIn(scopeOf(db, files, agent), slot, request), await themeNames(db, agent.brandId));
  });
}

export function removeAgentSlot(pool: pg.Pool, files: BrandFiles, agent: AgentJob, slotId: string) {
  return withIdentity(pool, { accountId: agent.accountId }, async (db) => {
    const slot = await slotOf(db, agent, slotId);
    await removeSlotIn(scopeOf(db, files, agent), slot);
    return { removed: slotId };
  });
}
