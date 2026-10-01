import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import type { BrandDraft, SectionKey } from '@moonbrand/shared/domain/brand';
import { ONBOARDING_SECTION_KEYS, sectionCopy, sectionStatus, sectionSummary } from '@moonbrand/shared/domain/sections';

import { Icon } from '../../../ui/icon';
import { ONBOARDING_STEPS, OnboardingStore } from '../onboarding.store';

const STATUS_COLOR = { complete: 'var(--mint-400)', partial: 'var(--accent-soft)', missing: 'var(--grey-300)' };

@Component({
  selector: 'mb-summary-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <div class="panel rows">
      @for (row of rows(); track row.key) {
        <button class="row-btn" type="button" (click)="edit(row.key)">
          <span class="dot" [style.background]="row.color"></span>
          <span class="grow texts">
            <span class="strong-sm">{{ row.name }}</span>
            <span class="caption">{{ row.summary }}</span>
          </span>
          <mb-icon name="chevron-right" [size]="16" class="chevron" />
        </button>
      }
    </div>
    <p class="caption">
      Tutto resta modificabile dalle Impostazioni brand. Riferimenti e fonti li aggiungi da lì quando vuoi: danno un appiglio reale alle idee.
    </p>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .rows {
      gap: 0;
      padding: 6px 20px;
      border-radius: var(--radius-card);
    }
    .row-btn {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      width: 100%;
      padding: 12px 0;
      border: 0;
      border-top: 1px solid var(--grey-100);
      background: none;
      text-align: left;
      cursor: pointer;
    }
    .row-btn:first-child {
      border-top: 0;
    }
    .row-btn:hover .strong-sm {
      text-decoration: underline;
    }
    .dot {
      margin-top: 4px;
    }
    .texts {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .chevron {
      color: var(--grey-300);
    }
  `,
})
export class SummaryStep {
  private readonly store = inject(OnboardingStore);
  readonly draft = input.required<BrandDraft>();

  protected readonly rows = computed(() => {
    const draft = this.draft();
    return ONBOARDING_SECTION_KEYS.map((key) => ({
      key,
      name: sectionCopy(key, draft.identity.kind).name,
      summary: sectionSummary(key, draft),
      color: STATUS_COLOR[sectionStatus(key, draft)],
    }));
  });

  protected edit(key: SectionKey): void {
    this.store.goTo(ONBOARDING_STEPS.indexOf(key));
  }
}
