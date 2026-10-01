import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

import { measure, type Meter } from '../lib/usage';
import { ffmpeg } from '../lib/video';

const API = 'https://api.elevenlabs.io/v1';
const VOICE_MODEL = 'eleven_v3';

interface SharedVoice {
  voice_id: string;
  name: string;
  description?: string | null;
  gender?: string;
  age?: string;
  accent?: string;
  descriptive?: string;
  use_case?: string;
}

interface Alignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

// Il formato Caption di @remotion/captions: il testo di ogni parola dopo la prima comincia con uno spazio.
interface Caption {
  text: string;
  startMs: number;
  endMs: number;
  timestampMs: number | null;
  confidence: number | null;
}

// Dai tempi delle lettere a quelli delle parole; i tag di intonazione di eleven_v3, come [whispers], non si leggono e restano fuori.
function toCaptions({ characters, character_start_times_seconds: starts, character_end_times_seconds: ends }: Alignment): Caption[] {
  const captions: Caption[] = [];
  let word: { text: string; start: number; end: number } | null = null;
  let inTag = false;
  const close = () => {
    if (!word) return;
    const startMs = Math.round(word.start * 1000);
    captions.push({ text: `${captions.length > 0 ? ' ' : ''}${word.text}`, startMs, endMs: Math.round(word.end * 1000), timestampMs: startMs, confidence: null });
    word = null;
  };
  characters.forEach((character, index) => {
    if (character === '[') inTag = true;
    if (inTag || /\s/.test(character)) {
      close();
      if (character === ']') inTag = false;
      return;
    }
    word ??= { text: '', start: starts[index] ?? 0, end: 0 };
    word.text += character;
    word.end = ends[index] ?? word.end;
  });
  close();
  return captions;
}

// Una parola con i suoi tempi, dall'allineamento (con il testo) o dalla trascrizione (senza).
interface TimedWord {
  text: string;
  start: number;
  end: number;
  type?: string;
}

