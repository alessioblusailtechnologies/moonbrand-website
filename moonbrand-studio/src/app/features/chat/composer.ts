import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, input, output, signal, viewChild } from '@angular/core';

import type { ChatAttachment } from '@moonbrand/shared/api/contract';

import { BrandsService } from '../../core/brands/brands.service';
import { ChatService } from '../../core/chat/chat.service';
import { MicrophoneError, Recorder } from '../../core/chat/recorder';
import { errorMessage } from '../../core/errors';
import { resizedDataUri } from '../../core/images';
import { Icon } from '../../ui/icon';
import { ToastService } from '../../ui/toast';

// Una foto o un video scelto per il messaggio: si carica subito, il messaggio lo cita quando è pronto.
// progress: per un video, quanto è già partito (da 0 a 1); a 1 il server lo sta convertendo.
interface PendingAttachment {
  id: number;
  preview: string;
  file: string | null;
  failed: boolean;
  video: boolean;
  progress: number;
}

// Quello che la casella manda: il testo e i percorsi degli allegati già caricati.
export interface ComposerMessage {
  message: string;
  attachments: string[];
}

// Le foto si rimpiccioliscono prima di partire: bastano per i post e restano sotto il limite dell'API.
const ATTACHMENT_SIDE = 2560;
const MAX_ATTACHMENTS = 10;
// Una dettatura si chiude da sola dopo cinque minuti: oltre, meglio in più riprese.
const MAX_DICTATION_S = 300;

// La casella dell'assistente: il testo sopra, allegati, dettatura e invio in una barra sotto. Foto e video si scelgono dal
// pulsante o si incollano, e partono subito. Il microfono registra fino al secondo clic e il testo trascritto (Voxtral)
// si aggiunge a quello scritto, da rileggere prima di mandarlo. La usano la chat e la finestra che crea un contenuto da un'idea.
// empty: si può mandare anche senza testo né allegati (c'è già altro, come l'idea). send: false toglie la freccia,
// quando a mandare è un pulsante di chi la usa; Invio manda comunque.
@Component({
  selector: 'mb-composer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  templateUrl: './composer.html',
  styleUrl: './composer.scss',
  host: { '[class.tall]': 'tall()' },
})
export class Composer {
  private readonly chat = inject(ChatService);
  private readonly brands = inject(BrandsService);
  private readonly toast = inject(ToastService);

  readonly placeholder = input('');
  readonly label = input('Messaggio per l’assistente');
  readonly tall = input(false);
  readonly running = input(false);
  readonly stopping = input(false);
  readonly busy = input(false);
  readonly empty = input(false);
  readonly send = input(true);
  readonly submitted = output<ComposerMessage>();
  readonly stopped = output();

  private readonly input = viewChild<ElementRef<HTMLTextAreaElement>>('field');
  private readonly picker = viewChild<ElementRef<HTMLInputElement>>('picker');
  protected readonly draft = signal('');
  protected readonly attachments = signal<PendingAttachment[]>([]);
  private nextAttachment = 0;
  protected readonly dictation = signal<'idle' | 'recording' | 'transcribing'>('idle');
  protected readonly elapsed = signal(0);
  private readonly recorder = new Recorder();
  private timer?: ReturnType<typeof setInterval>;

