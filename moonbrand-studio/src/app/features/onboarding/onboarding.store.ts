import { Injectable, computed, effect, inject, signal } from '@angular/core';

import type { BrandKind, MediaFile, SectionKey } from '@moonbrand/shared/domain/brand';
import { changeDraftKind, createEmptyDraft } from '@moonbrand/shared/domain/catalog';
import { ONBOARDING_SECTION_KEYS } from '@moonbrand/shared/domain/sections';

import { AuthService } from '../../core/auth/auth.service';
import { BrandsService } from '../../core/brands/brands.service';
import { DraftStore, EMPTY_DRAFT_STATE, type DraftState } from './draft-store';

export type OnboardingStep = 'intro' | SectionKey | 'summary';

export const ONBOARDING_STEPS: OnboardingStep[] = ['intro', ...ONBOARDING_SECTION_KEYS, 'summary'];

interface State extends DraftState {
  stepIndex: number;
  direction: 1 | -1;
}

const INITIAL: State = { ...EMPTY_DRAFT_STATE, stepIndex: 0, direction: 1 };

const clamp = (index: number) => Math.max(0, Math.min(ONBOARDING_STEPS.length - 1, index));

// crypto.randomUUID c'è solo in un contesto sicuro (https o localhost): aperto da un indirizzo in http
// l'id nasce da getRandomValues, che c'è sempre, nello stesso formato UUID v4.
function newBrandId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// La bozza del brand nuovo, passo dopo passo; resta nel browser finché il brand non è creato.
@Injectable({ providedIn: 'root' })
export class OnboardingStore extends DraftStore<State> {
  private readonly auth = inject(AuthService);
  private readonly brands = inject(BrandsService);
  private readonly storageKey = computed(() => `moonbrand/onboarding/v1/${this.auth.account()?.id ?? 'anon'}`);
  protected readonly state = signal<State>(this.read(this.storageKey()));

  readonly stepIndex = computed(() => (this.state().draft ? this.state().stepIndex : 0));
  readonly step = computed(() => ONBOARDING_STEPS[this.stepIndex()]);
  readonly direction = computed(() => this.state().direction);

  constructor() {
    super();
    effect(() => {
      const key = this.storageKey();
      this.state.set(this.read(key));
    });
    effect(() => {
      const value = this.state();
      try {
        localStorage.setItem(this.storageKey(), JSON.stringify(value));
      } catch {}
    });
  }

  goTo(index: number): void {
    this.state.update((state) => ({ ...state, stepIndex: clamp(index), direction: index >= state.stepIndex ? 1 : -1 }));
  }

  next(): void {
    this.state.update((state) => ({ ...state, stepIndex: clamp(state.stepIndex + 1), direction: 1 }));
  }

  back(): void {
    this.state.update((state) => ({ ...state, stepIndex: clamp(state.stepIndex - 1), direction: -1 }));
  }

  chooseKind(kind: BrandKind): void {
    this.state.update((state) => ({
      ...state,
      brandId: state.brandId ?? newBrandId(),
      draft: state.draft ? changeDraftKind(state.draft, kind) : createEmptyDraft(kind),
    }));
  }

  async removeReference(file: MediaFile): Promise<void> {
    const brandId = this.state().brandId;
    if (brandId && file.path) await this.brands.removeReference(brandId, file.path);
    this.withoutReference(file);
  }

  reset(): void {
    this.state.set(INITIAL);
  }

  private read(key: string): State {
    try {
      const raw = localStorage.getItem(key);
      const state: State = raw ? { ...INITIAL, ...(JSON.parse(raw) as Partial<State>) } : INITIAL;
      return state.draft && !state.brandId ? { ...state, brandId: newBrandId() } : state;
    } catch {
      return INITIAL;
    }
  }
}
