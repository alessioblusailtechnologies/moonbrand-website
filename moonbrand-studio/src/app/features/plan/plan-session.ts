import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked, type OnInit } from '@angular/core';

import type { PlanResponse } from '@moonbrand/shared/api/contract';
import type { ChannelId } from '@moonbrand/shared/domain/brand';
import { channelName } from '@moonbrand/shared/domain/catalog';
import { balanceHint, rankIdeasForSlot, themeBalance, type SlotDraft } from '@moonbrand/shared/domain/plan';
import { addDays, formatWeekdayShort, planNow, startOfWeek } from '@moonbrand/shared/lib/dates';

import { BrandsService } from '../../core/brands/brands.service';
import { errorMessage } from '../../core/errors';
import { PlanService } from '../../core/plan/plan.service';
import { ChannelMark } from '../../ui/channel-mark';
import { Icon } from '../../ui/icon';
import { lockPageScroll } from '../../ui/scroll-lock';
import { ToastService } from '../../ui/toast';

type Start = 'tomorrow' | 'nextWeek';

const WEEKS = [1, 2, 4];

// Pianificare le prossime settimane: da quando, per quanto, quante uscite a settimana e su quali canali. La proposta
// arriva dalle regole del piano (ritmo, orari migliori, temi secondo il peso, idee salvate dello stesso tema);
// si tolgono uscite o si cambia l'idea, poi si aggiungono tutte insieme.
@Component({
  selector: 'mb-plan-session',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, ChannelMark],
  host: { '(document:keydown.escape)': 'saving() || closed.emit()' },
  templateUrl: './plan-session.html',
  styleUrl: './plan-session.scss',
})
export class PlanSession implements OnInit {
  private readonly api = inject(PlanService);
  private readonly brands = inject(BrandsService);
  private readonly toast = inject(ToastService);

  readonly plan = input.required<PlanResponse>();
  readonly closed = output();
  readonly confirmed = output<number>();

  constructor() {
    lockPageScroll();
    // Ogni scelta rifà la proposta.
    effect(() => {
      const request = this.request();
      if (request) untracked(() => void this.propose(request));
    });
  }

  protected readonly start = signal<Start>('tomorrow');
  protected readonly weeks = signal(2);
  protected readonly perWeek = signal(3);
  protected readonly channels = signal<ChannelId[]>([]);
  protected readonly drafts = signal<SlotDraft[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  private readonly ready = signal(false);

  protected readonly weekOptions = WEEKS;
  protected readonly name = channelName;
  protected readonly day = formatWeekdayShort;

  private readonly startDate = computed(() => {
    const today = planNow().date;
    return this.start() === 'tomorrow' ? addDays(today, 1) : addDays(startOfWeek(today), 7);
  });

  private readonly request = computed(() =>
    this.ready() ? { startDate: this.startDate(), weeks: this.weeks(), perWeek: this.perWeek(), channels: this.channels() } : null,
  );

  protected readonly balance = computed(() => (this.drafts().length > 0 ? balanceHint(themeBalance(this.plan().themes, this.drafts())) : null));

  ngOnInit(): void {
    const plan = this.plan();
    this.perWeek.set(Math.max(1, Math.min(7, plan.postsPerWeek || 3)));
    this.channels.set([...plan.channels]);
    this.ready.set(true);
  }

  private async propose(request: { startDate: string; weeks: number; perWeek: number; channels: ChannelId[] }): Promise<void> {
    const brand = this.brands.activeBrand();
    if (!brand) return;
    if (request.channels.length === 0) {
      this.drafts.set([]);
      return;
    }
    this.loading.set(true);
    try {
      const { drafts } = await this.api.propose(brand.id, request);
      if (this.request() === request) this.drafts.set(drafts);
    } catch (error) {
      this.toast.show(errorMessage(error, 'Non riesco a preparare la proposta.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected toggle(channel: ChannelId): void {
    this.channels.update((list) => (list.includes(channel) ? list.filter((item) => item !== channel) : [...list, channel]));
  }

  protected stepPerWeek(step: number): void {
    this.perWeek.update((value) => Math.max(1, Math.min(7, value + step)));
  }

  protected themeName(themeId: string | null): string | null {
    return this.plan().themes.find((theme) => theme.id === themeId)?.name ?? null;
  }

  protected themeColor(themeId: string | null): string {
    return this.plan().themes.find((theme) => theme.id === themeId)?.color ?? 'var(--grey-300)';
  }

  protected ideaTitle(ideaId: string | null): string | null {
    return this.plan().ideas.find((idea) => idea.id === ideaId)?.title ?? null;
  }

  // L'idea di un'uscita: la prossima tra quelle adatte e non usate dalle altre, poi nessuna, poi si ricomincia.
  protected changeIdea(index: number): void {
    const drafts = this.drafts();
    const draft = drafts[index];
    const used = new Set(drafts.filter((_, i) => i !== index).map((item) => item.ideaId).filter((id): id is string => id !== null));
    const ranked = rankIdeasForSlot(draft, this.plan().ideas, used);
    const options = [...ranked.map((idea) => idea.id), null];
    const next = options[(options.indexOf(draft.ideaId) + 1) % options.length] ?? null;
    this.drafts.update((list) => list.map((item, i) => (i === index ? { ...item, ideaId: next } : item)));
  }

  protected removeDraft(index: number): void {
    this.drafts.update((list) => list.filter((_, i) => i !== index));
  }

  protected async confirm(): Promise<void> {
    const brand = this.brands.activeBrand();
    const drafts = this.drafts();
    if (!brand || drafts.length === 0 || this.saving()) return;
    this.saving.set(true);
    try {
      const created = await this.api.confirm(brand.id, { drafts });
      this.confirmed.emit(created.length);
    } catch (error) {
      this.toast.show(errorMessage(error, 'Non sono riuscito ad aggiungere le uscite. Riprova.'));
    } finally {
      this.saving.set(false);
    }
  }
}
