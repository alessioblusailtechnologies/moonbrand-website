import { ChangeDetectionStrategy, Component, type ElementRef, type TemplateRef, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ChatService } from '../../core/chat/chat.service';
import { pageHeader } from '../../core/layout/page-header';
import { Icon } from '../../ui/icon';

// Tutte le conversazioni del brand: la sidebar mostra solo le ultime. Ci porta anche ⌘K, quindi si comincia dalla ricerca.
@Component({
  selector: 'mb-conversations-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon],
  template: `
    <section class="conversations">
      <input
        #searchField
        class="sunken"
        type="search"
        aria-label="Cerca tra le conversazioni"
        placeholder="Cerca per titolo…"
        [value]="search()"
        (input)="search.set($any($event.target).value)"
      />

      <div class="panel list">
        @for (item of visible(); track item.id) {
          <a class="row" [routerLink]="['/assistente', item.id]">
            <mb-icon name="message-circle" [size]="16" />
            <span class="strong-sm row-title">{{ item.title }}</span>
            @if (item.busy) {
              <span class="caption busy"><span class="spinner"></span> Sto rispondendo</span>
            } @else {
              <span class="caption">{{ when(item.updatedAt) }}</span>
            }
          </a>
        } @empty {
          <p class="caption empty">
            {{ search() ? 'Nessuna conversazione con questo titolo.' : 'Ancora nessuna conversazione con l’assistente.' }}
          </p>
        }
      </div>
    </section>

    <ng-template #headerActions>
      <a class="btn btn-secondary btn-sm new" routerLink="/assistente">
        <mb-icon name="plus" [size]="16" /> Nuova conversazione
      </a>
    </ng-template>
  `,
  styles: `
    .conversations {
      display: flex;
      flex-direction: column;
      gap: 16px;
      margin: 0 auto;
      animation: fade-up 240ms var(--ease);
    }
    .new {
      gap: 6px;
      text-decoration: none;
    }
    .list {
      gap: 2px;
      padding: 8px;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 48px;
      padding: 0 12px;
      border-radius: var(--radius-md);
      color: var(--text-title);
      text-decoration: none;
    }
    .row:hover {
      background: var(--surface-sunken);
    }
    .row-title {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .busy {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .busy .spinner {
      width: 10px;
      height: 10px;
    }
    .empty {
      padding: 24px 12px;
      text-align: center;
    }
  `,
})
export class ConversationsPage {
  private readonly chat = inject(ChatService);

  private readonly headerActions = viewChild<TemplateRef<unknown>>('headerActions');
  private readonly searchField = viewChild.required<ElementRef<HTMLInputElement>>('searchField');
  protected readonly search = signal('');
  protected readonly visible = computed(() => {
    const words = this.search().trim().toLowerCase();
    const all = this.chat.conversations();
    return words ? all.filter((item) => item.title.toLowerCase().includes(words)) : all;
  });

  constructor() {
    pageHeader(
      () => [{ label: 'Assistente', link: '/assistente' }, { label: 'Tutte le conversazioni' }],
      () => this.headerActions(),
    );
    void this.chat.refresh();
    afterNextRender(() => this.searchField().nativeElement.focus());
  }

  protected when(date: string): string {
    const value = new Date(date);
    return value.toDateString() === new Date().toDateString()
      ? value.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
      : value.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
  }
}
