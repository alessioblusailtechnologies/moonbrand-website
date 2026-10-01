import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import pg from 'pg';

import { toolMedia, toolStep, type AiStep } from '@moonbrand/shared/ai/steps';
import type {
  ChatJobInput,
  ContentEditJobInput,
  ContentJobInput,
  ContentVideoJobInput,
  IdeasJobInput,
  StyleJobInput,
  VisualEditJobInput,
  VisualJobRequest,
  WebsiteJobRequest,
  WelcomeJobInput,
} from '@moonbrand/shared/api/contract';

import { examplesDir } from './lib/examples';
import { createStepReader } from './lib/step-reader';
import { USAGE_MESSAGE, type ToolUsage } from './lib/usage';
import { saveContent } from './results/content';
import { saveIdeas } from './results/ideas';
import { saveWelcome } from './results/welcome';
import { withLogo } from './results/website';

process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BRANDS_DIR = path.resolve(process.env.BRANDS_DIR || path.join(ROOT, '../../moonbrand-brands'));
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY) || 2;
const POLL_MS = 2000;
const LEASE = '5 minutes';
const HEARTBEAT_MS = 60_000;
const MAX_ATTEMPTS = 3;
const FLUSH_MS = 250;
const CANCEL_POLL_MS = 1000;
const STOP_GRACE_MS = 15_000;
// Quanto si aspettano, a job finito, le letture degli step ancora in corso; e l'etichetta se una lettura non arriva.
const READ_GRACE_MS = 3000;
const FALLBACK_STEP = 'Preparo il materiale';

interface Job {
  id: string;
  kind: string;
  input: unknown;
  account_id: string;
  agent_token: string | null;
}

// Ogni tipo di job è uno script autonomo in src/jobs: qui come lanciarlo (env: variabili in più per lo script) e,
// quando il risultato va salvato altrove oltre al job, come salvarlo.
// reply: il job non ha uno schema, il risultato è la risposta finale di Claude.
// finish: completa il risultato prima di salvarlo (per esempio scarica un file che Claude ha indicato).
interface JobKind {
  launch: (input: unknown, job: Job) => { script: string; args: string[]; env?: Record<string, string> };
  finish?: (result: unknown) => Promise<unknown>;
  save?: (job: Job, result: unknown) => Promise<void>;
  reply?: boolean;
}

