import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { SlotView } from '@moonbrand/shared/api/contract';
import type { Content } from '@moonbrand/shared/domain/content';
import { addDays, formatWeekdayLong, isDay, isPast, isTime, planNow } from '@moonbrand/shared/lib/dates';

import { errorMessage } from '../../core/errors';
import { PlanService } from '../../core/plan/plan.service';
import { ConfirmService } from '../../ui/confirm';
import { Icon } from '../../ui/icon';
import { ToastService } from '../../ui/toast';
import { SLOT_STATUS_LABELS, SLOT_TONES, timeFor } from '../plan/labels';

// Quando esce il contenuto: la sua uscita nel piano, da spostare o togliere, oppure il giorno e l'ora per programmarlo.
@Component({
  selector: 'mb-content-schedule',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon],
  template: `
    @let current = slot();
    <div class="schedule">
      <mb-icon name="calendar" [size]="16" />
      @if (editing()) {
        <input class="sunken" type="date" aria-label="Giorno" [min]="today" [value]="date()" (change)="date.set($any($event.target).value)" />
        <input class="sunken time" type="time" step="300" aria-label="Ora" [value]="time()" (change)="time.set($any($event.target).value)" />
        <button class="btn btn-primary btn-sm" type="button" [disabled]="!valid() || saving()" (click)="save()">
          {{ saving() ? 'Salvo…' : current ? 'Sposta' : 'Programma' }}
        </button>
        <button class="btn btn-ghost btn-sm" type="button" [disabled]="saving()" (click)="editing.set(false)">Annulla</button>
        @if (date() && time() && !valid()) {
          <span class="caption warn">Da adesso in poi.</span>
        }
      } @else if (current) {
        <span class="when">
          Esce {{ when(current.date) }} alle {{ current.time }}
          <span class="status" [style.--tone]="tones[current.status]">{{ statusLabels[current.status] }}</span>
        </span>
        <a class="link-btn" routerLink="/piano" [queryParams]="{ giorno: current.date }">Vedi nel piano</a>
        @if (current.status !== 'published') {
          <button class="link-btn" type="button" (click)="startEdit()">Sposta</button>
          <button class="link-btn muted" type="button" [disabled]="saving()" (click)="unschedule()">Togli dal piano</button>
        }
      } @else {
        <span class="caption">Non è ancora nel piano.</span>
        <button class="btn btn-secondary btn-sm" type="button" (click)="startEdit()">Programma</button>
      }
    </div>
  `,
  styles: `
    .schedule {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 12px;
      color: var(--text-title);
    }
    .sunken {
      width: auto;
      min-height: 34px;
      padding: 6px 10px;
    }
    .when {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      font-weight: 500;
    }
    .status {
      padding: 1px 8px 1px 6px;
      border-left: 3px solid var(--tone);
      border-radius: 4px;
      background: var(--surface-sunken);
      font-size: 11px;
      font-weight: 600;
    }
    .muted {
      color: var(--text-body);
    }
    .warn {
      color: var(--danger);
    }
  `,
})
export class ContentSchedule {
  private readonly api = inject(PlanService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  readonly content = input.required<Content>();
  readonly slot = input<SlotView | null>(null);
  readonly changed = output<SlotView | null>();

  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly date = signal('');
  protected readonly time = signal('');

  protected readonly today = planNow().date;
  protected readonly tones = SLOT_TONES;
  protected readonly statusLabels = SLOT_STATUS_LABELS;
  protected readonly when = formatWeekdayLong;
  protected readonly valid = computed(() => isDay(this.date()) && isTime(this.time()) && !isPast(this.date(), this.time()));

  // Si parte dall'uscita che c'è, o da domani all'ora migliore dei canali del contenuto.
  protected startEdit(): void {
    const slot = this.slot();
    const date = slot?.date ?? addDays(this.today, 1);
    this.date.set(date);
    this.time.set(slot?.time ?? timeFor(this.content().channels, date));
    this.editing.set(true);
  }

  protected async save(): Promise<void> {
    if (!this.valid() || this.saving()) return;
    this.saving.set(true);
    try {
      const slot = await this.api.schedule(this.content().id, { date: this.date(), time: this.time() });
      this.editing.set(false);
      this.changed.emit(slot);
      this.toast.show(`Esce ${formatWeekdayLong(slot.date)} alle ${slot.time}.`);
    } catch (error) {
      this.toast.show(errorMessage(error, 'Non sono riuscito a programmarlo. Riprova.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected async unschedule(): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: 'Tolgo il contenuto dal piano?',
      message: 'Resta tra i Contenuti, senza data: puoi programmarlo di nuovo quando vuoi.',
      confirmLabel: 'Togli dal piano',
      tone: 'danger',
    });
    if (!confirmed) return;
    this.saving.set(true);
    try {
      await this.api.unschedule(this.content().id);
      this.changed.emit(null);
    } catch (error) {
      this.toast.show(errorMessage(error, 'Non sono riuscito a toglierlo dal piano. Riprova.'));
    } finally {
      this.saving.set(false);
    }
  }
}
