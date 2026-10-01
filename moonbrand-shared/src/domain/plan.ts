import { addDays, isPast, planNow, weekdayIndex } from '../lib/dates';
import type { ChannelId, Theme } from './brand';
import type { ContentStatus } from './content';
import type { Idea } from './idea';

// Il piano è una sequenza di uscite: un contenuto, in un giorno e in un orario, su uno o più canali.
// Stessa entità di social-app (tabella presenza.slots), con le stesse regole: il ritmo del brand conta i contenuti, non i canali.

export type SlotStatus = 'empty' | 'toPrepare' | 'toApprove' | 'scheduled' | 'published';

export type SlotOrigin = 'session' | 'manual' | 'idea';

export interface SlotDraft {
  // YYYY-MM-DD, a Roma.
  date: string;
  // HH:mm, a Roma: uno per tutti i canali dell'uscita.
  time: string;
  channels: ChannelId[];
  // Il tema che il piano chiede per questa uscita.
  themeId: string | null;
  ideaId: string | null;
}

export interface PlanSlot extends SlotDraft {
  id: string;
  brandId: string;
  // Il titolo del contenuto, per le uscite nate da un contenuto.
  contentTitle: string | null;
  status: SlotStatus;
  origin: SlotOrigin;
  createdAt: string;
}

export const SLOT_STATUS_LABELS: Record<SlotStatus, string> = {
  empty: 'Da riempire',
  toPrepare: 'Da preparare',
  toApprove: 'Da approvare',
  scheduled: 'Programmata',
  published: 'Pubblicata',
};

// Lo stato segue quello che l'uscita ha: niente, un'idea, una bozza, un contenuto approvato. La pubblicazione vera non c'è
// ancora: come in social-app, un'uscita programmata il cui orario è passato risulta pubblicata.
export function slotStatus(
  slot: Pick<PlanSlot, 'status' | 'date' | 'time' | 'ideaId'>,
  content: { status: ContentStatus } | null,
  now = planNow(),
): SlotStatus {
  if (slot.status === 'published') return 'published';
  const status: SlotStatus = content ? (content.status === 'approved' ? 'scheduled' : 'toApprove') : slot.ideaId ? 'toPrepare' : 'empty';
  return status === 'scheduled' && isPast(slot.date, slot.time, now) ? 'published' : status;
}

// Giorni (1 = lunedì) e orario consigliati per canale. Arriveranno dalle statistiche dei canali, quando saranno collegati.
export const BEST_TIMES: Record<ChannelId, { days: number[]; time: string }> = {
  linkedin: { days: [2, 3, 4], time: '08:30' },
  instagram: { days: [1, 3, 5, 6], time: '18:30' },
  facebook: { days: [2, 4, 6], time: '13:00' },
  tiktok: { days: [2, 4, 6, 7], time: '19:00' },
  x: { days: [1, 2, 3, 4, 5], time: '09:00' },
};

// In quali giorni della settimana uscire, dato il ritmo.
const DAY_PATTERNS: Record<number, number[]> = {
  1: [3],
  2: [2, 4],
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
  5: [1, 2, 3, 4, 5],
  6: [1, 2, 3, 4, 5, 6],
  7: [1, 2, 3, 4, 5, 6, 7],
};

// Il brand come serve al piano: i canali scelti e i temi con il loro peso.
export interface PlanBrand {
  id: string;
  channels: ChannelId[];
  themes: Pick<Theme, 'id' | 'name' | 'weight'>[];
}

// Il canale più adatto a un giorno, tra quelli dati: il primo che ci esce bene, altrimenti il primo.
export function bestChannelFor(channels: readonly ChannelId[], date: string): ChannelId | null {
  const weekday = weekdayIndex(date);
  return channels.find((channel) => BEST_TIMES[channel].days.includes(weekday)) ?? channels[0] ?? null;
}

// Quante uscite a ogni tema (metodo dei resti più alti sui pesi), messe in un ordine che evita lo stesso tema due volte
// di fila quando si può.
export function allocateThemes(themes: PlanBrand['themes'], total: number): (string | null)[] {
  if (themes.length === 0) return Array.from({ length: total }, () => null);
  const weights = themes.reduce((sum, theme) => sum + theme.weight, 0) || 1;
  const exact = themes.map((theme) => (theme.weight / weights) * total);
  const counts = exact.map(Math.floor);
  let remaining = total - counts.reduce((sum, count) => sum + count, 0);
  const byRemainder = exact
    .map((value, i) => ({ i, rest: value - Math.floor(value) }))
    .sort((a, b) => b.rest - a.rest || themes[b.i].weight - themes[a.i].weight);
  for (const { i } of byRemainder) {
    if (remaining <= 0) break;
    counts[i] += 1;
    remaining -= 1;
  }

  const order: string[] = [];
  for (let n = 0; n < total; n++) {
    const previous = order[order.length - 1];
    let best = -1;
    counts.forEach((count, i) => {
      if (count === 0) return;
      const wouldRepeat = themes[i].id === previous && counts.some((other, j) => j !== i && other > 0);
      if (wouldRepeat) return;
      if (best === -1 || count > counts[best]) best = i;
    });
    if (best === -1) break;
    order.push(themes[best].id);
    counts[best] -= 1;
  }
  return order;
}

export interface PlanRequest {
  startDate: string;
  weeks: number;
  // Contenuti a settimana.
  perWeek: number;
  // Vuoto: i canali del brand.
  channels: ChannelId[];
}