const JOBS: Record<string, JobKind> = {
  website: { launch: (input) => ({ script: 'src/jobs/website.ts', args: [(input as WebsiteJobRequest).site] }), finish: withLogo },
  visual: {
    launch: (input, job) => {
      const { brandId, brand } = input as VisualJobRequest;
      return { script: 'src/jobs/visual.ts', args: [path.join(BRANDS_DIR, brandId), examplesDir(job.id), JSON.stringify(brand)] };
    },
  },
  'visual-edit': {
    launch: (input) => {
      const { brandId, dir, sessionId, channels, instruction } = input as VisualEditJobInput;
      return { script: 'src/jobs/visual-edit.ts', args: [path.join(BRANDS_DIR, brandId), dir, sessionId, JSON.stringify(channels), instruction] };
    },
  },
  ideas: {
    launch: (input) => {
      const { brandId, ...rest } = input as IdeasJobInput;
      return { script: 'src/jobs/ideas.ts', args: [path.join(BRANDS_DIR, brandId), JSON.stringify(rest)] };
    },
    save: async (job, result) => {
      const saved = await saveIdeas(pool, job.account_id, job.input as IdeasJobInput, result);
      console.log(`[${job.id}] ${saved} idee salvate`);
    },
  },
  content: {
    launch: (input) => {
      const { brandId, ...rest } = input as ContentJobInput;
      return { script: 'src/jobs/content.ts', args: [path.join(BRANDS_DIR, brandId), JSON.stringify(rest)] };
    },
    // Di un video il job content scrive solo il copione.
    save: (job, result) => {
      const input = job.input as ContentJobInput;
      return saveContent(pool, BRANDS_DIR, input, result, input.format === 'video');
    },
  },
  'content-edit': {
    launch: (input) => {
      const { brandId, ...rest } = input as ContentEditJobInput;
      return { script: 'src/jobs/content-edit.ts', args: [path.join(BRANDS_DIR, brandId), JSON.stringify(rest)] };
    },
    save: (job, result) => {
      const input = job.input as ContentEditJobInput;
      return saveContent(pool, BRANDS_DIR, input, result, input.scriptOnly);
    },
  },
  'content-video': {
    launch: (input) => {
      const { brandId, ...rest } = input as ContentVideoJobInput;
      return { script: 'src/jobs/content-video.ts', args: [path.join(BRANDS_DIR, brandId), JSON.stringify(rest)] };
    },
    save: (job, result) => saveContent(pool, BRANDS_DIR, job.input as ContentVideoJobInput, result),
  },
  // Lo stile dai riferimenti va nel brand; se nel frattempo è finito un job style chiesto dopo, vale quello.
  style: {
    launch: (input) => ({ script: 'src/jobs/style.ts', args: [path.join(BRANDS_DIR, (input as StyleJobInput).brandId)] }),
    save: async (job, result) => {
      await pool.query(
        `update presenza.brands set style_guide = $2 where id = $1
           and not exists (
             select 1 from presenza.ai_jobs newer
             where newer.kind = 'style' and newer.input->>'brandId' = $1::text and newer.status = 'done'
               and newer.created_at > (select created_at from presenza.ai_jobs where id = $3)
           )`,
        [(job.input as StyleJobInput).brandId, (result as { style: string }).style, job.id],
      );
    },
  },
  // I saluti e gli spunti della chat per un brand: nel prompt c'è già tutto, quindi niente cartella.
  welcome: {
    launch: (input) => {
      const { brandId: _brand, ...rest } = input as WelcomeJobInput;
      return { script: 'src/jobs/welcome.ts', args: [JSON.stringify(rest)] };
    },
    save: (job, result) => saveWelcome(pool, job.id, job.input as WelcomeJobInput, result),
  },
  // Il token arriva allo script per variabile d'ambiente: i tool della chat lo usano per chiamare l'API.
  chat: {
    launch: (input, job) => {
      const { brandId, ...rest } = input as ChatJobInput;
      return {
        script: 'src/jobs/chat.ts',
        args: [path.join(BRANDS_DIR, brandId), JSON.stringify(rest)],
        env: { MOONBRAND_AGENT_TOKEN: job.agent_token ?? '' },
      };
    },
    reply: true,
  },
};

const url = process.env.DATABASE_URL ?? '';

// Il DB è del worker: gli script dei job (e quindi Claude) non ne ricevono l'indirizzo.
const { DATABASE_URL: _database, ...jobEnv } = process.env;
const local = url.includes('localhost') || url.includes('127.0.0.1');
const pool = new pg.Pool({ connectionString: url, ...(local ? {} : { ssl: { rejectUnauthorized: false } }), max: CONCURRENCY + 2 });

const running = new Map<string, ChildProcess>();
let stopping = false;

async function claim(): Promise<Job | null> {
  await pool.query(
    `update presenza.ai_jobs set status = 'failed', error = 'Interrotto troppe volte.', finished_at = now(), locked_until = null
     where status = 'running' and locked_until < now() and attempts >= $1`,
    [MAX_ATTEMPTS],
  );
  const { rows } = await pool.query<Job>(
    `update presenza.ai_jobs set status = 'running', attempts = attempts + 1, started_at = now(), locked_until = now() + $1::interval
     where id = (
       select id from presenza.ai_jobs
       where status = 'queued' or (status = 'running' and locked_until < now())
       order by created_at
       for update skip locked
       limit 1
     )
     returning id, kind, input, account_id, agent_token`,
    [LEASE],
  );
  return rows[0] ?? null;
}

// I job di cui è stato chiesto lo stop: lo script riceve «stop» sullo stdin e ferma Claude;
// se non si chiude da solo entro STOP_GRACE_MS, si termina il processo.
const cancelled = new Set<string>();

