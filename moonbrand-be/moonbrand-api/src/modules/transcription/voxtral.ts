import { ApiError } from '../../errors';

// La dettatura nella casella dell'assistente: il browser registra, qui si trascrive con Voxtral di Mistral e il testo
// torna nella casella, da rileggere prima di mandarlo. L'audio passa e non resta.

const ENDPOINT = 'https://api.mistral.ai/v1/audio/transcriptions';
// Una dettatura è breve: un minuto di attesa basta.
const TIMEOUT_MS = 60_000;

export interface Audio {
  bytes: Buffer;
  // Il tipo che scrive il registratore del browser: audio/webm in Chrome, Edge e Firefox, audio/mp4 in Safari.
  type: string;
}

export interface Transcript {
  text: string;
  // I secondi di audio, come li conta Mistral.
  seconds: number | null;
}

// context_bias aiuta a scrivere giusti i nomi del brand, ma Voxtral accetta solo parole singole, fino a 100:
// uno spazio o una virgola in un termine fa rifiutare tutta la richiesta.
export const biasTerms = (terms: readonly string[]): string[] =>
  [...new Set(terms.flatMap((term) => term.split(/[\s,]+/)).filter((term) => term.length > 1 && !/[\s,]/.test(term)))].slice(0, 100);

function call(apiKey: string, model: string, audio: Audio, terms: readonly string[]): Promise<Response> {
  const form = new FormData();
  form.append('model', model);
  form.append('language', 'it');
  const extension = audio.type.includes('mp4') ? 'm4a' : audio.type.includes('ogg') ? 'ogg' : 'webm';
  form.append('file', new Blob([new Uint8Array(audio.bytes)], { type: audio.type }), `dettatura.${extension}`);
  for (const term of terms) form.append('context_bias', term);
  return fetch(ENDPOINT, { method: 'POST', headers: { authorization: `Bearer ${apiKey}` }, body: form, signal: AbortSignal.timeout(TIMEOUT_MS) });
}

function failure(status: number): ApiError {
  const message =
    status === 401 || status === 403
      ? 'La chiave del servizio di trascrizione non è valida.'
      : status === 429
        ? 'Il servizio di trascrizione è al limite: riprova fra qualche secondo.'
        : 'La trascrizione non è riuscita: riprova.';
  return new ApiError(502, 'TRANSCRIPTION_FAILED', message);
}

// Spazi doppi e trattini lunghi via, la maiuscola a inizio frase: il resto è di chi parla.
export function tidy(text: string): string {
  return text
    .replace(/[—–]/g, '-')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
    .replace(/^(\p{Ll})/u, (letter) => letter.toUpperCase())
    .replace(/([.!?]\s+)(\p{Ll})/gu, (_, before: string, letter: string) => before + letter.toUpperCase());
}

export async function transcribe(apiKey: string, model: string, audio: Audio, terms: readonly string[]): Promise<Transcript> {
  let response = await call(apiKey, model, audio, terms);
  // Se i termini non passano si riprova senza: meglio una trascrizione senza aiuto che nessuna.
  if (!response.ok && response.status >= 400 && response.status < 500 && terms.length > 0) {
    const detail = await response.text().catch(() => '');
    if (!/context.?bias/i.test(detail)) throw failure(response.status);
    response = await call(apiKey, model, audio, []);
  }
  if (!response.ok) throw failure(response.status);
  const body = (await response.json()) as { text?: unknown; usage?: { prompt_audio_seconds?: unknown } };
  const seconds = body.usage?.prompt_audio_seconds;
  return { text: tidy(typeof body.text === 'string' ? body.text : ''), seconds: typeof seconds === 'number' ? seconds : null };
}
