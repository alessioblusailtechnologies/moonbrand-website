import { ChangeDetectionStrategy, Component, type TemplateRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import type { ContentSummary, PlanResponse, SlotView } from '@moonbrand/shared/api/contract';
import { channelName } from '@moonbrand/shared/domain/catalog';
import type { Idea } from '@moonbrand/shared/domain/idea';
import { addDays, addMonths, formatMonth, formatRange, isDay, isPast, planNow, startOfMonth, startOfWeek } from '@moonbrand/shared/lib/dates';

import { BrandsService } from '../../core/brands/brands.service';
import { ChatService } from '../../core/chat/chat.service';
import { errorMessage } from '../../core/errors';
import { pageHeader } from '../../core/layout/page-header';
import { PlanService } from '../../core/plan/plan.service';
import { ChannelMark } from '../../ui/channel-mark';
import { Icon } from '../../ui/icon';
import { ToastService } from '../../ui/toast';
import { FORMAT_LABELS } from '../contents/labels';
import { canMove, SLOT_STATUS_LABELS, SLOT_TONES, slotTitle, timeFor, WEEKDAYS } from './labels';
import { PlanSession } from './plan-session';
import { SlotDrawer, type SlotDraftInput } from './slot-drawer';

type Mode = 'month' | 'week';

// Quello che si sta trascinando: un'uscita da spostare, un contenuto o un'idea da mettere in un giorno.
type Dragged = { kind: 'slot'; slot: SlotView } | { kind: 'content'; content: ContentSummary } | { kind: 'idea'; idea: Idea };

interface Day {
  date: string;
  number: number;
  inMonth: boolean;
  today: boolean;
  past: boolean;
  slots: SlotView[];
}

// In un giorno del mese si vedono al massimo tante uscite; le altre si aprono nella settimana.
const MONTH_VISIBLE = 3;

// Il piano del brand: le uscite nel calendario, a mese o a settimana. Si trascinano da un giorno all'altro, e dal pannello
// «Da programmare» arrivano i contenuti senza data e le idee tenute. Un'uscita si apre di lato, per cambiarla o prepararla in chat.
@Component({
  selector: 'mb-plan-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon, ChannelMark, SlotDrawer, PlanSession],
  templateUrl: './plan-page.html',
  styleUrl: './plan-page.scss',
})
export class PlanPage {
  private readonly api = inject(PlanService);
  private readonly chat = inject(ChatService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly brands = inject(BrandsService);

  // ?giorno=AAAA-MM-GG apre il calendario su quel giorno (dal contenuto, dalla chat).
  readonly giorno = input<string>();

  private readonly headerActions = viewChild<TemplateRef<unknown>>('headerActions');
  protected readonly mode = signal<Mode>('month');
  protected readonly anchor = signal(planNow().date);
  protected readonly plan = signal<PlanResponse | null>(null);
  protected readonly loading = signal(true);
  protected readonly panel = signal<'contents' | 'ideas'>('contents');
  // L'uscita aperta di lato, o quella da creare.
  protected readonly opened = signal<SlotView | null>(null);
  protected readonly drafting = signal<SlotDraftInput | null>(null);
  protected readonly planning = signal(false);
  protected readonly dragged = signal<Dragged | null>(null);
  protected readonly dropDate = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly weekdays = WEEKDAYS;
  protected readonly tones = SLOT_TONES;
  protected readonly statusLabels = SLOT_STATUS_LABELS;
  protected readonly formatLabels = FORMAT_LABELS;
  protected readonly visible = MONTH_VISIBLE;
  protected readonly name = channelName;
  protected readonly canMove = canMove;

  // Il periodo mostrato: sei settimane intere intorno al mese, o una settimana da lunedì.
  private readonly range = computed(() => {
    const anchor = this.anchor();
    const from = this.mode() === 'month' ? startOfWeek(startOfMonth(anchor)) : startOfWeek(anchor);
    return { from, to: addDays(from, this.mode() === 'month' ? 41 : 6) };
  });

  protected readonly title = computed(() => (this.mode() === 'month' ? formatMonth(this.anchor()) : formatRange(this.range().from, this.range().to)));

  protected readonly days = computed<Day[]>(() => {
    const { from } = this.range();
    const month = this.anchor().slice(0, 7);
    const now = planNow();
    const slots = this.plan()?.slots ?? [];
    return Array.from({ length: this.mode() === 'month' ? 42 : 7 }, (_, i) => {
      const date = addDays(from, i);
      return {
        date,
        number: Number(date.slice(8, 10)),
        inMonth: date.slice(0, 7) === month,
        today: date === now.date,
        past: date < now.date,
        slots: slots.filter((slot) => slot.date === date),
      };
    });
  });

  // Quante uscite a settimana chiede il brand, contro quante ce ne sono nella settimana mostrata (o nel mese).
  protected readonly summary = computed(() => {
    const plan = this.plan();
    if (!plan) return '';
    const { from, to } = this.range();
    const inRange = plan.slots.filter((slot) => slot.date >= from && slot.date <= to);
    const ready = inRange.filter((slot) => slot.content).length;
    return `${inRange.length} ${inRange.length === 1 ? 'uscita' : 'uscite'}, ${ready} con il contenuto · il ritmo è ${plan.postsPerWeek} a settimana`;
  });

  constructor() {
    pageHeader(
      () => [{ label: 'Piano' }],
      () => this.headerActions(),
    );
    effect(() => {
      const day = this.giorno();
      if (day && isDay(day)) untracked(() => this.anchor.set(day));
    });
    // Cambiando brand o periodo si rilegge il piano.
    effect(() => {
      const brand = this.brands.activeBrand();
      const { from, to } = this.range();
      if (brand) untracked(() => void this.load(brand.id, from, to));
    });
  }

  private async load(brandId: string, from: string, to: string): Promise<void> {
    this.loading.set(this.plan() === null);
    try {
      const plan = await this.api.get(brandId, from, to);
      if (this.brands.activeBrand()?.id === brandId && this.range().from === from) this.plan.set(plan);
    } catch (error) {
      this.toast.show(errorMessage(error, 'Non riesco a leggere il piano.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected reload(): void {
    const brand = this.brands.activeBrand();
    if (brand) void this.load(brand.id, this.range().from, this.range().to);
  }

  protected move(step: number): void {
    this.anchor.update((day) => (this.mode() === 'month' ? addMonths(day, step) : addDays(day, step * 7)));
  }

  protected goToday(): void {
    this.anchor.set(planNow().date);
  }

  // Dal mese, un giorno troppo pieno si apre nella sua settimana.
  protected openWeek(date: string): void {
    this.anchor.set(date);
    this.mode.set('week');
  }

  protected themeName = (themeId: string | null): string | null => this.plan()?.themes.find((theme) => theme.id === themeId)?.name ?? null;
  protected themeColor = (themeId: string | null): string | null => this.plan()?.themes.find((theme) => theme.id === themeId)?.color ?? null;
  protected slotTitle = (slot: SlotView): string => slotTitle(slot, this.themeName);

  protected open(slot: SlotView): void {
    this.drafting.set(null);
    this.opened.set(slot);
  }

  protected add(date: string, pick: Pick<SlotDraftInput, 'contentId' | 'ideaId'> = {}): void {
    this.opened.set(null);
    this.drafting.set({ date, ...pick });
  }

  // Dal pannello, senza trascinare (sul telefono): il primo giorno da domani, poi si sceglie nel pannello di lato.
  protected pickContent(content: ContentSummary): void {
    this.add(addDays(planNow().date, 1), { contentId: content.id });
  }

  protected pickIdea(idea: Idea): void {
    this.add(addDays(planNow().date, 1), { ideaId: idea.id });
  }

  protected closeDrawer(): void {
    this.opened.set(null);
    this.drafting.set(null);
  }

  protected afterSave(): void {
    this.closeDrawer();
    this.reload();
  }

  protected afterPlan(count: number): void {
    this.planning.set(false);
    this.toast.show(`${count} ${count === 1 ? 'uscita aggiunta' : 'uscite aggiunte'} al piano.`);
    this.reload();
  }

  // Un'uscita senza contenuto si prepara in una chat nuova che la menziona, con la sua idea.
  protected async prepareInChat(slot: SlotView): Promise<void> {
    const brand = this.brands.activeBrand();
    if (!brand || this.busy()) return;
    this.busy.set(true);
    try {
      const { conversationId } = await this.chat.start(brand.id, { message: 'Prepara il contenuto di questa uscita.', slotId: slot.id });
      void this.chat.refresh();
      await this.router.navigate(['/assistente', conversationId]);
    } catch (error) {
      this.toast.show(errorMessage(error, 'Non riesco ad aprire la chat. Riprova.'));
    } finally {
      this.busy.set(false);
    }
  }

  // Il trascinamento: HTML nativo. Si lascia solo su un giorno da oggi in poi.

  protected dragStart(event: DragEvent, dragged: Dragged): void {
    this.dragged.set(dragged);
    event.dataTransfer?.setData('text/plain', dragged.kind);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  protected dragEnd(): void {
    this.dragged.set(null);
    this.dropDate.set(null);
  }

  protected dragOver(event: DragEvent, day: Day): void {
    if (!this.dragged() || day.past) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dropDate.set(day.date);
  }

  protected dragLeave(day: Day): void {
    if (this.dropDate() === day.date) this.dropDate.set(null);
  }

  protected async drop(event: DragEvent, day: Day): Promise<void> {
    event.preventDefault();
    const dragged = this.dragged();
    const brand = this.brands.activeBrand();
    const plan = this.plan();
    this.dragEnd();
    if (!dragged || !brand || !plan || day.past) return;
    const date = day.date;
    try {
      if (dragged.kind === 'slot') {
        if (dragged.slot.date === date) return;
        // Oggi, un'ora già passata diventa la prossima ora piena.
        const time = isPast(date, dragged.slot.time) ? timeFor(dragged.slot.channels, date) : dragged.slot.time;
        await this.api.update(dragged.slot.id, { date, time });
      } else if (dragged.kind === 'content') {
        await this.api.create(brand.id, { date, time: timeFor(dragged.content.channels, date), contentId: dragged.content.id });
      } else {
        await this.api.create(brand.id, { date, time: timeFor(plan.channels, date), ideaId: dragged.idea.id });
      }
      this.reload();
    } catch (error) {
      this.toast.show(errorMessage(error, 'Non riesco a spostarla lì. Riprova.'));
      this.reload();
    }
  }
}
