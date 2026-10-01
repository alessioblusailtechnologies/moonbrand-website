import type pg from 'pg';

import type {
  PlanProposal,
  PlanResponse,
  SlotCreateRequest,
  SlotPatchRequest,
  SlotView,
} from '@moonbrand/shared/api/contract';
import type { ChannelId } from '@moonbrand/shared/domain/brand';
import type { Content } from '@moonbrand/shared/domain/content';
import { channelName } from '@moonbrand/shared/domain/catalog';
import { isPast, planNow } from '@moonbrand/shared/lib/dates';
import {
  bestChannelFor,
  buildSkeleton,
  fillSkeleton,
  placeIdea,
  slotStatus,
  type PlanBrand,
  type PlanRequest,
  type PlanSlot,
  type SlotDraft,
  type SlotOrigin,
} from '@moonbrand/shared/domain/plan';

import { withIdentity, type Identity } from '../../db/identity';
import type { Queryable } from '../../db/pool';
import { ApiError } from '../../errors';
import type { BrandFiles } from '../brand-files/files';
import { activeContentJobs, findContent, listContents } from '../contents/repository';
import { summarize } from '../contents/service';
import { findBrandForIdeas, findIdea, listIdeas, updateIdeaStatus } from '../ideas/repository';
import {
  deleteSlot,
  findSlot,
  ideaTitles,
  insertSlot,
  listSlots,
  plannedIdeaIds,
  setContentSlot,
  storeSlotStatus,
  updateSlot,
} from './repository';

// Il piano si tocca dalla sezione Piano e dai tool della chat: la logica è una, su un brand e un account.
export interface PlanScope {
  db: Queryable;
  files: BrandFiles;
  brandId: string;
  accountId: string;
}

async function brandFor(db: Queryable, brandId: string) {
  const brand = await findBrandForIdeas(db, brandId);
  if (!brand) throw ApiError.notFound('Brand non trovato.');
  const plan: PlanBrand = { id: brandId, channels: brand.context.channels, themes: brand.context.themes };
  return { brand, plan };
}

// Le uscite come le mostra il piano: i canali e il titolo del contenuto, se c'è, e lo stato che ne segue.
export async function slotViews(db: Queryable, files: BrandFiles, brandId: string, slots: readonly PlanSlot[]): Promise<SlotView[]> {
  if (slots.length === 0) return [];
  const ideaIds = [...new Set(slots.map((slot) => slot.ideaId).filter((id): id is string => id !== null))];
  const [contents, jobs, titles] = await Promise.all([listContents(db, brandId), activeContentJobs(db, brandId), ideaTitles(db, ideaIds)]);
  const bySlot = new Map(contents.filter((content) => content.slotId).map((content) => [content.slotId!, content]));
  const now = planNow();
  return slots.map((slot) => {
    const content = bySlot.get(slot.id) ?? null;
    const ideaTitle = slot.ideaId ? titles.get(slot.ideaId) : undefined;
    return {
      ...slot,
      channels: content?.channels ?? slot.channels,
      contentTitle: content?.title ?? slot.contentTitle,
      status: slotStatus(slot, content, now),
      idea: slot.ideaId && ideaTitle ? { id: slot.ideaId, title: ideaTitle } : null,
      content: content ? summarize(content, files, jobs.has(content.id), { date: slot.date, time: slot.time }) : null,
    };
  });
}

async function viewOf(scope: PlanScope, slot: PlanSlot): Promise<SlotView> {
  return (await slotViews(scope.db, scope.files, scope.brandId, [slot]))[0];
}

function requireFuture(date: string, time: string): void {
  if (isPast(date, time)) throw ApiError.invalid('Scegli un giorno e un’ora da adesso in poi.');
}

function requireBrandChannels(channels: readonly ChannelId[], brandChannels: readonly ChannelId[]): ChannelId[] {
  const unique = [...new Set(channels)];
  if (unique.length === 0) throw ApiError.invalid('Scegli almeno un canale.');
  const outside = unique.filter((channel) => !brandChannels.includes(channel));
  if (outside.length > 0) throw ApiError.invalid(`${outside.map(channelName).join(', ')}: non sono tra i canali del brand.`);
  return unique;
}

