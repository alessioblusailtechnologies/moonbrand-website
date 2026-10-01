import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';

import type { BrandProfile } from '@moonbrand/shared/api/contract';
import type { SectionKey } from '@moonbrand/shared/domain/brand';
import { kindLabel } from '@moonbrand/shared/domain/catalog';
import { identityLine, SECTION_KEYS, sectionCopy, sectionStatus, sectionSummary, type SectionStatus } from '@moonbrand/shared/domain/sections';

import { BrandsService } from '../../core/brands/brands.service';
import { errorMessage } from '../../core/errors';
import { pageHeader } from '../../core/layout/page-header';
import { BrandAvatar } from '../../ui/brand-avatar';
import { Icon } from '../../ui/icon';
import { ToastService } from '../../ui/toast';
import { SectionEditor } from './section-editor';

const STATUS: Record<SectionStatus, { color: string; label: string | null }> = {
  complete: { color: 'var(--mint-400)', label: null },
  partial: { color: 'var(--accent-soft)', label: 'Da completare' },
  missing: { color: 'var(--grey-300)', label: 'Da fare' },
};

@Component({
  selector: 'mb-profile-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BrandAvatar, Icon, SectionEditor],
  template: `
    @if (brands.activeBrand(); as brand) {
      <section class="profile">
        <header class="head">
          <mb-brand-avatar [name]="brand.name" [logo]="brand.logoUri" [color]="brand.color" [size]="64" />
          <div class="grow texts">
            <span class="label">{{ kindLabel(brand.kind) }}</span>
            <h1 class="title">{{ brand.name }}</h1>
            @if (line()) {
              <p class="caption">{{ line() }}</p>
            }
          </div>
        </header>

        @if (loading()) {
          <div class="empty"><span class="spinner"></span></div>
        } @else if (profile()) {
          <div class="panel rows">
            @for (row of rows(); track row.key) {
              <button class="row-btn" type="button" (click)="editing.set(row.key)">
                <span class="dot" [style.background]="row.color"></span>
                <span class="grow texts">
                  <span class="name">
                    <span class="strong-sm">{{ row.name }}</span>
                    @if (row.status) {
                      <span class="badge">{{ row.status }}</span>
                    }
                  </span>
                  <span class="caption summary">{{ row.summary }}</span>
                </span>
                <span class="edit caption">Modifica</span>
                <mb-icon name="chevron-right" [size]="16" class="chevron" />
              </button>
            }
          </div>
          <p class="caption">Ogni modifica vale dalle prossime idee e dai prossimi contenuti; quelli già scritti restano come sono.</p>
        } @else {
          <div class="empty">
            <p class="strong-sm">Non riesco a leggere il profilo</p>
            <button class="btn btn-secondary btn-sm" type="button" (click)="load(brand.id)">Riprova</button>
          </div>
        }
      </section>

      @if (editing(); as key) {
        @if (profile(); as current) {
          <mb-section-editor [brandId]="current.id" [draft]="current.draft" [section]="key" (closed)="editing.set(null)"
            (saved)="profile.set({ id: current.id, draft: $event }); editing.set(null)" />
        }
      }
    }
  `,
  styles: `
    .profile {
      display: flex;
      flex-direction: column;
      gap: 20px;
      margin: 0 auto;
      animation: fade-up 240ms var(--ease);
    }
    .head {
      display: flex;
      align-items: center;
      gap: 18px;
    }
    .texts {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .title {
      margin: 0;
    }
    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      padding: 48px 16px;
      text-align: center;
    }
    .rows {
      gap: 0;
      padding: 6px 20px;
      border-radius: var(--radius-card);
    }
    .row-btn {
      display: flex;
      align-items: center;
      gap: 14px;
      width: 100%;
      padding: 16px 0;
      border: 0;
      border-top: 1px solid var(--grey-100);
      background: none;
      text-align: left;
      cursor: pointer;
    }
    .row-btn:first-child {
      border-top: 0;
    }
    .row-btn:hover .edit {
      color: var(--text-title);
    }
    .row-btn:hover .chevron {
      transform: translateX(2px);
    }
    .name {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .summary {
      display: -webkit-box;
      overflow: hidden;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }
    .edit {
      flex: none;
      font-weight: 500;
      transition: color 120ms var(--ease);
    }
    .chevron {
      flex: none;
      color: var(--grey-300);
      transition: transform 120ms var(--ease);
    }
    @media (max-width: 640px) {
      .edit {
        display: none;
      }
    }
  `,
})
export class ProfilePage {
  private readonly toast = inject(ToastService);
  protected readonly brands = inject(BrandsService);
  protected readonly kindLabel = kindLabel;

  protected readonly profile = signal<BrandProfile | null>(null);
  protected readonly loading = signal(true);
  protected readonly editing = signal<SectionKey | null>(null);
  // Solo l'id: dopo un salvataggio nome e logo cambiano, ma il profilo non va riletto.
  private readonly activeId = computed(() => this.brands.activeBrand()?.id ?? null);

  protected readonly line = computed(() => {
    const draft = this.profile()?.draft;
    return draft ? identityLine(draft) : '';
  });

  protected readonly rows = computed(() => {
    const draft = this.profile()?.draft;
    if (!draft) return [];
    return SECTION_KEYS.map((key) => {
      const status = STATUS[sectionStatus(key, draft)];
      return { key, name: sectionCopy(key, draft.identity.kind).name, summary: sectionSummary(key, draft), color: status.color, status: status.label };
    });
  });

  constructor() {
    pageHeader(() => [{ label: 'Impostazioni brand' }]);
    effect(() => {
      const brandId = this.activeId();
      if (brandId) untracked(() => void this.load(brandId));
    });
  }

  protected async load(brandId: string): Promise<void> {
    this.editing.set(null);
    this.loading.set(true);
    try {
      const profile = await this.brands.profile(brandId);
      if (this.activeId() === brandId) this.profile.set(profile);
    } catch (error) {
      this.profile.set(null);
      this.toast.show(errorMessage(error, 'Non riesco a leggere il profilo. Riprova tra poco.'));
    } finally {
      if (this.activeId() === brandId) this.loading.set(false);
    }
  }
}
