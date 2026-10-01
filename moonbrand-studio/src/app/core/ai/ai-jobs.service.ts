import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { OnAiSteps, WebsiteInsights } from '@moonbrand/shared/ai/steps';
import type {
  AiJob,
  AiJobCreated,
  VisualEditJobRequest,
  VisualExampleFile,
  VisualJobRequest,
  VisualReading,
  WebsiteJobRequest,
  WebsiteReading,
} from '@moonbrand/shared/api/contract';
import type { Palette } from '@moonbrand/shared/domain/brand';
import { normalizeSite } from '@moonbrand/shared/lib/site';

import { LOGO_SIDE, resizedDataUri } from '../images';

const POLL_MS = 1000;
// La rete può mancare per un po', per esempio al rientro nel browser del telefono: si riprova con attese crescenti
// fino a MAX_WAIT_MS tra un tentativo e l'altro, per MAX_FAILURES volte di fila (qualche minuto).
const MAX_WAIT_MS = 10_000;
const MAX_FAILURES = 30;

const transient = (error: unknown) => error instanceof HttpErrorResponse && (error.status === 0 || error.status >= 502);

// Un lavoro fermato da chi l'aveva chiesto.
export class StoppedJobError extends Error {}

@Injectable({ providedIn: 'root' })
export class AiJobsService {
  private readonly http = inject(HttpClient);

  async readWebsite(site: string, onSteps?: OnAiSteps): Promise<WebsiteInsights> {
    const host = normalizeSite(site);
    const reading = await this.run<WebsiteReading>('/v1/ai/website', { site } satisfies WebsiteJobRequest, onSteps);
    return {
      site: host,
      name: reading.name,
      sector: reading.sector,
      summary: reading.summary,
      pitch: reading.pitch,
      themes: reading.themes,
      goals: reading.goals,
      audiences: reading.audiences,
      palette: { id: `site-${host}`, name: 'Dal sito', colors: reading.colors as Palette['colors'], origin: 'site' },
      logoUri: reading.logo ? await siteLogo(reading.logo) : null,
    };
  }

  // Gli esempi si mettono in coda e poi si seguono a parte: chi li chiede tiene l'id, per riprenderli dopo un ricaricamento
  // e perché una modifica successiva riprende la sessione del job.
  async queueExamples(request: VisualJobRequest): Promise<string> {
    return (await firstValueFrom(this.http.post<AiJobCreated>('/v1/ai/visual', request))).id;
  }

  async queueExamplesEdit(request: VisualEditJobRequest): Promise<string> {
    return (await firstValueFrom(this.http.post<AiJobCreated>('/v1/ai/visual/edit', request))).id;
  }

  async followExamples(jobId: string, onSteps?: OnAiSteps): Promise<VisualExampleFile[]> {
    return (await this.follow<VisualReading>(jobId, onSteps)).examples;
  }

  private async run<Result>(url: string, body: unknown, onSteps?: OnAiSteps): Promise<Result> {
    return (await this.runJob<Result>(url, body, onSteps)).result;
  }

  private async runJob<Result>(url: string, body: unknown, onSteps?: OnAiSteps): Promise<{ id: string; result: Result }> {
    const { id } = await firstValueFrom(this.http.post<AiJobCreated>(url, body));
    return { id, result: await this.follow<Result>(id, onSteps) };
  }

  // Segue un lavoro già in coda fino al risultato, passando gli step man mano; pollMs più basso per le risposte che si leggono mentre arrivano.
  async follow<Result>(jobId: string, onSteps?: OnAiSteps, pollMs = POLL_MS): Promise<Result> {
    let failures = 0;
    for (;;) {
      let job: AiJob<Result>;
      try {
        job = await firstValueFrom(this.http.get<AiJob<Result>>(`/v1/ai/jobs/${jobId}`));
        failures = 0;
      } catch (error) {
        if (!transient(error) || ++failures > MAX_FAILURES) throw error;
        await new Promise((resolve) => setTimeout(resolve, Math.min(pollMs * 2 ** failures, MAX_WAIT_MS)));
        continue;
      }
      onSteps?.(job.steps);
      if (job.status === 'done' && job.result) return job.result;
      if (job.status === 'stopped') throw new StoppedJobError('Fermato.');
      if (job.status === 'failed' || job.status === 'done') throw new Error(job.error ?? 'Lavoro AI senza risultato.');
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  }
}

// Il logo del sito come quello caricato a mano: un PNG di al massimo LOGO_SIDE pixel. Se non si riesce a leggerlo, niente logo.
async function siteLogo(dataUri: string): Promise<string | null> {
  try {
    const blob = await (await fetch(dataUri)).blob();
    return await resizedDataUri(new File([blob], 'logo', { type: blob.type }), LOGO_SIDE, 'image/png');
  } catch {
    return null;
  }
}
