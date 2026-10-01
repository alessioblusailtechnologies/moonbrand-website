import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal, type OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { PlanResponse, SlotView } from '@moonbrand/shared/api/contract';
import type { ChannelId } from '@moonbrand/shared/domain/brand';
import { channelName } from '@moonbrand/shared/domain/catalog';
import { bestChannelFor } from '@moonbrand/shared/domain/plan';
import { formatWeekdayLong, isDay, isPast, isTime, planNow } from '@moonbrand/shared/lib/dates';

import { BrandsService } from '../../core/brands/brands.service';
import { errorMessage } from '../../core/errors';
import { PlanService } from '../../core/plan/plan.service';
import { ChannelMark } from '../../ui/channel-mark';
import { ConfirmService } from '../../ui/confirm';
import { Icon } from '../../ui/icon';
import { lockPageScroll } from '../../ui/scroll-lock';
import { ToastService } from '../../ui/toast';
import { FORMAT_LABELS } from '../contents/labels';
import { canMove, SLOT_STATUS_LABELS, SLOT_TONES, slotTitle, timeFor } from './labels';

// Un'uscita da creare: il giorno e, se arriva dal pannello, il contenuto o l'idea da metterci.
export interface SlotDraftInput {
  date: string;
  contentId?: string;
  ideaId?: string;
}

// Cosa esce in un'uscita nuova: niente (con il tema), un'idea tenuta o un contenuto senza data.
type What = { kind: 'empty' } | { kind: 'idea'; id: string } | { kind: 'content'; id: string };

