import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { GoogleGenAI, type Part } from '@google/genai';

import { measure } from '../lib/usage';
import { MAX_FILES, MIME_TYPES, VISION_INSTRUCTION, VISION_MODEL } from '../tools/vista';

// Lo stile del brand dai suoi riferimenti, letto una volta da Gemini: finisce nel CLAUDE.md di ogni job, così chi fa un
// contenuto non riguarda i riferimenti ogni volta. La domanda è sempre la stessa, quindi niente Claude.
// Il worker legge i messaggi dell'SDK di Claude: lo script scrive quelli che servono, lo step di guarda e il risultato.

const [brandDir] = process.argv.slice(2);
if (!brandDir) {
  console.error('Uso: npm run style -- <cartella del brand>');
  process.exit(1);
}
const { GEMINI_API_KEY } = process.env;
if (!GEMINI_API_KEY) {
  console.error('Manca GEMINI_API_KEY nel .env di moonbrand-ai.');
  process.exit(1);
}

// Prima i post scelti come esempio, poi i file caricati (logo, foto, materiali).
const FOLDERS = ['riferimenti-da-seguire', 'file-riferimento'];

const QUESTION = `Sono i riferimenti di stile del brand: i post scelti come esempio (riferimenti-da-seguire) e i file caricati (file-riferimento: logo, foto, materiali).
Scrivi la guida di stile che userà chi prepara i prossimi contenuti senza vedere questi file. In italiano, al massimo 2.500 caratteri, una riga per voce che inizia con la voce in grassetto:
- **Palette**: i colori con l'esadecimale stimato e il ruolo (sfondo, titoli, accenti).
- **Caratteri**: titoli e testi (famiglia, peso, maiuscolo o no) e un font simile su Google Fonts.
- **Foto**: soggetti, luce, tono e trattamento.
- **Grafica ricorrente**: linee, riquadri, bordi, firme, hashtag e dove stanno.
- **Logo**: forma, colori e scritte; «nessuno» se non c'è.
- **Impaginazioni dei riferimenti**: per ogni post, con il nome del file, dove stanno titolo, foto, testo e logo.
- **In sintesi**: lo stile comune in due frasi.
Scrivi solo quello che si vede.`;

const emit = (message: unknown) => console.log(JSON.stringify(message));

const files: string[] = [];
for (const folder of FOLDERS) {
  const names = await readdir(path.join(brandDir, folder)).catch(() => []);
  files.push(...names.filter((name) => MIME_TYPES[path.extname(name).toLowerCase()]?.startsWith('image/')).sort().map((name) => `${folder}/${name}`));
}
const chosen = files.slice(0, MAX_FILES);

let style = '';
if (chosen.length > 0) {
  const step = 'style-look';
  emit({ type: 'assistant', message: { id: 'style', content: [{ type: 'tool_use', id: step, name: 'mcp__vista__guarda', input: { file: chosen } }] } });
  const parts: Part[] = [];
  for (const file of chosen) {
    const mimeType = MIME_TYPES[path.extname(file).toLowerCase()];
    parts.push({ text: `File: ${file}` }, { inlineData: { data: (await readFile(path.join(brandDir, file))).toString('base64'), mimeType } });
  }
  parts.push({ text: QUESTION });
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const response = await measure(
    {
      task: 'vision',
      model: VISION_MODEL,
      extra: ({ usageMetadata }) => ({ inputTokens: usageMetadata?.promptTokenCount, outputTokens: usageMetadata?.candidatesTokenCount }),
    },
    () => ai.models.generateContent({ model: VISION_MODEL, contents: [{ role: 'user', parts }], config: { systemInstruction: VISION_INSTRUCTION } }),
  );
  style = response.text?.trim() ?? '';
  if (!style) {
    console.error('Gemini non ha descritto lo stile.');
    process.exit(1);
  }
  emit({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: step }] } });
}

emit({ type: 'result', subtype: 'success', structured_output: { style } });
