import { Injectable } from '@angular/core';

import {
  contextStep,
  createStepLog,
  pickedDetail,
  POSITIONING_STEPS,
  THEMES_STEPS,
  VOICE_STEPS,
  type OnAiSteps,
  type PositioningIdeas,
  type WebsiteInsights,
} from '@moonbrand/shared/ai/steps';
import type { BrandKind, ChannelId, Identity, VoiceCard, VoiceSource } from '@moonbrand/shared/domain/brand';
import { AUDIENCES, channelName, GOALS } from '@moonbrand/shared/domain/catalog';
import { createRng, pick, sample, seedFromString } from '@moonbrand/shared/lib/random';

export interface VoiceSample {
  source: VoiceSource;
  texts?: string;
  channel?: ChannelId;
}

export type VoiceAnalysis = Omit<VoiceCard, 'version' | 'createdAt'>;

type Group = 'person' | 'business';

const groupOf = (kind: BrandKind): Group => (kind === 'person' ? 'person' : 'business');


const THEMES: Record<Group, string[]> = {
  person: [
    'Casi reali con i numeri',
    'Errori e cosa ho imparato',
    'Il settore che cambia',
    'Dietro le quinte',
    'Assunzioni e cultura',
    'Prezzi e margini spiegati',
    'Strumenti che uso davvero',
    'Clienti e progetti',
  ],
  business: [
    'Il prodotto da vicino',
    'Clienti che raccontano',
    'Dietro le quinte',
    'Le persone del team',
    'Consigli pratici',
    'Novità e lanci',
    'Filiera e territorio',
    'Numeri e traguardi',
  ],
};

const EXTRA_AUDIENCES: Record<Group, string[]> = {
  person: ['Responsabili IT', 'Consulenti', 'Imprenditori del manifatturiero'],
  business: ['Famiglie', 'Giovani professionisti', 'Architetti e designer', 'Ristoratori'],
};

const REGISTERS: Record<Group, string[]> = {
  person: [
    'Diretto e concreto, in prima persona. Nessuna domanda retorica in apertura.',
    'Riflessivo ma pratico: parti da un episodio vissuto e arrivi a una regola.',
    'Tecnico senza gergo, prima persona plurale quando parli del team.',
  ],
  business: [
    'Caldo ma preciso, prima persona plurale. Il prodotto si racconta attraverso chi lo usa.',
    'Essenziale e rassicurante: poche promesse, molti dettagli verificabili.',
    'Colloquiale e vicino, come al banco con un cliente abituale.',
  ],
};

const RHYTHM_SHORT = 'Frasi corte, un concetto per paragrafo, tre o quattro blocchi. Chiudi su un fatto, non su un invito.';
const RHYTHM_LONG = 'Periodi ampi e argomentati, con un esempio concreto a metà. Chiudi riprendendo l’apertura.';

const LEXICON: Record<Group, string> = {
  person: '«in produzione», «processo», «margine», numeri sempre in cifre.',
  business: '«fatto a mano», «ogni mattina», «su misura», prezzi e quantità sempre in cifre.',
};

const AVOID_BASE = '«rivoluzionario», «game changer», «unlockare»';

const STOPWORDS = new Set([
  'abbiamo', 'allora', 'ancora', 'essere', 'invece', 'nostra', 'nostri', 'nostro', 'perché',
  'proprio', 'quando', 'quella', 'quello', 'questa', 'questo', 'sempre', 'vostro', 'qualcosa',
]);

