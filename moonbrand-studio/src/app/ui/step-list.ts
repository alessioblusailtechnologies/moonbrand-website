import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';

import type { AiStep } from '@moonbrand/shared/ai/steps';

import { Icon } from './icon';

// I passaggi di un lavoro dell'AI, in un accordion: chiuso dice cosa sta facendo, aperto li mostra tutti.
// Il tempo è di tutto il lavoro e di ogni passaggio.
@Component({
  selector: 'mb-step-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <button class="head" type="button" [attr.aria-expanded]="open()" (click)="open.set(!open())">
      <span class="mark" [class.done]="!active()">
        @if (active()) {
          <span class="spinner"></span>
        } @else {
          <mb-icon name="check" [size]="12" [stroke]="3" />
        }
      </span>
      <span class="strong-sm title">{{ title() }}</span>
      @if (total(); as time) {
        <span class="caption time">{{ time }}</span>
      }
      <mb-icon class="chevron" name="chevron-down" [size]="16" />
    </button>
    @if (open()) {
      <ol class="steps">
        @for (step of steps(); track step.id) {
          <li class="step" [class]="step.status">
            <span class="mark">
              @if (step.status === 'running') {
                <span class="spinner"></span>
              } @else {
                <mb-icon name="check" [size]="12" [stroke]="3" />
              }
            </span>
            <span class="texts">
              <span class="strong-sm" [attr.title]="step.label">{{ step.label }}</span>
              @if (step.detail) {
                <span class="caption" [attr.title]="step.detail">{{ step.detail }}</span>
              }
            </span>
            @if (stepTime(step); as time) {
              <span class="caption time">{{ time }}</span>
            }
          </li>
        }
        @if (active() && !current()) {
          <li class="step running">
            <span class="mark"><span class="spinner"></span></span>
            <span class="texts"><span class="strong-sm">{{ steps().length === 0 ? waiting() : 'Ci penso' }}</span></span>
          </li>
        }
      </ol>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-width: 0;
    }
    .head {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 0;
      border: 0;
      background: none;
      color: var(--text-title);
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .title {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .chevron {
      color: var(--text-body);
      transition: transform 160ms var(--ease);
    }
    .head[aria-expanded='true'] .chevron {
      transform: rotate(180deg);
    }
    .time {
      flex: none;
      margin-left: auto;
      font-variant-numeric: tabular-nums;
    }
    .steps {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin: 0;
      padding: 0;
      list-style: none;
      animation: fade-in 160ms var(--ease);
    }
    .step {
      display: flex;
      align-items: flex-start;
      gap: 10px;
    }
    .mark {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: none;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      color: var(--primary);
    }
    .mark.done,
    .done .mark {
      background: var(--mint-400);
      color: var(--white);
    }
    // Un passaggio non riuscito non è un errore per chi aspetta: il lavoro va avanti, lo si segna in verde chiaro.
    .failed .mark {
      background: color-mix(in srgb, var(--mint-400) 30%, var(--white));
      color: color-mix(in srgb, var(--mint-400) 75%, var(--ink));
    }
    .spinner {
      width: 14px;
      height: 14px;
    }
    .texts {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 1px;
      min-width: 0;
    }
    // Una riga per etichetta e dettaglio: quello che non ci sta finisce con i puntini e si legge intero passandoci sopra.
    .texts > span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .done .strong-sm,
    .failed .strong-sm {
      color: var(--text-body);
    }
  `,
})
export class StepList {
  readonly steps = input.required<AiStep[]>();
  readonly waiting = input('Ci penso');
  // Se il lavoro è ancora in corso; senza, lo è finché la lista si vede (come mentre si preparano le idee).
  readonly live = input<boolean>();

  protected readonly open = signal(false);
  protected readonly now = signal(Date.now());
  protected readonly active = computed(() => this.live() ?? true);
  protected readonly current = computed(() => this.steps().find((step) => step.status === 'running'));
  // Chiuso, dice cosa sta facendo; finito, quanti passaggi ha fatto.
  protected readonly title = computed(() => {
    if (this.active()) return this.current()?.label ?? (this.steps().length === 0 ? this.waiting() : 'Ci penso');
    const count = this.steps().length;
    return count === 1 ? '1 passaggio' : `${count} passaggi`;
  });

  private readonly mountedAt = Date.now();
  // Gli orari degli step sono del server: si portano sull'orologio di chi guarda aggiungendo offset. Lo si stima per
  // eccesso (quando uno step si vede, sul server il suo ultimo orario è già passato) e può solo scendere: così i
  // contatori non tornano mai indietro e la durata finale di un passaggio non è mai sotto quella contata.
  private offset = Infinity;
  // Gli step senza orari (quelli salvati prima) si cronometrano da quando si vedono correre qui.
  private readonly seen = new Map<string, { start?: number; end?: number }>();
  // L'ultimo totale contato dal vivo: a lavoro finito resta quello, senza scatti.
  private counted: number | null = null;

  private readonly spans = computed(() => {
    const at = Date.now();
    const steps = this.steps();
    const stamps = steps.flatMap((step) => [step.startedAt, step.endedAt].filter((time): time is number => time !== undefined));
    if (stamps.length > 0) this.offset = Math.min(this.offset, at - Math.max(...stamps));
    return new Map(
      steps.map((step) => {
        const seen = this.seen.get(step.id) ?? { start: step.status === 'running' ? at : undefined };
        if (step.status !== 'running' && seen.start !== undefined) seen.end ??= at;
        this.seen.set(step.id, seen);
        const start = step.startedAt !== undefined ? step.startedAt + this.offset : seen.start;
        const end = step.endedAt !== undefined ? step.endedAt + this.offset : seen.end;
        return [step.id, { start, end }];
      }),
    );
  });

  // Dal vivo: da quando si aspetta (o dal primo passaggio, se è partito prima) a adesso, e non scende mai.
  // Di un lavoro già finito quando lo si apre: dal primo passaggio alla fine dell'ultimo.
  protected readonly total = computed(() => {
    const spans = [...this.spans().values()];
    const starts = spans.flatMap((span) => (span.start === undefined ? [] : [span.start]));
    if (this.active()) {
      this.counted = Math.max(this.counted ?? 0, this.now() - Math.min(this.mountedAt, ...starts));
      return elapsed(this.counted);
    }
    if (this.counted !== null) return elapsed(this.counted);
    const ends = spans.flatMap((span) => (span.end === undefined ? [] : [span.end]));
    return starts.length > 0 && ends.length > 0 ? elapsed(Math.max(...ends) - Math.min(...starts)) : null;
  });

  constructor() {
    effect((onCleanup) => {
      if (!this.active()) return;
      this.now.set(Date.now());
      const timer = setInterval(() => this.now.set(Date.now()), 1000);
      onCleanup(() => clearInterval(timer));
    });
  }

  // Il passaggio in corso conta i secondi; di quelli finiti si dice quanto sono durati.
  protected stepTime(step: AiStep): string | null {
    const span = this.spans().get(step.id);
    if (span?.start === undefined) return null;
    const end = step.status === 'running' ? Math.max(this.now(), span.start) : span.end;
    return end === undefined ? null : elapsed(end - span.start);
  }
}

function elapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
}
