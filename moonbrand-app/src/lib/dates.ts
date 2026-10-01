// Le date del piano, come in @moonbrand/shared/lib/dates: stringhe YYYY-MM-DD e orari HH:mm nell'ora di Roma.
// Qui l'ora di Roma si calcola con le regole dell'ora legale europea invece che con Intl, che su Hermes non garantisce i fusi:
// Metro usa questo file al posto di quello condiviso, anche dentro il codice condiviso.
export const PLAN_TIME_ZONE = 'Europe/Rome';

const WEEKDAYS_SHORT = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
const WEEKDAYS_LONG = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const MONTHS_SHORT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const MONTHS_LONG = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

const pad = (value: number) => String(value).padStart(2, '0');

// L'ultima domenica del mese, all'1:00 UTC: lì l'Europa cambia ora.
function lastSundayAtOne(year: number, month: number): number {
  const last = new Date(Date.UTC(year, month + 1, 0, 1));
  last.setUTCDate(last.getUTCDate() - last.getUTCDay());
  return last.getTime();
}

function romeOffsetHours(now: Date): number {
  const year = now.getUTCFullYear();
  const time = now.getTime();
  return time >= lastSundayAtOne(year, 2) && time < lastSundayAtOne(year, 9) ? 2 : 1;
}

// Adesso a Roma, qualunque sia il fuso del telefono.
export function planNow(now = new Date()): { date: string; time: string } {
  const rome = new Date(now.getTime() + romeOffsetHours(now) * 3_600_000);
  return {
    date: `${rome.getUTCFullYear()}-${pad(rome.getUTCMonth() + 1)}-${pad(rome.getUTCDate())}`,
    time: `${pad(rome.getUTCHours())}:${pad(rome.getUTCMinutes())}`,
  };
}

export function today(): string {
  return planNow().date;
}

// Per contare i giorni la data si legge a mezzogiorno UTC: nessun cambio d'ora la sposta.
function fromDay(day: string): Date {
  return new Date(`${day.slice(0, 10)}T12:00:00Z`);
}

function toDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(day: string, amount: number): string {
  const date = fromDay(day);
  date.setUTCDate(date.getUTCDate() + amount);
  return toDay(date);
}

// 1 = lunedì … 7 = domenica.
export function weekdayIndex(day: string): number {
  return ((fromDay(day).getUTCDay() + 6) % 7) + 1;
}

export function startOfWeek(day: string): string {
  return addDays(day, 1 - weekdayIndex(day));
}

export function startOfMonth(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

export function addMonths(day: string, amount: number): string {
  const date = fromDay(startOfMonth(day));
  date.setUTCMonth(date.getUTCMonth() + amount);
  return toDay(date);
}

export const isDay = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value) && toDay(fromDay(value)) === value;
export const isTime = (value: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

// Un giorno e un'ora già passati, a Roma.
export function isPast(date: string, time: string, now = planNow()): boolean {
  return `${date}T${time}` < `${now.date}T${now.time}`;
}

const parts = (day: string) => {
  const date = fromDay(day);
  return { weekday: date.getUTCDay(), day: date.getUTCDate(), month: date.getUTCMonth(), year: date.getUTCFullYear() };
};

// "2026-10-03" → "3 ottobre 2026"
export function formatDay(day: string): string {
  const p = parts(day);
  return `${p.day} ${MONTHS_LONG[p.month]} ${p.year}`;
}

// "2026-10-01" → "gio 1 ott"
export function formatWeekdayShort(day: string): string {
  const p = parts(day);
  return `${WEEKDAYS_SHORT[p.weekday]} ${p.day} ${MONTHS_SHORT[p.month]}`;
}

// "2026-10-01" → "giovedì 1 ottobre"
export function formatWeekdayLong(day: string): string {
  const p = parts(day);
  return `${WEEKDAYS_LONG[p.weekday]} ${p.day} ${MONTHS_LONG[p.month]}`;
}

// "2026-10-01" → "ottobre 2026"
export function formatMonth(day: string): string {
  const p = parts(day);
  return `${MONTHS_LONG[p.month]} ${p.year}`;
}

// "14 – 20 settembre" oppure "28 settembre – 4 ottobre"
export function formatRange(from: string, to: string): string {
  const [start, end] = [parts(from), parts(to)];
  return start.month === end.month
    ? `${start.day} – ${end.day} ${MONTHS_LONG[end.month]}`
    : `${start.day} ${MONTHS_LONG[start.month]} – ${end.day} ${MONTHS_LONG[end.month]}`;
}