async function requireIdea(scope: PlanScope, ideaId: string) {
  const idea = await findIdea(scope.db, ideaId);
  if (!idea || idea.brandId !== scope.brandId) throw ApiError.notFound('Idea non trovata in questo brand.');
  // Mettere un'idea nel piano la tiene.
  if (idea.status !== 'saved') await updateIdeaStatus(scope.db, idea.id, 'saved');
  return idea;
}

// Un'uscita nuova: con un contenuto già fatto, con un'idea o vuota (con il tema da coprire).
export async function createSlotIn(scope: PlanScope, request: SlotCreateRequest, origin?: SlotOrigin): Promise<SlotView> {
  requireFuture(request.date, request.time);
  const { plan } = await brandFor(scope.db, scope.brandId);
  const firstChannel = () => {
    const channel = bestChannelFor(plan.channels, request.date);
    if (!channel) throw ApiError.invalid('Il brand non ha canali.');
    return [channel];
  };

  if (request.contentId) {
    const content = await findContent(scope.db, request.contentId);
    if (!content || content.brandId !== scope.brandId) throw ApiError.notFound('Contenuto non trovato in questo brand.');
    if (content.slotId) throw ApiError.conflict('ALREADY_PLANNED', 'Questo contenuto è già nel piano: sposta la sua uscita.');
    const slot = await insertSlot(scope.db, {
      brandId: scope.brandId,
      accountId: scope.accountId,
      date: request.date,
      time: request.time,
      channels: content.channels,
      themeId: content.themeId,
      ideaId: content.ideaId,
      contentTitle: content.title,
      status: slotStatus({ status: 'empty', date: request.date, time: request.time, ideaId: content.ideaId }, content),
      origin: origin ?? (content.ideaId ? 'idea' : 'manual'),
    });
    await setContentSlot(scope.db, content.id, slot.id);
    return viewOf(scope, slot);
  }

  if (request.ideaId) {
    const idea = await requireIdea(scope, request.ideaId);
    const fromIdea = idea.channels.filter((channel) => plan.channels.includes(channel));
    const channels = request.channels?.length ? requireBrandChannels(request.channels, plan.channels) : fromIdea.length > 0 ? fromIdea : firstChannel();
    const slot = await insertSlot(scope.db, {
      brandId: scope.brandId,
      accountId: scope.accountId,
      date: request.date,
      time: request.time,
      channels,
      themeId: request.themeId ?? idea.themeId,
      ideaId: idea.id,
      contentTitle: null,
      status: 'toPrepare',
      origin: origin ?? 'idea',
    });
    return viewOf(scope, slot);
  }

  const channels = request.channels?.length ? requireBrandChannels(request.channels, plan.channels) : firstChannel();
  const slot = await insertSlot(scope.db, {
    brandId: scope.brandId,
    accountId: scope.accountId,
    date: request.date,
    time: request.time,
    channels,
    themeId: request.themeId ?? null,
    ideaId: null,
    contentTitle: null,
    status: 'empty',
    origin: origin ?? 'manual',
  });
  return viewOf(scope, slot);
}

// Spostare un'uscita o cambiarne canali, tema e idea. Con il contenuto, i canali sono i suoi e l'idea non si cambia più.
export async function patchSlotIn(scope: PlanScope, slot: PlanSlot, request: SlotPatchRequest): Promise<SlotView> {
  const date = request.date ?? slot.date;
  const time = request.time ?? slot.time;
  if (date !== slot.date || time !== slot.time) requireFuture(date, time);
  const content = (await listContents(scope.db, scope.brandId)).find((item) => item.slotId === slot.id) ?? null;
  if (content && request.channels) throw ApiError.invalid('I canali di un’uscita con il contenuto si cambiano dal contenuto.');
  if (content && request.ideaId !== undefined && request.ideaId !== slot.ideaId) {
    throw ApiError.invalid('Questa uscita ha già il suo contenuto: per un’altra idea toglila e aggiungine una nuova.');
  }
  const { plan } = await brandFor(scope.db, scope.brandId);
  const channels = request.channels ? requireBrandChannels(request.channels, plan.channels) : slot.channels;
  const ideaId = request.ideaId === undefined ? slot.ideaId : request.ideaId;
  if (ideaId && ideaId !== slot.ideaId) await requireIdea(scope, ideaId);
  const next = { ...slot, date, time, channels, ideaId, themeId: request.themeId === undefined ? slot.themeId : request.themeId };
  const saved = await updateSlot(scope.db, slot.id, { ...next, status: slotStatus({ ...next, status: 'empty' }, content) });
  if (!saved) throw ApiError.notFound('Uscita non trovata.');
  return viewOf(scope, saved);
}

