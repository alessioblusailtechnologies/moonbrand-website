import type { ChannelId } from './brand';

// Il contenuto: una variante di testo per canale e il visivo del formato scelto.
// Stessa entità di social-app (tabella presenza.contents).

export type ContentFormat = 'post' | 'carousel' | 'video' | 'article';

export type ContentStatus = 'draft' | 'approved';

export interface ChannelVariant {
  channel: ChannelId;
  text: string;
  hashtags: string[];
}

export interface CarouselSlide {
  title: string;
  body: string;
}

// Un file del contenuto nella cartella del brand: la copertina (una per proporzione), una slide (un giro per proporzione),
// il video (uno per proporzione, con la copertina della stessa proporzione) o il documento PDF del carosello per LinkedIn.
export interface ContentFile {
  file: string;
  role: 'cover' | 'slide' | 'video' | 'document';
  index: number;
  aspect: string;
  url?: string;
}

// Da dove viene quello che si vede in un'inquadratura: una clip generata, una foto generata,
// foto o clip dell'utente, oppure solo grafica e testo.
export type SceneSource = 'clip' | 'photo' | 'user' | 'graphics';

// Un'inquadratura del copione di un video.
export interface VideoScene {
  seconds: number;
  // Cosa si vede: soggetto, tipo di inquadratura e movimento di macchina.
  shot: string;
  source: SceneSource;
  // Il testo a schermo, vuoto se non c'è.
  onScreen: string;
  // La voce fuori campo in questa inquadratura, vuota se non c'è.
  voice: string;
}

// Stessa forma che legge social-app, più i file che produce moonbrand.
// In un video script è l'idea in breve (tono, ritmo, musica, voce) e scenes sono le inquadrature del copione.
export interface ContentVisual {
  headline: string;
  slides: CarouselSlide[];
  script: string;
  scenes: VideoScene[];
  design: unknown;
  // L'impaginazione in una frase, scritta da chi l'ha fatta: i contenuti dopo la leggono per variare, senza riguardare le immagini.
  layout?: string;
  files?: ContentFile[];
}

export interface Content {
  id: string;
  brandId: string;
  ideaId: string | null;
  // L'uscita del piano in cui esce, se è programmato.
  slotId: string | null;
  // La conversazione in cui è nato, se viene dalla chat.
  conversationId: string | null;
  title: string;
  themeId: string | null;
  channels: ChannelId[];
  format: ContentFormat;
  variants: ChannelVariant[];
  visual: ContentVisual;
  status: ContentStatus;
  revision: number;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
}

// Come esce ogni formato su ogni canale: la proporzione di copertina, slide o video, null se il canale non lo regge.
// X non ha caroselli (al massimo 4 immagini, senza scorrimento); su TikTok il carosello è il photo mode in 9:16
// e l'articolo non c'è, perché non si esce dall'app. L'articolo di LinkedIn ha la copertina in 16:9, altrove è un post che lo presenta.
export const FORMAT_ASPECT: Record<ContentFormat, Record<ChannelId, string | null>> = {
  post: { linkedin: '1:1', instagram: '4:5', facebook: '4:5', tiktok: '9:16', x: '16:9' },
  carousel: { linkedin: '4:5', instagram: '4:5', facebook: '4:5', tiktok: '9:16', x: null },
  article: { linkedin: '16:9', instagram: '4:5', facebook: '4:5', tiktok: null, x: '16:9' },
  video: { linkedin: '4:5', instagram: '9:16', facebook: '9:16', tiktok: '9:16', x: '16:9' },
};

export const VIDEO_ASPECT = FORMAT_ASPECT.video as Record<ChannelId, string>;

export const supportsFormat = (format: ContentFormat, channel: ChannelId): boolean => FORMAT_ASPECT[format][channel] !== null;

// Le proporzioni che servono per questi canali, senza doppioni, nell'ordine dei canali.
export const formatAspects = (format: ContentFormat, channels: readonly ChannelId[]): string[] => [
  ...new Set(channels.flatMap((channel) => FORMAT_ASPECT[format][channel] ?? [])),
];

// Su LinkedIn un carosello si pubblica come documento: le slide in un PDF, che fa moonbrand.
export const hasDocument = (format: ContentFormat, channels: readonly ChannelId[]): boolean => format === 'carousel' && channels.includes('linkedin');

// I caratteri che ogni canale accetta in un post, hashtag compresi (su X senza abbonamento).
export const TEXT_LIMIT: Record<ChannelId, number> = { linkedin: 3000, instagram: 2200, facebook: 63206, tiktok: 4000, x: 280 };

// Il testo come si incolla sul canale: gli hashtag in fondo, dopo una riga vuota.
const ROLE_ORDER: Record<ContentFile['role'], number> = { cover: 0, slide: 1, video: 2, document: 3 };

// Nell'ordine in cui si mostrano: copertine, slide, video e documento, ognuno per index.
export const sortFiles = <T extends Pick<ContentFile, 'role' | 'index'>>(files: readonly T[]): T[] =>
  [...files].sort((a, b) => (a.role === b.role ? a.index - b.index : ROLE_ORDER[a.role] - ROLE_ORDER[b.role]));

export const postText = (variant: Pick<ChannelVariant, 'text' | 'hashtags'>): string => [variant.text, variant.hashtags.join(' ')].filter(Boolean).join('\n\n');

// Un video nasce in due tempi: prima il copione, da approvare, poi il video.
export const hasScript = (content: Pick<Content, 'format' | 'visual'>): boolean => content.format === 'video' && content.visual.scenes.length > 0;
export const hasVideo = (content: Pick<Content, 'visual'>): boolean => (content.visual.files ?? []).some((file) => file.role === 'video');

// Gli hashtag che ogni canale regge al massimo.
export const HASHTAGS: Record<ChannelId, number> = { linkedin: 3, instagram: 6, facebook: 2, tiktok: 4, x: 2 };

// Con # davanti, senza spazi né doppioni, al massimo quelli del canale.
export function cleanHashtags(hashtags: readonly string[], channel: ChannelId): string[] {
  const clean = hashtags
    .map((tag) => tag.trim().replace(/\s+/g, '').replace(/^#*/, ''))
    .filter(Boolean)
    .map((tag) => `#${tag}`);
  return [...new Set(clean)].slice(0, HASHTAGS[channel]);
}
