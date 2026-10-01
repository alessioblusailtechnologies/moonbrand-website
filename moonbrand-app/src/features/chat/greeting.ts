import type { IconName } from '../../ui/kit';
import { dayPart, type DayPart, type Greeting, type WelcomeIcon } from '@moonbrand/shared/domain/welcome';

import { planNow } from '../../lib/dates';

// Il saluto in cima all'assistente, come nello studio: uno di quelli di oggi per la fascia oraria, diverso dagli ultimi visti
// sullo stesso brand. Finché quelli di oggi non ci sono, uno di riserva con il nome. Niente che indovini il genere.

const RECENT = 6;
const recentByBrand = new Map<string, string[]>();

const FALLBACK: Record<DayPart, string[]> = {
  mattina: ['Buongiorno, {nome}', 'Buongiorno, {nome}: da dove partiamo?', 'Caffè fatto, {nome}? Si comincia'],
  pranzo: ['Buon pranzo, {nome}', 'Pausa pranzo o si lavora, {nome}?', 'Un’idea veloce prima di pranzo, {nome}?'],
  pomeriggio: ['Buon pomeriggio, {nome}', 'Come procede la giornata, {nome}?', 'Pomeriggio produttivo, {nome}?'],
  sera: ['Buonasera, {nome}', 'Ultime cose della giornata, {nome}?', 'Serata di idee, {nome}?'],
  notte: ['Ancora al lavoro, {nome}?', 'Si è fatto tardi, {nome}', 'Le idee migliori arrivano di notte, {nome}?'],
};

export function fallbackGreeting(name: string, part = dayPart(planNow().time)): string {
  const first = name.trim().split(/\s+/)[0] ?? '';
  const options = FALLBACK[part];
  const text = options[Math.floor(Math.random() * options.length)];
  return first ? text.replace('{nome}', first) : text.replace(/,? \{nome\}/, '');
}

export function pickGreeting(brandId: string, greetings: readonly Greeting[], name: string): string {
  const part = dayPart(planNow().time);
  const options = greetings.filter((greeting) => greeting.part === part).map((greeting) => greeting.text);
  if (options.length === 0) return fallbackGreeting(name, part);
  const seen = recentByBrand.get(brandId) ?? [];
  const fresh = options.filter((text) => !seen.includes(text));
  const pool = fresh.length > 0 ? fresh : options;
  const text = pool[Math.floor(Math.random() * pool.length)];
  recentByBrand.set(brandId, [text, ...seen.filter((item) => item !== text)].slice(0, RECENT));
  return text;
}

// Le icone degli spunti (quelle dello studio) nel set Feather.
export const WELCOME_ICON: Record<WelcomeIcon, IconName> = {
  sparkle: 'star',
  layers: 'layers',
  pen: 'edit-3',
  'bar-chart': 'bar-chart-2',
  lightbulb: 'zap',
  calendar: 'calendar',
  clock: 'clock',
  'file-text': 'file-text',
  'image-plus': 'image',
  check: 'check',
};

// Gli spunti di riserva, finché non ci sono quelli di oggi scritti per il brand.
export const SUGGESTIONS: { icon: WelcomeIcon; label: string; draft: string }[] = [
  { icon: 'sparkle', label: 'Proponimi 5 idee per i prossimi post', draft: 'Proponimi 5 idee per i prossimi post' },
  { icon: 'layers', label: 'Prepara un carosello su…', draft: 'Prepara un carosello su ' },
  { icon: 'pen', label: 'Prendi un’idea che ho tenuto e fanne un post', draft: 'Prendi un’idea che ho tenuto e fanne un post' },
  { icon: 'bar-chart', label: 'Cosa ho pubblicato finora e cosa manca?', draft: 'Cosa ho pubblicato finora e cosa manca?' },
];
