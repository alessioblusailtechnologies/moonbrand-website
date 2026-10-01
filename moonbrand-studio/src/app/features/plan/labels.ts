import type { SlotView } from '@moonbrand/shared/api/contract';
import type { ChannelId } from '@moonbrand/shared/domain/brand';
import { BEST_TIMES, bestChannelFor, type SlotStatus } from '@moonbrand/shared/domain/plan';
import { isPast, planNow } from '@moonbrand/shared/lib/dates';

export { SLOT_STATUS_LABELS } from '@moonbrand/shared/domain/plan';

export const WEEKDAYS = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];

// Il colore di ogni stato, dai token dello studio: grigio da riempire, giallo da preparare, arancio da approvare,
// blu programmata, verde pubblicata.
export const SLOT_TONES: Record<SlotStatus, string> = {
  empty: 'var(--grey-300)',
  toPrepare: 'var(--accent-soft)',
  toApprove: 'var(--accent)',
  scheduled: 'var(--primary)',
  published: 'var(--mint-400)',
};

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
