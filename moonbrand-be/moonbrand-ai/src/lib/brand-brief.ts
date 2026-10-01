import type { BrandContext } from '@moonbrand/shared/api/contract';
import type { BrandKind } from '@moonbrand/shared/domain/brand';
import { channelName, kindLabel } from '@moonbrand/shared/domain/catalog';

// Il brand scritto a parole per i job: chi è, per chi scrive, temi e voce.

const PERSON: Record<BrandKind, string> = {
  person: 'prima persona singolare: è un personal brand',
  company: 'prima persona plurale: parla a nome dell’azienda e del team',
  client: 'prima persona plurale, a nome del cliente: chi usa l’app ne cura la presenza',
};

const list = (items: readonly string[]) => (items.length > 0 ? items.join(', ') : 'non indicati');

export function describeBrand(brand: BrandContext): string {
  const { identity, positioning, voice } = brand;
  const who = [
    `Tipo: ${kindLabel(identity.kind)}`,
    `Nome: ${identity.name || '(non indicato)'}`,
    identity.kind === 'person' && identity.role ? `Ruolo: ${identity.role}` : '',
    identity.kind === 'person' && identity.company ? `Azienda: ${identity.company}` : '',
    identity.kind !== 'person' && identity.sector ? `Settore: ${identity.sector}` : '',
    identity.site ? `Sito: ${identity.site}` : '',
    identity.pitch ? `Cosa fa, in una frase: ${identity.pitch}` : '',
    `Persona grammaticale dei post: ${PERSON[identity.kind]}`,
  ];
  const themes = [...brand.themes]
    .sort((a, b) => b.weight - a.weight)
    .map((theme) => `- ${theme.name} (id ${theme.id}, peso ${theme.weight}: più è alto, più spesso esce nel piano)`);
  const voiceLines = voice
    ? [`Registro: ${voice.register}`, `Ritmo: ${voice.rhythm}`, `Lessico: ${voice.lexicon}`, `Da evitare: ${voice.avoid}`]
    : ['Non ancora definita: resta sobria e concreta.'];
  return [
    '## Chi è',
    ...who.filter(Boolean),
    '',
    '## Per chi scrive e perché',
    `Pubblici: ${list(positioning.audiences)}`,
    `Obiettivi dei post: ${list(positioning.goals)}`,
    `Frequenza: ${positioning.postsPerWeek} post a settimana`,
    `Canali: ${brand.channels.map(channelName).join(', ')}`,
    '',
    '## Temi',
    ...(themes.length > 0 ? themes : ['Nessun tema definito.']),
    '',
    '## Voce',
    ...voiceLines,
  ].join('\n');
}
