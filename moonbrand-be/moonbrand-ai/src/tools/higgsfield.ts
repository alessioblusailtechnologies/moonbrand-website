import { exec } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';

import type { HookCallback, HookCallbackMatcher, HookEvent, McpHttpServerConfig } from '@anthropic-ai/claude-agent-sdk';

import { reportUsage } from '../lib/usage';

// Higgsfield come server MCP remoto, come in social-app: le clip dei video (Kling, Veo, Seedance e gli altri modelli
// che offre) e i suoi studi. È un MCP pensato per una chat, e qui gira senza nessuno che guardi: due cose vanno
// sistemate. I tool che non generano ma agiscono sul mondo (pubblicare, pagare, eseguire codice) l'agente non li deve
// vedere; e i file tornano come indirizzi che scadono, quindi si scaricano subito nella cartella di lavoro.

const DEFAULT_URL = 'https://mcp.higgsfield.ai/mcp';
const PREFIX = 'mcp__higgsfield__';

// Il token si chiede al loro CLI, che tiene la sessione (`higgsfield auth login` una volta sulla macchina):
// per l'MCP non danno chiavi. HIGGSFIELD_TOKEN, se c'è, lo scavalca. Senza sessione il job va avanti senza Higgsfield.
export async function higgsfieldToken(): Promise<string | null> {
  const { HIGGSFIELD_TOKEN, HIGGSFIELD_CLI } = process.env;
  if (HIGGSFIELD_TOKEN) return HIGGSFIELD_TOKEN;
  try {
    // Nella shell perché su Windows il CLI è un .cmd; il comando viene dal .env, non da chi usa l'app.
    const { stdout } = await promisify(exec)(`${HIGGSFIELD_CLI || 'higgsfield'} auth token`, { timeout: 30_000, windowsHide: true });
    // L'ultima riga senza spazi: i messaggi del CLI ne hanno, un token no.
    return (
      stdout
        .split('\n')
        .map((line) => line.trim())
        .findLast((line) => line.length >= 16 && !/\s/.test(line)) ?? null
    );
  } catch (error) {
    console.error(`Higgsfield senza sessione, si va avanti senza: ${error instanceof Error ? error.message : String(error)}. Rifai \`higgsfield auth login\`.`);
    return null;
  }
}

// Tolti prima che il modello li veda. Il * vale come prefisso; sotto resta comunque il controllo per intenzione.
export const HIGGSFIELD_DENIED = [
  `${PREFIX}tiktok_*`,
  `${PREFIX}website_*`,
  `${PREFIX}create_website`,
  `${PREFIX}deploy_website`,
  `${PREFIX}publish_website`,
  `${PREFIX}rename_website`,
  `${PREFIX}list_websites`,
  `${PREFIX}list_website_categories`,
  `${PREFIX}sandbox_exec`,
  `${PREFIX}scene_builder_3d_run_python`,
  `${PREFIX}scene_builder_3d_query_python`,
  `${PREFIX}apps_invoke`,
  `${PREFIX}apps_search`,
  `${PREFIX}apps_describe`,
  `${PREFIX}confirm_billing_purchase`,
  `${PREFIX}cancel_trial_auto_renewal`,
  `${PREFIX}confirm_trial_cancel`,
  `${PREFIX}reset_balance`,
  `${PREFIX}select_workspace`,
  `${PREFIX}participate_in_contest`,
  `${PREFIX}sync_agents`,
];

// La stessa regola per intenzione: i nomi dei tool cambiano, «pubblica», «paga» ed «esegui» no.
const ACTS = /publish|deploy|billing|purchase|checkout|trial|balance_reset|reset_balance|website|sandbox|secret|repo|python|apps_|contest|tiktok|sync_agents|select_workspace/i;

const guard: HookCallback = async (input) => {
  if (input.hook_event_name !== 'PreToolUse' || !input.tool_name.startsWith(PREFIX)) return {};
  if (!ACTS.test(input.tool_name.slice(PREFIX.length))) return {};
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: 'Con Higgsfield qui si genera soltanto: pubblicare, pagare o eseguire codice non è il tuo compito.',
    },
  };
};

// Sfogliare non è produrre: cronologia, librerie e preset fanno passare file di altri lavori, che non si scaricano.
const BROWSING = /^(show_(?!generation_by_ids)|list_|get_|models_explore|transactions|balance|animation_actions|video_analysis_jobs)/;

const EXTENSIONS = new Set(['mp4', 'mov', 'webm', 'png', 'jpg', 'jpeg', 'webp', 'mp3', 'wav', 'm4a']);
const MAX_BYTES = 1024 ** 3;
const MAX_FILES = 8;

