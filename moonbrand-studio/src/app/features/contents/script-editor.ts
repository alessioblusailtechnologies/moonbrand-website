import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output } from '@angular/core';

import type { ContentScriptRequest } from '@moonbrand/shared/api/contract';
import type { Content, SceneSource, VideoScene } from '@moonbrand/shared/domain/content';

import { Icon } from '../../ui/icon';
import { SOURCE_LABELS } from './labels';

const SOURCES = Object.keys(SOURCE_LABELS) as SceneSource[];

const EMPTY_SCENE: VideoScene = { seconds: 3, shot: '', source: 'graphics', onScreen: '', voice: '' };

// Il copione di un video: l'idea in breve e le inquadrature, da leggere e correggere prima di generare il video.
// Le correzioni restano qui finché non si salvano; "Genera il video" salva e poi genera.
@Component({
  selector: 'mb-script-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <div class="panel script">
      <div class="head">
        <div class="grow">
          <p class="strong">Il copione</p>
          <p class="caption">{{ summary() }}</p>
        </div>
        @if (dirty()) {
          <button class="btn btn-secondary btn-sm" type="button" [disabled]="busy()" (click)="save()">Salva il copione</button>
        }
        <button class="btn btn-primary btn-sm" type="button" [disabled]="busy() || !valid()" (click)="generate()">
          {{ hasVideo() ? 'Rifai il video' : 'Genera il video' }}
        </button>
      </div>

      <label class="stack">
        <span class="label">L’idea in breve</span>
        <textarea class="sunken" rows="2" [value]="script()" [disabled]="busy()" (input)="script.set(value($event))"></textarea>
      </label>

      <ol class="scenes">
        @for (scene of scenes(); track $index; let i = $index) {
          <li class="scene">
            <div class="scene-head">
              <span class="number">{{ i + 1 }}</span>
              <label class="seconds">
                <input class="sunken" type="number" min="0.5" step="0.5" aria-label="Durata in secondi" [value]="scene.seconds"
                  [disabled]="busy()" (input)="update(i, { seconds: number($event) })" />
                <span class="caption">s</span>
              </label>
              <select class="sunken source" aria-label="Da dove viene" [disabled]="busy()" (change)="update(i, { source: sourceOf($event) })">
                @for (source of sources; track source) {
                  <option [value]="source" [selected]="scene.source === source">{{ sourceLabel[source] }}</option>
                }
              </select>
              <button class="icon-btn" type="button" aria-label="Togli l’inquadratura" [disabled]="busy() || scenes().length === 1"
                (click)="remove(i)">
                <mb-icon name="trash" [size]="16" />
              </button>
            </div>
            <label class="stack">
              <span class="label">Cosa si vede</span>
              <textarea class="sunken" rows="2" [value]="scene.shot" [disabled]="busy()" (input)="update(i, { shot: value($event) })"></textarea>
            </label>
            @if (scene.source === 'user') {
              <p class="caption">Serve una tua foto o clip: mandala in chat o caricala tra i file del brand prima di generare il video.</p>
            }
            <div class="pair">
              <label class="stack">
                <span class="label">A schermo</span>
                <textarea class="sunken" rows="2" [value]="scene.onScreen" [disabled]="busy()"
                  (input)="update(i, { onScreen: value($event) })"></textarea>
              </label>
              <label class="stack">
                <span class="label">Voce</span>
                <textarea class="sunken" rows="2" [value]="scene.voice" [disabled]="busy()" (input)="update(i, { voice: value($event) })"></textarea>
              </label>
            </div>
          </li>
        }
      </ol>

      <button class="btn btn-ghost btn-sm add" type="button" [disabled]="busy()" (click)="add()">
        <mb-icon name="plus" [size]="16" /> Aggiungi un’inquadratura
      </button>
    </div>
  `,
  styles: `
    .script {
      gap: 16px;
    }
    .head {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .stack {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .scenes {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .scene {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 14px;
      border: 1px solid var(--border-card);
      border-radius: var(--radius-lg);
    }
    .scene-head {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .number {
      display: grid;
      place-items: center;
      width: 26px;
      height: 26px;
      border-radius: 999px;
      background: var(--primary);
      color: var(--white);
      font-size: 12px;
      font-weight: 600;
    }
    .seconds {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .seconds input {
      width: 72px;
      min-height: 34px;
      padding: 6px 10px;
    }
    .source {
      width: auto;
      min-height: 34px;
      padding: 6px 10px;
      margin-right: auto;
    }
    .pair {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    @media (max-width: 640px) {
      .pair {
        grid-template-columns: 1fr;
      }
    }
    .add {
      align-self: flex-start;
      gap: 6px;
    }
  `,
})
export class ScriptEditor {
  readonly content = input.required<Content>();
  readonly busy = input(false);
  readonly saved = output<ContentScriptRequest>();
  readonly generated = output<ContentScriptRequest | null>();

  // La bozza riparte dal contenuto ogni volta che il contenuto cambia (salvato, ritoccato, rifatto).
  protected readonly script = linkedSignal(() => this.content().visual.script);
  protected readonly scenes = linkedSignal(() => this.content().visual.scenes.map((scene) => ({ ...scene })));

  protected readonly sources = SOURCES;
  protected readonly sourceLabel = SOURCE_LABELS;
  protected readonly hasVideo = computed(() => (this.content().visual.files ?? []).some((file) => file.role === 'video'));
  protected readonly dirty = computed(
    () => this.script() !== this.content().visual.script || JSON.stringify(this.scenes()) !== JSON.stringify(this.content().visual.scenes),
  );
  protected readonly valid = computed(() => this.scenes().length > 0 && this.scenes().every((scene) => scene.seconds > 0));
  protected readonly summary = computed(() => {
    const seconds = this.scenes().reduce((total, scene) => total + (scene.seconds || 0), 0);
    const count = this.scenes().length;
    return `${Math.round(seconds)} secondi · ${count} ${count === 1 ? 'inquadratura' : 'inquadrature'}`;
  });

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
  }

  protected sourceOf(event: Event): SceneSource {
    return (event.target as HTMLSelectElement).value as SceneSource;
  }

  protected number(event: Event): number {
    return Number((event.target as HTMLInputElement).value) || 0;
  }

  protected update(index: number, change: Partial<VideoScene>): void {
    this.scenes.update((scenes) => scenes.map((scene, i) => (i === index ? { ...scene, ...change } : scene)));
  }

  protected add(): void {
    this.scenes.update((scenes) => [...scenes, { ...EMPTY_SCENE }]);
  }

  protected remove(index: number): void {
    this.scenes.update((scenes) => scenes.filter((_, i) => i !== index));
  }

  private request(): ContentScriptRequest {
    return { script: this.script(), scenes: this.scenes() };
  }

  protected save(): void {
    this.saved.emit(this.request());
  }

  // Con correzioni non salvate, la pagina le salva prima di generare.
  protected generate(): void {
    this.generated.emit(this.dirty() ? this.request() : null);
  }
}
