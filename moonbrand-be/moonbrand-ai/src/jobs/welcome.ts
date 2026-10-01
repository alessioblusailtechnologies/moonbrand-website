import { query } from '@anthropic-ai/claude-agent-sdk';

import type { WelcomeJobInput } from '@moonbrand/shared/api/contract';
import { channelName } from '@moonbrand/shared/domain/catalog';
import { SLOT_STATUS_LABELS } from '@moonbrand/shared/domain/plan';
import { DAY_PARTS, WELCOME_ICONS } from '@moonbrand/shared/domain/welcome';
import { formatWeekdayLong, formatWeekdayShort, planNow } from '@moonbrand/shared/lib/dates';

import { describeBrand } from '../lib/brand-brief';
import { GREETINGS_PER_PART, SUGGESTIONS } from '../lib/welcome-rules';

// Il benvenuto della chat per un brand: i saluti di oggi per ogni fascia oraria e gli spunti per la prima domanda.
// Tutto quello che serve è nel prompt, quindi Sonnet senza tool e senza la cartella del brand: una risposta sola.

const [inputJson] = process.argv.slice(2);
if (!inputJson) {
  console.error('Uso: npm run welcome -- <input del job in JSON>');
  process.exit(1);
}

const { day, name, brand, signals } = JSON.parse(inputJson) as Omit<WelcomeJobInput, 'brandId'>;
const { GEMINI_API_KEY: _gemini, ...env } = process.env;

const firstName = name.trim().split(/\s+/)[0] ?? '';
const list = (lines: string[], empty: string) => (lines.length > 0 ? lines.join('\n') : empty);

const PARTS: Record<(typeof DAY_PARTS)[number], string> = {
  mattina: 'mattina, dalle 5 a mezzogiorno',
  pranzo: 'ora di pranzo, da mezzogiorno alle 14:30',
  pomeriggio: 'pomeriggio, dalle 14:30 alle 18:30',
  sera: 'sera, dalle 18:30 alle 23',
  notte: 'notte, dalle 23 alle 5',
};

const SYSTEM = `Sei l'assistente di moonbrand, l'app con cui persone e aziende curano i loro social: idee, post, caroselli, video e il piano delle uscite.
Scrivi il benvenuto che la persona vede quando apre la chat con te per un suo brand: i saluti e gli spunti per la prima domanda.

I saluti:
- Sono il titolo della pagina: brevi, al massimo 55 caratteri, una frase sola.
- Caldi e con un filo di ironia, sempre professionali, come un collega bravo che ti conosce. Mai sdolcinati, mai da venditore, niente battute sul lavoro o sul tempo libero di chi legge.
- Specifici di oggi e di questo brand: il giorno della settimana, la ricorrenza, il momento del piano (un'uscita in arrivo, la settimana piena o scoperta), il settore, i temi. Mescola: non tutti devono citare il brand, qualcuno può essere solo un buon saluto per l'ora.
- Il nome della persona in circa metà dei saluti, mai il cognome, tra virgole come si fa con chi si chiama («Buongiorno, Marta»).
- Mai un aggettivo o un participio riferito alla persona che ne indovini il genere («bentornato», «pronta», «stanco», «benvenuto», «ancora sveglio?»): scegli formule che valgono per chiunque («che bello rivederti», «eccoci qui»).
- Niente emoji, niente punti esclamativi di fila, niente virgolette.
- Frasi che una persona direbbe davvero: se un saluto suona forzato, meglio uno semplice.
- Solo fatti che trovi qui: non inventare partite, eventi, lanci o numeri del brand.
- Ogni fascia oraria i suoi: di sera non si dice buongiorno, di notte si nota con garbo e un sorriso che è tardi («Ancora al lavoro, Marta?», «Si è fatto tardi, Marta»).

Gli spunti:
- Sono schede che la persona tocca per riempire la casella della chat: il label è quello che legge, il draft è il messaggio che ti manda, in prima persona e dando del tu a te (es. «Prepara il carosello di giovedì sul tema Formazione»).
- Nascono da quello che succede nel brand: uscite da preparare o da approvare nei prossimi giorni, una settimana sotto il ritmo, bozze ferme, idee tenute e mai usate, una ricorrenza o una data del brand in arrivo, da quanto non esce niente.
- Almeno due devono partire da un fatto preciso del piano o dello stato del brand, citandolo (il giorno, il titolo, il tema). Gli altri possono essere idee utili adesso per il settore del brand.
- Label e draft dicono la stessa cosa: il draft è il label detto per esteso.
- Al massimo uno spunto può restare aperto perché la persona lo completi: allora il label finisce con i puntini e il draft si ferma allo stesso punto (label «Scrivi un post su…», draft «Scrivi un post su »). Uno spunto che parte da un fatto preciso non resta mai aperto.
- Label al massimo 60 caratteri, niente emoji. Cose diverse tra loro: non quattro modi di dire «fai un post».
- Cose che sai fare: proporre idee, scrivere post, caroselli e video (anche dalle foto che ti mandano), ritoccare i contenuti, riempire e spostare le uscite del piano, dire cosa è uscito e cosa manca. Approvare no: lo fa la persona in Contenuti, quindi per una bozza lo spunto è rivederla o ritoccarla con te.

Scrivi in italiano.`;

