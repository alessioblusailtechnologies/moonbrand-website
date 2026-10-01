import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

import { measure, type Meter } from '../lib/usage';

// Musica e canzoni con Mureka: si chiede il brano, si aspetta che il lavoro finisca, si scarica il file.
const API = process.env.MUREKA_API_URL || 'https://api.mureka.ai';
const MODEL = 'auto';
const POLL_MS = 5000;
const MAX_WAIT_MS = 15 * 60_000;
const FAILED = new Set(['failed', 'cancelled', 'timeouted']);
// Mureka fa un lavoro alla volta per account e il worker ne fa girare più di uno: con 429 si aspetta il proprio turno.
const BUSY_RETRY_MS = 10_000;

interface MurekaTask {
  id: string;
  status: string;
  failed_reason?: string;
  choices?: { url?: string; duration?: number }[];
}

// La chiave resta in questo processo: Claude vede solo i tool, non le chiamate a Mureka.
export function musicTools(folder: string, apiKey: string) {
  const root = path.resolve(folder);
  const inside = (relative: string) => {
    const full = path.resolve(root, relative);
    if (!full.startsWith(root + path.sep)) throw new Error(`Il percorso ${relative} esce dalla cartella del brand.`);
    return full;
  };
  const call = async (method: 'GET' | 'POST', endpoint: string, body?: unknown): Promise<MurekaTask> => {
    const started = Date.now();
    for (;;) {
      const response = await fetch(`${API}${endpoint}`, {
        method,
        headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        ...(body !== undefined && { body: JSON.stringify(body) }),
      });
      if (response.status === 429 && Date.now() - started < MAX_WAIT_MS) {
        await new Promise((resolve) => setTimeout(resolve, BUSY_RETRY_MS));
        continue;
      }
      if (!response.ok) throw new Error(`Mureka ha risposto ${response.status}: ${await response.text()}`);
      return (await response.json()) as MurekaTask;
    }
  };

  // Quanto ha speso l'account in tutto, nell'unità di Mureka (sembrano centesimi di dollaro, non è documentato).
  const spending: Meter = {
    unit: 'spesa Mureka',
    read: async () => {
      const response = await fetch(`${API}/v1/account/billing`, { headers: { Authorization: `Bearer ${apiKey}` } });
      if (!response.ok) throw new Error(`Mureka ha risposto ${response.status}`);
      return ((await response.json()) as { total_spending: number }).total_spending;
    },
  };

  // Il lavoro gira da loro: si chiede lo stato finché ha finito, poi si scarica il primo brano.
  const produce = (kind: 'song' | 'instrumental', body: Record<string, unknown>, file: string) =>
    measure({ task: kind === 'song' ? 'song' : 'music', model: MODEL, meter: spending }, () => generate(kind, body, file));
  const generate = async (kind: 'song' | 'instrumental', body: Record<string, unknown>, file: string) => {
    let task = await call('POST', `/v1/${kind}/generate`, { model: MODEL, ...body });
    const started = Date.now();
    while (task.status !== 'succeeded') {
      if (FAILED.has(task.status)) throw new Error(`il lavoro è ${task.status}${task.failed_reason ? `: ${task.failed_reason}` : ''}`);
      if (Date.now() - started > MAX_WAIT_MS) throw new Error('il lavoro non è finito in 15 minuti');
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      task = await call('GET', `/v1/${kind}/query/${task.id}`);
    }
    const choice = task.choices?.find((item) => item.url);
    if (!choice?.url) throw new Error('il lavoro è finito senza un file audio');
    const download = await fetch(choice.url);
    if (!download.ok) throw new Error(`il file audio non si scarica (${download.status})`);
    // L'estensione è quella del file che arriva, se è diversa da quella chiesta.
    const extension = path.extname(new URL(choice.url).pathname).toLowerCase();
    const saved = extension && extension !== path.extname(file) ? file.replace(/\.[a-z0-9]+$/i, extension) : file;
    const target = inside(saved);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, Buffer.from(await download.arrayBuffer()));
    const length = choice.duration ? ` (${Math.round(choice.duration > 1000 ? choice.duration / 1000 : choice.duration)} secondi)` : '';
    return { content: [{ type: 'text' as const, text: `Salvato in ${saved}${length}.` }] };
  };
  const failure = (error: unknown) => ({
    content: [{ type: 'text' as const, text: `Non riuscito: ${error instanceof Error ? error.message : String(error)}` }],
    isError: true,
  });
  const audioFile = (example: string) =>
    z
      .string()
      .regex(/^[A-Za-z0-9._\/-]+\.(mp3|wav|flac|m4a)$/)
      .describe(`Dove salvarlo, relativo alla cartella del brand, es. video/public/contenuti/<id>/${example}`);

  const instrumental = tool(
    'genera_musica',
    'Compone una musica strumentale originale con Mureka e la salva nella cartella del brand. Ci vuole qualche minuto. ' +
      'Descrivi in inglese genere, atmosfera, strumenti, tempo (BPM) e andamento. La durata la sceglie Mureka (di solito 2-4 minuti): nel video tagliala e chiudila con una dissolvenza.',
    {
      descrizione: z.string().min(10).describe('Com’è la musica, in inglese: genere, atmosfera, strumenti, tempo, andamento'),
      file: audioFile('musica.mp3'),
    },
    async ({ descrizione, file }) => {
      try {
        return await produce('instrumental', { prompt: descrizione }, file);
      } catch (error) {
        return failure(error);
      }
    },
    { alwaysLoad: true },
  );

  const song = tool(
    'genera_canzone',
    'Compone una canzone cantata con Mureka, sul testo che scrivi tu, e la salva nella cartella del brand. Ci vuole qualche minuto. ' +
      'Il testo va diviso in sezioni con i tag [Verse], [Chorus], [Bridge], [Outro]; lo stile si descrive in inglese (genere, atmosfera, voce maschile o femminile, tempo).',
    {
      testo: z.string().min(10).describe('Il testo della canzone, con le sezioni tra parentesi quadre'),
      stile: z.string().optional().describe('Lo stile in inglese, es. "warm acoustic pop, female vocal, 100 BPM, hopeful"'),
      file: audioFile('canzone.mp3'),
    },
    async ({ testo, stile, file }) => {
      try {
        return await produce('song', { lyrics: testo, ...(stile && { prompt: stile }) }, file);
      } catch (error) {
        return failure(error);
      }
    },
    { alwaysLoad: true },
  );

  return createSdkMcpServer({ name: 'musica', tools: [instrumental, song] });
}
