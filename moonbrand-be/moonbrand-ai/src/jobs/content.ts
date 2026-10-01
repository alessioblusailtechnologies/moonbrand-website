import { rm } from 'node:fs/promises';
import path from 'node:path';

import type { ContentJobInput } from '@moonbrand/shared/api/contract';
import { channelName } from '@moonbrand/shared/domain/catalog';

import { writeBrandGuide } from '../lib/brand-guide';
import { contentDir, neededFiles, runContentAgent, videoAspects } from '../lib/content';

const [brandDir, inputJson] = process.argv.slice(2);
if (!brandDir || !inputJson) {
  console.error('Uso: npm run content -- <cartella del brand> <input del job in JSON>');
  process.exit(1);
}

const FORMAT_NAME = { post: 'post', carousel: 'carosello', article: 'articolo', video: 'video' } as const;

const { contentId, format, channels, brand, idea } = JSON.parse(inputJson) as Omit<ContentJobInput, 'brandId'>;
const dir = contentDir(contentId);
const ideaLines = [
  idea.title,
  idea.angleLabel && `Taglio: ${idea.angleLabel}`,
  idea.angle && `Cosa raccontare: ${idea.angle}`,
  idea.rationale && `Perché adesso: ${idea.rationale}`,
  idea.theme && `Tema: ${idea.theme}`,
]
  .filter(Boolean)
  .join('\n');
const channelList = channels.map((channel) => `${channelName(channel)} (${channel})`).join(', ');

// Da zero: via i file di una stesura precedente.
await rm(path.join(brandDir, dir), { recursive: true, force: true });
// Il brand sta nel CLAUDE.md della cartella e le regole nella skill: il prompt dice solo cosa vale per questo contenuto.
await writeBrandGuide(brandDir, brand);

// Un video nasce dal copione: qui solo quello, il video si fa quando l'utente l'ha approvato.
const prompt =
  format === 'video'
    ? `Scrivi il copione del video che nasce dall’idea qui sotto, seguendo la skill moonbrand:video; il brand è descritto in CLAUDE.md.
Per ora solo il copione: l’idea in breve (tono, ritmo, musica, voce) e le inquadrature, ognuna con durata, cosa si vede, da dove viene, testo a schermo e voce fuori campo.
Non generare immagini, clip o audio e non scrivere la composizione: l’utente legge e corregge il copione, poi si fa il video.

## L’idea
${ideaLines}

## Canali
${channelList}. Il video uscirà in ${videoAspects(channels).join(', ')}: scrivi il copione per la proporzione principale, le altre si adattano.

Rispondi in italiano.`
    : `Scrivi il contenuto che nasce dall’idea qui sotto, pronto da pubblicare, e prepara le sue immagini.
Segui la skill moonbrand:contenuti; il brand è descritto in CLAUDE.md.

## L’idea
${ideaLines}

## Formato
${FORMAT_NAME[format]}

## Canali
Una variante di testo per ciascuno: ${channelList}.

## Immagini
Servono ${neededFiles(format, channels)}.
Salva le immagini finali in ${dir} e tieni i file di lavoro (HTML, script, foto intermedie) in ${dir}/lavoro.

Rispondi in italiano.`;

await runContentAgent({ brandDir, contentId, format, channels, prompt, scriptOnly: format === 'video' });
