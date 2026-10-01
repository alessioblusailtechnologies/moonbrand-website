import { ChangeDetectionStrategy, Component, Injectable, inject, signal } from '@angular/core';

interface Toast {
  id: number;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private next = 0;
  readonly toasts = signal<Toast[]>([]);

  show(message: string): void {
    if (!message) return;
    const id = ++this.next;
    this.toasts.update((list) => [...list.slice(-2), { id, message }]);
    setTimeout(() => this.toasts.update((list) => list.filter((toast) => toast.id !== id)), 3600);
  }
}

@Component({
  selector: 'mb-toasts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toasts" aria-live="polite">
      @for (toast of service.toasts(); track toast.id) {
        <div class="toast">{{ toast.message }}</div>
      }
    </div>
  `,
  styles: `
    .toasts {
      position: fixed;
      left: 50%;
      bottom: 24px;
      z-index: 100;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      width: min(480px, calc(100vw - 32px));
      transform: translateX(-50%);
      pointer-events: none;
    }
    .toast {
      padding: 12px 18px;
      border-radius: 14px;
      background: var(--primary);
      color: var(--white);
      font-size: 13px;
      box-shadow: var(--shadow-toast);
      animation: fade-up 200ms var(--ease);
    }
  `,
})
export class Toasts {
  protected readonly service = inject(ToastService);
}
