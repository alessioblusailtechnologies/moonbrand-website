import type { WebsiteInsights } from '@moonbrand/shared/ai/steps';
import type { Identity } from '@moonbrand/shared/domain/brand';
import { normalizeSite } from '@moonbrand/shared/lib/site';

const MIN_PITCH_WORDS = 6;

export interface PositioningSource {
  key: string;
  site: WebsiteInsights | null;
}

export function positioningSource(identity: Identity, insights: WebsiteInsights | null): PositioningSource | null {
  const site = insights?.pitch && insights.site === normalizeSite(identity.site) ? insights : null;
  const words = identity.pitch.trim().split(/\s+/).filter(Boolean).length;
  if (!site && words < MIN_PITCH_WORDS) return null;
  const { kind, role, company, sector, pitch } = identity;
  return { key: JSON.stringify([kind, role, company, sector, pitch.trim(), site?.site ?? '']), site };
}
