import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import type { AiStep } from '@moonbrand/shared/ai/steps';
import type { BrandKind, SectionKey } from '@moonbrand/shared/domain/brand';
import { isSkippable, sectionCopy, sectionError } from '@moonbrand/shared/domain/sections';

import { AiJobsService } from '../../core/ai/ai-jobs.service';
import { BrandsService } from '../../core/brands/brands.service';
import { errorMessage } from '../../core/errors';
import { ConfirmService } from '../../ui/confirm';
import { Icon } from '../../ui/icon';
import { Logo } from '../../ui/logo';
import { lockPageScroll } from '../../ui/scroll-lock';
import { StepList } from '../../ui/step-list';
import { ToastService } from '../../ui/toast';
import { DraftStore } from './draft-store';
import { ONBOARDING_STEPS, OnboardingStore, type OnboardingStep } from './onboarding.store';
import { ChannelsStep } from './steps/channels-step';
import { IdentityStep } from './steps/identity-step';
import { IntroStep } from './steps/intro-step';
import { PositioningStep } from './steps/positioning-step';
import { SummaryStep } from './steps/summary-step';
import { ThemesStep } from './steps/themes-step';
import { VisualStep } from './steps/visual-step';
import { VoiceStep } from './steps/voice-step';

function stepCopy(step: OnboardingStep, kind: BrandKind, name: string) {
  if (step === 'intro') {
    return {
      title: 'Ciao, costruiamo la tua presenza',
      subtitle: 'Prima di generare qualsiasi cosa mi serve sapere per chi scrivo e come. Poi lavoro da solo.',
    };
  }
  if (step === 'summary') {
    const firstName = name.trim().split(/\s+/)[0];
    return {
      title: kind === 'person' && firstName ? `Tutto pronto, ${firstName}` : 'Tutto pronto',
      subtitle: 'Ecco cosa ho capito. Controlla e creiamo il profilo.',
    };
  }
  return sectionCopy(step, kind);
}

@Component({
  selector: 'mb-onboarding',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, Logo, StepList, IntroStep, IdentityStep, PositioningStep, ChannelsStep, ThemesStep, VoiceStep, VisualStep, SummaryStep],
  // I passi scrivono nella bozza del brand nuovo.
  providers: [{ provide: DraftStore, useExisting: OnboardingStore }],
  templateUrl: './onboarding.html',
  styleUrl: './onboarding.scss',
})
export class Onboarding {
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly ai = inject(AiJobsService);
  protected readonly store = inject(OnboardingStore);
  protected readonly brands = inject(BrandsService);

  protected readonly creating = signal(false);
  // Dopo la creazione: i passaggi di stile e prime idee, finché non sono finiti.
  protected readonly preparing = signal(false);
  protected readonly steps = signal<AiStep[]>([]);
  protected readonly total = ONBOARDING_STEPS.length - 1;
  protected readonly segments = ONBOARDING_STEPS.slice(1).map((_, i) => i + 1);

  protected readonly copy = computed(() => {
    const draft = this.store.draft();
    return stepCopy(this.store.step(), draft?.identity.kind ?? 'person', draft?.identity.name ?? '');
  });

  protected readonly sectionStep = computed<SectionKey | null>(() => {
    const step = this.store.step();
    return step === 'intro' || step === 'summary' ? null : step;
  });

  protected readonly error = computed(() => {
    const key = this.sectionStep();
    const draft = this.store.draft();
    return key && draft ? sectionError(key, draft) : null;
  });

  protected readonly skippable = computed(() => {
    const key = this.sectionStep();
    return key !== null && isSkippable(key);
  });

  protected readonly canClose = computed(() => this.brands.brands().length > 0);

  constructor() {
    lockPageScroll();
    void this.brands.ensureLoaded();
    const fromNewBrand = this.router.currentNavigation()?.extras.state?.['newBrand'] === true;
    if (fromNewBrand && this.store.draft()) void this.askRestart();
  }

  protected primaryLabel(): string {
    const step = this.store.step();
    if (step === 'intro') return 'Iniziamo';
    if (step === 'summary') return this.creating() ? 'Sto preparando il profilo…' : 'Crea il profilo';
    return 'Continua';
  }

  protected primary(): void {
    const step = this.store.step();
    if (step === 'intro') {
      if (!this.store.draft()) {
        this.toast.show('Scegli per chi costruiamo la presenza.');
        return;
      }
      this.store.next();
      return;
    }
    if (step === 'summary') {
      void this.create();
      return;
    }
    const error = this.error();
    if (error) {
      this.toast.show(error);
      return;
    }
    this.store.next();
  }

  protected skip(): void {
    this.toast.show('Saltato: lo ritrovi nelle Impostazioni brand.');
    this.store.next();
  }

  protected close(): void {
    void this.router.navigateByUrl('/');
  }

  private async askRestart(): Promise<void> {
    const draft = this.store.draft();
    if (!draft) return;
    const name = draft.identity.name.trim();
    const index = this.store.stepIndex();
    const who = name ? `«${name}»` : 'Il brand che stavi creando';
    const where = index === 0 ? 'all’inizio' : `al passo ${index} di ${this.total}`;
    const restart = await this.confirm.ask({
      title: 'Hai un brand in sospeso',
      message: `${who} è rimasto ${where}. Puoi riprendere da lì o ricominciare da capo: quello che hai inserito andrà perso.`,
      cancelLabel: 'Riprendi',
      confirmLabel: 'Ricomincia',
      tone: 'danger',
    });
    if (restart) this.store.reset();
  }

  private async create(): Promise<void> {
    const draft = this.store.draft();
    const brandId = this.store.brandId();
    if (!draft || !brandId || this.creating()) return;
    this.creating.set(true);
    let jobs: string[];
    try {
      jobs = (await this.brands.create(brandId, draft, this.store.selectedExamples())).setupJobs;
      this.store.reset();
    } catch (error) {
      this.toast.show(errorMessage(error, 'Non sono riuscito a creare il profilo. Riprova.'));
      this.creating.set(false);
      return;
    }
    await this.prepare(jobs);
    await this.router.navigateByUrl('/assistente');
  }

  // Il brand esiste già: si resta qui finché stile e prime idee sono pronti, poi si apre la chat. Se un lavoro non riesce
  // si va avanti lo stesso: lo stile si rilegge al primo contenuto, le idee si chiedono dalla sezione Idee.
  private async prepare(jobs: string[]): Promise<void> {
    this.preparing.set(true);
    const steps = new Map<string, AiStep[]>(jobs.map((id) => [id, []]));
    const failures = await Promise.all(
      jobs.map((id) =>
        this.ai
          .follow(id, (current) => {
            steps.set(id, current);
            this.steps.set([...steps.values()].flat());
          })
          .then(
            () => false,
            () => true,
          ),
      ),
    );
    if (failures.some(Boolean)) this.toast.show('Il profilo è pronto, ma una parte della preparazione non è riuscita: la rifaccio quando serve.');
  }
}
