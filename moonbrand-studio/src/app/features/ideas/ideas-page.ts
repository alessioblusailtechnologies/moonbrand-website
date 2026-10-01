import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  type TemplateRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';

import type { AiStep } from '@moonbrand/shared/ai/steps';
import type { IdeasResponse } from '@moonbrand/shared/api/contract';
import type { ChannelId } from '@moonbrand/shared/domain/brand';
import { channelName } from '@moonbrand/shared/domain/catalog';
import type { Idea, IdeaStatus } from '@moonbrand/shared/domain/idea';
import { formatWeekdayLong } from '@moonbrand/shared/lib/dates';

import { AiJobsService } from '../../core/ai/ai-jobs.service';
import { BrandsService } from '../../core/brands/brands.service';
import { ChatService } from '../../core/chat/chat.service';
import { PlanService } from '../../core/plan/plan.service';
import { errorMessage } from '../../core/errors';
import { IdeasService } from '../../core/ideas/ideas.service';
import { pageHeader } from '../../core/layout/page-header';
import { Icon } from '../../ui/icon';
import { StepList } from '../../ui/step-list';
import { ToastService } from '../../ui/toast';
import { FORMAT_REQUEST } from '../contents/labels';
import { CreateContentDialog, type IdeaContentRequest } from './create-content-dialog';
import { SIGNAL_LABELS } from './labels';

type View = 'new' | 'saved';

// Masonry: colonne larghe almeno così, separate da questo spazio.
const MIN_COLUMN = 320;
const COLUMN_GAP = 16;

@Component({
  selector: 'mb-ideas-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, Icon, StepList, CreateContentDialog],
  host: { '(window:resize)': 'updateScroll()' },
  templateUrl: './ideas-page.html',
  styleUrl: './ideas-page.scss',
})
export class IdeasPage {
  private readonly api = inject(IdeasService);
  private readonly ai = inject(AiJobsService);
  private readonly toast = inject(ToastService);
  private readonly chat = inject(ChatService);
  private readonly plan = inject(PlanService);
  private readonly router = inject(Router);
  protected readonly brands = inject(BrandsService);

  protected readonly view = signal<View>('new');
  protected readonly themeId = signal<string | null>(null);
  protected readonly ideas = signal<Idea[]>([]);
  protected readonly themes = signal<IdeasResponse['themes']>([]);
  protected readonly channels = signal<ChannelId[]>([]);
  // L'idea da cui si sta creando un contenuto: apre la finestra del formato e dei canali.
  protected readonly creatingFrom = signal<Idea | null>(null);
  protected readonly creating = signal(false);
  // L'idea che si sta mettendo nel piano.
  protected readonly planning = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly preparing = signal(false);
  protected readonly steps = signal<AiStep[]>([]);
  protected readonly lastDecision = signal<{ idea: Idea; previous: IdeaStatus } | null>(null);
  protected readonly canScrollLeft = signal(false);
  protected readonly canScrollRight = signal(false);
  private readonly filters = viewChild<ElementRef<HTMLElement>>('filters');
  private readonly list = viewChild<ElementRef<HTMLElement>>('list');
  private readonly headerActions = viewChild<TemplateRef<unknown>>('headerActions');
  protected readonly columnCount = signal(3);

  protected readonly brand = computed(() => this.brands.activeBrand());
  protected readonly counts = computed(() => ({
    new: this.ideas().filter((idea) => idea.status === 'new').length,
    saved: this.ideas().filter((idea) => idea.status === 'saved').length,
  }));
  protected readonly visible = computed(() => {
    const themeId = this.themeId();
    return this.ideas().filter((idea) => idea.status === this.view() && (!themeId || idea.themeId === themeId));
  });
  // A rotazione tra le colonne: l'ordine si legge per righe, da sinistra a destra, e ogni colonna cresce da sé.
  protected readonly columns = computed(() => {
    const count = this.columnCount();
    return Array.from({ length: count }, (_, column) => this.visible().filter((_, index) => index % count === column));
  });

  constructor() {
    pageHeader(
      () => [{ label: 'Idee' }],
      () => this.headerActions(),
    );
    effect(() => {
      const brand = this.brand();
      if (brand) untracked(() => void this.load(brand.id));
    });
    effect((onCleanup) => {
      const element = this.list()?.nativeElement;
      if (!element) return;
      const observer = new ResizeObserver(([entry]) => {
        this.columnCount.set(Math.max(1, Math.floor((entry.contentRect.width + COLUMN_GAP) / (MIN_COLUMN + COLUMN_GAP))));
      });
      observer.observe(element);
      onCleanup(() => observer.disconnect());
    });
    // I temi cambiano con il brand: dopo il disegno si ricontrolla se la riga scorre.
    afterRenderEffect(() => {
      this.themes();
      this.updateScroll();
    });
  }

