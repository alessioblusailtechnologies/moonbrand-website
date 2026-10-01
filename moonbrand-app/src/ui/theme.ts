import type { SlotStatus } from '@moonbrand/shared/domain/plan';

// La palette dello studio (styles.scss): blu notte, arancio, grigi caldi, fondo avorio.
export const colors = {
  ink: '#000000',
  primary: '#0b1324',
  primarySoft: '#26324a',
  accent: '#f29a2e',
  accentStrong: '#c96f10',
  accentSoft: '#fdd08a',
  accentTint: '#fdf1e2',
  grey100: '#f1efea',
  grey300: '#d4d2cc',
  grey500: '#98a2b3',
  mint: '#6dd47e',
  mintTint: '#e3f6e6',
  success: '#2f9e6a',
  danger: '#d64528',
  dangerTint: '#fbe6e1',
  white: '#ffffff',
  surface: '#fafaf8',
  card: '#ffffff',
  sunken: '#f1efea',
  title: '#0b1324',
  body: '#667085',
  border: '#e9e8e4',
  borderField: '#d4d2cc',
  sidebarText: '#c4ccda',
  sidebarMuted: '#7e8aa3',
  scrim: 'rgba(0, 0, 0, 0.55)',
};

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, card: 24, pill: 999 };

export const fonts = {
  regular: 'Geist_400Regular',
  medium: 'Geist_500Medium',
  semibold: 'Geist_600SemiBold',
  bold: 'Geist_700Bold',
};

export const shadow = {
  card: {
    shadowColor: '#0b1324',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  lifted: {
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
};

// Il colore di ogni stato di un'uscita, come nel piano dello studio.
export const SLOT_TONES: Record<SlotStatus, string> = {
  empty: colors.grey300,
  toPrepare: colors.accentSoft,
  toApprove: colors.accent,
  scheduled: colors.primary,
  published: colors.mint,
};
