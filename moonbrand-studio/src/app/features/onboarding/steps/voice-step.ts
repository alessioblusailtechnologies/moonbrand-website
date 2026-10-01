import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';

import type { AiStep } from '@moonbrand/shared/ai/steps';
import { currentVoiceCard, isConnected, type BrandDraft, type VoiceCard } from '@moonbrand/shared/domain/brand';
import { CHANNELS } from '@moonbrand/shared/domain/catalog';

import { errorMessage } from '../../../core/errors';
import { Icon, type IconName } from '../../../ui/icon';
import { StepList } from '../../../ui/step-list';
import { ToastService } from '../../../ui/toast';
import { DraftStore } from '../draft-store';
import { MockAi, type VoiceAnalysis, type VoiceSample } from '../mock-ai';

const ROWS = [
  { key: 'register', label: 'Registro' },
  { key: 'rhythm', label: 'Ritmo' },
  { key: 'lexicon', label: 'Lessico ammesso' },
  { key: 'avoid', label: 'Da evitare' },
] as const;

type RowKey = (typeof ROWS)[number]['key'];
type Mode = 'sources' | 'paste' | 'recording';

const dateFormat = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

@Component({
  selector: 'mb-voice-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, StepList],
  templateUrl: './voice-step.html',
  styleUrl: './voice-step.scss',
})
export class VoiceStep {
  private readonly ai = inject(MockAi);
  private readonly toast = inject(ToastService);
  private readonly store = inject(DraftStore);
  readonly draft = input.required<BrandDraft>();

  protected readonly rows = ROWS;
  protected readonly mode = signal<Mode>('sources');
  protected readonly adding = signal(false);
  protected readonly editing = signal(false);
  protected readonly texts = signal('');
  protected readonly analyzing = signal(false);
  protected readonly steps = signal<AiStep[]>([]);
  protected readonly seconds = signal(0);
  private timer: ReturnType<typeof setInterval> | undefined;

  protected readonly voice = computed(() => this.draft().voice);
  protected readonly card = computed(() => currentVoiceCard(this.voice()));
  protected readonly previous = computed(() => this.voice().cards.slice(0, -1).reverse());
  private readonly connected = computed(() => CHANNELS.find(({ id }) => isConnected(this.draft().channels[id])) ?? null);

  protected readonly sources = computed<{ key: string; title: string; meta: string; icon: IconName; disabled: boolean; run: () => void }[]>(() => {
    const channel = this.connected();
    return [
      {
        key: 'paste',
        title: 'Incolla qualche testo',
        meta: 'Il modo più veloce: copia da LinkedIn, dal sito o dalle note',
        icon: 'clipboard',
        disabled: false,
        run: () => this.mode.set('paste'),
      },
      {
        key: 'history',
        title: channel ? `Leggi lo storico di ${channel.name}` : 'Leggi lo storico di un canale',
        meta: channel ? `Leggo gli ultimi post pubblicati da ${this.draft().channels[channel.id].handle}` : 'Serve un canale collegato',
        icon: 'history',
        disabled: !channel,
        run: () => channel && void this.analyze({ source: 'history', channel: channel.id }),
      },
      {
        key: 'recording',
        title: 'Registra un minuto di voce',
        meta: 'Racconta com’è andata la settimana: trascrivo e ne ricavo il ritmo',
        icon: 'mic',
        disabled: false,
        run: () => this.startRecording(),
      },
    ];
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => clearInterval(this.timer));
  }

  protected formatDate(iso: string): string {
    return dateFormat.format(new Date(iso));
  }

  protected clock(): string {
    const seconds = this.seconds();
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }

  protected submitTexts(): void {
    if (this.texts().trim().length < 40) {
      this.toast.show('Incolla almeno qualche riga scritta da te.');
      return;
    }
    void this.analyze({ source: 'pasted', texts: this.texts() });
  }

  protected startRecording(): void {
    this.seconds.set(0);
    this.mode.set('recording');
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.seconds.update((value) => value + 1);
      if (this.seconds() >= 60) this.stopRecording();
    }, 1000);
  }

  protected stopRecording(): void {
    clearInterval(this.timer);
    void this.analyze({ source: 'recording' });
  }

  protected cancelRecording(): void {
    clearInterval(this.timer);
    this.mode.set('sources');
  }

  protected editRow(key: RowKey, text: string): void {
    const card = this.card();
    if (!card) return;
    this.store.patch({ key: 'voice', value: { cards: [...this.voice().cards.slice(0, -1), { ...card, [key]: text }] } });
  }

  protected restore(older: VoiceCard): void {
    const { version: _version, createdAt: _createdAt, ...content } = older;
    this.toast.show(`Ripristinata come v${this.append(content)}.`);
  }

  protected addMore(): void {
    this.editing.set(false);
    this.adding.set(true);
  }

  private async analyze(sample: VoiceSample): Promise<void> {
    this.mode.set('sources');
    this.analyzing.set(true);
    this.steps.set([]);
    try {
      const analysis = await this.ai.analyzeVoice(sample, this.draft().identity, (steps) => this.steps.set(steps));
      const version = this.append(analysis);
      this.adding.set(false);
      this.texts.set('');
      this.toast.show(`Scheda voce v${version} pronta.`);
    } catch (error) {
      this.toast.show(errorMessage(error, 'Analisi non riuscita. Riprova.'));
    } finally {
      this.analyzing.set(false);
    }
  }

  private append(content: VoiceAnalysis): number {
    const cards = this.store.draft()?.voice.cards ?? this.voice().cards;
    const version = (cards.at(-1)?.version ?? 0) + 1;
    this.store.patch({ key: 'voice', value: { cards: [...cards, { ...content, version, createdAt: new Date().toISOString() }] } });
    return version;
  }
}
