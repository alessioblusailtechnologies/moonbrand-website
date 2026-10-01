import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal, type OnInit } from '@angular/core';

import type { BrandDraft, SectionKey } from '@moonbrand/shared/domain/brand';
import { sectionCopy, sectionError } from '@moonbrand/shared/domain/sections';

import { errorMessage } from '../../core/errors';
import { ConfirmService } from '../../ui/confirm';
import { Icon } from '../../ui/icon';
import { lockPageScroll } from '../../ui/scroll-lock';
import { ToastService } from '../../ui/toast';
import { DraftStore } from '../onboarding/draft-store';
import { ChannelsStep } from '../onboarding/steps/channels-step';
import { IdentityStep } from '../onboarding/steps/identity-step';
import { PositioningStep } from '../onboarding/steps/positioning-step';
import { ThemesStep } from '../onboarding/steps/themes-step';
import { VisualStep } from '../onboarding/steps/visual-step';
import { VoiceStep } from '../onboarding/steps/voice-step';
import { ProfileDraftStore } from './profile-draft.store';
import { ReferencesEditor } from './references-editor';

// Una sezione delle Impostazioni brand, con gli stessi passi dell'onboarding: le modifiche restano qui finché non si salva.
@Component({
  selector: 'mb-section-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, IdentityStep, PositioningStep, ChannelsStep, ThemesStep, VoiceStep, VisualStep, ReferencesEditor],
  providers: [ProfileDraftStore, { provide: DraftStore, useExisting: ProfileDraftStore }],
  template: `
    <div class="scrim" (click)="close()"></div>
    <div class="dialog" role="dialog" aria-modal="true" [attr.aria-label]="copy().name">
      <header class="bar">
        <span class="label">Impostazioni brand · {{ copy().name }}</span>
        <button class="icon-btn" type="button" aria-label="Chiudi" (click)="close()">
          <mb-icon name="x" />
        </button>
      </header>

      <main class="page">
        <div class="step">
          <div class="titles">
            <h1 class="title">{{ copy().title }}</h1>
            <p class="body">{{ copy().subtitle }}</p>
          </div>
          @if (store.draft(); as draft) {
            @switch (section()) {
              @case ('identity') { <mb-identity-step [draft]="draft" /> }
              @case ('positioning') { <mb-positioning-step [draft]="draft" /> }
              @case ('channels') { <mb-channels-step [draft]="draft" /> }
              @case ('themes') { <mb-themes-step [draft]="draft" /> }
              @case ('voice') { <mb-voice-step [draft]="draft" /> }
              @case ('visual') { <mb-visual-step [draft]="draft" /> }
              @case ('references') { <mb-references-editor [draft]="draft" /> }
            }
          }
        </div>
      </main>

      <footer class="footer">
        @if (error(); as error) {
          <p class="caption grow">{{ error }}</p>
        } @else if (newReferences() > 0) {
          <p class="caption grow">
            Salvando, {{ newReferences() === 1 ? 'l’esempio scelto prende' : 'i ' + newReferences() + ' esempi scelti prendono' }}
            il posto dei riferimenti da seguire.
          </p>
        } @else {
          <span class="grow"></span>
        }
        <button class="btn btn-secondary" type="button" [disabled]="saving()" (click)="close()">Annulla</button>
        <button class="btn btn-primary" type="button" [class.busy]="saving()" [attr.aria-disabled]="!store.dirty() || error() !== null"
          (click)="save()">
          @if (saving()) {
            <span class="spinner"></span>
          }
          Salva
        </button>
      </footer>
    </div>
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: 50;
      display: grid;
      place-items: center;
      padding: 24px;
    }
    .scrim {
      position: absolute;
      inset: 0;
      background: var(--scrim);
      animation: fade-in 200ms var(--ease);
    }
    .dialog {
      position: relative;
      display: flex;
      flex-direction: column;
      width: min(760px, 100%);
      height: min(880px, 100%);
      overflow: hidden;
      border-radius: var(--radius-card);
      background: var(--surface-dialog);
      box-shadow: var(--shadow-menu);
      animation: fade-up 240ms var(--ease);
    }
    .bar {
      flex: none;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      height: var(--topbar-height);
      padding: 0 20px 0 24px;
    }
    .page {
      flex: 1;
      overflow-y: auto;
      padding: 8px 24px 24px;
    }
    .step {
      display: flex;
      flex-direction: column;
      gap: 20px;
      width: min(640px, 100%);
      margin: 0 auto;
    }
    .titles {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .footer {
      flex: none;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 24px 20px;
      border-top: 1px solid rgba(20, 33, 61, 0.08);
    }
    .footer .btn[aria-disabled='true'] {
      opacity: 0.45;
    }
    @media (max-width: 640px) {
      :host {
        padding: 0;
      }
      .dialog {
        width: 100%;
        height: 100%;
        border-radius: 0;
      }
      .footer {
        flex-wrap: wrap;
      }
      .footer .grow {
        flex-basis: 100%;
      }
      .footer .btn {
        flex: 1;
      }
    }
  `,
})
export class SectionEditor implements OnInit {
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  protected readonly store = inject(ProfileDraftStore);

  constructor() {
    lockPageScroll();
  }

  readonly brandId = input.required<string>();
  readonly draft = input.required<BrandDraft>();
  readonly section = input.required<SectionKey>();
  readonly saved = output<BrandDraft>();
  readonly closed = output<void>();

  protected readonly saving = signal(false);
  protected readonly copy = computed(() => sectionCopy(this.section(), this.draft().identity.kind));
  protected readonly error = computed(() => {
    const draft = this.store.draft();
    return draft ? sectionError(this.section(), draft) : null;
  });
  protected readonly newReferences = computed(() => (this.section() === 'visual' ? this.store.selectedExamples().length : 0));

  ngOnInit(): void {
    this.store.start(this.brandId(), this.draft());
  }

  protected async close(): Promise<void> {
    if (this.saving()) return;
    if (this.store.dirty()) {
      const leave = await this.confirm.ask({
        title: 'Esci senza salvare?',
        message: 'Le modifiche a questa sezione andranno perse.',
        cancelLabel: 'Continua a modificare',
        confirmLabel: 'Esci senza salvare',
        tone: 'danger',
      });
      if (!leave) return;
    }
    this.closed.emit();
  }

  protected async save(): Promise<void> {
    const error = this.error();
    if (error) {
      this.toast.show(error);
      return;
    }
    if (!this.store.dirty() || this.saving()) return;
    this.saving.set(true);
    try {
      this.saved.emit(await this.store.save());
      this.toast.show('Salvato.');
    } catch (err) {
      this.toast.show(errorMessage(err, 'Non sono riuscito a salvare. Riprova.'));
    } finally {
      this.saving.set(false);
    }
  }
}
