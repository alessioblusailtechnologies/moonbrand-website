import { dayPart, type DayPart, type Greeting } from '@moonbrand/shared/domain/welcome';
import { planNow } from '@moonbrand/shared/lib/dates';

// Il saluto in cima alla chat: uno di quelli di oggi per la fascia oraria, diverso dagli ultimi visti sullo stesso brand.
// Finché quelli di oggi non ci sono, uno di riserva per la fascia oraria, con il nome.

const RECENT_KEY = 'moonbrand:greetings:';
const RECENT = 6;

// «, {nome}» sparisce quando il nome non c'è. Come quelli scritti da Sonnet: niente che indovini il genere.
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

function recent(brandId: string): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(RECENT_KEY + brandId) ?? '[]');
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function remember(brandId: string, text: string): void {
  try {
    localStorage.setItem(RECENT_KEY + brandId, JSON.stringify([text, ...recent(brandId).filter((item) => item !== text)].slice(0, RECENT)));
  } catch {
    // Senza memoria si può ripetere un saluto: niente di grave.
  }
}

export function pickGreeting(brandId: string, greetings: readonly Greeting[], name: string): string {
  const part = dayPart(planNow().time);
  const options = greetings.filter((greeting) => greeting.part === part).map((greeting) => greeting.text);
  if (options.length === 0) return fallbackGreeting(name, part);
  const seen = recent(brandId);
  const fresh = options.filter((text) => !seen.includes(text));
  const pool = fresh.length > 0 ? fresh : options;
  const text = pool[Math.floor(Math.random() * pool.length)];
  remember(brandId, text);
  return text;
}
