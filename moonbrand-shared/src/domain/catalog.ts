import { palette } from '../design/tokens';
import type { BrandDraft, BrandKind, ChannelId, Channels, Palette, SignalSource, TypographyId } from './brand';

export const KIND_OPTIONS: { kind: BrandKind; title: string; meta: string; label: string }[] = [
  { kind: 'person', title: 'Per me', meta: 'Personal brand: parli in prima persona, con il tuo nome', label: 'Personal brand' },
  { kind: 'company', title: 'Per la mia azienda', meta: 'Il brand parla a nome del team, dei servizi e dei prodotti', label: 'Azienda' },
  { kind: 'client', title: 'Per un cliente', meta: 'Curi la presenza di qualcun altro, come agenzia o freelance', label: 'Cliente' },
];

export function kindLabel(kind: BrandKind): string {
  return KIND_OPTIONS.find((option) => option.kind === kind)?.label ?? '';
}

export const CHANNELS: { id: ChannelId; name: string }[] = [
  { id: 'linkedin', name: 'LinkedIn' },
  { id: 'instagram', name: 'Instagram' },
  { id: 'facebook', name: 'Facebook' },
  { id: 'tiktok', name: 'TikTok' },
  { id: 'x', name: 'X' },
];

// Gli esempi di post dell'onboarding: al massimo MAX_EXAMPLES, uno per canale sui primi canali scelti; con un canale
// solo, tutti su quello.
export const MAX_EXAMPLES = 2;

export function exampleChannels(channels: readonly ChannelId[]): ChannelId[] {
  return channels.slice(0, MAX_EXAMPLES);
}

export function examplesPerChannel(channels: readonly ChannelId[]): number {
  return Math.max(1, Math.floor(MAX_EXAMPLES / Math.max(1, exampleChannels(channels).length)));
}

export function channelName(id: ChannelId): string {
  return CHANNELS.find((channel) => channel.id === id)?.name ?? id;
}

const BUSINESS_GOALS = [
  'Far conoscere il brand',
  'Vendere di più',
  'Fidelizzare i clienti',
  'Lanciare un prodotto',
  'Attirare candidati',
  'Costruire una community',
];

export const GOALS: Record<BrandKind, string[]> = {
  person: ['Autorevolezza nel settore', 'Trovare clienti', 'Attirare candidati', 'Raccogliere investimenti', 'Costruire una community'],
  company: BUSINESS_GOALS,
  client: BUSINESS_GOALS,
};

const BUSINESS_AUDIENCES = ['Clienti privati', 'Aziende', 'Rivenditori', 'Candidati', 'Community locale'];

export const AUDIENCES: Record<BrandKind, string[]> = {
  person: ['Founder di PMI', 'Direttori operativi', 'Sviluppatori', 'Investitori', 'Candidati'],
  company: BUSINESS_AUDIENCES,
  client: BUSINESS_AUDIENCES,
};

export const THEME_COLORS = [palette.navy700, palette.orange500, palette.lime400, palette.mint400, palette.yellow400, palette.navy500];

export const PALETTE_PRESETS: Palette[] = [
  { id: 'indigo-coral', name: 'Indigo e coral', colors: ['#1C2150', '#2F3452', '#FF6B35', '#ECEEEF'], origin: 'preset' },
  { id: 'navy-lime', name: 'Navy e lime', colors: ['#2F3452', '#D9E05B', '#6DD47E', '#FFFFFF'], origin: 'preset' },
  { id: 'navy-grey', name: 'Solo navy e grigio', colors: ['#2F3452', '#8A8F9A', '#CDD1D4', '#ECEEEF'], origin: 'preset' },
];

export const PALETTE_SLOT_LABELS = ['Principale', 'Secondario', 'Accento', 'Sfondo'] as const;

export interface FontFace {
  family: string;
  weight: number;
}

export const TYPOGRAPHY_OPTIONS: { id: TypographyId; name: string; heading: FontFace; body: FontFace }[] = [
  { id: 'inter', name: 'Moderno', heading: { family: 'Inter Tight', weight: 700 }, body: { family: 'Inter', weight: 400 } },
  { id: 'archivo', name: 'Deciso', heading: { family: 'Archivo', weight: 800 }, body: { family: 'Archivo', weight: 400 } },
  { id: 'space-grotesk', name: 'Tecnico', heading: { family: 'Space Grotesk', weight: 700 }, body: { family: 'Inter', weight: 400 } },
  { id: 'manrope', name: 'Morbido', heading: { family: 'Manrope', weight: 800 }, body: { family: 'Manrope', weight: 400 } },
  { id: 'fraunces', name: 'Editoriale', heading: { family: 'Fraunces', weight: 700 }, body: { family: 'Inter', weight: 400 } },
  { id: 'dm-serif', name: 'Elegante', heading: { family: 'DM Serif Display', weight: 400 }, body: { family: 'DM Sans', weight: 400 } },
  { id: 'playfair', name: 'Classico', heading: { family: 'Playfair Display', weight: 700 }, body: { family: 'Source Sans 3', weight: 400 } },
  { id: 'ibm-plex', name: 'Istituzionale', heading: { family: 'IBM Plex Sans', weight: 700 }, body: { family: 'IBM Plex Sans', weight: 400 } },
];

