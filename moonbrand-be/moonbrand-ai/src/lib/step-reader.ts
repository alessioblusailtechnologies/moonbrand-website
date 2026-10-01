import { query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';

// Gli step che la tabella di moonbrand-shared non sa tradurre (Bash, Read, i tool nuovi, il testo che Claude si scrive
// tra un passaggio e l'altro) li legge Haiku, sullo stesso login di Claude Code. Una sessione per job: il contesto ha
// solo i passaggi di quel job, e il processo parte con il job, così alla prima richiesta è già pronto. Le richieste
// che arrivano mentre Haiku risponde partono tutte insieme alla volta dopo.

// null: lo step non dice niente a chi aspetta e non si mostra.
export type StepReading = { label: string; detail?: string } | null;

export interface StepRequest {
  tool: string;
  input: unknown;
}

export interface StepReader {
  // onRead riceve undefined se Haiku non c'è o risponde male: allora chi chiede usa la sua etichetta di riserva.
  // Dopo close non arriva più niente.
  read(request: StepRequest, onRead: (reading: StepReading | undefined) => void): void;
  // Aspetta al massimo graceMs le letture in corso, poi chiude la sessione.
  close(graceMs: number): Promise<void>;
}

const MAX_STRING = 200;
const MAX_INPUT = 600;
const MAX_LABEL = 60;
const MAX_DETAIL = 60;
const CACHE_SIZE = 500;
// Se nella risposta resta qualcosa di tecnico (percorsi, file, nomi di tool, misure, id) la lettura si butta.
const TECHNICAL =
  /[\\/]|\.(md|json|ts|js|mjs|tsx|html|css|png|jpe?g|webp|mp4|mp3|wav|txt|sh)\b|mcp__|_[a-z]|\d+x\d+|\w-\d|\b[a-f0-9]{8,}\b|\b(bash|grep|glob|npm|npx|node|curl|ffmpeg|remotion|json|tool)\b/i;

const PROMPT = `Traduci i passaggi di un agente che prepara i social di un brand in righe per il cliente, che le vede scorrere mentre aspetta.

Ti arriva un array JSON di passaggi: id, tool (lo strumento usato; "testo" è quello che l'agente si scrive tra un passaggio e l'altro) e input.
Rispondi solo con un array JSON, un oggetto per ogni id, senza altro testo: {"id": "...", "label": "...", "detail": "..."} oppure {"id": "...", "hide": true}.

- label: cosa sta facendo, in prima persona singolare, al presente, al massimo 7 parole, senza punto finale. Per esempio: «Rileggo la voce del brand», «Guardo le foto che mi hai mandato», «Cerco i colori nel codice del sito», «Ripasso come si scrive un carosello», «Monto il video», «Controllo le immagini finali».
- detail: quasi sempre assente. Solo se aggiunge qualcosa che il cliente capisce (il nome di una pagina, cosa sta cercando, quante slide), al massimo 60 caratteri; mai sigle, codici, formati, misure o nomi di file.
- Mai percorsi, nomi di file, estensioni, comandi, codice, nomi di strumenti, di modelli o di servizi, termini tecnici inglesi.
- hide: true per i passaggi che al cliente non dicono niente: creare cartelle, installare, controllare che un file ci sia, organizzarsi il lavoro, riprovare la stessa cosa, e il testo che non dice cosa sta per fare (saluti, resoconti, conferme).
- Per il testo dell'agente la label è quello che sta per fare, detto in breve («Scrivo il post»).
- I passaggi arrivano in ordine: usa quelli già visti per capire il filo. Se un passaggio continua lo stesso lavoro del precedente con la stessa label, hide.
- Non inventare: se non si capisce cosa fa, «Preparo il materiale».`;

// Le letture valgono per tutti i job: la chiave è il passaggio stesso, con i percorsi già senza la cartella del brand.
const cache = new Map<string, StepReading>();

function remember(key: string, reading: StepReading): void {
  cache.set(key, reading);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
}

function clean(text: unknown, max: number): string | undefined {
  if (typeof text !== 'string') return undefined;
  const value = text.replace(/\s+/g, ' ').trim().replace(/\.$/, '');
  return value && value.length <= max && !TECHNICAL.test(value) ? value : undefined;
}

function readingOf(item: { hide?: unknown; label?: unknown; detail?: unknown }): StepReading | undefined {
  if (item.hide === true) return null;
  const label = clean(item.label, MAX_LABEL);
  if (!label) return undefined;
  const detail = clean(item.detail, MAX_DETAIL);
  return { label, ...(detail && { detail }) };
}

// brandsDir: la cartella dei brand, che con l'id del brand si toglie dai percorsi prima di mandarli a Haiku.
export function createStepReader(brandsDir: string): StepReader {
  const root = brandsDir.replaceAll('\\', '/').replace(/\/+$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const brandDir = new RegExp(`${root}/[^/]+/?`, 'gi');
  // L'input accorciato: di un file scritto basta l'inizio, di un comando la prima parte.
  const shortInput = (input: unknown): string =>
    (
      JSON.stringify(input, (_key, value: unknown) => {
        if (typeof value !== 'string') return value;
        const plain = value.replaceAll('\\', '/').replace(brandDir, '');
        return plain.length > MAX_STRING ? `${plain.slice(0, MAX_STRING)}…` : plain;
      }) ?? ''
    ).slice(0, MAX_INPUT);

  type Pending = { id: string; key: string; request: StepRequest; onRead: (reading: StepReading | undefined) => void };
  let queued: Pending[] = [];
  let sent: Pending[] = [];
  let counter = 0;
  let closed = false;
  let failed = false;
  // wake: è arrivata una richiesta; answered: Haiku ha risposto; idle: non c'è più niente in corso.
  let wake: (() => void) | undefined;
  let answered: (() => void) | undefined;
  let idle: (() => void) | undefined;
  const abort = new AbortController();

  // Il prompt della sessione: un messaggio per ogni gruppo di richieste, il successivo solo dopo la risposta.
  async function* messages(): AsyncGenerator<SDKUserMessage> {
    while (!closed) {
      if (queued.length === 0) {
        idle?.();
        await new Promise<void>((resolve) => (wake = resolve));
        continue;
      }
      sent = queued;
      queued = [];
      const content = JSON.stringify(sent.map(({ id, request }) => ({ id, tool: request.tool, input: shortInput(request.input) })));
      yield { type: 'user', message: { role: 'user', content }, parent_tool_use_id: null };
      await new Promise<void>((resolve) => (answered = resolve));
    }
  }

  function answer(text: string): void {
    let items: unknown;
    try {
      items = JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1));
    } catch {
      items = [];
    }
    const byId = new Map<string, Record<string, unknown>>(Array.isArray(items) ? items.map((item: Record<string, unknown>) => [String(item?.id), item]) : []);
    for (const { id, key, onRead } of sent) {
      const item = byId.get(id);
      const reading = item && typeof item === 'object' ? readingOf(item) : undefined;
      if (reading !== undefined) remember(key, reading);
      onRead(reading);
    }
    sent = [];
    answered?.();
  }

  void (async () => {
    try {
      for await (const message of query({
        prompt: messages(),
        options: {
          model: 'haiku',
          tools: [],
          systemPrompt: PROMPT,
          settingSources: [],
          persistSession: false,
          thinking: { type: 'disabled' },
          abortController: abort,
        },
      })) {
        if (message.type === 'result') answer(message.subtype === 'success' ? message.result : '');
      }
    } catch (error) {
      if (!abort.signal.aborted) console.error('Lettura degli step interrotta', error);
    } finally {
      // Se la sessione cade prima di close, le richieste in sospeso e quelle dopo restano senza lettura.
      failed = !abort.signal.aborted;
      closed = true;
      const pending = [...sent, ...queued];
      queued = [];
      sent = [];
      if (failed) for (const { onRead } of pending) onRead(undefined);
      idle?.();
    }
  })();

  return {
    read(request, onRead) {
      const key = `${request.tool} ${shortInput(request.input)}`;
      const known = cache.get(key);
      if (known !== undefined) {
        onRead(known);
        return;
      }
      if (closed) {
        if (failed) onRead(undefined);
        return;
      }
      queued.push({ id: String(++counter), key, request, onRead });
      wake?.();
    },
    async close(graceMs) {
      if (!closed && (queued.length > 0 || sent.length > 0)) {
        await Promise.race([new Promise<void>((resolve) => (idle = resolve)), new Promise((resolve) => setTimeout(resolve, graceMs))]);
      }
      closed = true;
      wake?.();
      answered?.();
      abort.abort();
    },
  };
}
