// Le generazioni dei tool (immagini, voce, effetti, musica, clip) finiscono in ai_usage con il job che le ha chieste.
// Lo script del job non ha il DB: le scrive sullo stdout, una riga JSON accanto ai messaggi di Claude, e le salva il worker.

export const USAGE_MESSAGE = 'moonbrand_usage';

// units e unit: quello che il servizio ha contato (crediti, caratteri, token); costUsd solo quando il servizio lo dice.
export interface ToolUsage {
  task: string;
  model: string;
  outcome: 'ok' | 'error';
  error?: string;
  durationMs: number;
  units?: number;
  unit?: string;
  costUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export function reportUsage(usage: ToolUsage): void {
  process.stdout.write(`${JSON.stringify({ type: USAGE_MESSAGE, ...usage })}\n`);
}

// Il consumo dell'account di un servizio, letto prima e dopo la generazione: la differenza è quello che è costata.
// Due job in parallelo sullo stesso servizio si sommano: è una misura, non una fattura.
export interface Meter {
  unit: string;
  read: () => Promise<number>;
}

// Esegue una generazione e la registra, anche se fallisce. extra: quello che si sa solo dal risultato (i token).
export async function measure<T>(
  usage: { task: string; model: string; meter?: Meter; extra?: (result: T) => Partial<ToolUsage> },
  run: () => Promise<T>,
): Promise<T> {
  const reading = () => usage.meter?.read().catch(() => undefined) ?? Promise.resolve(undefined);
  const before = await reading();
  const start = Date.now();
  const spent = async () => {
    const after = before === undefined ? undefined : await reading();
    return after === undefined || before === undefined ? {} : { units: after - before, unit: usage.meter!.unit };
  };
  try {
    const result = await run();
    reportUsage({ task: usage.task, model: usage.model, outcome: 'ok', durationMs: Date.now() - start, ...(await spent()), ...usage.extra?.(result) });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    reportUsage({ task: usage.task, model: usage.model, outcome: 'error', error: message, durationMs: Date.now() - start, ...(await spent()) });
    throw error;
  }
}