  protected updateScroll(): void {
    const element = this.filters()?.nativeElement;
    this.canScrollLeft.set(!!element && element.scrollLeft > 1);
    this.canScrollRight.set(!!element && element.scrollLeft + element.clientWidth < element.scrollWidth - 1);
  }

  protected scrollThemes(direction: 1 | -1): void {
    const element = this.filters()?.nativeElement;
    element?.scrollBy({ left: direction * element.clientWidth * 0.7, behavior: 'smooth' });
  }

  private async load(brandId: string): Promise<void> {
    this.loading.set(true);
    this.themeId.set(null);
    this.lastDecision.set(null);
    try {
      const response = await this.api.list(brandId);
      if (this.brand()?.id !== brandId) return;
      this.ideas.set(response.ideas);
      this.themes.set(response.themes);
      this.channels.set(response.channels);
      if (response.jobId) void this.follow(brandId, response.jobId);
    } catch (error) {
      this.toast.show(errorMessage(error, 'Non riesco a caricare le idee. Riprova tra poco.'));
    } finally {
      this.loading.set(false);
    }
  }

  // Il worker salva le idee a lavoro finito: allora si rilegge la lista.
  private async follow(brandId: string, jobId: string): Promise<void> {
    this.preparing.set(true);
    this.steps.set([]);
    try {
      await this.ai.follow(jobId, (steps) => this.steps.set(steps));
      if (this.brand()?.id !== brandId) return;
      this.ideas.set((await this.api.list(brandId)).ideas);
      this.view.set('new');
    } catch (error) {
      this.toast.show(errorMessage(error, 'Non sono riuscito a preparare le idee. Riprova.'));
    } finally {
      this.preparing.set(false);
    }
  }

  protected async more(): Promise<void> {
    const brand = this.brand();
    if (!brand || this.preparing()) return;
    try {
      const { id } = await this.api.generate(brand.id);
      void this.follow(brand.id, id);
    } catch (error) {
      this.toast.show(errorMessage(error, 'Non riesco a chiedere nuove idee. Riprova.'));
    }
  }

  protected async decide(idea: Idea, status: IdeaStatus): Promise<void> {
    try {
      const updated = await this.api.setStatus(idea.id, status);
      this.ideas.update((list) => list.map((item) => (item.id === updated.id ? updated : item)));
      this.lastDecision.set({ idea: updated, previous: idea.status });
    } catch (error) {
      this.toast.show(errorMessage(error, 'Non sono riuscito a salvare la scelta. Riprova.'));
    }
  }

  protected async undo(): Promise<void> {
    const last = this.lastDecision();
    if (!last) return;
    this.lastDecision.set(null);
    await this.decide(last.idea, last.previous);
    this.lastDecision.set(null);
  }

  // Il contenuto nasce in una conversazione nuova con l'assistente: il messaggio chiede formato e canali, menziona l'idea
  // e porta quello che si è aggiunto nella finestra, testo e allegati.
  protected async createContent(request: IdeaContentRequest): Promise<void> {
    const idea = this.creatingFrom();
    const brand = this.brands.activeBrand();
    if (!idea || !brand || this.creating()) return;
    this.creating.set(true);
    try {
      const names = request.channels.map(channelName);
      const channels = names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names.at(-1)}` : names[0];
      const ask = `Crea ${FORMAT_REQUEST[request.format]} per ${channels} da questa idea.`;
      // Il testo aggiunto continua la richiesta, come una frase dopo l'altra.
      const note = request.message.charAt(0).toUpperCase() + request.message.slice(1);
      const message = note ? `${ask} ${note}` : ask;
      const { conversationId } = await this.chat.start(brand.id, { message, attachments: request.attachments, ideaId: idea.id });
      this.creatingFrom.set(null);
      void this.chat.refresh();
      await this.router.navigate(['/assistente', conversationId]);
    } catch (error) {
      this.toast.show(errorMessage(error, 'Non sono riuscito ad aprire la chat. Riprova.'));
    } finally {
      this.creating.set(false);
    }
  }

  // Nel piano: la prima uscita vuota del suo tema, altrimenti il primo giorno buono libero.
  protected async addToPlan(idea: Idea): Promise<void> {
    const brand = this.brands.activeBrand();
    if (!brand || this.planning()) return;
    this.planning.set(idea.id);
    try {
      const slot = await this.plan.addIdea(brand.id, idea.id);
      this.toast.show(`Nel piano: ${formatWeekdayLong(slot.date)} alle ${slot.time}.`);
    } catch (error) {
      this.toast.show(errorMessage(error, 'Non sono riuscito ad aggiungerla al piano. Riprova.'));
    } finally {
      this.planning.set(null);
    }
  }

  protected signalLabel(idea: Idea): string {
    return [SIGNAL_LABELS[idea.signal.kind] ?? idea.signal.kind, idea.signal.label].filter(Boolean).join(' · ');
  }

  protected theme(idea: Idea) {
    return this.themes().find((theme) => theme.id === idea.themeId) ?? null;
  }
}
