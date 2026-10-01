import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  type TemplateRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';

import type { AiStep } from '@moonbrand/shared/ai/steps';
import type { ChannelId } from '@moonbrand/shared/domain/brand';
import { channelName } from '@moonbrand/shared/domain/catalog';
import type { Content } from '@moonbrand/shared/domain/content';
import { formatWeekdayShort } from '@moonbrand/shared/lib/dates';
import type { ConversationSummary, ConversationTurn, WelcomeResponse } from '@moonbrand/shared/api/contract';

import { AiJobsService } from '../../core/ai/ai-jobs.service';
import { AuthService } from '../../core/auth/auth.service';
import { BrandsService } from '../../core/brands/brands.service';
import { ChatService } from '../../core/chat/chat.service';
import { errorMessage } from '../../core/errors';
import { pageHeader } from '../../core/layout/page-header';
import { ConfirmService } from '../../ui/confirm';
import { Icon, type IconName } from '../../ui/icon';
import { LightboxService } from '../../ui/lightbox';
import { PendingMedia, pendingFromSteps } from '../../ui/pending-media';
import { Markdown } from '../../ui/markdown';
import { StepList } from '../../ui/step-list';
import { ToastService } from '../../ui/toast';
import { ContentPreview } from '../contents/content-preview';
import { FORMAT_LABELS, STATUS_LABELS } from '../contents/labels';
import { Composer, type ComposerMessage } from './composer';
import { fallbackGreeting, pickGreeting } from './greeting';

// Nella risposta di un turno i testi di Claude si leggono, i tool di fila si raccolgono in un blocco solo.
// streaming: il testo sta ancora arrivando.
type Block = { kind: 'text'; id: string; text: string; streaming: boolean } | { kind: 'tools'; id: string; steps: AiStep[] };

// Spunti per la prima domanda: riempiono la casella, non partono da soli. Questi valgono finché non ci sono quelli di
// oggi, scritti per il brand.
const SUGGESTIONS: { icon: IconName; label: string; draft: string }[] = [
  { icon: 'sparkle', label: 'Proponimi 5 idee per i prossimi post', draft: 'Proponimi 5 idee per i prossimi post' },
  { icon: 'layers', label: 'Prepara un carosello su…', draft: 'Prepara un carosello su ' },
  { icon: 'pen', label: 'Prendi un’idea che ho tenuto e fanne un post', draft: 'Prendi un’idea che ho tenuto e fanne un post' },
  { icon: 'bar-chart', label: 'Cosa ho pubblicato finora e cosa manca?', draft: 'Cosa ho pubblicato finora e cosa manca?' },
];

// Mentre risponde si legge più spesso: il testo arriva a pezzi e si svela con un ritmo costante.
const LIVE_POLL_MS = 400;
// Il saluto e gli spunti di oggi si scrivono in pochi secondi: basta guardare ogni tanto.
const WELCOME_POLL_MS = 2000;
// Il filo segue la risposta finché chi legge sta in fondo (entro questa distanza).
const STICK_PX = 80;

