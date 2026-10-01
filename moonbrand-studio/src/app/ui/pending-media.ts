import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import type { AiStep } from '@moonbrand/shared/ai/steps';

import { Icon } from './icon';

// Una card in arrivo: la proporzione, se è un video, e quante ne arrivano in quella proporzione (le slide di un carosello).
// label: cosa dire quando il numero non si sa ancora.
export interface PendingTile {
  kind: 'image' | 'video';
  aspect: string;
  count: number;
  label?: string;
}

const SAVE_TOOLS = /^mcp__moonbrand__contenuto_(salva|aggiorna)$/;

// Le card che l'AI sta preparando, dai passaggi che generano immagini e video dopo l'ultimo salvataggio di un contenuto:
// una per proporzione, perché foto, clip e prove intermedie diventano la stessa uscita. Un video in una proporzione
// vale per tutta la proporzione; un file rifatto più volte si conta una volta.
export function pendingFromSteps(steps: readonly AiStep[]): PendingTile[] {
  const lastSave = steps.reduce((last, step, index) => (step.tool && SAVE_TOOLS.test(step.tool) && step.status === 'done' ? index : last), -1);
  const byAspect = new Map<string, { video: boolean; files: Set<string>; loose: number }>();
  for (const step of steps.slice(lastSave + 1)) {
    if (step.status === 'failed') continue;
    for (const item of step.media ?? []) {
      const group = byAspect.get(item.aspect) ?? { video: false, files: new Set<string>(), loose: 0 };
      if (item.kind === 'video') group.video = true;
      else if (item.file) group.files.add(item.file);
      else group.loose += 1;
      byAspect.set(item.aspect, group);
    }
  }
  return [...byAspect].map(([aspect, group]) => ({
    kind: group.video ? 'video' : 'image',
    aspect,
    count: group.video ? 1 : Math.max(1, group.files.size || group.loose),
  }));
}

// I segnaposto delle card in arrivo, come nei siti di generazione: la forma giusta, un velo di luce che scorre,
// e nessun risultato parziale. Al loro posto arriva il contenuto, quando è pronto.
@Component({
  selector: 'mb-pending-media',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    @if (tiles().length > 0) {
      <div class="strip" role="status" [attr.aria-label]="label()">
        @for (tile of tiles(); track tile.aspect) {
          <div class="tile" [class.stack]="tile.count > 1" [style.aspect-ratio]="ratio(tile.aspect)">
            <span class="shimmer" aria-hidden="true"></span>
            <span class="tile-label" aria-hidden="true">
              <mb-icon [name]="tile.kind === 'video' ? 'play' : 'image-plus'" [size]="14" />
              {{ tileLabel(tile) }}
            </span>
          </div>
        }
      </div>
    }
  `,
  styles: `
    .strip {
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
    }
    .tile {
      position: relative;
      height: var(--tile-height, 220px);
      max-width: 100%;
      border-radius: var(--radius-md);
      background: linear-gradient(135deg, #eceef3, #f6f1e8);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
      animation: breathe 2.4s ease-in-out infinite;
      overflow: hidden;
    }
    // Più card nella stessa proporzione (le slide): un mazzo, con quelle sotto che spuntano.
    .stack {
      overflow: visible;
      box-shadow:
        5px -5px 0 -1px #e3e5ea,
        10px -10px 0 -2px #eceef1,
        0 1px 3px rgba(0, 0, 0, 0.08);
      margin: 10px 10px 0 0;
    }
    .shimmer {
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background: linear-gradient(110deg, transparent 20%, rgba(255, 255, 255, 0.75) 45%, rgba(252, 163, 17, 0.16) 55%, transparent 80%);
      background-size: 250% 100%;
      animation: sweep 1.6s linear infinite;
    }
    .tile-label {
      position: absolute;
      right: 8px;
      bottom: 8px;
      left: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 5px 8px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.85);
      color: var(--text-title);
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
      backdrop-filter: blur(4px);
    }
    @keyframes sweep {
      from {
        background-position: 150% 0;
      }
      to {
        background-position: -100% 0;
      }
    }
    @keyframes breathe {
      50% {
        filter: brightness(0.96);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .tile,
      .shimmer {
        animation: none;
      }
    }
    @media (max-width: 640px) {
      .tile {
        height: var(--tile-height-small, 160px);
      }
    }
  `,
})
export class PendingMedia {
  readonly tiles = input.required<PendingTile[]>();

  protected ratio(aspect: string): string {
    return aspect.replace(':', ' / ');
  }

  protected tileLabel(tile: PendingTile): string {
    if (tile.label) return tile.label;
    if (tile.kind === 'video') return 'Preparo il video';
    return tile.count > 1 ? `Preparo ${tile.count} immagini` : 'Preparo la card';
  }

  protected label(): string {
    const count = this.tiles().reduce((sum, tile) => sum + tile.count, 0);
    return count === 1 ? 'Sto preparando una card' : `Sto preparando ${count} card`;
  }
}
