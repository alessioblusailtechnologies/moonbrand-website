import { ChangeDetectionStrategy, Component, computed, input, output, signal, viewChild, type OnInit } from '@angular/core';

import type { CreateContentRequest } from '@moonbrand/shared/api/contract';
import type { ChannelId } from '@moonbrand/shared/domain/brand';
import { supportsFormat, type ContentFormat } from '@moonbrand/shared/domain/content';
import { channelName } from '@moonbrand/shared/domain/catalog';
import type { Idea } from '@moonbrand/shared/domain/idea';

import { lockPageScroll } from '../../ui/scroll-lock';
import { Composer, type ComposerMessage } from '../chat/composer';
import { FORMAT_NAMES, FORMAT_OPTIONS } from '../contents/labels';

// Il contenuto da creare in chat: formato e canali, e quello che si aggiunge all'idea (testo e allegati).
export type IdeaContentRequest = CreateContentRequest & ComposerMessage;

@Component({
  selector: 'mb-create-content-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Composer],
  host: { '(document:keydown.escape)': 'busy() || closed.emit()' },
  template: `
    <div class="backdrop" (click)="busy() || closed.emit()"></div>
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="create-content-title">
      <div class="stack">
        <h2 id="create-content-title" class="dialog-title">Crea il contenuto</h2>
        <p class="body">{{ idea().title }}</p>
        <p class="caption">Si apre una conversazione nuova con l’assistente, che parte da questa idea.</p>
      </div>

      <div class="stack">
        <p class="label">Formato</p>
        <div class="formats" role="radiogroup" aria-label="Formato">
          @for (option of formats; track option.id) {
            <button class="option-card" type="button" role="radio" [attr.aria-checked]="format() === option.id"
              [class.selected]="format() === option.id" (click)="choose(option.id)">
              <span class="grow">
                <span class="strong-sm">{{ option.label }}</span>
                <span class="caption">{{ option.hint }}</span>
              </span>
              <span class="radio-mark" [class.on]="format() === option.id"></span>
            </button>
          }
        </div>
      </div>

      <div class="stack">
        <p class="label">Canali</p>
        <div class="chips" role="group" aria-label="Canali">
          @for (channel of channels(); track channel) {
            <button class="chip" type="button" [attr.aria-pressed]="selected().includes(channel)" [class.selected]="selected().includes(channel)"
              [disabled]="!supports(channel)" (click)="toggle(channel)">
              {{ name(channel) }}
            </button>
          }
        </div>
        @if (unsupported()) {
          <p class="caption">{{ unsupported() }}</p>
        }
      </div>

      <div class="stack">
        <p class="label">Aggiungi all’idea</p>
        <mb-composer
          label="Indicazioni per l’assistente"
          placeholder="Indicazioni, dettagli, cosa evitare… e le tue foto o i tuoi video, se vuoi (facoltativo)"
          [tall]="true"
          [empty]="true"
          [send]="false"
          [busy]="busy()"
          (submitted)="submit()"
        />
      </div>

      <div class="actions">
        <button class="btn btn-secondary" type="button" [disabled]="busy()" (click)="closed.emit()">Annulla</button>
        <button class="btn btn-primary" type="button" [disabled]="busy() || selected().length === 0 || composer()?.uploading()" (click)="submit()">
          {{ busy() ? 'Apro la chat…' : 'Crea in chat' }}
        </button>
      </div>
    </div>
  `,
  styles: `
    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 70;
      background: var(--scrim);
      animation: fade-in 160ms var(--ease);
    }
    .dialog {
      position: fixed;
      top: 50%;
      left: 50%;
      z-index: 71;
      display: flex;
      flex-direction: column;
      gap: 18px;
      width: min(560px, calc(100vw - 32px));
      max-height: calc(100vh - 32px);
      overflow-y: auto;
      padding: 24px;
      border-radius: var(--radius-lg);
      background: var(--surface-card);
      box-shadow: var(--shadow-menu);
      transform: translate(-50%, -50%);
      animation: dialog-in 180ms var(--ease);
    }
    .dialog-title {
      margin: 0;
      color: var(--text-title);
      font-size: 17px;
      font-weight: 600;
    }
    .stack {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .body {
      margin: 0;
    }
    // Due colonne: la finestra resta bassa e la casella si vede senza scorrere.
    .formats {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    @media (max-width: 520px) {
      .formats {
        grid-template-columns: 1fr;
      }
    }
    .chip:disabled {
      border-color: var(--grey-100);
      color: var(--grey-300);
      cursor: not-allowed;
    }
    .option-card {
      padding: 12px 14px;
      border-color: var(--grey-100);
      background: var(--surface-card);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
  `,
})
export class CreateContentDialog implements OnInit {
  readonly idea = input.required<Idea>();
  readonly channels = input.required<ChannelId[]>();
  readonly busy = input(false);
  readonly closed = output();
  readonly created = output<IdeaContentRequest>();

  constructor() {
    lockPageScroll();
  }

  protected readonly composer = viewChild(Composer);
  protected readonly formats = FORMAT_OPTIONS;
  protected readonly format = signal<ContentFormat>('post');
  protected readonly selected = signal<ChannelId[]>([]);
  protected readonly name = channelName;

  // I canali del brand che non reggono il formato scelto, detti in una frase.
  protected readonly unsupported = computed(() => {
    const names = this.channels()
      .filter((channel) => !supportsFormat(this.format(), channel))
      .map(channelName);
    return names.length > 0 ? `Su ${names.join(' e ')} ${FORMAT_NAMES[this.format()]} non c’è.` : '';
  });

  ngOnInit(): void {
    this.selected.set(this.channels().filter((channel) => supportsFormat(this.format(), channel)));
  }

  protected supports(channel: ChannelId): boolean {
    return supportsFormat(this.format(), channel);
  }

  // Cambiando formato si riparte da tutti i canali che lo reggono.
  protected choose(format: ContentFormat): void {
    this.format.set(format);
    this.selected.set(this.channels().filter((channel) => supportsFormat(format, channel)));
  }

  protected toggle(channel: ChannelId): void {
    this.selected.update((list) => (list.includes(channel) ? list.filter((item) => item !== channel) : [...list, channel]));
  }

  // Parte quando gli allegati sono tutti caricati.
  protected submit(): void {
    const note = this.composer()?.value();
    if (this.selected().length > 0 && note) this.created.emit({ format: this.format(), channels: this.selected(), ...note });
  }
}
