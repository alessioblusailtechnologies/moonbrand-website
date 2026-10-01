import { ChangeDetectionStrategy, Component, ElementRef, Injectable, afterRenderEffect, computed, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';

import { kindLabel } from '@moonbrand/shared/domain/catalog';

import { BrandsService } from '../../core/brands/brands.service';
import { errorMessage } from '../../core/errors';
import { BrandAvatar } from '../../ui/brand-avatar';
import { Icon } from '../../ui/icon';
import { lockPageScroll } from '../../ui/scroll-lock';
import { ToastService } from '../../ui/toast';

// Oltre questi brand compare la ricerca per nome.
const SEARCH_FROM = 6;

// La finestra per scegliere il brand: la apre la scheda del brand in cima alla sidebar.
@Injectable({ providedIn: 'root' })
export class BrandPickerService {
  readonly isOpen = signal(false);

  open(): void {
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }
}

// Al centro dello schermo, sopra la pagina: i brand in schede, quello attivo evidenziato e per primo,
// e in fondo le impostazioni del brand attivo e un brand nuovo. Sta nello shell, fuori dalla sidebar:
// sul telefono la sidebar è spostata con transform e una finestra fixed dentro di lei non starebbe al centro.
@Component({
  selector: 'mb-brand-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BrandAvatar, Icon],
  host: { '(document:keydown.escape)': 'close()' },
  template: `
    @if (picker.isOpen()) {
      @let active = brands.activeBrand();
      <div class="backdrop" (click)="close()"></div>
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="brand-picker-title">
        <header class="head">
          <div class="titles">
            <h2 id="brand-picker-title" class="heading">Scegli il brand</h2>
            <p class="caption">Idee, contenuti, piano e chat cambiano con il brand che scegli.</p>
          </div>
          <button class="icon-btn" type="button" aria-label="Chiudi" (click)="close()">
            <mb-icon name="x" />
          </button>
        </header>

        @if (brands.brands().length > searchFrom) {
          <label class="search">
            <mb-icon name="search" [size]="16" />
            <input
              #searchField
              type="search"
              placeholder="Cerca un brand…"
              aria-label="Cerca un brand"
              [value]="query()"
              (input)="query.set($any($event.target).value)"
              (keydown.enter)="chooseFirst()"
            />
          </label>
        }

        <div class="grid" role="listbox" aria-label="Brand">
          @for (brand of visible(); track brand.id) {
            @let current = brand.id === active?.id;
            <button
              class="card"
              type="button"
              role="option"
              [class.current]="current"
              [attr.aria-selected]="current"
              [disabled]="switching() !== null"
              (click)="choose(brand.id)"
            >
              <mb-brand-avatar [name]="brand.name" [logo]="brand.logoUri" [color]="brand.color" [size]="44" />
              <span class="card-texts">
                <span class="card-name">{{ brand.name }}</span>
                <span class="caption">{{ kindLabel(brand.kind) }}</span>
              </span>
              @if (switching() === brand.id) {
                <span class="spinner"></span>
              } @else if (current) {
                <span class="tag"><mb-icon name="check" [size]="12" [stroke]="3" />Attivo</span>
              }
            </button>
          } @empty {
            <p class="caption empty">Nessun brand con questo nome.</p>
          }
        </div>

        <footer class="foot">
          @if (active) {
            <button class="btn btn-ghost" type="button" (click)="openSettings()">
              <mb-icon name="settings" [size]="16" /> Impostazioni di {{ active.name }}
            </button>
          }
          <button class="btn btn-primary" type="button" (click)="createBrand()">
            <mb-icon name="plus" [size]="16" /> Nuovo brand
          </button>
        </footer>
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
      gap: 16px;
      width: min(620px, calc(100vw - 32px));
      max-height: min(680px, calc(100dvh - 32px));
      padding: 24px;
      border-radius: var(--radius-card);
      background: var(--surface-app);
      box-shadow: var(--shadow-menu);
      transform: translate(-50%, -50%);
      animation: dialog-in 180ms var(--ease);
    }
    // Solo la griglia scorre: testa, ricerca e piede restano della loro altezza.
    .head,
    .search,
    .foot {
      flex: none;
    }
    .head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
    }
    .titles {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .head .icon-btn {
      margin: -8px -8px 0 0;
    }
    .search {
      display: flex;
      align-items: center;
      gap: 10px;
      height: 42px;
      padding: 0 14px;
      border: 1px solid var(--border-card);
      border-radius: var(--radius-md);
      background: var(--white);
      color: var(--text-body);
      transition: border-color 120ms var(--ease);
    }
    .search:focus-within {
      border-color: var(--grey-300);
    }
    .search input {
      flex: 1;
      min-width: 0;
      border: 0;
      outline: 0;
      background: transparent;
      color: var(--text-title);
      font-size: 14px;
    }
    .search input::placeholder {
      color: var(--grey-500);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      min-height: 0;
      margin: 0 -4px;
      padding: 4px;
      overflow-y: auto;
    }
    .card {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
      padding: 12px 14px 12px 12px;
      border: 1px solid var(--border-card);
      border-radius: var(--radius-lg);
      background: var(--white);
      color: var(--text-title);
      text-align: left;
      cursor: pointer;
      transition:
        border-color 120ms var(--ease),
        box-shadow 120ms var(--ease),
        transform 120ms var(--ease);
    }
    .card:hover:not(:disabled) {
      border-color: var(--grey-300);
      box-shadow: var(--shadow-card);
    }
    .card:active:not(:disabled) {
      transform: scale(0.98);
    }
    .card:disabled {
      cursor: progress;
    }
    .card:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }
    .card.current {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-tint);
    }
    .card-texts {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 1px;
      min-width: 0;
    }
    .card-name {
      overflow: hidden;
      font-size: 14px;
      font-weight: 600;
      line-height: 1.35;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .card .spinner {
      flex: none;
      width: 14px;
      height: 14px;
      color: var(--text-body);
    }
    .tag {
      display: inline-flex;
      flex: none;
      align-items: center;
      gap: 4px;
      min-height: 22px;
      padding: 0 9px 0 7px;
      border-radius: 999px;
      background: var(--accent-tint);
      color: var(--accent-strong);
      font-size: 11px;
      font-weight: 600;
    }
    .empty {
      grid-column: 1 / -1;
      padding: 24px 0;
      text-align: center;
    }
    .foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding-top: 16px;
      border-top: 1px solid var(--border-subtle);
    }
    .foot .btn-ghost {
      min-width: 0;
      margin-left: -12px;
      padding: 0 12px;
    }
    .foot .btn-primary {
      margin-left: auto;
    }
    @media (max-width: 560px) {
      .dialog {
        padding: 20px 16px;
      }
      .grid {
        grid-template-columns: minmax(0, 1fr);
      }
      .foot {
        flex-direction: column-reverse;
        align-items: stretch;
      }
      .foot .btn-ghost,
      .foot .btn-primary {
        margin: 0;
      }
    }
  `,
})
export class BrandPicker {
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly picker = inject(BrandPickerService);
  protected readonly brands = inject(BrandsService);
  protected readonly kindLabel = kindLabel;
  protected readonly searchFrom = SEARCH_FROM;

  protected readonly query = signal('');
  // Il brand su cui si è cliccato, finché il cambio non è fatto.
  protected readonly switching = signal<string | null>(null);
  private readonly searchField = viewChild<ElementRef<HTMLInputElement>>('searchField');

  // Il brand attivo per primo, poi gli altri nell'ordine in cui sono nati; con la ricerca, solo quelli che le somigliano.
  protected readonly visible = computed(() => {
    const activeId = this.brands.activeBrand()?.id;
    const words = this.query().trim().toLowerCase();
    const all = this.brands.brands();
    const ordered = [...all.filter((brand) => brand.id === activeId), ...all.filter((brand) => brand.id !== activeId)];
    return words ? ordered.filter((brand) => brand.name.toLowerCase().includes(words)) : ordered;
  });

  constructor() {
    lockPageScroll(() => this.picker.isOpen());
    // Aprendo si comincia dalla ricerca, se c'è; altrimenti dalla scheda del brand attivo.
    afterRenderEffect(() => {
      if (!this.picker.isOpen()) return;
      const field = this.searchField()?.nativeElement;
      if (field) field.focus();
      else document.querySelector<HTMLElement>('mb-brand-picker .card.current')?.focus();
    });
  }

  protected close(): void {
    if (!this.picker.isOpen()) return;
    this.picker.close();
    this.query.set('');
  }

  protected async choose(brandId: string): Promise<void> {
    if (this.switching()) return;
    if (brandId === this.brands.activeBrand()?.id) return this.close();
    this.switching.set(brandId);
    try {
      await this.brands.setActive(brandId);
      this.close();
    } catch (error) {
      this.toast.show(errorMessage(error, 'Non riesco a cambiare brand. Riprova.'));
    } finally {
      this.switching.set(null);
    }
  }

  protected chooseFirst(): void {
    const first = this.visible()[0];
    if (first) void this.choose(first.id);
  }

  protected openSettings(): void {
    this.close();
    void this.router.navigateByUrl('/impostazioni');
  }

  protected createBrand(): void {
    this.close();
    void this.router.navigateByUrl('/onboarding', { state: { newBrand: true } });
  }
}
