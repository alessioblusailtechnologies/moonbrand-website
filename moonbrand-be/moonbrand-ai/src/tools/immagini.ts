import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';

import { measure } from '../lib/usage';

const MODEL = 'gemini-3.1-flash-image';

const MIME_TYPES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

const EXTENSIONS: Record<string, string> = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };

// La chiave resta in questo processo: Claude vede solo il tool, non la chiamata a Gemini.
export function imageTools(folder: string, apiKey: string) {
  const ai = new GoogleGenAI({ apiKey });
  const root = path.resolve(folder);
  const inside = (relative: string) => {
    const full = path.resolve(root, relative);
    if (!full.startsWith(root + path.sep)) throw new Error(`Il percorso ${relative} esce dalla cartella del brand.`);
    return full;
  };
  const failure = (text: string) => ({ content: [{ type: 'text' as const, text }], isError: true });

  const generate = tool(
    'genera_immagine',
    'Genera un’immagine vera (foto o illustrazione) con Gemini e la salva in JPEG nella cartella del brand. ' +
      'Descrivi soggetto, inquadratura, luce e stile. Puoi passare immagini della cartella come riferimento di soggetto o di stile. ' +
      'L’immagine si può usare così com’è o comporre con testi e grafica.',
    {
      descrizione: z.string().min(10).describe('Cosa deve mostrare l’immagine: soggetto, inquadratura, luce, stile'),
      riferimenti: z
        .array(z.string())
        .max(14)
        .optional()
        .describe('Immagini della cartella del brand da seguire come soggetto o stile, es. file-riferimento/abc.png'),
      formato: z.enum(['1:1', '4:5', '3:4', '2:3', '9:16', '16:9', '4:3', '3:2', '5:4', '21:9']).describe('Proporzioni dell’immagine'),
      file: z
        .string()
        .regex(/^[A-Za-z0-9._\/-]+\.jpg$/)
        .describe('Dove salvarla, relativo alla cartella del brand, es. esempi/foto-1.jpg'),
    },
    async ({ descrizione, riferimenti = [], formato, file }) => {
      try {
        const images = await Promise.all(
          riferimenti.map(async (reference) => {
            const mimeType = MIME_TYPES[path.extname(reference).toLowerCase()];
            if (!mimeType) throw new Error(`Formato non supportato per il riferimento ${reference}: usa PNG, JPEG o WebP.`);
            return { type: 'image' as const, mime_type: mimeType, data: (await readFile(inside(reference))).toString('base64') };
          }),
        );
        const interaction = await measure(
          {
            task: 'image',
            model: MODEL,
            extra: ({ usage }) => ({ units: 1, unit: 'immagini', inputTokens: usage?.total_input_tokens, outputTokens: usage?.total_output_tokens }),
          },
          () =>
            ai.interactions.create({
              model: MODEL,
              input: [{ type: 'text', text: descrizione }, ...images],
              response_format: { type: 'image', aspect_ratio: formato, image_size: '2K', mime_type: 'image/jpeg' },
            }),
        );
        const image = interaction.output_image;
        if (!image?.data) return failure('Gemini non ha restituito un’immagine: prova a riformulare la descrizione.');
        const extension = EXTENSIONS[image.mime_type ?? 'image/jpeg'] ?? '.jpg';
        const saved = file.replace(/\.jpg$/, extension);
        const target = inside(saved);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, Buffer.from(image.data, 'base64'));
        return { content: [{ type: 'text' as const, text: `Immagine salvata in ${saved}` }] };
      } catch (error) {
        return failure(`Generazione non riuscita: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    { alwaysLoad: true },
  );

  return createSdkMcpServer({ name: 'immagini', tools: [generate] });
}
