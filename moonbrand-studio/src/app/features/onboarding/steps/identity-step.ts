import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';

import type { AiStep } from '@moonbrand/shared/ai/steps';
import type { BrandDraft, BrandKind, Identity } from '@moonbrand/shared/domain/brand';
import { normalizeSite } from '@moonbrand/shared/lib/site';

import { AiJobsService } from '../../../core/ai/ai-jobs.service';
import { StepList } from '../../../ui/step-list';
import { ToastService } from '../../../ui/toast';
import { DraftStore } from '../draft-store';

type TextField = 'name' | 'role' | 'company' | 'sector';

const FIELDS: Record<BrandKind, { key: TextField; label: string; placeholder: string }[]> = {
  person: [
    { key: 'name', label: 'Nome e cognome', placeholder: 'Marco Sereni' },
    { key: 'role', label: 'Ruolo', placeholder: 'Founder' },
    { key: 'company', label: 'Azienda', placeholder: 'Nodo' },
  ],
  company: [
    { key: 'name', label: 'Nome dell’azienda', placeholder: 'Forno Rinaldi' },
    { key: 'sector', label: 'Settore', placeholder: 'Panificio artigianale' },
  ],
  client: [
    { key: 'name', label: 'Nome del cliente', placeholder: 'Studio Verdi' },
    { key: 'sector', label: 'Settore', placeholder: 'Architettura d’interni' },
  ],
};

const PITCH: Record<BrandKind, { label: string; placeholder: string }> = {
  person: {
    label: 'In una frase, cosa fai',
    placeholder: 'Es. metto l’AI nei processi noiosi delle PMI italiane, partendo da dove il dolore è misurabile',
  },
  company: {
    label: 'In una frase, cosa fate',
    placeholder: 'Es. pane a lievitazione naturale con grani del territorio, consegnato ogni mattina a bar e ristoranti',
  },
  client: {
    label: 'In una frase, cosa fa il cliente',
    placeholder: 'Es. progetta case piccole che sembrano grandi, con budget chiari fin dal primo incontro',
  },
};

const SITE_PLACEHOLDER: Record<BrandKind, string> = { person: 'nodo.it', company: 'fornorinaldi.it', client: 'studioverdi.it' };

@Component({
  selector: 'mb-identity-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StepList],
  template: `
    @let value = identity();
    <div class="field">
      <label for="site">Sito</label>
      <div class="field-row">
        <input id="site" type="url" autocomplete="url" [placeholder]="sitePlaceholder()" [value]="value.site"
          (input)="update('site', $any($event.target).value)" (keydown.enter)="canRead() && read()" />
        @if (canRead()) {
          <button class="btn btn-secondary btn-sm" type="button" [disabled]="reading()" (click)="read()">
            {{ reading() ? 'Leggo…' : 'Leggi' }}
          </button>
        }
      </div>
    </div>

    @if (reading()) {
      <div class="panel">
        <p class="strong-sm">Sto leggendo {{ site() }}</p>
        <mb-step-list [steps]="steps()" waiting="Mi collego al sito" />
      </div>
    } @else if (alreadyRead()) {
      <div class="panel read">
        <span class="badge mint">Sito letto</span>
        <p class="body ink">{{ store.insights()?.summary }}</p>
      </div>
    }

    @for (field of fields(); track field.key) {
      <div class="field">
        <label [attr.for]="field.key">{{ field.label }}</label>
        <input [id]="field.key" type="text" [placeholder]="field.placeholder" [value]="value[field.key]"
          (input)="update(field.key, $any($event.target).value)" />
      </div>
    }

    <div class="field">
      <label for="pitch">{{ pitch().label }}</label>
      <textarea id="pitch" rows="3" [placeholder]="reading() ? 'La scrivo io appena finisco di leggere il sito…' : pitch().placeholder"
        [value]="value.pitch" (input)="update('pitch', $any($event.target).value)"></textarea>
      @if (pitchFromSite()) {
        <span class="hint">L’ho scritta leggendo il sito: cambiala come vuoi.</span>
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .read {
      gap: 8px;
    }
  `,
})
export class IdentityStep {
  private readonly ai = inject(AiJobsService);
  private readonly toast = inject(ToastService);
  protected readonly store = inject(DraftStore);
  readonly draft = input.required<BrandDraft>();

  protected readonly reading = signal(false);
  protected readonly steps = signal<AiStep[]>([]);

  protected readonly identity = computed(() => this.draft().identity);
  protected readonly fields = computed(() => FIELDS[this.identity().kind]);
  protected readonly pitch = computed(() => PITCH[this.identity().kind]);
  protected readonly sitePlaceholder = computed(() => SITE_PLACEHOLDER[this.identity().kind]);
  protected readonly site = computed(() => normalizeSite(this.identity().site));
  protected readonly alreadyRead = computed(() => this.store.insights()?.site === this.site());
  protected readonly canRead = computed(() => this.site().includes('.') && !this.alreadyRead());
  protected readonly pitchFromSite = computed(() => {
    const insights = this.store.insights();
    return Boolean(insights?.pitch) && this.identity().pitch === insights?.pitch;
  });

  protected update(key: keyof Identity, text: string): void {
    this.store.patch({ key: 'identity', value: { ...this.identity(), [key]: text } });
  }

  protected async read(): Promise<void> {
    if (this.reading()) return;
    this.reading.set(true);
    this.steps.set([]);
    try {
      const insights = await this.ai.readWebsite(this.identity().site, (steps) => this.steps.set(steps));
      this.store.applyInsights(insights);
      this.toast.show('Ho letto il sito: temi, pubblico e palette sono già proposti nei prossimi passi.');
    } catch {
      this.toast.show('Non riesco a leggere il sito. Riprova tra poco.');
    } finally {
      this.reading.set(false);
    }
  }
}
