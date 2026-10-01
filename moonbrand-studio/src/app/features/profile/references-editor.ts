import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import type { BrandDraft, Milestone, References } from '@moonbrand/shared/domain/brand';

import { Icon } from '../../ui/icon';
import { DraftStore } from '../onboarding/draft-store';

// I limiti dell'API.
const MAX_PROFILES = 50;
const MAX_MILESTONES = 50;

function milestoneId(): string {
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

@Component({
  selector: 'mb-references-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <section class="panel">
      <div class="head">
        <p class="label">Profili da cui imparare</p>
        <p class="caption">Account o pagine che scrivono come vorresti scrivere tu: un nome, un @ o un link per riga.</p>
      </div>
      @for (profile of references().profiles; track $index; let i = $index) {
        <div class="row">
          <input class="sunken grow" maxlength="300" placeholder="es. @nomeaccount o linkedin.com/in/…" [attr.aria-label]="'Profilo ' + (i + 1)"
            [value]="profile" (input)="setProfile(i, $any($event.target).value)" />
          <button class="icon-btn" type="button" [attr.aria-label]="'Togli il profilo ' + (i + 1)" (click)="removeProfile(i)">
            <mb-icon name="x" [size]="16" />
          </button>
        </div>
      }
      @if (references().profiles.length < maxProfiles) {
        <button class="link-btn align-start" type="button" (click)="addProfile()">Aggiungi un profilo</button>
      }
    </section>

    <section class="panel">
      <div class="head">
        <p class="label">Fonti dei segnali</p>
        <p class="caption">Dove guardo per proporre idee legate a quello che succede.</p>
      </div>
      <div class="chips">
        @for (source of references().sources; track source.label; let i = $index) {
          <button class="chip" type="button" role="checkbox" [attr.aria-checked]="source.enabled" [class.selected]="source.enabled"
            (click)="toggleSource(i)">
            {{ source.label }}
          </button>
        }
      </div>
    </section>

    <section class="panel">
      <div class="head">
        <p class="label">Date che contano</p>
        <p class="caption">Lanci, anniversari, eventi: le idee arrivano in tempo per parlarne.</p>
      </div>
      @for (milestone of references().milestones; track milestone.id; let i = $index) {
        <div class="row">
          <input class="sunken grow" maxlength="200" placeholder="es. Apertura della nuova sede" [attr.aria-label]="'Cosa succede, data ' + (i + 1)"
            [value]="milestone.label" (input)="setMilestone(i, { label: $any($event.target).value })" />
          <input class="sunken date" type="date" [attr.aria-label]="'Quando, data ' + (i + 1)" [value]="milestone.date"
            (change)="setDate(i, $any($event.target).value)" />
          <button class="icon-btn" type="button" [attr.aria-label]="'Togli la data ' + (i + 1)" (click)="removeMilestone(i)">
            <mb-icon name="x" [size]="16" />
          </button>
        </div>
      }
      @if (references().milestones.length < maxMilestones) {
        <button class="link-btn align-start" type="button" (click)="addMilestone()">Aggiungi una data</button>
      }
    </section>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .head {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .row {
      gap: 8px;
    }
    .date {
      flex: none;
      width: 160px;
    }
    .align-start {
      align-self: flex-start;
    }
  `,
})
export class ReferencesEditor {
  private readonly store = inject(DraftStore);
  readonly draft = input.required<BrandDraft>();

  protected readonly maxProfiles = MAX_PROFILES;
  protected readonly maxMilestones = MAX_MILESTONES;
  protected readonly references = computed(() => this.draft().references);

  private set(patch: Partial<References>): void {
    const current = this.store.draft()?.references ?? this.references();
    this.store.patch({ key: 'references', value: { ...current, ...patch } });
  }

  protected addProfile(): void {
    this.set({ profiles: [...this.references().profiles, ''] });
  }

  protected setProfile(index: number, value: string): void {
    this.set({ profiles: this.references().profiles.map((profile, i) => (i === index ? value : profile)) });
  }

  protected removeProfile(index: number): void {
    this.set({ profiles: this.references().profiles.filter((_, i) => i !== index) });
  }

  protected toggleSource(index: number): void {
    this.set({ sources: this.references().sources.map((source, i) => (i === index ? { ...source, enabled: !source.enabled } : source)) });
  }

  protected addMilestone(): void {
    const today = new Date().toISOString().slice(0, 10);
    this.set({ milestones: [...this.references().milestones, { id: milestoneId(), label: '', date: today }] });
  }

  protected setMilestone(index: number, patch: Partial<Milestone>): void {
    this.set({ milestones: this.references().milestones.map((milestone, i) => (i === index ? { ...milestone, ...patch } : milestone)) });
  }

  // Una data cancellata a mano non si salva: resta quella di prima.
  protected setDate(index: number, date: string): void {
    if (date) this.setMilestone(index, { date });
  }

  protected removeMilestone(index: number): void {
    this.set({ milestones: this.references().milestones.filter((_, i) => i !== index) });
  }
}
