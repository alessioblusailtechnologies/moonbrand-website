import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { FORMAT_ASPECT, sortFiles, type ContentFile } from '@moonbrand/shared/domain/content';

import { launchChrome, SIZES } from '../tools/grafica';

const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

// Su LinkedIn il carosello è un documento: le slide nella proporzione di LinkedIn riunite in un PDF, una per pagina,
// della misura della slide. Lo fa moonbrand e non Claude, così c'è sempre ed è uguale alle slide.
// Restituisce il file del documento, o null se non ci sono slide da riunire.
export async function carouselDocument(brandDir: string, files: readonly ContentFile[], target: string): Promise<ContentFile | null> {
  const aspect = FORMAT_ASPECT.carousel.linkedin as keyof typeof SIZES;
  const slides = sortFiles(files.filter((file) => file.role === 'slide' && file.aspect === aspect));
  if (slides.length === 0) return null;
  const { width, height } = SIZES[aspect];
  const images = await Promise.all(
    slides.map(async (slide) => {
      const bytes = await readFile(path.join(brandDir, slide.file));
      return `<img src="data:${MIME[path.extname(slide.file).toLowerCase()] ?? 'image/png'};base64,${bytes.toString('base64')}">`;
    }),
  );
  const html = `<!doctype html><html><head><style>
    @page { size: ${width}px ${height}px; margin: 0; }
    html, body { margin: 0; padding: 0; }
    img { display: block; width: ${width}px; height: ${height}px; object-fit: cover; }
    img:not(:last-child) { break-after: page; }
  </style></head><body>${images.join('')}</body></html>`;

  const output = path.join(brandDir, target);
  await mkdir(path.dirname(output), { recursive: true });
  const browser = await launchChrome();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.pdf({ path: output, width: `${width}px`, height: `${height}px`, printBackground: true });
  } finally {
    await browser.close().catch(() => undefined);
  }
  return { file: target, role: 'document', index: 0, aspect };
}
