import type { ChannelId } from './brand';

// Un'idea è il punto di partenza di un contenuto: cosa raccontare, con quale taglio e perché adesso.
// Stessa entità di social-app (tabella presenza.ideas).

export type IdeaSignalKind = 'theme' | 'trend' | 'recurrence' | 'season' | 'network' | 'prompt' | 'link' | 'document';

export type IdeaFormat = 'post' | 'carousel' | 'video' | 'article';

export type IdeaStatus = 'new' | 'saved' | 'discarded';

export interface IdeaDraft {
  title: string;
  angleLabel: string;
  angle: string;
  rationale: string;
  themeId: string | null;
  // label: la fonte in poche parole (può mancare); sourceUrl: l'articolo da cui nasce un trend.
  signal: { kind: IdeaSignalKind; label: string; sourceUrl?: string };
  formats: IdeaFormat[];
  channels: ChannelId[];
}

export interface Idea extends IdeaDraft {
  id: string;
  brandId: string;
  createdAt: string;
  status: IdeaStatus;
  decidedAt: string | null;
}
