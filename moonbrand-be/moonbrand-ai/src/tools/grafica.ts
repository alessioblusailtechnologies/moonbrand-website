import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { ensureBrowser } from '@remotion/renderer';
import puppeteer, { type Browser } from 'puppeteer-core';
import { z } from 'zod';

import { createLooker } from './vista';

// Le immagini dei contenuti sono HTML: renderizza le esporta in PNG o JPEG con il Chrome headless che Remotion ha già
// scaricato, aperto al primo render e tenuto per tutto il job. Prima dello scatto aspetta font e immagini; dopo misura
// sul DOM quello che si misura (testi tagliati o fuori bordo, font mancanti, immagini rotte, testi sovrapposti, corpo
// troppo piccolo, zone coperte dall'interfaccia nel 9:16) e, se glielo si chiede, fa guardare l'immagine a Gemini.
// Tutto in una chiamata: Claude non deve ricordarsi come si fa e non paga un giro in più per il controllo.

export const SIZES = {
  '4:5': { width: 1080, height: 1350 },
  '1:1': { width: 1080, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1600, height: 900 },
  '1.91:1': { width: 1200, height: 628 },
} as const;
type Aspect = keyof typeof SIZES;

const LOAD_TIMEOUT_MS = 30_000;
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);

// I controlli sul DOM girano nella pagina: stanno in un file JavaScript a parte, letto come testo.
const CHECKS = readFileSync(new URL('./grafica-controlli.js', import.meta.url), 'utf8')
  .replace(/^(\s*\/\/.*\n)+/, '')
  .trim();

// Il Chrome headless che Remotion ha già scaricato: serve al render e al documento PDF dei caroselli.
export async function launchChrome(): Promise<Browser> {
  const status = await ensureBrowser();
  if (status.type !== 'local-puppeteer-browser' && status.type !== 'user-defined-path') throw new Error('Chrome headless non disponibile');
  return puppeteer.launch({ executablePath: status.path, headless: true, args: ['--hide-scrollbars', '--font-render-hinting=none'] });
}

// Il render da solo, senza tool: lo usa renderizza (e chi lo vuole provare da fuori).
export function createRenderer(folder: string) {
  const root = path.resolve(folder);
  const inside = (relative: string) => {
    const full = path.resolve(root, relative);
    if (!full.startsWith(root + path.sep)) throw new Error(`Il percorso ${relative} esce dalla cartella del brand.`);
    return full;
  };
  let browser: Promise<Browser> | null = null;
  const openBrowser = () => (browser ??= launchChrome());

  async function render(html: string, file: string, aspect: Aspect): Promise<string> {
    const source = inside(html);
    const target = inside(file);
    const extension = path.extname(target).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(extension)) throw new Error(`${file}: l'immagine si salva in PNG o JPEG.`);
    const { width, height } = SIZES[aspect];
    const page = await (await openBrowser()).newPage();
    const failed: string[] = [];
    page.on('requestfailed', (request) => failed.push(`${request.url()} (${request.failure()?.errorText ?? 'errore'})`));
    page.on('response', (response) => {
      if (response.status() >= 400) failed.push(`${response.url()} (${response.status()})`);
    });
    try {
      const started = Date.now();
      await page.setViewport({ width, height, deviceScaleFactor: 1 });
      await page.goto(pathToFileURL(source).href, { waitUntil: 'networkidle0', timeout: LOAD_TIMEOUT_MS });
      await page.evaluate('Promise.all([document.fonts.ready, ...[...document.images].map((image) => image.decode().catch(() => undefined))])');
      await page.screenshot({ path: target, type: extension === '.png' ? 'png' : 'jpeg', ...(extension !== '.png' && { quality: 92 }), clip: { x: 0, y: 0, width, height } });
      const found = (await page.evaluate(`(${CHECKS})(${aspect === '9:16'})`)) as { fix: string[]; check: string[] };
      const fix = [...found.fix, ...failed.map((request) => `richiesta non riuscita: ${request}`)];
      const seconds = ((Date.now() - started) / 1000).toFixed(1).replace('.', ',');
      const list = (title: string, items: string[]) => (items.length > 0 ? [`${title}:`, ...items.map((item) => `- ${item}`)] : []);
      const checks =
        fix.length + found.check.length === 0 ? ['Controlli: tutto a posto.'] : [...list('Da correggere', fix), ...list('Da valutare, se non sono scelte', found.check)];
      return [`Salvata ${file} (${width}×${height}, ${aspect}) in ${seconds} s.`, ...checks].join('\n');
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  return {
    render,
    // Da chiamare a fine job: il browser aperto terrebbe vivo il processo.
    close: async () => {
      if (browser) await (await browser.catch(() => null))?.close().catch(() => undefined);
    },
  };
}

export function graphicsTools(folder: string, geminiKey?: string) {
  const { render, close } = createRenderer(folder);
  const lookAt = geminiKey ? createLooker(folder, geminiKey) : null;

  const renderTool = tool(
    'renderizza',
    'Esporta in PNG o JPEG l’HTML di un’immagine, con il browser già pronto e le misure giuste per il formato; aspetta font e immagini prima dello scatto. ' +
      'Poi misura sul DOM testi tagliati o fuori bordo, font non caricati, immagini rotte, testi sovrapposti e corpo troppo piccolo, e te lo dice. ' +
      'Con domanda, fa anche guardare le immagini a Gemini e ti riporta la risposta: usala per il giudizio che il DOM non dà (cosa copre cosa, equilibrio, colori). ' +
      'Più uscite in una chiamata si fanno in parallelo.',
    {
      uscite: z
        .array(
          z.object({
            html: z.string().describe('Il file HTML, relativo alla cartella del brand; percorsi di immagini e CSS relativi a lui'),
            file: z.string().describe('L’immagine da scrivere, .png o .jpg, relativa alla cartella del brand'),
            formato: z.enum(Object.keys(SIZES) as [Aspect, ...Aspect[]]).describe('4:5 1080×1350, 1:1 1080×1080, 9:16 1080×1920, 16:9 1600×900, 1.91:1 1200×628'),
          }),
        )
        .min(1)
        .max(16),
      domanda: z.string().min(10).optional().describe('Cosa far controllare a Gemini sulle immagini appena fatte'),
    },
    async ({ uscite, domanda }) => {
      const results = await Promise.all(
        uscite.map(({ html, file, formato }) =>
          render(html, file, formato).catch((error: unknown) => `Non riuscita ${file}: ${error instanceof Error ? error.message : String(error)}`),
        ),
      );
      let text = results.join('\n\n');
      const done = uscite.filter((_, index) => results[index].startsWith('Salvata')).map((item) => item.file);
      if (domanda && done.length > 0) {
        text += lookAt ? `\n\nGemini:\n${(await lookAt(done, domanda)).text}` : '\n\nGemini non è disponibile in questo lavoro: usa guarda.';
      }
      return { content: [{ type: 'text' as const, text }], ...(done.length < uscite.length && { isError: true as const }) };
    },
    { alwaysLoad: true },
  );

  return {
    server: createSdkMcpServer({ name: 'grafica', tools: [renderTool] }),
    close,
  };
}