export function typographyOption(id: TypographyId | undefined) {
  return TYPOGRAPHY_OPTIONS.find((option) => option.id === id) ?? TYPOGRAPHY_OPTIONS[0];
}

export const LINE_FONTS: { id: string; family: string }[] = [
  { id: 'newsreader', family: 'Newsreader' },
  { id: 'source-serif', family: 'Source Serif 4' },
  { id: 'fraunces', family: 'Fraunces' },
  { id: 'playfair', family: 'Playfair Display' },
  { id: 'dm-serif', family: 'DM Serif Display' },
  { id: 'instrument-serif', family: 'Instrument Serif' },
  { id: 'eb-garamond', family: 'EB Garamond' },
  { id: 'cormorant', family: 'Cormorant Garamond' },
  { id: 'lora', family: 'Lora' },
  { id: 'inter-tight', family: 'Inter Tight' },
  { id: 'inter', family: 'Inter' },
  { id: 'archivo', family: 'Archivo' },
  { id: 'space-grotesk', family: 'Space Grotesk' },
  { id: 'manrope', family: 'Manrope' },
  { id: 'dm-sans', family: 'DM Sans' },
  { id: 'work-sans', family: 'Work Sans' },
  { id: 'plus-jakarta', family: 'Plus Jakarta Sans' },
  { id: 'source-sans', family: 'Source Sans 3' },
  { id: 'ibm-plex-sans', family: 'IBM Plex Sans' },
  { id: 'syne', family: 'Syne' },
  { id: 'ibm-plex-mono', family: 'IBM Plex Mono' },
  { id: 'jetbrains-mono', family: 'JetBrains Mono' },
  { id: 'space-mono', family: 'Space Mono' },
  { id: 'dm-mono', family: 'DM Mono' },
];

export function lineFontFamily(id: string): string {
  return LINE_FONTS.find((font) => font.id === id)?.family ?? id;
}

export function lineFontId(family: string): string | null {
  return LINE_FONTS.find((font) => font.family === family)?.id ?? null;
}

const BUSINESS_SOURCES = (milestones: string): SignalSource[] => [
  { label: 'Testate di settore', enabled: true },
  { label: 'Recensioni dei clienti', enabled: true },
  { label: 'Trend su Instagram e TikTok', enabled: true },
  { label: 'Fiere ed eventi', enabled: true },
  { label: 'Ricorrenze e stagionalità', enabled: true },
  { label: milestones, enabled: true },
];

const DEFAULT_SOURCES: Record<BrandKind, SignalSource[]> = {
  person: [
    { label: 'Stampa economica', enabled: true },
    { label: 'Testate di settore', enabled: true },
    { label: 'La tua rete LinkedIn', enabled: true },
    { label: 'Eventi di settore', enabled: true },
    { label: 'Discussioni su X', enabled: false },
    { label: 'Le tue milestone', enabled: true },
  ],
  company: BUSINESS_SOURCES('Le milestone dell’azienda'),
  client: BUSINESS_SOURCES('Le milestone del cliente'),
};

function emptyChannels(): Channels {
  const channels = {} as Channels;
  for (const { id } of CHANNELS) channels[id] = { selected: false, handle: null };
  return channels;
}

export function createEmptyDraft(kind: BrandKind): BrandDraft {
  return {
    identity: { kind, name: '', role: '', company: '', sector: '', site: '', pitch: '' },
    positioning: { goals: [], audiences: [], postsPerWeek: 3 },
    channels: emptyChannels(),
    themes: [],
    voice: { cards: [] },
    visual: { logoUri: null, palette: PALETTE_PRESETS[0], imageStyle: 'flat-geometric', typography: 'inter', signature: true },
    references: { profiles: [], sources: DEFAULT_SOURCES[kind].map((source) => ({ ...source })), milestones: [] },
  };
}

export function changeDraftKind(draft: BrandDraft, kind: BrandKind): BrandDraft {
  if (draft.identity.kind === kind) return draft;
  return {
    ...draft,
    identity: { ...draft.identity, kind },
    positioning: { ...draft.positioning, goals: [], audiences: [] },
    references: { ...draft.references, sources: createEmptyDraft(kind).references.sources },
  };
}
