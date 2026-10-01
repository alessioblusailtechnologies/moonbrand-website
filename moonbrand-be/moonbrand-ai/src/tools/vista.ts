import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { GoogleGenAI, type Part } from '@google/genai';
import { z } from 'zod';

import { measure } from '../lib/usage';

// Gemini guarda immagini e video al posto di Claude e risponde a parole: i pixel non entrano nella conversazione di
// Claude, che altrimenti li rilegge a ogni passaggio. I video li guarda interi, con l'audio.
export const VISION_MODEL = process.env.GEMINI_VISION_MODEL || 'gemini-3.8-flash';
export const MAX_FILES = 10;
const PROCESSING_POLL_MS = 2000;
const PROCESSING_MAX_MS = 5 * 60_000;

export const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
};

export const VISION_INSTRUCTION = `Guardi immagini e video per un agente che prepara i social di un brand e che non può vederli: la tua risposta è tutto quello che saprà di questi file.

- Rispondi in italiano, alla domanda che ti fa, con precisione e senza giri di parole.
- Descrivi quello che si vede e si sente davvero: soggetti, luoghi, prodotti e marchi leggibili, colori, luce, inquadrature, movimenti di camera, testi a schermo, parlato e musica. Non inventare e non abbellire: se una cosa non si capisce, dillo.
- Nei video indica sempre i tempi (m:ss) di quello che descrivi, così l'agente può usarli nel montaggio.
- Quando ti chiede un controllo, elenca ogni problema con il file, il punto (in alto a destra, al centro…) e nei video il tempo; se è tutto a posto, dillo in una riga.
- Con più file, tienili distinti e chiamali con il loro nome.`;

// Gemini che guarda file della cartella del brand e risponde a parole: lo usano guarda e renderizza.
// La risposta, o perché non è arrivata, è già scritta per Claude.
export function createLooker(folder: string, apiKey: string): (file: string[], domanda: string) => Promise<{ text: string; isError?: true }> {
  const ai = new GoogleGenAI({ apiKey });
  const root = path.resolve(folder);
  const inside = (relative: string) => {
    const full = path.resolve(root, relative);
    if (!full.startsWith(root + path.sep)) throw new Error(`Il percorso ${relative} esce dalla cartella del brand.`);
    return full;
  };

  // I video si caricano con la Files API di Gemini, che li tiene 48 ore: nello stesso job lo stesso file non si
  // ricarica, finché non cambia.
  const uploaded = new Map<string, { uri: string; mimeType: string }>();
  const video = async (file: string, mimeType: string): Promise<Part> => {
    const full = inside(file);
    const { size, mtimeMs } = await stat(full);
    const key = `${full}:${size}:${mtimeMs}`;
    let remote = uploaded.get(key);
    if (!remote) {
      let current = await ai.files.upload({ file: full, config: { mimeType, displayName: path.basename(file) } });
      const started = Date.now();
      while (current.state === 'PROCESSING') {
        if (Date.now() - started > PROCESSING_MAX_MS) throw new Error(`Gemini non ha finito di elaborare ${file} in 5 minuti`);
        await new Promise((resolve) => setTimeout(resolve, PROCESSING_POLL_MS));
        current = await ai.files.get({ name: current.name! });
      }
      if (current.state !== 'ACTIVE' || !current.uri) throw new Error(`Gemini non riesce a leggere ${file}`);
      remote = { uri: current.uri, mimeType };
      uploaded.set(key, remote);
    }
    return { fileData: { fileUri: remote.uri, mimeType: remote.mimeType } };
  };
  const image = async (file: string, mimeType: string): Promise<Part> => ({
    inlineData: { data: (await readFile(inside(file))).toString('base64'), mimeType },
  });

  return async (file, domanda) => {
    try {
      const parts: Part[] = [];
      for (const item of file) {
        const mimeType = MIME_TYPES[path.extname(item).toLowerCase()];
        if (!mimeType) return { text: `Formato non supportato per ${item}: usa PNG, JPEG, WebP, MP4, MOV o WebM.`, isError: true };
        parts.push({ text: `File: ${item}` }, await (mimeType.startsWith('video/') ? video(item, mimeType) : image(item, mimeType)));
      }
      parts.push({ text: domanda });
      const response = await measure(
        {
          task: 'vision',
          model: VISION_MODEL,
          extra: ({ usageMetadata }) => ({ inputTokens: usageMetadata?.promptTokenCount, outputTokens: usageMetadata?.candidatesTokenCount }),
        },
        () => ai.models.generateContent({ model: VISION_MODEL, contents: [{ role: 'user', parts }], config: { systemInstruction: VISION_INSTRUCTION } }),
      );
      const answer = response.text?.trim();
      return answer ? { text: answer } : { text: 'Gemini non ha risposto: riprova, magari con una domanda diversa.', isError: true };
    } catch (error) {
      return { text: `Non riuscito: ${error instanceof Error ? error.message : String(error)}`, isError: true };
    }
  };
}

// La chiave resta in questo processo: Claude vede solo il tool, non la chiamata a Gemini.
export function visionTools(folder: string, apiKey: string) {
  const lookAt = createLooker(folder, apiKey);
  const look = tool(
    'guarda',
    'Fa guardare a Gemini immagini e video della cartella del brand e ti risponde a parole: usalo ogni volta che devi vedere una foto, ' +
      'un riferimento, un allegato, una clip, un fotogramma o un video montato, invece di aprirli tu. I video li guarda interi, con l’audio: ' +
      'passali così come sono, senza estrarre fotogrammi. Fai una domanda precisa e completa, perché la risposta è tutto quello che saprai di quei file: ' +
      'per capire un materiale chiedi cosa si vede e si sente e con quali tempi; per un controllo elenca cosa verificare.',
    {
      file: z
        .array(z.string())
        .min(1)
        .max(MAX_FILES)
        .describe('Immagini (PNG, JPEG, WebP) e video (MP4, MOV, WebM), relativi alla cartella del brand, es. allegati/abc.mp4'),
      domanda: z.string().min(10).describe('Cosa vuoi sapere, o cosa controllare, di questi file'),
    },
    async ({ file, domanda }) => {
      const { text, isError } = await lookAt(file, domanda);
      return { content: [{ type: 'text' as const, text }], ...(isError && { isError }) };
    },
    { alwaysLoad: true },
  );

  return createSdkMcpServer({ name: 'vista', tools: [look] });
}
