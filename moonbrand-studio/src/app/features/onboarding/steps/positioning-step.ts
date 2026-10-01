import { ChangeDetectionStrategy, Component, computed, inject, input, signal, type OnInit } from '@angular/core';

import type { AiStep } from '@moonbrand/shared/ai/steps';
import type { BrandDraft, BrandKind, Positioning } from '@moonbrand/shared/domain/brand';
import { AUDIENCES, GOALS } from '@moonbrand/shared/domain/catalog';

import { Icon } from '../../../ui/icon';
import { StepList } from '../../../ui/step-list';
import { DraftStore } from '../draft-store';
import { MockAi } from '../mock-ai';
import { positioningSource } from '../positioning-source';

const GOAL_LABEL: Record<BrandKind, string> = { person: 'Perché pubblichi', company: 'Perché pubblicate', client: 'Perché pubblica' };
const AUDIENCE_LABEL: Record<BrandKind, string> = {
  person: 'Chi vuoi raggiungere',
  company: 'Chi volete raggiungere',
  client: 'Chi vuole raggiungere',
};
const WHAT_YOU_DO: Record<BrandKind, string> = { person: 'cosa fai', company: 'cosa fate', client: 'cosa fa' };

const toggle = (list: string[], item: string) => (list.includes(item) ? list.filter((entry) => entry !== item) : [...list, item]);

function frequencyNote(perWeek: number): string {
  if (perWeek <= 2) return 'Ritmo leggero: una sessione ogni tre settimane';
  if (perWeek <= 4) return 'Ritmo consigliato: una sessione ogni due settimane';
  return 'Ritmo alto: serve una sessione a settimana';
}

@Component({
  selector: 'mb-positioning-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, StepList],
  template: `
    @let value = positioning();
    @if (loading()) {
      <div class="panel">
        <p class="strong-sm">Preparo obiettivi e pubblico su misura</p>
        <mb-step-list [steps]="steps()" waiting="Rileggo quello che so del brand" />
      </div>
    } @else {
      <p class="caption">{{ note() }}</p>
      <section class="group">
        <p class="label">{{ goalLabel() }}</p>
        <div class="chips">
          @for (goal of goals(); track goal) {
            <button class="chip" type="button" [class.selected]="value.goals.includes(goal)" (click)="set({ goals: toggle(value.goals, goal) })">
              {{ goal }}
            </button>
          }
        </div>
      </section>
      <section class="group">
        <p class="label">{{ audienceLabel() }}</p>
        <div class="chips">
          @for (audience of audiences(); track audience) {
            <button class="chip" type="button" [class.selected]="value.audiences.includes(audience)"
              (click)="set({ audiences: toggle(value.audiences, audience) })">
              {{ audience }}
            </button>
          }
        </div>
        @if (adding()) {
          <div class="row">
            <input class="sunken grow" placeholder="Es. Responsabili acquisti" aria-label="Nuovo pubblico" [value]="custom()"
              (input)="custom.set($any($event.target).value)" (keydown.enter)="addAudience()" />
            <button class="btn btn-primary btn-sm" type="button" [disabled]="!custom().trim()" (click)="addAudience()">Aggiungi</button>
          </div>
        } @else {
          <button class="link-btn" type="button" (click)="adding.set(true)">Aggiungi un pubblico</button>
        }
      </section>
    }

    <section class="panel">
      <p class="label">Quanto vuoi pubblicare</p>
      <div class="stepper">
        <button class="icon-btn outline" type="button" aria-label="Meno uscite" [disabled]="value.postsPerWeek <= 1"
          (click)="set({ postsPerWeek: value.postsPerWeek - 1 })">
          <mb-icon name="minus" />
        </button>
        <div class="stepper-value">
          <p class="heading">{{ value.postsPerWeek }} {{ value.postsPerWeek === 1 ? 'volta' : 'volte' }} a settimana</p>
          <p class="caption">{{ frequencyNote(value.postsPerWeek) }}</p>
        </div>
        <button class="icon-btn outline" type="button" aria-label="Più uscite" [disabled]="value.postsPerWeek >= 7"
          (click)="set({ postsPerWeek: value.postsPerWeek + 1 })">
          <mb-icon name="plus" />
        </button>
      </div>
    </section>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
    .group {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 10px;
    }
    .group .row {
      width: 100%;
    }
    .stepper {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .stepper-value {
      flex: 1;
      text-align: center;
    }
  `,
})
export class PositioningStep implements OnInit {
  private readonly ai = inject(MockAi);
  private readonly store = inject(DraftStore);
  readonly draft = input.required<BrandDraft>();

  protected readonly toggle = toggle;
  protected readonly frequencyNote = frequencyNote;
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  protected readonly steps = signal<AiStep[]>([]);
  protected readonly adding = signal(false);
  protected readonly custom = signal('');

  protected readonly positioning = computed(() => this.draft().positioning);
  private readonly kind = computed(() => this.draft().identity.kind);
  protected readonly goalLabel = computed(() => GOAL_LABEL[this.kind()]);
  protected readonly audienceLabel = computed(() => AUDIENCE_LABEL[this.kind()]);
  private readonly source = computed(() => positioningSource(this.draft().identity, this.store.insights()));
  private readonly ideas = computed(() => {
    const source = this.source();
    const stored = this.store.positioningIdeas();
    return source && stored?.key === source.key ? stored.ideas : null;
  });

  protected readonly goals = computed(() => [...new Set([...(this.ideas()?.goals ?? GOALS[this.kind()]), ...this.positioning().goals])]);
  protected readonly audiences = computed(() => [
    ...new Set([
      ...(this.ideas()?.audiences ?? [...AUDIENCES[this.kind()], ...(this.store.insights()?.audiences ?? [])]),
      ...this.positioning().audiences,
    ]),
  ]);

  protected readonly note = computed(() => {
    if (this.ideas()) {
      const site = this.source()?.site;
      return site ? `Proposti leggendo ${site.site}: tocca per scegliere o togliere.` : 'Proposti da quello che hai scritto: tocca per scegliere o togliere.';
    }
    if (this.failed()) return 'Non sono riuscito a preparare proposte su misura: ecco le più comuni.';
    return `Proposte comuni: se nel passo prima scrivi ${WHAT_YOU_DO[this.kind()]} o mi fai leggere il sito, le preparo su misura.`;
  });

  ngOnInit(): void {
    const source = this.source();
    if (!source || this.ideas()) return;
    const site = source.site;
    if (site?.goals?.length && site.audiences.length) {
      const picked = { goals: site.goals.slice(0, 2), audiences: site.audiences.slice(0, 2) };
      this.store.applyPositioningIdeas(source.key, { goals: site.goals, audiences: site.audiences, picked });
      return;
    }
    this.loading.set(true);
    this.ai
      .suggestPositioning(this.draft().identity, source.site, (steps) => this.steps.set(steps))
      .then((ideas) => this.store.applyPositioningIdeas(source.key, ideas))
      .catch(() => this.failed.set(true))
      .finally(() => this.loading.set(false));
  }

  protected set(patch: Partial<Positioning>): void {
    this.store.patch({ key: 'positioning', value: { ...this.positioning(), ...patch } });
  }

  protected addAudience(): void {
    const label = this.custom().trim();
    if (!label) return;
    if (!this.positioning().audiences.includes(label)) this.set({ audiences: [...this.positioning().audiences, label] });
    this.custom.set('');
    this.adding.set(false);
  }
}