// Voce fuori campo, effetti e tempi delle parole con ElevenLabs (la musica la fa Mureka, in musica.ts).
// La chiave resta in questo processo: Claude vede solo i tool, non le chiamate a ElevenLabs.
export function audioTools(folder: string, apiKey: string) {
  const root = path.resolve(folder);
  const inside = (relative: string) => {
    const full = path.resolve(root, relative);
    if (!full.startsWith(root + path.sep)) throw new Error(`Il percorso ${relative} esce dalla cartella del brand.`);
    return full;
  };
  const save = async (file: string, data: Buffer | string) => {
    const target = inside(file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data);
  };
  const call = async (endpoint: string, init?: { body: unknown }) => {
    const response = await fetch(`${API}${endpoint}`, {
      method: init ? 'POST' : 'GET',
      headers: { 'xi-api-key': apiKey, 'content-type': 'application/json' },
      ...(init && { body: JSON.stringify(init.body) }),
    });
    if (!response.ok) throw new Error(`ElevenLabs ha risposto ${response.status}: ${await response.text()}`);
    return response;
  };
  // Le chiamate con un file: il content-type lo mette FormData.
  const upload = async (endpoint: string, form: FormData) => {
    const response = await fetch(`${API}${endpoint}`, { method: 'POST', headers: { 'xi-api-key': apiKey }, body: form });
    if (!response.ok) throw new Error(`ElevenLabs ha risposto ${response.status}: ${await response.text()}`);
    return response;
  };
  // I crediti usati nel periodo: la differenza prima e dopo è quanto è costata una generazione.
  const credits: Meter = {
    unit: 'crediti ElevenLabs',
    read: async () => ((await (await call('/user/subscription')).json()) as { character_count: number }).character_count,
  };
  const text = (value: string) => ({ content: [{ type: 'text' as const, text: value }] });
  const failure = (error: unknown) => ({
    content: [{ type: 'text' as const, text: `Non riuscito: ${error instanceof Error ? error.message : String(error)}` }],
    isError: true,
  });
  const mp3 = (example: string) =>
    z
      .string()
      .regex(/^[A-Za-z0-9._\/-]+\.mp3$/)
      .describe(`Dove salvarlo, relativo alla cartella del brand, es. video/public/contenuti/<id>/${example}`);

  const voices = tool(
    'cerca_voci',
    'Cerca voci per la voce fuori campo nella libreria di ElevenLabs e restituisce id e descrizione di ciascuna. ' +
      'Non puoi ascoltarle: scegli dalla descrizione quella che somiglia di più alla voce del brand.',
    {
      lingua: z.string().optional().describe('Codice della lingua, es. it (di base) o en'),
      genere: z.enum(['male', 'female', 'neutral']).optional(),
      eta: z.enum(['young', 'middle_aged', 'old']).optional(),
      uso: z
        .enum(['narrative_story', 'conversational', 'characters_animation', 'social_media', 'entertainment_tv', 'advertisement', 'informative_educational'])
        .optional()
        .describe('Per cosa è pensata la voce'),
      cerca: z.string().optional().describe('Parole da cercare nel nome o nella descrizione, in inglese, es. warm, calm, energetic'),
    },
    async ({ lingua = 'it', genere, eta, uso, cerca }) => {
      try {
        const query = new URLSearchParams({ language: lingua, page_size: '20', sort: 'usage_character_count_1y' });
        if (genere) query.set('gender', genere);
        if (eta) query.set('age', eta);
        if (uso) query.set('use_cases', uso);
        if (cerca) query.set('search', cerca);
        const { voices: found } = (await (await call(`/shared-voices?${query}`)).json()) as { voices: SharedVoice[] };
        if (found.length === 0) return text('Nessuna voce trovata: allarga la ricerca.');
        const lines = found.map((voice) =>
          [voice.voice_id, voice.name, voice.gender, voice.age, voice.accent, voice.descriptive, voice.use_case, voice.description?.replace(/\s+/g, ' ')]
            .filter(Boolean)
            .join(' · '),
        );
        return text(lines.join('\n'));
      } catch (error) {
        return failure(error);
      }
    },
    { alwaysLoad: true },
  );

  const voiceOver = tool(
    'genera_voce',
    'Legge un testo con una voce di ElevenLabs (eleven_v3) e salva l’audio in MP3. Accanto salva, con lo stesso nome e .json, ' +
      'i tempi di ogni parola nel formato Caption di @remotion/captions, per i sottotitoli e per mettere a tempo le scene. ' +
      'Il testo può contenere tag di intonazione in inglese tra parentesi quadre, es. [whispers], [excited], [pause]: non finiscono nei sottotitoli.',
    {
      testo: z.string().min(1).describe('Il testo da leggere, scritto come si pronuncia: numeri e sigle come vanno detti'),
      voce: z.string().describe('L’id della voce, da cerca_voci o quella già scelta per il brand'),
      lingua: z.string().optional().describe('Codice della lingua, es. it (di base)'),
      file: mp3('voce.mp3'),
    },
    async ({ testo, voce, lingua = 'it', file }) => {
      try {
        const { audio_base64, alignment } = await measure({ task: 'voice', model: VOICE_MODEL, meter: credits }, async () => {
          const response = await call(`/text-to-speech/${encodeURIComponent(voce)}/with-timestamps?output_format=mp3_44100_128`, {
            body: { text: testo, model_id: VOICE_MODEL, language_code: lingua },
          });
          return (await response.json()) as { audio_base64: string; alignment: Alignment };
        });
        const captions = toCaptions(alignment);
        const captionsFile = file.replace(/\.mp3$/, '.json');
        await save(file, Buffer.from(audio_base64, 'base64'));
        await save(captionsFile, JSON.stringify(captions, null, 2));
        const seconds = (alignment.character_end_times_seconds.at(-1) ?? 0).toFixed(2);
        return text(`Voce salvata in ${file} (${seconds} secondi); i tempi delle parole in ${captionsFile}.`);
      } catch (error) {
        return failure(error);
      }
    },
    { alwaysLoad: true },
  );

  const words = tool(
    'tempi_parole',
    'Trova quando viene detta o cantata ogni parola di un audio della cartella (una canzone di Mureka, una voce registrata) e salva i tempi ' +
      'nel formato Caption di @remotion/captions: per sottotitoli e parole che si accendono a tempo. Con il testo esatto lo allinea, ed è il modo più preciso; ' +
      'senza testo lo trascrive. Per una canzone prima separa la voce dalla musica. Con da e a lavora solo su quel pezzo, ma i tempi restano quelli del brano intero. ' +
      'Per la voce fatta con genera_voce non serve: i tempi li ha già salvati lei.',
    {
      audio: z.string().describe('Il file audio, relativo alla cartella del brand, es. video/public/contenuti/<id>/canzone.mp3'),
      testo: z
        .string()
        .optional()
        .describe(
          'Il testo esattamente come si sente, nell’ordine e con le ripetizioni (i tag come [Chorus] si ignorano); se non lo sai con certezza lascialo vuoto e il tool trascrive',
        ),
      canzone: z.boolean().optional().describe('true (di base) se sotto la voce c’è musica da separare; false per una voce sola'),
      da: z.number().min(0).optional().describe('Secondo del brano da cui partire'),
      a: z.number().positive().optional().describe('Secondo del brano a cui fermarsi'),
      lingua: z.string().optional().describe('Codice della lingua per la trascrizione, es. it (di base) o en'),
      file: z
        .string()
        .regex(/^[A-Za-z0-9._\/-]+\.json$/)
        .describe('Dove salvare i tempi, relativo alla cartella del brand, es. video/public/contenuti/<id>/canzone.parole.json'),
    },
    async ({ audio, testo, canzone = true, da = 0, a, lingua = 'it', file }) => {
      const work = await mkdtemp(path.join(tmpdir(), 'moonbrand-parole-'));
      try {
        // Il pezzo che serve, in WAV mono: meno da mandare e da pagare, e ogni ffmpeg lo sa scrivere.
        const piece = path.join(work, 'pezzo.wav');
        const { bin, dir } = ffmpeg();
        const range = [...(da > 0 ? ['-ss', String(da)] : []), ...(a !== undefined ? ['-to', String(a)] : [])];
        await promisify(execFile)(bin, ['-hide_banner', '-loglevel', 'error', '-y', ...range, '-i', inside(audio), '-vn', '-ac', '1', '-ar', '22050', piece], {
          cwd: dir,
          env: { ...process.env, LD_LIBRARY_PATH: dir },
        });

        let voice = new Blob([await readFile(piece)]);
        if (canzone) {
          const form = new FormData();
          form.append('audio', voice, 'pezzo.wav');
          const isolated = await measure({ task: 'voice-isolation', model: 'audio-isolation', meter: credits }, () => upload('/audio-isolation', form));
          voice = new Blob([await isolated.arrayBuffer()]);
        }

        const lyrics = testo?.replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
        const form = new FormData();
        form.append('file', voice, canzone ? 'voce.mp3' : 'pezzo.wav');
        let found: TimedWord[];
        let loss: number | undefined;
        if (lyrics) {
          form.append('text', lyrics);
          const aligned = await measure({ task: 'word-timing', model: 'forced-alignment', meter: credits }, () => upload('/forced-alignment', form));
          const result = (await aligned.json()) as { words: TimedWord[]; loss: number };
          found = result.words;
          loss = result.loss;
        } else {
          form.append('model_id', 'scribe_v1');
          form.append('language_code', lingua);
          form.append('timestamps_granularity', 'word');
          const transcribed = await measure({ task: 'word-timing', model: 'scribe_v1', meter: credits }, () => upload('/speech-to-text', form));
          found = ((await transcribed.json()) as { words: TimedWord[] }).words.filter((item) => item.type === 'word');
        }

        const spoken = found.filter((item) => item.text.trim());
        if (spoken.length === 0) return failure(new Error('nessuna parola trovata in questo pezzo'));
        const captions: Caption[] = spoken.map((item, index) => {
          const startMs = Math.round((item.start + da) * 1000);
          return { text: `${index > 0 ? ' ' : ''}${item.text.trim()}`, startMs, endMs: Math.round((item.end + da) * 1000), timestampMs: startMs, confidence: null };
        });
        await save(file, JSON.stringify(captions, null, 2));
        const first = (captions[0].startMs / 1000).toFixed(2);
        const last = (captions[captions.length - 1].endMs / 1000).toFixed(2);
        const how = lyrics
          ? `allineate al testo (loss ${loss?.toFixed(2)}: più è basso, più il testo coincide con quello che si sente)`
          : `trascritte: "${captions.map((item) => item.text).join('').slice(0, 300)}"`;
        return text(`${captions.length} parole in ${file}, da ${first} a ${last} secondi del brano, ${how}.`);
      } catch (error) {
        return failure(error);
      } finally {
        await rm(work, { recursive: true, force: true });
      }
    },
    { alwaysLoad: true },
  );

  const effect = tool(
    'genera_effetto',
    'Crea un effetto sonoro con ElevenLabs e lo salva in MP3: transizioni, colpi, fruscii, ambienti, rumori di oggetti. ' +
      'Descrivi il suono in inglese e con precisione, es. "soft whoosh transition, airy, short tail".',
    {
      descrizione: z.string().min(3).describe('Il suono, in inglese'),
      secondi: z.number().min(0.5).max(30).optional().describe('Durata in secondi; se manca la sceglie ElevenLabs'),
      loop: z.boolean().optional().describe('true per un suono che si ripete senza stacchi, es. un ambiente di fondo'),
      file: mp3('whoosh.mp3'),
    },
    async ({ descrizione, secondi, loop = false, file }) => {
      try {
        const response = await measure({ task: 'sound-effect', model: 'sound-generation', meter: credits }, () =>
          call('/sound-generation?output_format=mp3_44100_128', {
            body: { text: descrizione, loop, ...(secondi !== undefined && { duration_seconds: secondi }) },
          }),
        );
        await save(file, Buffer.from(await response.arrayBuffer()));
        return text(`Effetto salvato in ${file}`);
      } catch (error) {
        return failure(error);
      }
    },
    { alwaysLoad: true },
  );

  return createSdkMcpServer({ name: 'audio', tools: [voices, voiceOver, words, effect] });
}