// Lo scheletro: giorni, orari e canali delle uscite, con il tema che ognuna dovrebbe coprire. Un giorno che ha già
// un'uscita resta com'è.
export function buildSkeleton(brand: PlanBrand, request: PlanRequest, existing: readonly Pick<PlanSlot, 'date'>[]): SlotDraft[] {
  const channels = request.channels.length > 0 ? request.channels : brand.channels;
  if (channels.length === 0) return [];
  const pattern = DAY_PATTERNS[Math.max(1, Math.min(7, request.perWeek))];
  const busy = new Set(existing.map((slot) => slot.date));

  const dates: string[] = [];
  for (let offset = 0; offset < request.weeks * 7; offset++) {
    const date = addDays(request.startDate, offset);
    if (pattern.includes(weekdayIndex(date)) && !busy.has(date)) dates.push(date);
  }

  const themeIds = allocateThemes(brand.themes, dates.length);
  const usage = new Map<ChannelId, number>(channels.map((channel) => [channel, 0]));

  return dates.map((date, i) => {
    const weekday = weekdayIndex(date);
    const fitting = channels.filter((channel) => BEST_TIMES[channel].days.includes(weekday));
    const pool = fitting.length > 0 ? fitting : channels;
    const channel = [...pool].sort((a, b) => (usage.get(a) ?? 0) - (usage.get(b) ?? 0))[0];
    usage.set(channel, (usage.get(channel) ?? 0) + 1);
    return { date, time: BEST_TIMES[channel].time, channels: [channel], themeId: themeIds[i] ?? null, ideaId: null };
  });
}

type PlanIdea = Pick<Idea, 'id' | 'themeId' | 'channels' | 'status' | 'decidedAt'>;

// Le idee tenute adatte a un'uscita: prima stesso tema, poi stesso canale, poi le più recenti.
export function rankIdeasForSlot<T extends PlanIdea>(slot: SlotDraft, ideas: readonly T[], excluded: ReadonlySet<string>): T[] {
  const score = (idea: T) =>
    (idea.themeId === slot.themeId ? 2 : 0) + (idea.channels.some((channel) => slot.channels.includes(channel)) ? 1 : 0);
  return ideas
    .filter((idea) => idea.status === 'saved' && !excluded.has(idea.id))
    .sort((a, b) => score(b) - score(a) || (b.decidedAt ?? '').localeCompare(a.decidedAt ?? ''));
}

// Riempie lo scheletro solo con idee dello stesso tema, così l'equilibrio resta quello del brand.
export function fillSkeleton(skeleton: readonly SlotDraft[], ideas: readonly PlanIdea[], existing: readonly Pick<PlanSlot, 'ideaId'>[]): SlotDraft[] {
  const used = new Set(existing.map((slot) => slot.ideaId).filter((id): id is string => id !== null));
  return skeleton.map((slot) => {
    const best = rankIdeasForSlot(slot, ideas, used).find((idea) => idea.themeId === slot.themeId);
    if (!best) return slot;
    used.add(best.id);
    return { ...slot, ideaId: best.id };
  });
}

// Quanto ogni tema esce nel piano, contro quanto dovrebbe (in percentuale).
export function themeBalance(themes: PlanBrand['themes'], slots: readonly Pick<SlotDraft, 'themeId'>[]) {
  const weights = themes.reduce((sum, theme) => sum + theme.weight, 0) || 1;
  const withTheme = slots.filter((slot) => slot.themeId !== null).length;
  return themes.map((theme) => {
    const count = slots.filter((slot) => slot.themeId === theme.id).length;
    return { theme, count, target: Math.round((theme.weight / weights) * 100), planned: withTheme > 0 ? Math.round((count / withTheme) * 100) : 0 };
  });
}

// Il tema più lontano da quanto spesso dovrebbe uscire, se lo scarto è evidente.
export function balanceHint(balance: ReturnType<typeof themeBalance>): string | null {
  const worst = [...balance].sort((a, b) => a.planned - a.target - (b.planned - b.target))[0];
  if (!worst || worst.target - worst.planned < 15) return null;
  return worst.count === 0 ? `Manca «${worst.theme.name}».` : `«${worst.theme.name}» ha poche uscite rispetto al suo peso.`;
}

// Il primo giorno senza uscite dopo from, tra quelli consigliati per il canale, entro quattro settimane.
export function nextFreeDay(existing: readonly Pick<SlotDraft, 'date'>[], channel: ChannelId, from: string): { date: string; time: string } {
  const busy = new Set(existing.filter((slot) => slot.date > from).map((slot) => slot.date));
  const { days, time } = BEST_TIMES[channel];
  for (let offset = 1; offset <= 28; offset++) {
    const date = addDays(from, offset);
    if (!busy.has(date) && days.includes(weekdayIndex(date))) return { date, time };
  }
  return { date: addDays(from, 1), time };
}

// Dove mettere un'idea: la prima uscita vuota dello stesso tema (o senza tema), altrimenti il primo giorno buono libero.
export function placeIdea(
  brand: PlanBrand,
  idea: Pick<Idea, 'id' | 'themeId' | 'channels'>,
  existing: readonly PlanSlot[],
  from: string,
): { slotId: string } | { draft: SlotDraft } {
  const future = existing.filter((slot) => slot.date > from);
  const empty = future
    .filter((slot) => slot.status === 'empty' && (slot.themeId === idea.themeId || slot.themeId === null))
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))[0];
  if (empty) return { slotId: empty.id };

  const channels = idea.channels.filter((channel) => brand.channels.includes(channel));
  const primary = channels[0] ?? brand.channels[0] ?? 'instagram';
  const { date, time } = nextFreeDay(future, primary, from);
  return { draft: { date, time, channels: channels.length > 0 ? channels : [primary], themeId: idea.themeId, ideaId: idea.id } };
}
