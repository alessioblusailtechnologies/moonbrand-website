import type { IdeaSignalKind } from '@moonbrand/shared/domain/idea';

export const SIGNAL_LABELS: Record<IdeaSignalKind, string> = {
  theme: 'Tema',
  trend: 'Trend',
  recurrence: 'Ricorrenza',
  season: 'Stagione',
  network: 'Rete',
  prompt: 'Tua',
  link: 'Da un link',
  document: 'Da un documento',
};