const NUMBER_WORDS = ['zero', 'un', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci'];

const ACCENTS: [RegExp, string][] = [
  [/[àá]/g, 'a'],
  [/[èé]/g, 'e'],
  [/[ìí]/g, 'i'],
  [/[òó]/g, 'o'],
  [/[ùú]/g, 'u'],
];

function countLabel(count: number, singular: string, plural: string): string {
  return `${count <= 10 ? NUMBER_WORDS[count] : count} ${count === 1 ? singular : plural}`;
}

function frequentWords(text: string): string[] {
  const counts = new Map<string, number>();
  for (const word of text.toLowerCase().match(/[a-zàèéìòù]{7,}/g) ?? []) {
    if (!STOPWORDS.has(word)) counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, 3)
    .map(([word]) => word);
}

function analyzeTexts(text: string, group: Group): Pick<VoiceAnalysis, 'rhythm' | 'lexicon' | 'avoid'> {
  const sentences = text.split(/[.!?]+\s/).filter((sentence) => sentence.trim());
  const words = text.split(/\s+/).filter(Boolean).length;
  const averageLength = words / Math.max(1, sentences.length);
  const hasEmoji = /\p{Extended_Pictographic}/u.test(text);
  const top = frequentWords(text);
  return {
    rhythm: averageLength <= 16 ? RHYTHM_SHORT : RHYTHM_LONG,
    lexicon: top.length >= 2 ? `${top.map((word) => `«${word}»`).join(', ')}, numeri sempre in cifre.` : LEXICON[group],
    avoid: `${[AVOID_BASE, hasEmoji ? '' : 'emoji', text.includes('!') ? '' : 'esclamativi'].filter(Boolean).join(', ')}.`,
  };
}

@Injectable({ providedIn: 'root' })
export class MockAi {
  async suggestThemes(identity: Identity, onSteps?: OnAiSteps): Promise<string[]> {
    const group = groupOf(identity.kind);
    const rng = createRng(seedFromString(`${identity.pitch}|${group}`));
    const log = createStepLog(onSteps);
    log.start('read', THEMES_STEPS.read, identity.pitch.slice(0, 90));
    log.finish('read');
    log.start('pick', THEMES_STEPS.pick);
    const themes = sample(rng, THEMES[group], 4);
    log.finish('pick', { detail: pickedDetail(themes.length, themes.slice(0, 2)) });
    return themes;
  }

  async suggestPositioning(identity: Identity, site: WebsiteInsights | null, onSteps?: OnAiSteps): Promise<PositioningIdeas> {
    const group = groupOf(identity.kind);
    const rng = createRng(seedFromString(`${identity.pitch}|${site?.site ?? ''}|${identity.kind}`));
    const log = createStepLog(onSteps);
    const labels = POSITIONING_STEPS[identity.kind];
    const start = contextStep(site?.site ?? null, site?.pitch || identity.pitch);
    log.start('context', start.label, start.detail);
    log.finish('context');

    log.start('goals', labels.goals);
    const goals = sample(rng, GOALS[identity.kind], 5);
    log.finish('goals', { detail: pickedDetail(goals.length, goals.slice(0, 2)) });

    log.start('audiences', labels.audiences);
    const audiences = [
      ...new Set([...(site?.audiences ?? []), ...sample(rng, [...AUDIENCES[identity.kind], ...EXTRA_AUDIENCES[group]], 6)]),
    ].slice(0, 6);
    log.finish('audiences', { detail: pickedDetail(audiences.length, audiences.slice(0, 2)) });

    return { goals, audiences, picked: { goals: goals.slice(0, 2), audiences: audiences.slice(0, 2) } };
  }

  async analyzeVoice(voiceSample: VoiceSample, identity: Identity, onSteps?: OnAiSteps): Promise<VoiceAnalysis> {
    const group = groupOf(identity.kind);
    const rng = createRng(seedFromString(`${identity.name}|${voiceSample.source}|${voiceSample.texts ?? ''}`));
    const log = createStepLog(onSteps);
    log.start('read', VOICE_STEPS.read(voiceSample.source));
    log.finish('read');
    log.start('rhythm', VOICE_STEPS.rhythm);
    log.finish('rhythm');
    log.start('card', VOICE_STEPS.card);
    log.finish('card');
    const register = pick(rng, REGISTERS[group]);

    if (voiceSample.source === 'pasted' && voiceSample.texts) {
      const count = voiceSample.texts.split(/\n\s*\n/).filter((text) => text.trim()).length;
      return {
        source: 'pasted',
        sourceLabel: countLabel(count, 'testo incollato', 'testi incollati'),
        register,
        ...analyzeTexts(voiceSample.texts, group),
      };
    }
    if (voiceSample.source === 'history') {
      return {
        source: 'history',
        sourceLabel: `${18 + Math.floor(rng() * 30)} post di ${channelName(voiceSample.channel ?? 'linkedin')}`,
        register,
        rhythm: pick(rng, [RHYTHM_SHORT, RHYTHM_LONG]),
        lexicon: LEXICON[group],
        avoid: `${AVOID_BASE}, emoji, esclamativi.`,
      };
    }
    return {
      source: 'recording',
      sourceLabel: 'un minuto registrato',
      register,
      rhythm: RHYTHM_SHORT,
      lexicon: LEXICON[group],
      avoid: `${AVOID_BASE}, frasi fatte da comunicato stampa.`,
    };
  }

  async connectChannel(identity: Identity): Promise<{ handle: string }> {
    let slug = identity.name.toLowerCase();
    for (const [pattern, letter] of ACCENTS) slug = slug.replace(pattern, letter);
    slug = slug.replace(/[^a-z0-9]/g, '');
    return { handle: `@${slug || 'account'}` };
  }
}
