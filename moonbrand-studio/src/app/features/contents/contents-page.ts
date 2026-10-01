import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type ElementRef,
  type TemplateRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { Icon } from '../../ui/icon';

import type { ContentSummary } from '@moonbrand/shared/api/contract';
import { channelName } from '@moonbrand/shared/domain/catalog';
import { formatWeekdayShort } from '@moonbrand/shared/lib/dates';

import { BrandsService } from '../../core/brands/brands.service';
import { ContentsService } from '../../core/contents/contents.service';
import { errorMessage } from '../../core/errors';
import { pageHeader } from '../../core/layout/page-header';
import { ToastService } from '../../ui/toast';
import { cssAspect, FORMAT_LABELS, STATUS_LABELS } from './labels';

// Mentre un contenuto si prepara, l'elenco si aggiorna da solo.
const REFRESH_MS = 5000;

// La griglia masonry: colonne di almeno COLUMN_MIN px; ogni card va nella colonna più corta, così le copertine
// restano intere in ogni proporzione (un Reel 9:16 accanto a un post 4:5) e l'ordine si legge per righe.
const COLUMN_MIN = 240;
const GAP = 16;
// L'altezza della card oltre la copertina (badge, titolo, canali), in proporzione alla larghezza: basta per scegliere la colonna.
const CARD_TEXT = 0.55;

function aspectRatio(aspect: string | null): number {
  const [width, height] = (aspect ?? '4:5').split(':').map(Number);
  return width > 0 && height > 0 ? height / width : 1.25;
}

@Component({
  selector: 'mb-contents-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon],
  template: `
    @if (brands.activeBrand()) {
      <section class="contents">
        @if (loading()) {
          <div class="empty"><span class="spinner"></span></div>
        } @else if (contents().length === 0) {
          <div class="empty">
            <p class="strong-sm">Ancora nessun contenuto</p>
            <p class="caption">Parti da un’idea: scegli formato e canali, e preparo testo e immagini.</p>
          </div>
        } @else {
          <div class="grid" #grid>
            @for (column of columns(); track $index) {
              <div class="column">
                @for (content of column; track content.id) {
                  <a class="panel card" [routerLink]="['/contenuti', content.id]">
                    <div class="cover" [style.aspect-ratio]="cssAspect(content.coverAspect ?? '4:5')">
                      @if (content.coverUrl) {
                        <img [src]="content.coverUrl" alt="" loading="lazy" />
                        @if (content.format === 'video') {
                          <span class="play"><mb-icon name="play" [size]="18" /></span>
                        }
                      } @else if (content.format === 'video') {
                        <span class="caption">{{ content.preparing ? 'Preparo il video…' : 'Video ancora da fare' }}</span>
                      } @else {
                        <span class="caption">{{ content.preparing ? 'Preparo testo e immagini…' : 'Senza immagine' }}</span>
                      }
                    </div>
                    <div class="meta">
                      <span class="badge">{{ formatLabel(content) }}</span>
                      @if (content.preparing) {
                        <span class="badge">In preparazione</span>
                      } @else {
                        <span class="badge" [class.mint]="content.status === 'approved'">{{ statusLabel(content) }}</span>
                      }
                    </div>
                    <h2 class="strong">{{ content.title }}</h2>
                    <p class="caption">{{ channelsLabel(content) }}</p>
                  </a>
                }
              </div>
            }
          </div>
        }
      </section>
    }

    <ng-template #headerActions>
      <a class="btn btn-secondary btn-sm from-idea" routerLink="/">Crea da un’idea</a>
    </ng-template>
  `,
  styles: `
    .contents {
      display: flex;
      flex-direction: column;
      gap: 20px;
      margin: 0 auto;
      animation: fade-up 240ms var(--ease);
    }
    .from-idea {
      text-decoration: none;
    }
    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 48px 16px;
      text-align: center;
    }
    .grid {
      display: flex;
      align-items: flex-start;
      gap: 16px;
    }
    .column {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 16px;
      min-width: 0;
    }
    .card {
      gap: 10px;
      padding: 12px;
      color: inherit;
      text-decoration: none;
      transition: transform 120ms var(--ease);
    }
    .card:hover {
      transform: translateY(-2px);
    }
    .cover {
      display: grid;
      place-items: center;
      overflow: hidden;
      border-radius: var(--radius-md);
      background: var(--surface-sunken);
    }
    .cover img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .cover {
      position: relative;
    }
    .play {
      position: absolute;
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.92);
      color: var(--primary);
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .strong {
      margin: 0;
    }
    .caption {
      margin: 0;
    }
  `,
})
export class ContentsPage {
  private readonly api = inject(ContentsService);
  private readonly toast = inject(ToastService);
  protected readonly brands = inject(BrandsService);

