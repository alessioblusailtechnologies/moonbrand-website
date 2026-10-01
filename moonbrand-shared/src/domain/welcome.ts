import { addDays } from '../lib/dates';

// Il benvenuto dell'assistente, per brand: i saluti e gli spunti del giorno, scritti ogni giorno dal job welcome.
// Lo studio sceglie il saluto della fascia oraria in cui si apre la pagina; senza quelli del giorno, usa i suoi.

export type DayPart = 'mattina' | 'pranzo' | 'pomeriggio' | 'sera' | 'notte';

export const DAY_PARTS: readonly DayPart[] = ['mattina', 'pranzo', 'pomeriggio', 'sera', 'notte'];

// time: HH:mm, a Roma.
export function dayPart(time: string): DayPart {
  if (time < '05:00') return 'notte';
  if (time < '12:00') return 'mattina';
  if (time < '14:30') return 'pranzo';
  if (time < '18:30') return 'pomeriggio';
  if (time < '23:00') return 'sera';
  return 'notte';
}

export interface Greeting {
  part: DayPart;
  text: string;
}

// Le icone che uno spunto può avere: tutte nel set dello studio.
export const WELCOME_ICONS = ['sparkle', 'layers', 'pen', 'bar-chart', 'lightbulb', 'calendar', 'clock', 'file-text', 'image-plus', 'check'] as const;

export type WelcomeIcon = (typeof WELCOME_ICONS)[number];

// label: quello che si legge sulla scheda; draft: il messaggio che finisce nella casella, da mandare o completare.
export interface WelcomeSuggestion {
  icon: WelcomeIcon;
  label: string;
  draft: string;
}

export interface Occasion {
  date: string;
  name: string;
}

// Pasqua (calendario gregoriano, algoritmo di Meeus): da lì le feste mobili.
function easter(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// La seconda domenica di maggio.
function mothersDay(year: number): string {
  const first = new Date(Date.UTC(year, 4, 1)).getUTCDay();
  return `${year}-05-${String(1 + ((7 - first) % 7) + 7).padStart(2, '0')}`;
}

const FIXED: [string, string][] = [
  ['01-01', 'Capodanno'],
  ['01-06', 'Epifania'],
  ['02-14', 'San Valentino'],
  ['03-08', 'Festa della donna'],
  ['03-19', 'Festa del papà'],
  ['04-25', 'Festa della Liberazione'],
  ['05-01', 'Festa dei lavoratori'],
  ['06-02', 'Festa della Repubblica'],
  ['08-15', 'Ferragosto'],
  ['10-31', 'Halloween'],
  ['11-01', 'Ognissanti'],
  ['12-08', 'Immacolata'],
  ['12-24', 'Vigilia di Natale'],
  ['12-25', 'Natale'],
  ['12-26', 'Santo Stefano'],
  ['12-31', 'San Silvestro'],
];

function occasionsOf(year: number): Occasion[] {
  const pasqua = easter(year);
  return [
    ...FIXED.map(([day, name]) => ({ date: `${year}-${day}`, name })),
    { date: addDays(pasqua, -47), name: 'Martedì grasso' },
    { date: pasqua, name: 'Pasqua' },
    { date: addDays(pasqua, 1), name: 'Pasquetta' },
    { date: mothersDay(year), name: 'Festa della mamma' },
  ];
}

// Le ricorrenze italiane tra due giorni compresi (YYYY-MM-DD), in ordine.
export function occasionsBetween(from: string, to: string): Occasion[] {
  const years = new Set([Number(from.slice(0, 4)), Number(to.slice(0, 4))]);
  return [...years]
    .flatMap(occasionsOf)
    .filter((occasion) => occasion.date >= from && occasion.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date));
}
