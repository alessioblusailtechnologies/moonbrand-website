import { execFile } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { access, cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { ensureBrowser } from '@remotion/renderer';

const KIT = fileURLToPath(new URL('../../video-kit', import.meta.url));

const exists = (file: string) =>
  access(file).then(
    () => true,
    () => false,
  );

// ffmpeg arriva con Remotion (@remotion/renderer è tra le dipendenze di moonbrand-ai), senza installare altro.
// Va lanciato dalla sua cartella: lì accanto ci sono le librerie che gli servono.
export function ffmpeg(): { bin: string; dir: string } {
  const modules = fileURLToPath(new URL('../../node_modules/@remotion', import.meta.url));
  for (const name of readdirSync(modules)) {
    if (!name.startsWith('compositor-')) continue;
    const dir = path.join(modules, name);
    const bin = path.join(dir, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
    if (existsSync(bin)) return { bin, dir };
  }
  throw new Error('ffmpeg non trovato tra i pacchetti di Remotion');
}

// Il progetto Remotion del brand, in <brand>/video: al primo video nasce dal kit di partenza, poi è del brand.
// Le dipendenze le installa pnpm dal suo archivio condiviso, quindi per ogni brand costano pochi secondi e quasi niente spazio.
// Restituisce l'ambiente per i comandi remotion: il Chrome headless condiviso da tutti i brand.
export async function prepareVideoProject(brandDir: string): Promise<Record<string, string>> {
  const project = path.join(brandDir, 'video');
  if (!(await exists(path.join(project, 'package.json')))) await cp(KIT, project, { recursive: true });
  if (!(await exists(path.join(project, 'node_modules')))) {
    await promisify(execFile)('pnpm', ['install', '--prefer-offline'], { cwd: project, shell: process.platform === 'win32' });
  }
  const browser = await ensureBrowser();
  return browser.type === 'local-puppeteer-browser' || browser.type === 'user-defined-path' ? { REMOTION_BROWSER: browser.path } : {};
}
