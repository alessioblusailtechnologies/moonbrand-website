import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { promisify } from 'node:util';

import ffmpegPath from 'ffmpeg-static';

const run = promisify(execFile);

// Il lato lungo dei video caricati: basta per i video dei social, che escono in 1080×1920.
const MAX_SIDE = 1920;

async function ffmpeg(args: string[]): Promise<void> {
  if (!ffmpegPath) throw new Error('ffmpeg non è disponibile su questa piattaforma');
  await run(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { maxBuffer: 10 * 1024 * 1024 });
}

// Un video caricato diventa un MP4 H.264 che si guarda ovunque e che Remotion sa montare: dall'HEVC dell'iPhone,
// da MOV, WebM e altri. Già ruotato per il verso giusto, con il lato lungo al massimo di MAX_SIDE, e con l'inizio
// del file pronto per partire subito. Accanto, la copertina in JPEG da un fotogramma di mezzo secondo.
export async function normalizeVideo(input: string, output: string, poster: string): Promise<void> {
  await ffmpeg([
    '-i',
    input,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    '-vf',
    `scale='if(gte(iw,ih),min(${MAX_SIDE},iw),-2)':'if(gte(iw,ih),-2,min(${MAX_SIDE},ih))'`,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    '-movflags',
    '+faststart',
    output,
  ]);
  // Un video più corto di mezzo secondo prende il primo fotogramma.
  await ffmpeg(['-ss', '0.5', '-i', output, '-frames:v', '1', '-q:v', '3', poster]).catch(() => undefined);
  const made = await stat(poster).then(
    (info) => info.size > 0,
    () => false,
  );
  if (!made) await ffmpeg(['-i', output, '-frames:v', '1', '-q:v', '3', poster]);
}
