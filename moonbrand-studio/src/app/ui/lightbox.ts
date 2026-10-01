import { ChangeDetectionStrategy, Component, Injectable, computed, inject, signal } from '@angular/core';

import { Icon } from './icon';
import { lockPageScroll } from './scroll-lock';

export interface LightboxImage {
  url: string;
  alt: string;
  caption?: string;
}

@Injectable({ providedIn: 'root' })
export class LightboxService {
  readonly images = signal<LightboxImage[]>([]);
  readonly index = signal(0);

  open(images: LightboxImage[], index = 0): void {
    if (images.length === 0) return;
    this.images.set(images);
    this.index.set(Math.max(0, Math.min(index, images.length - 1)));
  }

  close(): void {
    this.images.set([]);
  }

  move(step: number): void {
    const count = this.images().length;
    if (count > 1) this.index.update((index) => (index + step + count) % count);
  }
}

@Component({
  selector: 'mb-lightbox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  host: {
    '(document:keydown.escape)': 'service.close()',
    '(document:keydown.arrowleft)': 'service.move(-1)',
    '(document:keydown.arrowright)': 'service.move(1)',
  },
  template: `
    @if (current(); as image) {
      <div class="backdrop" (click)="service.close()"></div>
      <div class="viewer" role="dialog" aria-modal="true" aria-label="Immagine ingrandita">
        <button class="icon-btn close" type="button" aria-label="Chiudi" (click)="service.close()">
          <mb-icon name="x" />
        </button>
        @if (count() > 1) {
          <button class="icon-btn nav prev" type="button" aria-label="Immagine precedente" (click)="service.move(-1)">
            <mb-icon name="chevron-left" />
          </button>
          <button class="icon-btn nav next" type="button" aria-label="Immagine successiva" (click)="service.move(1)">
            <mb-icon name="chevron-right" />
          </button>
        }
        <figure class="frame">
          <img [src]="image.url" [alt]="image.alt" />
          @if (image.caption || count() > 1) {
            <figcaption>
              @if (count() > 1) {
                <span class="counter">{{ service.index() + 1 }} / {{ count() }}</span>
              }
              @if (image.caption) {
                <span class="text">{{ image.caption }}</span>
              }
            </figcaption>
          }
        </figure>
      </div>
    }
  `,
  styles: `
    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 80;
      background: rgba(0, 0, 0, 0.86);
      animation: fade-in 160ms var(--ease);
    }
    .viewer {
      position: fixed;
      inset: 0;
      z-index: 81;
      display: grid;
      place-items: center;
      padding: 56px 72px;
      pointer-events: none;
    }
    .frame {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      max-width: 100%;
      max-height: 100%;
      margin: 0;
      pointer-events: auto;
      animation: fade-in 160ms var(--ease);
    }
    img {
      max-width: min(1100px, 100%);
      max-height: 64vh;
      border-radius: var(--radius-md);
      object-fit: contain;
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.4);
    }
    figcaption {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      max-width: 640px;
      color: rgba(255, 255, 255, 0.86);
      font-size: 13px;
      text-align: center;
      white-space: pre-line;
    }
    .text {
      max-height: 20vh;
      overflow-y: auto;
      padding-right: 4px;
      text-align: left;
    }
    .counter {
      color: rgba(255, 255, 255, 0.6);
      font-size: 12px;
    }
    .icon-btn {
      position: absolute;
      pointer-events: auto;
      background: rgba(255, 255, 255, 0.92);
      color: var(--primary);
    }
    .icon-btn:hover {
      background: var(--white);
    }
    .close {
      top: 16px;
      right: 16px;
    }
    .nav {
      top: 50%;
      transform: translateY(-50%);
    }
    .prev {
      left: 16px;
    }
    .next {
      right: 16px;
    }
    @media (max-width: 640px) {
      .viewer {
        padding: 64px 12px;
      }
      .nav {
        top: auto;
        bottom: 16px;
        transform: none;
      }
    }
  `,
})
export class Lightbox {
  protected readonly service = inject(LightboxService);
  protected readonly count = computed(() => this.service.images().length);
  protected readonly current = computed(() => this.service.images()[this.service.index()] ?? null);

  constructor() {
    lockPageScroll(() => this.current() !== null);
  }
}