async function watchCancellations(): Promise<void> {
  const ids = [...running.keys()].filter((id) => !cancelled.has(id));
  if (ids.length === 0) return;
  const { rows } = await pool.query<{ id: string }>('select id from presenza.ai_jobs where id = any($1) and cancel_requested', [ids]);
  for (const { id } of rows) {
    const child = running.get(id);
    if (!child) continue;
    cancelled.add(id);
    console.log(`[${id}] stop richiesto`);
    child.stdin?.write('stop\n');
    setTimeout(() => child.exitCode === null && child.kill(), STOP_GRACE_MS).unref();
  }
}

async function run(job: Job): Promise<void> {
  const kind = JOBS[job.kind];
  if (!kind) {
    await finish(job.id, { status: 'failed', error: `Tipo di lavoro sconosciuto: ${job.kind}` });
    return;
  }
  const { script, args, env } = kind.launch(job.input, job);
  console.log(`[${job.id}] ${job.kind} avviato`);

  // hidden: gli step che non si mostrano, perché non dicono niente a chi aspetta o perché Haiku non li ha ancora letti.
  // Restano nella mappa per tenere il loro posto nell'ordine.
  const steps = new Map<string, AiStep>();
  const hidden = new Set<string>();
  const visible = () => [...steps.values()].filter((step) => !hidden.has(step.id));
  const reader = createStepReader(BRANDS_DIR);
  let outcome: { result?: unknown; error?: string; cost?: number } = {};
  // La sessione si sa dal primo messaggio: anche un job fermato a metà si può riprendere.
  let sessionId: string | undefined;

  // Gli step vanno sul DB al massimo ogni FLUSH_MS; saved è l'ultimo salvataggio, da aspettare prima di chiudere il job.
  let flushTimer: NodeJS.Timeout | undefined;
  let saved = Promise.resolve();
  const flush = () => {
    flushTimer = undefined;
    const snapshot = JSON.stringify(visible());
    saved = saved
      .then(() => pool.query('update presenza.ai_jobs set steps = $2::jsonb where id = $1', [job.id, snapshot]))
      .then(() => undefined)
      .catch((error: unknown) => console.error(`[${job.id}] steps non salvati`, error));
  };
  const changed = () => (flushTimer ??= setTimeout(flush, FLUSH_MS));

  // Quando arriva la lettura di Haiku lo step prende la sua etichetta, o resta nascosto; senza lettura prende quella di
  // riserva, se ce l'ha.
  const readStep = (id: string, tool: string, input: unknown, fallback?: string) => {
    hidden.add(id);
    reader.read({ tool, input }, (reading) => {
      const step = steps.get(id);
      const shown = reading === undefined ? fallback && { label: fallback } : reading;
      if (!step || !shown) return;
      steps.set(id, { ...step, label: shown.label, ...(shown.detail && { detail: shown.detail }) });
      hidden.delete(id);
      changed();
    });
  };

  const heartbeat = setInterval(() => {
    void pool.query(`update presenza.ai_jobs set locked_until = now() + $2::interval where id = $1`, [job.id, LEASE]).catch(() => undefined);
  }, HEARTBEAT_MS);

  const child = spawn(process.execPath, ['--import', 'tsx', script, ...args], { cwd: ROOT, env: { ...jobEnv, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.on('error', () => undefined);
  running.set(job.id, child);

  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => (stderr = (stderr + chunk.toString()).slice(-2000)));

  // Un blocco di Claude ha la stessa chiave mentre arriva a pezzi (stream_event) e quando è completo (assistant):
  // l'id del messaggio dell'API e la posizione del blocco nel messaggio. Claude Code manda i blocchi di un messaggio
  // uno alla volta, quindi la posizione si conta per id del messaggio.
  const blockCount = new Map<string, number>();
  let streaming: string | undefined;
  // Quando è finito l'ultimo passaggio: il testo che Claude scrive dopo è durato da lì.
  let lastEventAt = Date.now();

  const lines = createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    let message: SDKMessage;
    try {
      message = JSON.parse(line) as SDKMessage;
    } catch {
      return;
    }
    // Le generazioni dei tool arrivano sulla stessa uscita dei messaggi di Claude.
    if ((message as { type: string }).type === USAGE_MESSAGE) {
      void saveUsage(job, message as unknown as ToolUsage);
      return;
    }
    if ('session_id' in message && message.session_id) sessionId = message.session_id;
    if (message.type === 'stream_event') {
      // Il testo che arriva a pezzi si mostra solo nella chat, dove è la risposta.
      if (message.parent_tool_use_id || !kind.reply) return;
      const { event } = message;
      if (event.type === 'message_start') {
        streaming = event.message.id;
      } else if (event.type === 'content_block_start' && event.content_block.type === 'text' && streaming) {
        const id = `${streaming}-${event.index}`;
        steps.set(id, { id, label: event.content_block.text, status: 'running', kind: 'text', startedAt: Date.now() });
        changed();
      } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta' && streaming) {
        const step = steps.get(`${streaming}-${event.index}`);
        if (step) steps.set(step.id, { ...step, label: step.label + event.delta.text });
        changed();
      }
    } else if (message.type === 'assistant') {
      const messageId = message.message.id;
      const now = Date.now();
      for (const block of message.message.content) {
        const index = blockCount.get(messageId) ?? 0;
        blockCount.set(messageId, index + 1);
        if (block.type === 'text') {
          const id = `${messageId}-${index}`;
          const text = block.text.trim();
          if (!text) {
            steps.delete(id);
            continue;
          }
          steps.set(id, { id, label: text, status: 'done', kind: 'text', startedAt: steps.get(id)?.startedAt ?? lastEventAt, endedAt: now });
          // Fuori dalla chat il testo è Claude che si parla tra un passaggio e l'altro: si mostra come lo legge Haiku.
          if (!kind.reply) readStep(id, 'testo', text);
        } else if (block.type === 'tool_use') {
          const input = block.input as Record<string, unknown>;
          const known = toolStep(block.name, input);
          const label = known?.label ?? FALLBACK_STEP;
          // Immagini e video in arrivo: lo studio mostra i segnaposto nella loro proporzione, e poi il file.
          const media = toolMedia(block.name, input);
          steps.set(block.id, {
            id: block.id,
            label,
            ...(known?.detail && { detail: known.detail }),
            status: 'running',
            kind: 'tool',
            tool: block.name,
            startedAt: now,
            ...(media && { media }),
          });
          if (known === null) hidden.add(block.id);
          else if (known === undefined) readStep(block.id, block.name, input, FALLBACK_STEP);
        }
      }
      lastEventAt = now;
      changed();
    } else if (message.type === 'user' && Array.isArray(message.message.content)) {
      lastEventAt = Date.now();
      for (const block of message.message.content) {
        if (block.type !== 'tool_result') continue;
        const step = steps.get(block.tool_use_id);
        if (step) steps.set(step.id, { ...step, status: block.is_error ? 'failed' : 'done', endedAt: lastEventAt });
      }
      changed();
    } else if (message.type === 'result') {
      outcome = {
        cost: message.total_cost_usd,
        ...(message.subtype === 'success'
          ? { result: kind.reply ? { text: message.result } : message.structured_output }
          : { error: `${message.subtype}: ${message.errors.join('; ')}` }),
      };
    }
  });

  const code = await new Promise<number | null>((resolve) => child.on('close', resolve));
  running.delete(job.id);
  // Le ultime letture di Haiku finiscono negli step del job; se il job è stato fermato non si aspettano.
  await reader.close(stopping || cancelled.has(job.id) ? 0 : READ_GRACE_MS);
  clearInterval(heartbeat);
  clearTimeout(flushTimer);
  await saved;
  const wasCancelled = cancelled.delete(job.id);
  if (stopping) return;

  for (const step of steps.values()) if (step.status === 'running') steps.set(step.id, { ...step, status: 'done', endedAt: Date.now() });
  if (wasCancelled) {
    await finish(job.id, { status: 'stopped', steps: visible(), cost: outcome.cost, sessionId });
    console.log(`[${job.id}] fermato`);
    return;
  }
  let error = outcome.error ?? (outcome.result === undefined ? `Processo terminato (codice ${code}) senza risultato. ${stderr.trim()}` : undefined);
  if (!error && kind.finish) outcome.result = await kind.finish(outcome.result);
  if (!error && kind.save) {
    error = await kind
      .save(job, outcome.result)
      .then(() => undefined)
      .catch((saveError: unknown) => `Risultato non salvato: ${saveError instanceof Error ? saveError.message : String(saveError)}`);
  }
  await finish(job.id, {
    status: error ? 'failed' : 'done',
    result: outcome.result,
    error,
    steps: visible(),
    cost: outcome.cost,
    sessionId,
  });
  console.log(`[${job.id}] ${error ? `fallito: ${error}` : 'completato'}${outcome.cost ? ` ($${outcome.cost.toFixed(4)})` : ''}`);
}

