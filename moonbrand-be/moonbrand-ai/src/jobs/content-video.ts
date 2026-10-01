import type { ContentVideoJobInput } from '@moonbrand/shared/api/contract';
import { channelName } from '@moonbrand/shared/domain/catalog';
import { VIDEO_ASPECT, type SceneSource } from '@moonbrand/shared/domain/content';

import { contentDir, neededFiles, runContentAgent } from '../lib/content';

const [brandDir, inputJson] = process.argv.slice(2);
if (!brandDir || !inputJson) {
  console.error('Uso: npm run content-video -- <cartella del brand> <input del job in JSON>');
  process.exit(1);
}

const SOURCE_NAME: Record<SceneSource, string> = {
  clip: 'clip generata',
  photo: 'foto generata',
  user: 'foto o clip dell’utente',
  graphics: 'solo grafica e testo',
};

const { contentId, sessionId, channels, script, scenes } = JSON.parse(inputJson) as Omit<ContentVideoJobInput, 'brandId'>;
const dir = contentDir(contentId);

// Il copione com'è sul DB: l'utente può averlo corretto dopo che Claude l'ha scritto.
const sceneLines = scenes
  .map((scene, index) =>
    [
      `${index + 1}. ${scene.seconds} s · ${SOURCE_NAME[scene.source]}`,
      `   Si vede: ${scene.shot || '—'}`,
      `   A schermo: ${scene.onScreen || '—'}`,
      `   Voce: ${scene.voice || '—'}`,
    ].join('\n'),
  )
  .join('\n');

const prompt = `L’utente ha approvato il copione del video: ora fai il video, seguendo la skill moonbrand:video, e scrivi i testi per canale con la skill moonbrand:contenuti.
Il copione qui sotto è quello approvato e può essere diverso da quello che avevi scritto: segui questo.
Dove un’inquadratura chiede foto o clip dell’utente, cercale in allegati/ e file-riferimento/; se non ci sono, usa la soluzione più vicina e dillo nella risposta.

## Il copione
${script}

${sceneLines}

## Canali
Una variante di testo per ciascuno: ${channels.map((channel) => `${channelName(channel)} (${channel}, video in ${VIDEO_ASPECT[channel]})`).join(', ')}.

## File
Servono ${neededFiles('video', channels)}.
L’id del video è ${contentId}. Salva video e copertine finali in ${dir} (es. ${dir}/video-9x16.mp4 e ${dir}/cover-9x16.jpg) e i fotogrammi di controllo in ${dir}/lavoro.
Nel risultato riporta anche il copione, con le correzioni che hai dovuto fare mentre facevi il video.

Rispondi in italiano.`;

await runContentAgent({ brandDir, contentId, format: 'video', channels, prompt, resume: sessionId });
