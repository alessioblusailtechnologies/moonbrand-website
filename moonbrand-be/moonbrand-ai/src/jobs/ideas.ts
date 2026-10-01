import { mkdir } from 'node:fs/promises';

import { query } from '@anthropic-ai/claude-agent-sdk';

import type { IdeasJobInput } from '@moonbrand/shared/api/contract';

import { writeBrandGuide } from '../lib/brand-guide';
import { HORIZON_DAYS, MAX_PER_THEME, MAX_TRENDS } from '../lib/ideas-rules';
import { MOONBRAND_PLUGINS } from '../lib/plugin';

const [brandDir, inputJson] = process.argv.slice(2);
if (!brandDir || !inputJson) {
  console.error('Uso: npm run ideas -- <cartella del brand> <input del job in JSON>');
  process.exit(1);
}

const { count, brand, recent, preferences } = JSON.parse(inputJson) as Omit<IdeasJobInput, 'brandId'>;
const { GEMINI_API_KEY: _gemini, ...env } = process.env;

const STATUS = { new: 'da decidere', saved: 'tenuta', discarded: 'scartata' } as const;
const SIGNALS = { theme: 'tema', trend: 'trend', recurrence: 'ricorrenza', season: 'stagione' } as Record<string, string>;

const day = (date: Date) => date.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const today = new Date();
const horizon = new Date(today.getTime() + HORIZON_DAYS * 24 * 60 * 60 * 1000);
const themeName = (id: string | null) => brand.themes.find((theme) => theme.id === id)?.name ?? 'nessun tema';
const score = (value: number) => `${value > 0 ? '+' : ''}${String(value).replace('.', ',')}`;

function describeHistory(): string {
  const tastes =
    preferences.decided > 0
      ? [
          `Idee decise finora: ${preferences.decided}, tenute ${preferences.saved}.`,
          `Punteggio dei temi (+1 per ogni idea tenuta, -0,5 per ogni scartata): ${
            preferences.themes.map((item) => `${themeName(item.themeId)} ${score(item.score)}`).join('; ') || 'nessuno'
          }`,
          `Punteggio dei segnali: ${preferences.signals.map((item) => `${SIGNALS[item.kind] ?? item.kind} ${score(item.score)}`).join('; ') || 'nessuno'}`,
        ].join('\n')
      : 'Nessuna idea ancora decisa.';
  const titles =
    recent.length > 0 ? recent.map((idea) => `- [${STATUS[idea.status]}] ${idea.title} (${themeName(idea.themeId)}, ${SIGNALS[idea.signal] ?? idea.signal})`) : ['Nessuna.'];
  return ['## Gusti', tastes, '', '## Idee già proposte di recente: non ripeterle', ...titles].join('\n');
}

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['ideas'],
  properties: {
    ideas: {
      type: 'array',
      minItems: 1,
      maxItems: count,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'angleLabel', 'angle', 'rationale', 'themeId', 'signal'],
        properties: {
          title: { type: 'string', description: 'L’idea in una frase specifica, massimo 110 caratteri, con la voce del brand' },
          angleLabel: {
            type: 'string',
            description: 'Il taglio in 2-4 parole, es. «Il caso con i numeri», «Il dietro le quinte», «Prima e dopo», «La domanda frequente»',
          },
          angle: {
            type: 'string',
            description: 'Cosa raccontare e con quali elementi (esempi, dati, momenti), in due o tre frasi, senza legarla a un formato o a un canale',
          },
          rationale: { type: 'string', description: 'Perché ha senso adesso, in una frase che cita il segnale da cui nasce' },
          themeId: {
            type: ['string', 'null'],
            enum: [...brand.themes.map((theme) => theme.id), null],
            description: 'L’id del tema del brand che tocca, null se non ne tocca nessuno',
          },
          signal: {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'sourceUrl'],
            description: 'Da dove nasce l’idea',
            properties: {
              kind: {
                type: 'string',
                enum: ['theme', 'trend', 'recurrence', 'season'],
                description: 'theme: un tema del brand; trend: una notizia trovata sul web; recurrence: una ricorrenza; season: il periodo dell’anno',
              },
              label: { type: 'string', description: 'Facoltativo: la fonte, la ricorrenza con il giorno o il periodo, in poche parole' },
              sourceUrl: {
                type: ['string', 'null'],
                description: 'Per un trend, l’indirizzo dell’articolo trovato con la ricerca; null per gli altri segnali',
              },
            },
          },
        },
      },
    },
  },
};

// Il brand sta nel CLAUDE.md della cartella e le regole nella skill: il prompt dice quante idee, quando e cosa c'è già.
await mkdir(brandDir, { recursive: true });
await writeBrandGuide(brandDir, brand);

const prompt = `Proponi fino a ${count} idee di contenuto nuove per il brand descritto in CLAUDE.md, seguendo la skill moonbrand:idee.

Oggi è ${day(today)}: l’orizzonte per ricorrenze e stagione arriva a ${day(horizon)}.
Al massimo ${MAX_PER_THEME} idee sullo stesso tema e ${MAX_TRENDS} trend.

Rispondi in italiano.

${describeHistory()}`;

for await (const message of query({
  prompt,
  options: {
    cwd: brandDir,
    env,
    plugins: MOONBRAND_PLUGINS,
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    outputFormat: { type: 'json_schema', schema },
  },
})) {
  console.log(JSON.stringify(message));
}
