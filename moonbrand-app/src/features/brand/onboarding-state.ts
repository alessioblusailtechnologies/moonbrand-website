import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

import type { WebsiteInsights } from '@moonbrand/shared/ai/steps';
import type { BrandDraft, BrandKind, Identity } from '@moonbrand/shared/domain/brand';
import { changeDraftKind, createEmptyDraft } from '@moonbrand/shared/domain/catalog';
import { createThemes } from '@moonbrand/shared/domain/themes';

// La bozza del brand nuovo, passo dopo passo: resta sul telefono finché il brand non è creato, come nello studio.
// Voce e identità visiva si completano dopo, dal brand.
export const STEPS = ['kind', 'identity', 'positioning', 'channels', 'themes', 'summary'] as const;
export type Step = (typeof STEPS)[number];

export interface OnboardingState {
  step: number;
  brandId: string | null;
  draft: BrandDraft | null;
  insights: WebsiteInsights | null;
  themesEdited: boolean;
}

export const INITIAL: OnboardingState = { step: 0, brandId: null, draft: null, insights: null, themesEdited: false };

const key = (accountId: string) => `moonbrand/onboarding/v1/${accountId}`;

export async function readState(accountId: string): Promise<OnboardingState> {
  try {
    const raw = await AsyncStorage.getItem(key(accountId));
    return raw ? { ...INITIAL, ...(JSON.parse(raw) as Partial<OnboardingState>) } : INITIAL;
  } catch {
    return INITIAL;
  }
}

export function writeState(accountId: string, state: OnboardingState): void {
  void AsyncStorage.setItem(key(accountId), JSON.stringify(state)).catch(() => undefined);
}

export function clearState(accountId: string): void {
  void AsyncStorage.removeItem(key(accountId)).catch(() => undefined);
}

export function chooseKind(state: OnboardingState, kind: BrandKind): OnboardingState {
  return {
    ...state,
    brandId: state.brandId ?? Crypto.randomUUID(),
    draft: state.draft ? changeDraftKind(state.draft, kind) : createEmptyDraft(kind),
  };
}

// I temi di partenza quando non ci sono quelli del sito: gli stessi dello studio.
const STARTING_THEMES: Record<'person' | 'business', string[]> = {
  person: ['Casi reali con i numeri', 'Errori e cosa ho imparato', 'Il settore che cambia', 'Dietro le quinte'],
  business: ['Il prodotto da vicino', 'Clienti che raccontano', 'Dietro le quinte', 'Consigli pratici'],
};

export function withStartingThemes(state: OnboardingState): OnboardingState {
  const { draft } = state;
  if (!draft || draft.themes.length > 0) return state;
  const names = state.insights?.themes.length ? state.insights.themes : STARTING_THEMES[draft.identity.kind === 'person' ? 'person' : 'business'];
  return { ...state, draft: { ...draft, themes: createThemes(names) } };
}

// Un campo si riempie dal sito solo se è vuoto o contiene ancora quanto letto la volta prima.
function fillFromSite(identity: Identity, insights: WebsiteInsights, previous: WebsiteInsights | null): Identity {
  const fill = (value: string, next: string, before: string | undefined) => (next && (!value.trim() || value === before) ? next : value);
  const nameKey = identity.kind === 'person' ? 'company' : 'name';
  return {
    ...identity,
    [nameKey]: fill(identity[nameKey], insights.name, previous?.name),
    ...(identity.kind !== 'person' && { sector: fill(identity.sector, insights.sector, previous?.sector) }),
    pitch: fill(identity.pitch, insights.pitch, previous?.pitch),
  };
}

export function applyInsights(state: OnboardingState, insights: WebsiteInsights): OnboardingState {
  const { draft } = state;
  if (!draft) return state;
  const siteLogo = !draft.visual.logoUri || draft.visual.logoUri === state.insights?.logoUri;
  const visual = draft.visual.palette.origin === 'custom' ? draft.visual : { ...draft.visual, palette: insights.palette };
  return {
    ...state,
    insights,
    draft: {
      ...draft,
      identity: fillFromSite(draft.identity, insights, state.insights),
      themes: state.themesEdited || insights.themes.length === 0 ? draft.themes : createThemes(insights.themes),
      positioning: {
        ...draft.positioning,
        goals: draft.positioning.goals.length ? draft.positioning.goals : insights.goals.slice(0, 2),
        audiences: draft.positioning.audiences.length ? draft.positioning.audiences : insights.audiences.slice(0, 2),
      },
      visual: siteLogo && insights.logoUri ? { ...visual, logoUri: insights.logoUri } : visual,
    },
  };
}