// cost: il costo che riporta Claude Code, cioè il totale della sessione anche quando il job ne riprende una.
async function finish(
  jobId: string,
  fields: { status: 'done' | 'failed' | 'stopped'; result?: unknown; error?: string; steps?: AiStep[]; cost?: number; sessionId?: string },
): Promise<void> {
  const own = fields.cost !== undefined && fields.sessionId ? await ownCost(jobId, fields.sessionId, fields.cost) : fields.cost;
  await pool.query(
    `update presenza.ai_jobs set status = $2, result = $3::jsonb, error = $4, steps = coalesce($5::jsonb, steps),
       cost_usd = $6, session_cost_usd = $7, session_id = $8, finished_at = now(), locked_until = null
     where id = $1`,
    [
      jobId,
      fields.status,
      fields.result === undefined ? null : JSON.stringify(fields.result),
      fields.error ?? null,
      fields.steps ? JSON.stringify(fields.steps) : null,
      own ?? null,
      fields.cost ?? null,
      fields.sessionId ?? null,
    ],
  );
}

async function saveUsage(job: Job, usage: ToolUsage): Promise<void> {
  const brandId = (job.input as { brandId?: string } | null)?.brandId ?? null;
  await pool
    .query(
      `insert into presenza.ai_usage
         (account_id, brand_id, job_id, task, model, outcome, error, duration_ms, cost_usd, input_tokens, output_tokens, units, unit)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        job.account_id,
        brandId,
        job.id,
        usage.task,
        usage.model,
        usage.outcome,
        usage.error ?? null,
        Math.round(usage.durationMs),
        usage.costUsd ?? null,
        usage.inputTokens ?? 0,
        usage.outputTokens ?? 0,
        usage.units ?? null,
        usage.unit ?? null,
      ],
    )
    .catch((error: unknown) => console.error(`[${job.id}] generazione non registrata`, error));
}

// La parte del job: il totale della sessione meno quello del job prima nella stessa sessione. I job salvati prima di
// session_cost_usd hanno quel totale in cost_usd.
async function ownCost(jobId: string, sessionId: string, total: number): Promise<number> {
  const { rows } = await pool.query<{ before: string }>(
    `select coalesce(session_cost_usd, cost_usd) as before from presenza.ai_jobs
     where session_id = $1 and id <> $2 and coalesce(session_cost_usd, cost_usd) is not null
       and created_at < (select created_at from presenza.ai_jobs where id = $2)
     order by created_at desc limit 1`,
    [sessionId, jobId],
  );
  const before = Number(rows[0]?.before ?? 0);
  return total >= before ? total - before : total;
}

async function tick(): Promise<void> {
  while (!stopping && running.size < CONCURRENCY) {
    const job = await claim().catch((error: unknown) => {
      console.error('coda non raggiungibile', error);
      return null;
    });
    if (!job) return;
    void run(job).catch(async (error: unknown) => {
      running.delete(job.id);
      console.error(`[${job.id}] errore del worker`, error);
      await finish(job.id, { status: 'failed', error: String(error) }).catch(() => undefined);
    });
  }
}

const shutdown = async () => {
  stopping = true;
  clearInterval(poller);
  clearInterval(canceller);
  const interrupted = [...running.keys()];
  for (const child of running.values()) child.kill();
  if (interrupted.length > 0) {
    await pool.query(`update presenza.ai_jobs set status = 'queued', locked_until = null where id = any($1)`, [interrupted]);
  }
  await pool.end();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const poller = setInterval(() => void tick(), POLL_MS);
const canceller = setInterval(() => void watchCancellations().catch(() => undefined), CANCEL_POLL_MS);
console.log(`worker pronto: ${CONCURRENCY} lavori in parallelo, tipi: ${Object.keys(JOBS).join(', ')}`);
void tick();
