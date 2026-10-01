// Esporta ogni Still di src/Root.tsx in ../public/images, alla larghezza che serve al sito (circa 720px, il doppio della card).
// Uso: npx tsx scripts/render.mts [id...]
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

// Lo stesso Chrome headless di moonbrand-ai, scaricato una volta per tutti i progetti Remotion.
const chrome = path.resolve(
  '../../moonbrand-be/moonbrand-ai/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe',
);

const stills: { id: string; out: string; scale: number }[] = [
  { id: 'solco-buds', out: 'posts/solco-buds.jpg', scale: 2 / 3 },
  { id: 'solco-colori', out: 'posts/solco-colori.jpg', scale: 2 / 3 },
  { id: 'aurora-torta', out: 'posts/aurora-torta.jpg', scale: 2 / 3 },
  { id: 'aurora-laboratorio', out: 'posts/aurora-laboratorio.jpg', scale: 2 / 3 },
  { id: 'forma-slide', out: 'posts/forma-slide.jpg', scale: 2 / 3 },
  { id: 'forma-stacco', out: 'posts/forma-stacco.jpg', scale: 2 / 3 },
  { id: 'osteria-pescato', out: 'posts/osteria-pescato.jpg', scale: 2 / 3 },
  { id: 'riva-case', out: 'posts/riva-case.jpg', scale: 0.6 },
  { id: 'libreria-libri', out: 'posts/libreria-libri.jpg', scale: 2 / 3 },
  { id: 'social-manager', out: 'social-manager.jpg', scale: 1 },
  // Le copertine dei contenuti di Solco nella griglia dello studio: card piccole, bastano 480px.
  { id: 'solco-buds', out: 'studio/solco-buds.jpg', scale: 4 / 9 },
  { id: 'solco-colori', out: 'studio/solco-colori.jpg', scale: 4 / 9 },
  { id: 'solco-dentro', out: 'studio/solco-dentro.jpg', scale: 4 / 9 },
  { id: 'solco-suono', out: 'studio/solco-suono.jpg', scale: 4 / 9 },
  { id: 'solco-countdown', out: 'studio/solco-countdown.jpg', scale: 4 / 9 },
  { id: 'solco-team', out: 'studio/solco-team.jpg', scale: 4 / 9 },
];

const scelte = process.argv.slice(2);
for (const { id, out, scale } of stills.filter((s) => !scelte.length || scelte.includes(s.id))) {
  const target = path.resolve('../public/images', out);
  execFileSync(
    'npx',
    ['remotion', 'still', id, target, '--image-format=jpeg', '--jpeg-quality=86', `--scale=${scale}`, ...(existsSync(chrome) ? [`--browser-executable=${chrome}`] : [])],
    { stdio: 'inherit', shell: process.platform === 'win32' },
  );
}
