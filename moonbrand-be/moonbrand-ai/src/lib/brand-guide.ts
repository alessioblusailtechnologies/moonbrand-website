import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { BrandContext } from '@moonbrand/shared/api/contract';
import { channelName } from '@moonbrand/shared/domain/catalog';
import { SLOT_STATUS_LABELS } from '@moonbrand/shared/domain/plan';
import { formatWeekdayShort, planNow } from '@moonbrand/shared/lib/dates';

import { describeBrand } from './brand-brief';

// Il CLAUDE.md della cartella del brand: chi apre Claude lì dentro sa già chi è il brand e dove sono le cose.
// Le regole per scrivere e proporre idee stanno nelle skill di moonbrand. Si riscrive prima di ogni job dal brand com'è sul DB.
export function brandGuide(brand: BrandContext): string {
  const name = brand.identity.name || 'Brand';
  // Lo stile l'ha già letto Gemini dai riferimenti (job style): chi prepara un contenuto parte da qui.
  const style = brand.style?.trim()
    ? `
## Lo stile
Letto dai file in riferimenti-da-seguire e file-riferimento: vale come se li avessi guardati. Riguardali con guarda solo per un dettaglio che qui manca.

${brand.style.trim()}
`
    : '';
  // Le impaginazioni le scrive chi fa il contenuto quando lo salva: bastano per sceglierne una diversa.
  const layouts = brand.layouts ?? [];
  const recent =
    layouts.length > 0
      ? `
## Le impaginazioni degli ultimi contenuti
Dal più recente: scegline una diversa. Guarda con guarda solo i contenuti recenti che non sono in questa lista.

${layouts.map((item) => `- ${item.title} (${item.format}): ${item.layout}`).join('\n')}
`
      : '';
  // Il piano delle prossime due settimane: l'assistente sa cosa esce e quando senza chiederlo ai tool.
  const planned = brand.plan ?? [];
  const plan = `
## Il piano
Oggi è ${formatWeekdayShort(planNow().date)} (${planNow().date}), ora di Roma. ${
    planned.length > 0
      ? `Le uscite dei prossimi 14 giorni, con l'id che serve ai tool del piano:

${planned
  .map(
    (slot) =>
      `- ${formatWeekdayShort(slot.date)} ${slot.time} · ${slot.channels.map(channelName).join(', ')} · ${SLOT_STATUS_LABELS[slot.status]}` +
      `${slot.title ? ` · «${slot.title}»` : ''}${slot.theme ? ` · tema ${slot.theme}` : ''} (id ${slot.id})`,
  )
  .join('\n')}`
      : 'Nei prossimi 14 giorni non ci sono uscite.'
  }
`;
  return `# ${name}

La cartella del brand ${name} su moonbrand. Questo file lo scrive moonbrand dal profilo del brand: non modificarlo, si riscrive a ogni lavoro.

${describeBrand(brand)}
${style}${recent}${plan}
## La cartella
- file-riferimento/: i file caricati per il brand (logo, foto, materiali).
- riferimenti-da-seguire/: i post scelti come esempio dello stile del brand.
- allegati/: le foto e i video mandati nella chat.
- contenuti/<id>/: i contenuti salvati, con le immagini finali e i file di lavoro in lavoro/.
- chat/<id>/: la cartella di lavoro di ogni conversazione.
- video/: il progetto Remotion dei video del brand (vedi video/README.md).

## Le regole
- Per scrivere o ritoccare un contenuto: la skill moonbrand:contenuti.
- Per fare o ritoccare un video: la skill moonbrand:video.
- Per proporre idee: la skill moonbrand:idee.
- Per pianificare le uscite: la skill moonbrand:piano.
`;
}

export async function writeBrandGuide(brandDir: string, brand: BrandContext): Promise<void> {
  await writeFile(path.join(brandDir, 'CLAUDE.md'), brandGuide(brand));
}
