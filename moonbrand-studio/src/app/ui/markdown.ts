import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ViewEncapsulation,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { marked } from 'marked';

// Il ritardo da recuperare, in secondi: più testo resta indietro, più svelto si svela. Mai sotto MIN_SPEED caratteri al secondo.
const CATCH_UP_S = 0.6;
const MIN_SPEED = 40;

// Il markdown di Claude. Con animate, il testo che arriva a pezzi si svela a ritmo costante invece che a blocchi.
// Senza encapsulation: gli stili devono arrivare all'HTML generato, che Angular non marca.
@Component({
  selector: 'mb-markdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `<div class="mb-md" [innerHTML]="html()"></div>`,
  styles: `
    .mb-md {
      color: var(--text-title);
      font-size: 14px;
      line-height: 1.6;
      overflow-wrap: anywhere;

      :where(p, ul, ol, pre, table, blockquote) {
        margin: 0 0 10px;
      }
      > :last-child {
        margin-bottom: 0;
      }
      :where(h1, h2, h3, h4) {
        margin: 16px 0 8px;
        font-size: 15px;
        font-weight: 700;
      }
      :where(ul, ol) {
        padding-left: 22px;
      }
      li + li {
        margin-top: 4px;
      }
      code {
        padding: 1px 5px;
        border-radius: 6px;
        background: var(--surface-sunken);
        font-size: 13px;
      }
      pre {
        padding: 12px 14px;
        border-radius: var(--radius-md);
        background: var(--surface-sunken);
        overflow-x: auto;

        code {
          padding: 0;
          background: none;
        }
      }
      blockquote {
        padding-left: 12px;
        border-left: 3px solid var(--grey-300);
        color: var(--text-body);
      }
      table {
        border-collapse: collapse;
      }
      :where(th, td) {
        padding: 6px 10px;
        border: 1px solid var(--border-subtle);
        text-align: left;
      }
      hr {
        border: 0;
        border-top: 1px solid var(--border-subtle);
      }
    }
  `,
})
export class Markdown {
  readonly text = input.required<string>();
  readonly animate = input(false);

  private readonly shown = signal(Number.POSITIVE_INFINITY);
  protected readonly html = computed(() => {
    const text = this.text();
    const shown = this.shown();
    return marked.parse(shown >= text.length ? text : text.slice(0, shown), { async: false, gfm: true, breaks: true });
  });

  private started = false;
  private frame = 0;
  private last = 0;

  constructor() {
    // Si decide al primo testo: un blocco già scritto si mostra intero, uno che sta arrivando parte da zero.
    effect(() => {
      const length = this.text().length;
      untracked(() => {
        if (!this.started) {
          this.started = true;
          if (!this.animate()) return;
          this.shown.set(0);
        }
        if (this.shown() < length) this.play();
      });
    });
    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(this.frame));
  }

  private play(): void {
    if (this.frame) return;
    this.last = performance.now();
    const step = (now: number) => {
      const target = this.text().length;
      const backlog = target - this.shown();
      if (backlog <= 0) {
        this.frame = 0;
        return;
      }
      const elapsed = Math.min(100, now - this.last);
      this.last = now;
      const speed = Math.max(MIN_SPEED, backlog / CATCH_UP_S);
      this.shown.update((shown) => Math.min(target, shown + Math.max(1, Math.round((speed * elapsed) / 1000))));
      this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }
}