const plan = list(
  brand.plan.map(
    (slot) =>
      `- ${formatWeekdayShort(slot.date)} ${slot.time} · ${slot.channels.map(channelName).join(', ')} · ${SLOT_STATUS_LABELS[slot.status]}` +
      `${slot.title ? ` · «${slot.title}»` : ''}${slot.theme ? ` · tema ${slot.theme}` : ''}`,
  ),
  'Nessuna uscita nei prossimi 14 giorni.',
);

const prompt = `Oggi è ${formatWeekdayLong(day)} ${day.slice(0, 4)}, ora di Roma (adesso sono le ${planNow().time}, ma i saluti valgono per tutto il giorno).
La persona si chiama ${firstName || '(nome non indicato: non usarlo)'}.

# Il brand
${describeBrand(brand)}

# Le prossime due settimane del piano
${plan}

# Lo stato del brand
- Questa settimana: ${signals.week.planned} uscite con qualcosa dentro, il ritmo del brand ne chiede ${signals.week.target}.
- Ultima uscita pubblicata: ${signals.lastPublished ? formatWeekdayLong(signals.lastPublished) : 'nessuna finora'}.
- Bozze da approvare: ${signals.drafts.length > 0 ? signals.drafts.map((draft) => `«${draft.title}» (ferma dal ${formatWeekdayShort(draft.updatedAt.slice(0, 10))})`).join('; ') : 'nessuna'}.
- Idee tenute e non ancora usate: ${signals.savedIdeas.length > 0 ? signals.savedIdeas.map((title) => `«${title}»`).join('; ') : 'nessuna'}.
- Ultime conversazioni con te: ${signals.recentChats.length > 0 ? signals.recentChats.map((title) => `«${title}»`).join('; ') : 'nessuna'}.

# Ricorrenze e date del brand da oggi a una settimana
${list(
  [
    ...signals.occasions.map((occasion) => `- ${formatWeekdayLong(occasion.date)}: ${occasion.name}`),
    ...signals.milestones.map((milestone) => `- ${formatWeekdayLong(milestone.date)}: ${milestone.anniversary ? 'anniversario di ' : ''}${milestone.label} (data del brand)`),
  ],
  'Nessuna.',
)}

# Cosa scrivere
${GREETINGS_PER_PART} saluti per ciascuna fascia oraria:
${DAY_PARTS.map((part) => `- ${part}: ${PARTS[part]}`).join('\n')}
E ${SUGGESTIONS} spunti.`;

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['greetings', 'suggestions'],
  properties: {
    greetings: {
      type: 'array',
      minItems: DAY_PARTS.length,
      maxItems: DAY_PARTS.length * GREETINGS_PER_PART,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['part', 'text'],
        properties: {
          part: { type: 'string', enum: [...DAY_PARTS] },
          text: { type: 'string', description: 'Il saluto, al massimo 55 caratteri' },
        },
      },
    },
    suggestions: {
      type: 'array',
      minItems: 2,
      maxItems: SUGGESTIONS,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['icon', 'label', 'draft'],
        properties: {
          icon: {
            type: 'string',
            enum: [...WELCOME_ICONS],
            description:
              'sparkle: idee; layers: carosello; pen: scrivere o ritoccare; bar-chart: com’è andata; lightbulb: un’idea tenuta; calendar: il piano; clock: una scadenza vicina; file-text: una bozza; image-plus: dalle foto; check: da approvare',
          },
          label: { type: 'string', description: 'Il testo della scheda, al massimo 60 caratteri' },
          draft: { type: 'string', description: 'Il messaggio che finisce nella casella' },
        },
      },
    },
  },
};

for await (const message of query({
  prompt,
  options: {
    model: 'sonnet',
    tools: [],
    systemPrompt: SYSTEM,
    settingSources: [],
    persistSession: false,
    thinking: { type: 'disabled' },
    // Niente server MCP, nemmeno i connettori dell'account: i loro tool entrerebbero nel contesto per niente.
    mcpServers: {},
    strictMcpConfig: true,
    settings: { disableClaudeAiConnectors: true },
    env,
    outputFormat: { type: 'json_schema', schema },
  },
})) {
  console.log(JSON.stringify(message));
}
