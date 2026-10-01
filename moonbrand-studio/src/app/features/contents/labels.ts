import type { ChannelId } from '@moonbrand/shared/domain/brand';
import type { ContentFormat, ContentStatus, SceneSource } from '@moonbrand/shared/domain/content';

export const FORMAT_LABELS: Record<ContentFormat, string> = {
  post: 'Post',
  carousel: 'Carosello',
  article: 'Articolo',
  video: 'Video',
};

export const FORMAT_OPTIONS: { id: ContentFormat; label: string; hint: string }[] = [
  { id: 'post', label: 'Post', hint: 'Testo e un’immagine' },
  { id: 'carousel', label: 'Carosello', hint: 'Da 5 a 7 slide da scorrere, su LinkedIn un documento PDF' },
  { id: 'article', label: 'Articolo', hint: 'Testo lungo su LinkedIn, altrove un post che lo presenta' },
  { id: 'video', label: 'Video', hint: 'Movimento, musica ed eventuale voce: prima il copione, poi il video' },
];

export const SOURCE_LABELS: Record<SceneSource, string> = {
  clip: 'Clip generata',
  photo: 'Foto generata',
  user: 'Foto o clip tua',
  graphics: 'Solo grafica',
};

export const STATUS_LABELS: Record<ContentStatus, string> = {
  draft: 'Bozza',
  approved: 'Approvato',
};

// Il formato in una richiesta: «crea un carosello per LinkedIn».
export const FORMAT_REQUEST: Record<ContentFormat, string> = { post: 'un post', carousel: 'un carosello', article: 'un articolo', video: 'un video' };

// Il formato dentro una frase: «su X il carosello non c'è».
export const FORMAT_NAMES: Record<ContentFormat, string> = { post: 'il post', carousel: 'il carosello', article: 'l’articolo', video: 'il video' };

// Quanti caratteri del testo si vedono nel feed prima di «…altro»: l'anteprima taglia lì, come il canale. X mostra tutto.
export const FOLD: Record<ChannelId, number | null> = { linkedin: 210, instagram: 125, facebook: 250, tiktok: 80, x: null };

export function cssAspect(aspect: string): string {
  return aspect.replace(':', ' / ');
}