export async function removeSlotIn(scope: PlanScope, slot: PlanSlot): Promise<void> {
  await deleteSlot(scope.db, slot.id);
}

// Uno scheletro per le prossime settimane: giorni del ritmo, canali e orari migliori, temi secondo il peso,
// riempito con le idee tenute dello stesso tema. Non salva niente.
export async function proposeIn(db: Queryable, brandId: string, request: PlanRequest): Promise<PlanProposal> {
  const { plan } = await brandFor(db, brandId);
  const channels = request.channels.length > 0 ? requireBrandChannels(request.channels, plan.channels) : plan.channels;
  const [existing, ideas, planned] = await Promise.all([listSlots(db, brandId, { from: request.startDate }), listIdeas(db, brandId), plannedIdeaIds(db, brandId)]);
  const skeleton = buildSkeleton(plan, { ...request, channels }, existing);
  const drafts = fillSkeleton(skeleton, ideas, [...planned].map((ideaId) => ({ ideaId })));
  return { drafts: drafts.filter((draft) => !isPast(draft.date, draft.time)) };
}

// Le uscite confermate di una proposta, com'è stata ritoccata.
export async function confirmIn(scope: PlanScope, drafts: readonly SlotDraft[]): Promise<SlotView[]> {
  const created: SlotView[] = [];
  for (const draft of drafts) {
    created.push(
      await createSlotIn(scope, { date: draft.date, time: draft.time, channels: draft.channels, themeId: draft.themeId, ideaId: draft.ideaId }, 'session'),
    );
  }
  return created;
}

// Un'idea nel piano: la prima uscita vuota del suo tema, altrimenti il primo giorno buono libero.
export async function placeIdeaIn(scope: PlanScope, ideaId: string): Promise<SlotView> {
  const idea = await requireIdea(scope, ideaId);
  const { plan } = await brandFor(scope.db, scope.brandId);
  const now = planNow();
  const future = await slotViews(scope.db, scope.files, scope.brandId, await listSlots(scope.db, scope.brandId, { from: now.date }));
  const place = placeIdea(plan, idea, future, now.date);
  if ('slotId' in place) {
    const slot = future.find((item) => item.id === place.slotId)!;
    return patchSlotIn(scope, slot, { ideaId: idea.id });
  }
  return createSlotIn(scope, place.draft, 'idea');
}

// Programmare un contenuto: crea la sua uscita o sposta quella che ha.
export async function scheduleContentIn(scope: PlanScope, contentId: string, date: string, time: string): Promise<SlotView> {
  const content = await findContent(scope.db, contentId);
  if (!content || content.brandId !== scope.brandId) throw ApiError.notFound('Contenuto non trovato in questo brand.');
  if (!content.slotId) return createSlotIn(scope, { date, time, contentId });
  const slot = await findSlot(scope.db, content.slotId);
  if (!slot) throw ApiError.notFound('Uscita non trovata.');
  return patchSlotIn(scope, slot, { date, time });
}

// Un contenuto fatto per un'uscita (dalla chat): entra lì, che prende i suoi canali e il suo titolo.
// L'uscita non deve avere già un altro contenuto.
export async function attachContentIn(scope: PlanScope, slotId: string, content: Pick<Content, 'id' | 'title' | 'channels' | 'status'>): Promise<void> {
  const slot = await findSlot(scope.db, slotId);
  if (!slot || slot.brandId !== scope.brandId) throw ApiError.notFound('Uscita non trovata in questo brand.');
  const taken = (await listContents(scope.db, scope.brandId)).find((item) => item.slotId === slotId && item.id !== content.id);
  if (taken) throw ApiError.conflict('SLOT_TAKEN', `Questa uscita ha già il contenuto «${taken.title}»: scegline un’altra o creane una nuova.`);
  await setContentSlot(scope.db, content.id, slotId);
  await updateSlot(scope.db, slotId, {
    ...slot,
    channels: content.channels,
    contentTitle: content.title,
    status: slotStatus({ ...slot, status: 'empty' }, content),
  });
}