function mediaUrls(response: unknown): string[] {
  let raw: string;
  try {
    raw = typeof response === 'string' ? response : JSON.stringify(response);
  } catch {
    return [];
  }
  const found = new Set<string>();
  for (const match of raw?.matchAll(/https?:\/\/[^\s"'`<>()\\]+/g) ?? []) {
    const url = match[0].replace(/[.,;:]+$/, '');
    if (extensionOf(url)) found.add(url);
  }
  return [...found];
}

function extensionOf(url: string): string | null {
  try {
    const extension = new URL(url).pathname.split('.').pop()?.toLowerCase() ?? '';
    return EXTENSIONS.has(extension) ? extension : null;
  } catch {
    return null;
  }
}

async function download(url: string, target: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`risposta ${response.status}`);
  let size = 0;
  const limit = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      size += chunk.length;
      done(size > MAX_BYTES ? new Error('file troppo grande') : null, chunk);
    },
  });
  await mkdir(path.dirname(target), { recursive: true });
  await pipeline(Readable.fromWeb(response.body), limit, createWriteStream(target)).catch(async (error: unknown) => {
    await rm(target, { force: true });
    throw error;
  });
}

// Dopo ogni tool di Higgsfield che produce file: si scaricano in dir (relativa alla cartella del brand) e a Claude si
// dice il percorso locale, da usare nel progetto video. Un indirizzo già scaricato non si riscarica.
function mirror(brandDir: string, dir: string): HookCallback {
  const saved = new Map<string, string>();
  return async (input) => {
    if (input.hook_event_name !== 'PostToolUse' || !input.tool_name.startsWith(PREFIX)) return {};
    if (BROWSING.test(input.tool_name.slice(PREFIX.length))) return {};
    const urls = mediaUrls(input.tool_response).filter((url) => !saved.has(url));
    const files: string[] = [];
    for (const url of urls.slice(0, MAX_FILES)) {
      const name = path.basename(new URL(url).pathname).replace(/[^A-Za-z0-9._-]/g, '_');
      const file = `${dir}/${Date.now().toString(36)}-${name}`;
      try {
        await download(url, path.join(brandDir, file));
        saved.set(url, file);
        files.push(file);
      } catch (error) {
        console.error(`Higgsfield: non riesco a scaricare ${url}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (files.length === 0) return {};
    return {
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: `I file di Higgsfield sono già scaricati nella cartella del brand:\n${files.join('\n')}\n\nUsa questi file: gli indirizzi qui sopra scadono.`,
      },
    };
  };
}

// I tool che fanno lavorare Higgsfield, e quindi spendono crediti.
const GENERATES = /^(generate_|remove_background|upscale_|outpaint_image|reframe|motion_control|voice_change|dubbing|create_voice|execute_preset)/;

interface Submitted {
  index?: number;
  model?: string;
  status?: string;
  error?: string;
}

// Il risultato di un tool MCP arriva come testo JSON, a volte dentro i blocchi content.
function parsed(response: unknown): Record<string, unknown> | null {
  if (response && typeof response === 'object' && 'content' in response) return parsed(response.content);
  const raw = Array.isArray(response)
    ? (response as { type?: string; text?: string }[]).find((block) => block?.type === 'text')?.text
    : typeof response === 'string'
      ? response
      : JSON.stringify(response);
  try {
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// Una riga di ai_usage per ogni lavoro mandato a Higgsfield, con il modello e com'è andato. Il risultato non dice i
// crediti: quelli si leggono dai movimenti dell'account.
const usage: HookCallback = async (input) => {
  if (input.hook_event_name !== 'PostToolUse' || !input.tool_name.startsWith(PREFIX)) return {};
  const name = input.tool_name.slice(PREFIX.length);
  if (!GENERATES.test(name)) return {};
  const response = parsed(input.tool_response);
  const request = input.tool_input as { params?: { model?: string }; requests?: { index?: number; params?: { model?: string } }[] };
  const modelOf = (job: Submitted) => job.model ?? request.requests?.find((item) => item.index === job.index)?.params?.model ?? request.params?.model ?? name;
  const task = name.startsWith('generate_video') ? 'clip' : name.startsWith('generate_image') ? 'image' : name;
  const jobs = ((response?.jobs ?? response?.results) as Submitted[] | undefined) ?? [{}];
  for (const job of jobs) {
    const error = job.error ?? (job.status === 'submission_failed' || job.status === 'failed' ? job.status : undefined);
    reportUsage({ task, model: modelOf(job), outcome: error ? 'error' : 'ok', ...(error && { error }), durationMs: 0 });
  }
  return {};
};

// Server, tool esclusi e hook per un job: i file generati finiscono in dir, relativa alla cartella del brand.
export function higgsfield(
  token: string,
  brandDir: string,
  dir: string,
): { server: McpHttpServerConfig; disallowedTools: string[]; hooks: Partial<Record<HookEvent, HookCallbackMatcher[]>> } {
  return {
    server: {
      type: 'http',
      url: process.env.HIGGSFIELD_URL || DEFAULT_URL,
      headers: { Authorization: `Bearer ${token}` },
      // Una clip si aspetta in minuti.
      timeout: 600_000,
    },
    disallowedTools: HIGGSFIELD_DENIED,
    hooks: { PreToolUse: [{ hooks: [guard] }], PostToolUse: [{ hooks: [mirror(brandDir, dir), usage] }] },
  };
}