// L'uscita di lato: per crearla, spostarla, cambiarne canali, tema e idea, toglierla, o preparare il contenuto in chat.
@Component({
  selector: 'mb-slot-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon, ChannelMark],
  host: { '(document:keydown.escape)': 'saving() || closed.emit()' },
  templateUrl: './slot-drawer.html',
  styleUrl: './slot-drawer.scss',
})
export class SlotDrawer implements OnInit {
  private readonly api = inject(PlanService);
  private readonly brands = inject(BrandsService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  readonly slot = input<SlotView | null>(null);
  readonly draft = input<SlotDraftInput | null>(null);
  readonly plan = input.required<PlanResponse>();
  readonly busy = input(false);
  readonly closed = output();
  readonly saved = output();
  readonly prepare = output<SlotView>();

  constructor() {
    lockPageScroll();
  }

  protected readonly date = signal('');
  protected readonly time = signal('');
  protected readonly channels = signal<ChannelId[]>([]);
  protected readonly themeId = signal<string | null>(null);
  protected readonly ideaId = signal<string | null>(null);
  protected readonly what = signal<What>({ kind: 'empty' });
  protected readonly saving = signal(false);

  protected readonly name = channelName;
  protected readonly tones = SLOT_TONES;
  protected readonly statusLabels = SLOT_STATUS_LABELS;
  protected readonly formatLabels = FORMAT_LABELS;
  protected readonly today = planNow().date;

  protected readonly creating = computed(() => this.slot() === null);
  // Un'uscita passata (pubblicata) si guarda soltanto.
  protected readonly locked = computed(() => {
    const slot = this.slot();
    return slot !== null && !canMove(slot);
  });
  // Il contenuto dell'uscita, o quello scelto per crearla: i canali sono i suoi.
  protected readonly content = computed(() => {
    const slot = this.slot();
    if (slot) return slot.content;
    const what = this.what();
    return what.kind === 'content' ? (this.plan().unscheduled.find((item) => item.id === what.id) ?? null) : null;
  });
  // Le idee tra cui scegliere: quelle tenute fuori dal piano, più quella dell'uscita.
  protected readonly ideas = computed(() => {
    const own = this.slot()?.idea;
    const ideas = this.plan().ideas.map((idea) => ({ id: idea.id, title: idea.title }));
    return own && !ideas.some((idea) => idea.id === own.id) ? [own, ...ideas] : ideas;
  });
  protected readonly heading = computed(() => {
    const slot = this.slot();
    return slot ? slotTitle(slot, (id) => this.plan().themes.find((theme) => theme.id === id)?.name ?? null) : 'Nuova uscita';
  });
  protected readonly when = computed(() => (isDay(this.date()) ? formatWeekdayLong(this.date()) : ''));
  protected readonly valid = computed(
    () => isDay(this.date()) && isTime(this.time()) && (this.content() !== null || this.channels().length > 0) && !isPast(this.date(), this.time()),
  );

  ngOnInit(): void {
    const slot = this.slot();
    if (slot) {
      this.date.set(slot.date);
      this.time.set(slot.time);
      this.channels.set([...slot.channels]);
      this.themeId.set(slot.themeId);
      this.ideaId.set(slot.ideaId);
      return;
    }
    const draft = this.draft();
    if (!draft) return;
    this.date.set(draft.date);
    if (draft.contentId) this.what.set({ kind: 'content', id: draft.contentId });
    else if (draft.ideaId) this.what.set({ kind: 'idea', id: draft.ideaId });
    this.fitToWhat();
  }

  // Canali, ora e tema seguono quello che si sceglie di mettere nell'uscita.
  private fitToWhat(): void {
    const content = this.content();
    const what = this.what();
    const idea = what.kind === 'idea' ? this.plan().ideas.find((item) => item.id === what.id) : undefined;
    const best = bestChannelFor(this.plan().channels, this.date());
    const channels = content ? content.channels : best ? [best] : [];
    this.channels.set(channels);
    this.themeId.set(idea?.themeId ?? null);
    this.time.set(timeFor(channels, this.date()));
  }

  protected chooseWhat(value: string): void {
    const [kind, id] = value.split(':');
    this.what.set(kind === 'idea' ? { kind: 'idea', id } : kind === 'content' ? { kind: 'content', id } : { kind: 'empty' });
    this.fitToWhat();
  }

  protected whatValue(): string {
    const what = this.what();
    return what.kind === 'empty' ? 'empty' : `${what.kind}:${what.id}`;
  }

  protected toggle(channel: ChannelId): void {
    this.channels.update((list) => (list.includes(channel) ? list.filter((item) => item !== channel) : [...list, channel]));
  }

  protected async save(): Promise<void> {
    const brand = this.brands.activeBrand();
    if (!brand || !this.valid() || this.saving()) return;
    this.saving.set(true);
    try {
      const slot = this.slot();
      if (slot) {
        await this.api.update(slot.id, {
          date: this.date(),
          time: this.time(),
          ...(!slot.content && { channels: this.channels(), themeId: this.themeId(), ideaId: this.ideaId() }),
        });
        this.toast.show('Uscita aggiornata.');
      } else {
        const what = this.what();
        await this.api.create(brand.id, {
          date: this.date(),
          time: this.time(),
          ...(what.kind === 'content' ? { contentId: what.id } : { channels: this.channels(), themeId: this.themeId() }),
          ...(what.kind === 'idea' && { ideaId: what.id }),
        });
        this.toast.show('Uscita aggiunta al piano.');
      }
      this.saved.emit();
    } catch (error) {
      this.toast.show(errorMessage(error, 'Non sono riuscito a salvare l’uscita. Riprova.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const slot = this.slot();
    if (!slot || this.saving()) return;
    const confirmed = await this.confirm.ask({
      title: 'Tolgo l’uscita dal piano?',
      message: slot.content ? 'Il contenuto resta tra i Contenuti, senza data.' : 'L’idea resta tra le idee salvate.',
      confirmLabel: 'Togli dal piano',
      tone: 'danger',
    });
    if (!confirmed) return;
    this.saving.set(true);
    try {
      await this.api.remove(slot.id);
      this.toast.show('Uscita tolta dal piano.');
      this.saved.emit();
    } catch (error) {
      this.toast.show(errorMessage(error, 'Non sono riuscito a toglierla. Riprova.'));
    } finally {
      this.saving.set(false);
    }
  }
}