  private readonly headerActions = viewChild<TemplateRef<unknown>>('headerActions');
  protected readonly contents = signal<ContentSummary[]>([]);
  protected readonly loading = signal(true);
  private readonly preparing = computed(() => this.contents().some((content) => content.preparing));
  private readonly grid = viewChild<ElementRef<HTMLElement>>('grid');
  private readonly columnCount = signal(1);
  protected readonly cssAspect = cssAspect;

  // Le card nella colonna più corta, nell'ordine dell'elenco.
  protected readonly columns = computed(() => {
    const count = this.columnCount();
    const columns: ContentSummary[][] = Array.from({ length: count }, () => []);
    const heights = new Array<number>(count).fill(0);
    for (const content of this.contents()) {
      const shortest = heights.indexOf(Math.min(...heights));
      columns[shortest].push(content);
      heights[shortest] += aspectRatio(content.coverAspect) + CARD_TEXT;
    }
    return columns;
  });

  constructor() {
    pageHeader(
      () => [{ label: 'Contenuti' }],
      () => this.headerActions(),
    );
    effect(() => {
      const brand = this.brands.activeBrand();
      if (brand) untracked(() => void this.load(brand.id, true));
    });
    // Quante colonne ci stanno: si ricalcola quando cambia la larghezza della pagina.
    // La griglia compare solo quando ci sono contenuti.
    const observer = new ResizeObserver(([entry]) =>
      this.columnCount.set(Math.max(1, Math.floor((entry.contentRect.width + GAP) / (COLUMN_MIN + GAP)))),
    );
    effect(() => {
      const grid = this.grid()?.nativeElement;
      observer.disconnect();
      if (grid) observer.observe(grid);
    });
    inject(DestroyRef).onDestroy(() => observer.disconnect());
    effect((onCleanup) => {
      const brand = this.brands.activeBrand();
      if (!brand || !this.preparing()) return;
      const timer = setInterval(() => void this.load(brand.id, false), REFRESH_MS);
      onCleanup(() => clearInterval(timer));
    });
  }

  private async load(brandId: string, first: boolean): Promise<void> {
    if (first) this.loading.set(true);
    try {
      const contents = await this.api.list(brandId);
      if (this.brands.activeBrand()?.id === brandId) this.contents.set(contents);
    } catch (error) {
      if (first) this.toast.show(errorMessage(error, 'Non riesco a caricare i contenuti. Riprova tra poco.'));
    } finally {
      if (first) this.loading.set(false);
    }
  }

  protected formatLabel(content: ContentSummary): string {
    return FORMAT_LABELS[content.format];
  }

  protected statusLabel(content: ContentSummary): string {
    return STATUS_LABELS[content.status];
  }

  // I canali e, se è nel piano, quando esce: sulla stessa riga, così la card resta alta uguale.
  protected channelsLabel(content: ContentSummary): string {
    const channels = content.channels.map(channelName).join(', ');
    const when = content.scheduledFor;
    return when ? `${channels} · esce ${formatWeekdayShort(when.date)}, ${when.time}` : channels;
  }
}
