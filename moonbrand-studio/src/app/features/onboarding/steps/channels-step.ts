import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';

import { isConnected, type BrandDraft, type ChannelId, type ChannelState } from '@moonbrand/shared/domain/brand';
import { CHANNELS, channelName } from '@moonbrand/shared/domain/catalog';

import { ChannelMark } from '../../../ui/channel-mark';
import { ToastService } from '../../../ui/toast';
import { DraftStore } from '../draft-store';
import { MockAi } from '../mock-ai';

@Component({
  selector: 'mb-channels-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChannelMark],
  template: `
    @for (channel of channels; track channel.id) {
      @let state = draft().channels[channel.id];
      @let connected = isConnected(state);
      <div class="card" [class.selected]="state.selected">
        <button class="toggle" type="button" role="checkbox" [attr.aria-checked]="state.selected" (click)="toggle(channel.id, state)">
          <mb-channel-mark [channel]="channel.id" [active]="state.selected" [size]="30" />
          <span class="grow texts">
            <span class="strong">{{ channel.name }}</span>
            <span class="caption" [class.ink]="connected">{{ status(channel.id, state) }}</span>
          </span>
        </button>
        @if (connected) {
          <button class="btn btn-ghost btn-sm" type="button" (click)="disconnect(channel.id)">Scollega</button>
        } @else {
          <button class="btn btn-primary btn-sm" type="button" [disabled]="connecting() !== null" (click)="connect(channel.id)">
            {{ connecting() === channel.id ? 'Collego…' : 'Collega' }}
          </button>
        }
      </div>
    }
    <p class="caption">Scegline almeno uno. Collegarli serve solo per pubblicare: puoi farlo adesso o dalle Impostazioni brand.</p>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .card {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px 12px 12px;
      border: 1.5px solid transparent;
      border-radius: var(--radius-xl);
      background: var(--white);
      transition: border-color 120ms var(--ease);
    }
    .card.selected {
      border-color: var(--border-strong);
    }
    .toggle {
      display: flex;
      flex: 1;
      align-items: center;
      gap: 14px;
      min-width: 0;
      padding: 4px;
      border: 0;
      background: none;
      text-align: left;
      cursor: pointer;
    }
    .texts {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
  `,
})
export class ChannelsStep {
  private readonly ai = inject(MockAi);
  private readonly toast = inject(ToastService);
  private readonly store = inject(DraftStore);
  readonly draft = input.required<BrandDraft>();

  protected readonly channels = CHANNELS;
  protected readonly isConnected = isConnected;
  protected readonly connecting = signal<ChannelId | null>(null);

  protected status(id: ChannelId, state: ChannelState): string {
    if (isConnected(state)) return `Collegato come ${state.handle}`;
    if (this.connecting() === id) return 'Ti porto alla pagina di accesso…';
    return state.selected ? 'Scelto · da collegare per pubblicare' : 'Tocca per sceglierlo';
  }

  protected toggle(id: ChannelId, state: ChannelState): void {
    this.update(id, state.selected ? { selected: false, handle: null } : { selected: true });
  }

  protected async connect(id: ChannelId): Promise<void> {
    this.connecting.set(id);
    try {
      const { handle } = await this.ai.connectChannel(this.draft().identity);
      this.update(id, { selected: true, handle });
      this.toast.show(`${channelName(id)} collegato.`);
    } catch {
      this.toast.show(`Non riesco a collegare ${channelName(id)}. Riprova.`);
    } finally {
      this.connecting.set(null);
    }
  }

  protected disconnect(id: ChannelId): void {
    this.update(id, { handle: null });
    this.toast.show(`${channelName(id)} scollegato.`);
  }

  private update(id: ChannelId, patch: Partial<ChannelState>): void {
    const channels = this.store.draft()?.channels ?? this.draft().channels;
    this.store.patch({ key: 'channels', value: { ...channels, [id]: { ...channels[id], ...patch } } });
  }
}