@Component({
  selector: 'mb-chat-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, RouterLink, Icon, Markdown, StepList, PendingMedia, ContentPreview, Composer],
  templateUrl: './chat-page.html',
  styleUrl: './chat-page.scss',
})
export class ChatPage {
  private readonly chat = inject(ChatService);
  private readonly ai = inject(AiJobsService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly lightbox = inject(LightboxService);
  private readonly auth = inject(AuthService);
  protected readonly brands = inject(BrandsService);

  // Dal percorso /assistente/:conversationId; senza, è una conversazione nuova.
  readonly conversationId = input<string>();

  protected readonly current = signal<ConversationSummary | null>(null);
  protected readonly turns = signal<ConversationTurn[]>([]);
  protected readonly contents = signal<Content[]>([]);
  protected readonly loading = signal(false);
  protected readonly sending = signal(false);
  protected readonly stopping = signal(false);
  // Il saluto in cima: null finché non si sa se quelli di oggi ci sono, così non ne compare uno per poi cambiare subito.
  protected readonly greeting = signal<string | null>(null);
  private readonly welcome = signal<WelcomeResponse | null>(null);
  protected readonly suggestions = computed(() => {
    const today = this.welcome()?.suggestions ?? [];
    return today.length > 0 ? today : SUGGESTIONS;
  });
  // Solo l'id: il brand attivo si ricarica anche quando cambia altro, e il saluto non deve cambiare con lui.
  private readonly activeBrandId = computed(() => this.brands.activeBrand()?.id ?? null);
  // Ogni caricamento del benvenuto ha il suo numero: quello di un brand lasciato nel frattempo non arriva a schermo.
  private welcomeLoad = 0;

  private readonly thread = viewChild<ElementRef<HTMLElement>>('thread');
  private readonly composer = viewChild(Composer);
  private readonly headerActions = viewChild<TemplateRef<unknown>>('headerActions');
  // Il lavoro che si sta seguendo e i blocchi che c'erano già quando si è cominciato: solo i nuovi si svelano piano.
  private readonly live = signal<{ jobId: string; known: Set<string> } | null>(null);
  private stick = true;

  protected readonly running = computed(() =>
    this.turns().some((turn) => turn.job.status === 'queued' || turn.job.status === 'running'),
  );
  private readonly turnCount = computed(() => this.turns().length);
  // Ogni contenuto sta nella risposta del turno in cui è nato: l'ultimo turno partito prima che venisse creato.
  protected readonly view = computed(() => {
    const turns = this.turns();
    const contents = this.contents();
    return turns.map((turn, index) => {
      const next = turns[index + 1]?.createdAt;
      return {
        ...turn,
        blocks: blocksOf(turn.job.steps),
        contents: contents.filter((content) => content.createdAt >= turn.createdAt && (!next || content.createdAt < next)),
        // Le card che il turno in corso sta preparando: al loro posto arriva il contenuto, quando lo salva.
        pending: turn.job.status === 'queued' || turn.job.status === 'running' ? pendingFromSteps(turn.job.steps) : [],
      };
    });
  });

  constructor() {
    pageHeader(
      () => {
        const open = this.current();
        return open ? [{ label: 'Assistente', link: '/assistente' }, { label: open.title }] : [{ label: 'Assistente' }];
      },
      () => this.headerActions(),
    );
    effect(() => {
      const id = this.conversationId();
      untracked(() => (id ? void this.open(id) : this.reset()));
    });
    // Senza conversazione aperta si vede il benvenuto del brand attivo: si rilegge ogni volta che si torna qui.
    effect(() => {
      const brandId = this.activeBrandId();
      if (brandId && !this.conversationId()) untracked(() => void this.loadWelcome(brandId));
    });
    // Cambiando brand, la conversazione aperta non è più di quello attivo.
    effect(() => {
      const brand = this.brands.activeBrand();
      const open = untracked(this.current);
      if (brand && open && open.brandId !== brand.id) void this.router.navigateByUrl('/assistente');
    });
    // Un messaggio nuovo porta in fondo al filo.
    afterRenderEffect(() => {
      this.turnCount();
      this.stick = true;
      this.toBottom();
    });
    // La risposta cresce anche tra un aggiornamento e l'altro, mentre si svela: il filo la segue se si è in fondo.
    effect((onCleanup) => {
      const element = this.thread()?.nativeElement;
      if (!element) return;
      const observer = new MutationObserver(() => this.stick && this.toBottom());
      observer.observe(element, { childList: true, subtree: true, characterData: true });
      onCleanup(() => observer.disconnect());
    });
  }

  protected scrolled(): void {
    const element = this.thread()?.nativeElement;
    if (element) this.stick = element.scrollHeight - element.scrollTop - element.clientHeight < STICK_PX;
  }

  private toBottom(): void {
    const element = this.thread()?.nativeElement;
    if (element) element.scrollTop = element.scrollHeight;
  }

  private reset(): void {
    this.live.set(null);
    this.current.set(null);
    this.turns.set([]);
    this.contents.set([]);
    queueMicrotask(() => this.composer()?.focus());
  }

  // Il benvenuto di oggi; se lo sta ancora scrivendo si vede quello di riserva e, appena pronto, il suo.
  private async loadWelcome(brandId: string): Promise<void> {
    const load = ++this.welcomeLoad;
    const name = this.auth.account()?.name ?? '';
    const show = (welcome: WelcomeResponse) => {
      this.welcome.set(welcome);
      this.greeting.set(pickGreeting(brandId, welcome.greetings, name));
    };
    this.welcome.set(null);
    this.greeting.set(null);
    try {
      const welcome = await this.chat.welcome(brandId);
      if (load !== this.welcomeLoad) return;
      show(welcome);
      if (!welcome.jobId) return;
      await this.ai.follow(welcome.jobId, undefined, WELCOME_POLL_MS);
      if (load !== this.welcomeLoad) return;
      const ready = await this.chat.welcome(brandId);
      if (load === this.welcomeLoad && ready.greetings.length > 0) show(ready);
    } catch {
      // Resta il benvenuto di riserva; se non si è saputo niente, il saluto semplice.
      if (load === this.welcomeLoad && this.greeting() === null) this.greeting.set(fallbackGreeting(name));
    }
  }

  private async open(conversationId: string): Promise<void> {
    if (this.current()?.id !== conversationId) {
      this.live.set(null);
      this.loading.set(true);
      this.turns.set([]);
      this.contents.set([]);
    }
    try {
      await this.refresh(conversationId);
      const active = this.turns().find(
        (turn) => turn.job.status === 'queued' || turn.job.status === 'running',
      );
      if (active) void this.follow(conversationId, active.job.id);
    } catch (error) {
      this.toast.show(errorMessage(error, 'Non trovo questa conversazione.'));
      void this.router.navigateByUrl('/assistente');
    } finally {
      this.loading.set(false);
    }
  }

  private async refresh(conversationId: string): Promise<void> {
    const { conversation, turns, contents } = await this.chat.get(conversationId);
    if (this.conversationId() !== conversationId) return;
    this.current.set(conversation);
    this.turns.set(turns);
    this.contents.set(contents);
  }

  private async refreshContents(conversationId: string): Promise<void> {
    const { contents } = await this.chat.get(conversationId).catch(() => ({ contents: null }));
    if (contents && this.conversationId() === conversationId) this.contents.set(contents);
  }

  // Gli step arrivano man mano; a turno finito si rilegge tutto, per i contenuti salvati e lo stato finale.
  private async follow(conversationId: string, jobId: string): Promise<void> {
    if (this.live()?.jobId === jobId) return;
    const turn = this.turns().find((item) => item.job.id === jobId);
    this.live.set({ jobId, known: new Set(blocksOf(turn?.job.steps ?? []).map((block) => block.id)) });
    let saved = savesOf(turn?.job.steps ?? []);
    const update = (steps: AiStep[]) => {
      if (this.live()?.jobId !== jobId) return;
      // Un contenuto appena salvato o aggiornato compare subito, senza aspettare la fine del turno.
      const now = savesOf(steps);
      if (now > saved) {
        saved = now;
        void this.refreshContents(conversationId);
      }
      this.turns.update((turns) =>
        turns.map((item) =>
          item.job.id === jobId ? { ...item, job: { ...item.job, status: 'running', steps } } : item,
        ),
      );
    };
    try {
      await this.ai.follow(jobId, update, LIVE_POLL_MS);
    } catch {
      // L'errore o lo stop del turno si vedono nel filo, dopo la rilettura.
    }
    if (this.live()?.jobId !== jobId) return;
    await this.refresh(conversationId).catch(() => undefined);
    this.live.set(null);
    this.stopping.set(false);
    void this.chat.refresh();
  }

  // Solo i blocchi arrivati mentre si segue il turno si svelano piano; quelli già scritti si mostrano interi.
  protected animated(turn: ConversationTurn, blockId: string): boolean {
    const live = this.live();
    return live?.jobId === turn.job.id && !live.known.has(blockId);
  }

  protected async send({ message, attachments }: ComposerMessage): Promise<void> {
    const brand = this.brands.activeBrand();
    if (!brand || this.sending() || this.running()) return;
    this.sending.set(true);
    try {
      const open = this.current();
      if (open) {
        const created = await this.chat.send(open.id, { message, attachments });
        this.composer()?.clear();
        await this.refresh(open.id);
        void this.follow(open.id, created.jobId);
        void this.chat.refresh();
      } else {
        const created = await this.chat.start(brand.id, { message, attachments });
        this.composer()?.clear();
        void this.chat.refresh();
        await this.router.navigate(['/assistente', created.conversationId]);
      }
    } catch (error) {
      this.toast.show(errorMessage(error, 'Non riesco a mandare il messaggio. Riprova.'));
    } finally {
      this.sending.set(false);
    }
  }

  protected async stop(): Promise<void> {
    const open = this.current();
    if (!open || this.stopping()) return;
    this.stopping.set(true);
    try {
      await this.chat.stop(open.id);
    } catch (error) {
      this.stopping.set(false);
      this.toast.show(errorMessage(error, 'Non riesco a fermarlo. Riprova.'));
    }
  }

  protected suggest(text: string): void {
    this.composer()?.setDraft(text);
  }

  // Nella lightbox solo le foto: i video si guardano nel messaggio.
  protected openPhoto(turn: ConversationTurn, file: string): void {
    const photos = turn.attachments.filter((item) => !item.poster);
    this.lightbox.open(
      photos.map((item, i) => ({ url: item.url, alt: `Foto ${i + 1}` })),
      photos.findIndex((item) => item.file === file),
    );
  }

  protected async remove(): Promise<void> {
    const open = this.current();
    if (!open) return;
    const confirmed = await this.confirm.ask({
      title: 'Elimino la conversazione?',
      message: 'I contenuti e le idee salvati restano nelle loro sezioni.',
      confirmLabel: 'Elimina',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await this.chat.remove(open.id);
      void this.router.navigateByUrl('/assistente');
    } catch (error) {
      this.toast.show(errorMessage(error, 'Non sono riuscito a eliminarla. Riprova.'));
    }
  }

  protected active(turn: ConversationTurn): boolean {
    return turn.job.status === 'queued' || turn.job.status === 'running';
  }

  // Finché il turno non è finito qualcosa si muove sempre: prima della risposta e dopo un testo concluso si dice che
  // sta pensando; tra un passaggio e l'altro lo dice il blocco dei passaggi, che resta vivo finché è l'ultimo.
  protected waiting(blocks: Block[], turn: ConversationTurn): boolean {
    if (!this.active(turn)) return false;
    const last = blocks.at(-1);
    return !last || (last.kind === 'text' && !last.streaming);
  }

  // La copertina o la prima slide, per la chip in fondo.
  protected coverOf(content: Content): string | null {
    return content.visual.files?.find((file) => file.index === 0)?.url ?? null;
  }

  // L'uscita menzionata in un messaggio, in breve: «gio 2 ott · 18:30 · Instagram».
  protected slotLabel(slot: { date: string; time: string; channels: ChannelId[] }): string {
    return `${formatWeekdayShort(slot.date)} · ${slot.time} · ${slot.channels.map(channelName).join(', ')}`;
  }

  protected formatLabel(content: Content): string {
    return FORMAT_LABELS[content.format];
  }

  protected statusLabel(content: Content): string {
    return STATUS_LABELS[content.status];
  }
}

// I tool che salvano o aggiornano un contenuto, già conclusi. Negli step più vecchi il nome del tool era la label.
function savesOf(steps: AiStep[]): number {
  return steps.filter((step) => step.kind === 'tool' && /contenuto_(salva|aggiorna)$/.test(step.tool ?? step.label) && step.status === 'done').length;
}

// Un blocco di passaggi prende il nome dal testo che lo precede: resta lo stesso anche quando un passaggio
// nascosto si mostra dopo, così il blocco non si ricrea (e non perde tempi e accordion aperto).
function blocksOf(steps: AiStep[]): Block[] {
  const blocks: Block[] = [];
  let after = 'start';
  for (const step of steps) {
    if (step.kind === 'text') {
      blocks.push({ kind: 'text', id: step.id, text: step.label, streaming: step.status === 'running' });
      after = step.id;
      continue;
    }
    const last = blocks.at(-1);
    if (last?.kind === 'tools') last.steps.push(step);
    else blocks.push({ kind: 'tools', id: `tools-${after}`, steps: [step] });
  }
  return blocks;
}
