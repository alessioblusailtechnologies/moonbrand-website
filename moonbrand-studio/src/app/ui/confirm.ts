import { ChangeDetectionStrategy, Component, ElementRef, Injectable, afterRenderEffect, inject, signal, viewChild } from '@angular/core';

import { lockPageScroll } from './scroll-lock';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
}

interface OpenConfirm extends ConfirmOptions {
  resolve: (confirmed: boolean) => void;
}

// Chiudere senza scegliere (Esc, click fuori) vale come annulla: l'azione
// distruttiva va sempre sul pulsante di conferma.
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly current = signal<OpenConfirm | null>(null);

  ask(options: ConfirmOptions): Promise<boolean> {
    this.current()?.resolve(false);
    return new Promise((resolve) => this.current.set({ ...options, resolve }));
  }

  close(confirmed: boolean): void {
    const open = this.current();
    if (!open) return;
    this.current.set(null);
    open.resolve(confirmed);
  }
}

@Component({
  selector: 'mb-confirm',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'service.close(false)' },
  template: `
    @if (service.current(); as open) {
      <div class="backdrop" (click)="service.close(false)"></div>
      <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title"
        [attr.aria-describedby]="open.message ? 'confirm-message' : null">
        <h2 id="confirm-title" class="dialog-title">{{ open.title }}</h2>
        @if (open.message) {
          <p id="confirm-message" class="body">{{ open.message }}</p>
        }
        <div class="actions">
          <button #cancel class="btn btn-secondary" type="button" (click)="service.close(false)">
            {{ open.cancelLabel ?? 'Annulla' }}
          </button>
          <button class="btn" type="button" [class.btn-primary]="open.tone !== 'danger'" [class.btn-accent]="open.tone === 'danger'"
            (click)="service.close(true)">
            {{ open.confirmLabel ?? 'Conferma' }}
          </button>
        </div>
      </div>
    }
  `,
  styles: `
    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 90;
      background: var(--scrim);
      animation: fade-in 160ms var(--ease);
    }
    .dialog {
      position: fixed;
      top: 50%;
      left: 50%;
      z-index: 91;
      display: flex;
      flex-direction: column;
      gap: 10px;
      width: min(420px, calc(100vw - 32px));
      padding: 24px;
      border-radius: var(--radius-lg);
      background: var(--surface-card);
      box-shadow: var(--shadow-menu);
      transform: translate(-50%, -50%);
      animation: dialog-in 180ms var(--ease);
    }
    .dialog-title {
      margin: 0;
      color: var(--text-title);
      font-size: 17px;
      font-weight: 600;
    }
    .body {
      margin: 0;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 14px;
    }
    @media (max-width: 480px) {
      .actions {
        flex-direction: column-reverse;
      }
    }
  `,
})
export class Confirm {
  protected readonly service = inject(ConfirmService);
  private readonly cancel = viewChild<ElementRef<HTMLButtonElement>>('cancel');

  constructor() {
    afterRenderEffect(() => this.cancel()?.nativeElement.focus());
    lockPageScroll(() => this.service.current() !== null);
  }
}