  readonly uploading = computed(() => this.attachments().some((item) => !item.file && !item.failed));
  readonly canSend = computed(
    () =>
      !this.running() &&
      !this.busy() &&
      !this.uploading() &&
      this.dictation() === 'idle' &&
      (this.empty() || this.draft().trim().length > 0 || this.attachments().some((item) => item.file)),
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.clear();
      clearInterval(this.timer);
      this.recorder.cancel();
    });
  }

  // Quello che si manderebbe adesso, o null se non si può ancora (un allegato che sta caricando).
  value(): ComposerMessage | null {
    if (!this.canSend()) return null;
    return {
      message: this.draft().trim(),
      attachments: this.attachments()
        .map((item) => item.file)
        .filter((file): file is string => Boolean(file)),
    };
  }

  // Dopo un invio riuscito: la casella torna vuota.
  clear(): void {
    this.draft.set('');
    for (const item of this.attachments()) URL.revokeObjectURL(item.preview);
    this.attachments.set([]);
  }

  focus(): void {
    this.input()?.nativeElement.focus();
  }

  // Un testo da cui partire, con il cursore in fondo.
  setDraft(text: string): void {
    this.draft.set(text);
    const element = this.input()?.nativeElement;
    element?.focus();
    queueMicrotask(() => element?.setSelectionRange(text.length, text.length));
  }

  protected submit(): void {
    const value = this.value();
    if (value) this.submitted.emit(value);
  }

  protected keydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    this.submit();
  }

  protected pick(): void {
    this.picker()?.nativeElement.click();
  }

  protected picked(event: Event): void {
    const element = event.target as HTMLInputElement;
    this.attach([...(element.files ?? [])]);
    element.value = '';
  }

  // Una foto o un video incollato nella casella vale come una scelta dal pulsante.
  protected pasted(event: ClipboardEvent): void {
    const media = [...(event.clipboardData?.files ?? [])].filter((file) => file.type.startsWith('image/') || file.type.startsWith('video/'));
    if (media.length === 0) return;
    event.preventDefault();
    this.attach(media);
  }

  private attach(files: File[]): void {
    const brand = this.brands.activeBrand();
    if (!brand) return;
    const room = MAX_ATTACHMENTS - this.attachments().length;
    if (files.length > room) this.toast.show(`Al massimo ${MAX_ATTACHMENTS} allegati per messaggio.`);
    for (const file of files.slice(0, Math.max(0, room))) {
      const pending: PendingAttachment = {
        id: ++this.nextAttachment,
        preview: URL.createObjectURL(file),
        file: null,
        failed: false,
        video: file.type.startsWith('video/'),
        progress: 0,
      };
      this.attachments.update((list) => [...list, pending]);
      void (pending.video ? this.uploadVideo(brand.id, file, pending.id) : this.upload(brand.id, file, pending.id));
    }
  }

  private set(id: number, patch: Partial<PendingAttachment>): void {
    this.attachments.update((list) => list.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  private async uploadVideo(brandId: string, file: File, id: number): Promise<void> {
    try {
      const uploaded = await this.chat.uploadVideo(brandId, file, (progress) => this.set(id, { progress }));
      this.set(id, { file: uploaded.file, progress: 1 });
    } catch (error) {
      this.set(id, { failed: true });
      this.toast.show(errorMessage(error, 'Non riesco a caricare il video. Riprova.'));
    }
  }

  private async upload(brandId: string, file: File, id: number): Promise<void> {
    try {
      const dataUri = await resizedDataUri(file, ATTACHMENT_SIDE, 'image/jpeg');
      const uploaded: ChatAttachment = await this.chat.upload(brandId, dataUri);
      this.set(id, { file: uploaded.file });
    } catch (error) {
      this.set(id, { failed: true });
      this.toast.show(errorMessage(error, 'Non riesco a caricare la foto: usa un PNG, un JPEG o un WebP.'));
    }
  }

  protected async toggleDictation(): Promise<void> {
    if (this.dictation() === 'transcribing') return;
    if (this.dictation() === 'recording') return this.finishDictation();
    try {
      await this.recorder.start();
    } catch (error) {
      this.toast.show(error instanceof MicrophoneError ? error.message : 'Non riesco ad aprire il microfono.');
      return;
    }
    this.elapsed.set(0);
    this.dictation.set('recording');
    this.timer = setInterval(() => {
      this.elapsed.update((seconds) => seconds + 1);
      if (this.elapsed() >= MAX_DICTATION_S) void this.finishDictation();
    }, 1000);
  }

  // Si chiude il microfono e si trascrive: il testo va in coda a quello già scritto.
  private async finishDictation(): Promise<void> {
    clearInterval(this.timer);
    const brand = this.brands.activeBrand();
    const audio = await this.recorder.stop();
    if (!brand || audio.size === 0) {
      this.dictation.set('idle');
      return;
    }
    this.dictation.set('transcribing');
    try {
      const text = await this.chat.transcribe(brand.id, audio);
      if (text) {
        const current = this.draft().trimEnd();
        this.setDraft(current ? `${current} ${text}` : text);
      } else {
        this.toast.show('Non ho sentito niente: riprova più vicino al microfono.');
      }
    } catch (error) {
      this.toast.show(errorMessage(error, 'Non sono riuscito a trascrivere. Riprova.'));
    } finally {
      this.dictation.set('idle');
    }
  }

  protected elapsedLabel(): string {
    const seconds = this.elapsed();
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }

  protected progressLabel(progress: number): string {
    return `${Math.floor(progress * 100)}%`;
  }

  protected unattach(id: number): void {
    const item = this.attachments().find((attachment) => attachment.id === id);
    if (item) URL.revokeObjectURL(item.preview);
    this.attachments.update((list) => list.filter((attachment) => attachment.id !== id));
  }
}
