import type { SlotView } from '@moonbrand/shared/api/contract';
import type { ChannelId } from '@moonbrand/shared/domain/brand';
import type { ContentFormat, ContentStatus, SceneSource } from '@moonbrand/shared/domain/content';
import type { IdeaSignalKind } from '@moonbrand/shared/domain/idea';
import { BEST_TIMES, bestChannelFor } from '@moonbrand/shared/domain/plan';

import { isPast, planNow } from './dates';

// Le etichette dello studio (features/*/labels.ts), le stesse parole.

export const SIGNAL_LABELS: Record<IdeaSignalKind, string> = {
  theme: 'Tema',
  trend: 'Trend',
  recurrence: 'Ricorrenza',
  season: 'Stagione',
  network: 'Rete',
  prompt: 'Tua',
  link: 'Da un link',
  document: 'Da un documento',
};

export const FORMAT_LABELS: Record<ContentFormat, string> = { post: 'Post', carousel: 'Carosello', article: 'Articolo', video: 'Video' };

export const FORMAT_OPTIONS: { id: ContentFormat; label: string; hint: string }[] = [
  { id: 'post', label: 'Post', hint: 'Testo e un’immagine' },
  { id: 'carousel', label: 'Carosello', hint: 'Da 5 a 7 slide da scorrere, su LinkedIn un documento PDF' },
  { id: 'article', label: 'Articolo', hint: 'Testo lungo su LinkedIn, altrove un post che lo presenta' },
  { id: 'video', label: 'Video', hint: 'Movimento, musica ed eventuale voce: prima il copione, poi il video' },
];

export const SOURCE_LABELS: Record<SceneSource, string> = {
  clip: 'Clip generata',
  photo: 'Foto generata',
  user: 'Foto o clip tua',
  graphics: 'Solo grafica',
};

export const STATUS_LABELS: Record<ContentStatus, string> = { draft: 'Bozza', approved: 'Approvato' };

// Il formato in una richiesta: «crea un carosello per LinkedIn».
export const FORMAT_REQUEST: Record<ContentFormat, string> = { post: 'un post', carousel: 'un carosello', article: 'un articolo', video: 'un video' };

// Il formato dentro una frase: «su X il carosello non c'è».
export const FORMAT_NAMES: Record<ContentFormat, string> = { post: 'il post', carousel: 'il carosello', article: 'l’articolo', video: 'il video' };

// Quanti caratteri del testo si vedono nel feed prima di «…altro». X mostra tutto.
export const FOLD: Record<ChannelId, number | null> = { linkedin: 210, instagram: 125, facebook: 250, tiktok: 80, x: null };

// «16:9» → larghezza / altezza.
export function aspectRatio(aspect: string | null | undefined): number {
  const [width, height] = (aspect ?? '4:5').split(':').map(Number);
  return width > 0 && height > 0 ? width / height : 0.8;
}

// «LinkedIn, Instagram e X».
export function listNames(names: string[]): string {
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}` : (names[0] ?? '');
}

export const WEEKDAYS = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];

// Il titolo di un'uscita: il contenuto, l'idea, o il tema che il piano chiede.
export function slotTitle(slot: SlotView, themeName: (id: string | null) => string | null): string {
  if (slot.content) return slot.content.title;
  if (slot.idea) return slot.idea.title;
  if (slot.contentTitle) return slot.contentTitle;
  const theme = themeName(slot.themeId);
  return theme ? `Serve un contenuto su «${theme}»` : 'Da riempire';
}

// L'ora per un'uscita nuova in un giorno: quella migliore del canale, o l'ora piena dopo adesso se oggi è già passata.
export function timeFor(channels: readonly ChannelId[], date: string): string {
  const channel = bestChannelFor(channels, date);
  const time = channel ? BEST_TIMES[channel].time : '09:00';
  if (!isPast(date, time)) return time;
  const hour = Number(planNow().time.slice(0, 2)) + 1;
  return hour > 23 ? '23:59' : `${String(hour).padStart(2, '0')}:00`;
}

// Un'uscita si sposta finché non è passata.
export const canMove = (slot: SlotView): boolean => slot.status !== 'published' && !isPast(slot.date, slot.time);