// Lo stato salvato dell'uscita di un contenuto, dopo che il contenuto è cambiato (approvato, riaperto, riscritto).
export async function syncContentSlot(db: Queryable, content: { slotId: string | null; status: 'draft' | 'approved' }): Promise<void> {
  if (!content.slotId) return;
  const slot = await findSlot(db, content.slotId);
  if (slot) await storeSlotStatus(db, slot.id, slotStatus({ ...slot, status: 'empty' }, content));
}

// Le rotte dello studio: il brand dal percorso, o quello dell'uscita.

function scopeOf(db: Queryable, files: BrandFiles, identity: Identity, brandId: string): PlanScope {
  return { db, files, brandId, accountId: identity.accountId };
}

async function slotScope(db: Queryable, files: BrandFiles, identity: Identity, slotId: string) {
  const slot = await findSlot(db, slotId);
  if (!slot) throw ApiError.notFound('Uscita non trovata.');
  return { slot, scope: scopeOf(db, files, identity, slot.brandId) };
}

export function getPlan(pool: pg.Pool, files: BrandFiles, identity: Identity, brandId: string, from: string, to: string): Promise<PlanResponse> {
  return withIdentity(pool, identity, async (db) => {
    const { brand } = await brandFor(db, brandId);
    const [slots, contents, jobs, ideas, planned] = await Promise.all([
      listSlots(db, brandId, { from, to }),
      listContents(db, brandId),
      activeContentJobs(db, brandId),
      listIdeas(db, brandId),
      plannedIdeaIds(db, brandId),
    ]);
    return {
      slots: await slotViews(db, files, brandId, slots),
      unscheduled: contents.filter((content) => !content.slotId).map((content) => summarize(content, files, jobs.has(content.id))),
      ideas: ideas.filter((idea) => idea.status === 'saved' && !planned.has(idea.id)),
      themes: brand.themes.map(({ id, name, color, weight }) => ({ id, name, color, weight })),
      channels: brand.context.channels,
      postsPerWeek: brand.context.positioning.postsPerWeek,
      today: planNow().date,
    };
  });
}

export function proposePlan(pool: pg.Pool, identity: Identity, brandId: string, request: PlanRequest): Promise<PlanProposal> {
  return withIdentity(pool, identity, (db) => proposeIn(db, brandId, request));
}

export function confirmPlan(pool: pg.Pool, files: BrandFiles, identity: Identity, brandId: string, drafts: SlotDraft[]): Promise<SlotView[]> {
  return withIdentity(pool, identity, (db) => confirmIn(scopeOf(db, files, identity, brandId), drafts));
}

export function addIdeaToPlan(pool: pg.Pool, files: BrandFiles, identity: Identity, brandId: string, ideaId: string): Promise<SlotView> {
  return withIdentity(pool, identity, (db) => placeIdeaIn(scopeOf(db, files, identity, brandId), ideaId));
}

export function createSlot(pool: pg.Pool, files: BrandFiles, identity: Identity, brandId: string, request: SlotCreateRequest): Promise<SlotView> {
  return withIdentity(pool, identity, (db) => createSlotIn(scopeOf(db, files, identity, brandId), request));
}

export function patchSlot(pool: pg.Pool, files: BrandFiles, identity: Identity, slotId: string, request: SlotPatchRequest): Promise<SlotView> {
  return withIdentity(pool, identity, async (db) => {
    const { slot, scope } = await slotScope(db, files, identity, slotId);
    return patchSlotIn(scope, slot, request);
  });
}

export function removeSlot(pool: pg.Pool, files: BrandFiles, identity: Identity, slotId: string): Promise<void> {
  return withIdentity(pool, identity, async (db) => {
    const { slot, scope } = await slotScope(db, files, identity, slotId);
    await removeSlotIn(scope, slot);
  });
}

export function scheduleContent(
  pool: pg.Pool,
  files: BrandFiles,
  identity: Identity,
  contentId: string,
  date: string,
  time: string,
): Promise<SlotView> {
  return withIdentity(pool, identity, async (db) => {
    const content = await findContent(db, contentId);
    if (!content) throw ApiError.notFound('Contenuto non trovato.');
    return scheduleContentIn(scopeOf(db, files, identity, content.brandId), contentId, date, time);
  });
}

export function unscheduleContent(pool: pg.Pool, identity: Identity, contentId: string): Promise<void> {
  return withIdentity(pool, identity, async (db) => {
    const content = await findContent(db, contentId);
    if (!content) throw ApiError.notFound('Contenuto non trovato.');
    if (content.slotId) await deleteSlot(db, content.slotId);
  });
}

