import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, type ElementRef, afterNextRender, computed, effect, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';

import type { ConversationSummary } from '@moonbrand/shared/api/contract';

import { AuthService } from '../../core/auth/auth.service';
import { ChatService } from '../../core/chat/chat.service';
import { PageHeader } from '../../core/layout/page-header';
import { Icon, type IconName } from '../../ui/icon';
import { Logo } from '../../ui/logo';
import { BrandPicker, BrandPickerService } from './brand-picker';
import { BrandSwitcher } from './brand-switcher';

// Le sezioni dell'app, nell'ordine della sidebar; le impostazioni stanno in fondo, sopra l'account.
// Sotto le sezioni, le ultime conversazioni divise per giorno; le altre in /conversazioni.
const RECENT_CHATS = 40;
const COLLAPSED_KEY = 'mb.sidebar-collapsed';

const SECTIONS: { path: string; label: string; icon: IconName; exact: boolean }[] = [
  { path: '/assistente', label: 'Assistente', icon: 'message-circle', exact: false },
  { path: '/', label: 'Idee', icon: 'lightbulb', exact: true },
  { path: '/contenuti', label: 'Contenuti', icon: 'file-text', exact: false },
  { path: '/piano', label: 'Piano', icon: 'calendar', exact: false },
];

@Component({
  selector: 'mb-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, RouterOutlet, RouterLink, RouterLinkActive, Icon, Logo, BrandSwitcher, BrandPicker],
  // L'altezza vera della barra in alto, per le pagine che occupano lo schermo (la chat): sul telefono va su due righe.
  host: {
    '[style.--topbar-height.px]': 'topbarHeight()',
    '(document:keydown.escape)': 'menuOpen.set(false)',
    '(document:keydown)': 'shortcut($event)',
  },
  template: `
    @if (menuOpen()) {
      <div class="scrim" (click)="menuOpen.set(false)"></div>
    }
    <aside class="sidebar" [class.open]="menuOpen()" [class.collapsed]="collapsed()">
      <div class="head">
        <a class="brand-mark" routerLink="/assistente" aria-label="Moonbrand Studio"><mb-logo [compact]="collapsed()" /></a>
        @if (!collapsed()) {
          <button class="side-btn toggle" type="button" title="Comprimi la barra" aria-label="Comprimi la barra" (click)="toggleCollapsed()">
            <mb-icon name="panel-left" [stroke]="1.8" />
          </button>
        }
      </div>
      @if (collapsed()) {
        <button class="side-btn toggle wide" type="button" title="Espandi la barra" aria-label="Espandi la barra" (click)="toggleCollapsed()">
          <mb-icon name="panel-left" [stroke]="1.8" />
        </button>
      }

      <mb-brand-switcher [compact]="collapsed()" />

      <div class="quick">
        <a class="new-chat" routerLink="/assistente" [attr.title]="collapsed() ? 'Nuova chat' : null">
          <mb-icon name="plus" [size]="16" [stroke]="2.2" />
          @if (!collapsed()) {
            <span>Nuova chat</span>
          }
        </a>
        @if (!collapsed()) {
          <a class="side-btn search" routerLink="/conversazioni" [title]="'Cerca tra le conversazioni (' + shortcutLabel + ')'"
            aria-label="Cerca tra le conversazioni">
            <mb-icon name="search" [size]="16" />
          </a>
        }
      </div>

      <nav class="nav" aria-label="Sezioni">
        @for (section of sections; track section.path) {
          <a class="nav-item" [routerLink]="section.path" routerLinkActive="active"
            [routerLinkActiveOptions]="{ exact: section.exact }" ariaCurrentWhenActive="page" [attr.title]="section.label">
            <mb-icon [name]="section.icon" [stroke]="1.8" />
            <span class="nav-label">{{ section.label }}</span>
          </a>
        }
      </nav>

      <div class="history" aria-label="Conversazioni">
        @if (!collapsed()) {
          @for (group of chatGroups(); track group.label) {
            <div class="group">
              <p class="group-label">{{ group.label }}</p>
              @for (item of group.items; track item.id) {
                <a class="session" [routerLink]="['/assistente', item.id]" routerLinkActive="active" ariaCurrentWhenActive="page"
                  [attr.title]="item.title">
                  <span class="session-title">{{ item.title }}</span>
                  @if (item.busy) {
                    <span class="spinner" aria-label="Sta rispondendo"></span>
                  }
                </a>
              }
            </div>
          }
          @if (chat.conversations().length > recentCount) {
            <a class="show-all" routerLink="/conversazioni">Mostra tutte <mb-icon name="chevron-right" [size]="14" /></a>
          }
        }
      </div>

      <div class="foot">
        <a class="nav-item" routerLink="/impostazioni" routerLinkActive="active" ariaCurrentWhenActive="page" title="Impostazioni brand">
          <mb-icon name="settings" [stroke]="1.8" />
          <span class="nav-label">Impostazioni brand</span>
        </a>
        @if (auth.account(); as account) {
          <div class="account">
            <span class="initials" [attr.title]="collapsed() ? account.name : null">{{ initials(account.name) }}</span>
            @if (!collapsed()) {
              <span class="account-texts">
                <span class="account-name">{{ account.name || 'Il tuo account' }}</span>
                <span class="account-email">{{ account.email }}</span>
              </span>
              <button class="side-btn" type="button" title="Esci" aria-label="Esci" (click)="signOut()">
                <mb-icon name="log-out" [size]="16" />
              </button>
            }
          </div>
        }
      </div>
    </aside>
    <div class="main">
      <header class="topbar" #topbar>
        <button class="icon-btn burger" type="button" aria-label="Apri il menu" [attr.aria-expanded]="menuOpen()" (click)="menuOpen.set(true)">
          <mb-icon name="menu" [size]="20" />
        </button>
        <nav class="crumbs" aria-label="Dove sei">
          @for (crumb of header.crumbs(); track $index; let last = $last) {
            @if (crumb.link && !last) {
              <a class="crumb" [routerLink]="crumb.link">{{ crumb.label }}</a>
            } @else {
              <span class="crumb" [class.current]="last" [attr.aria-current]="last ? 'page' : null">{{ crumb.label }}</span>
            }
            @if (!last) {
              <span class="crumb-sep" aria-hidden="true">/</span>
            }
          }
        </nav>
        @if (header.actions(); as actions) {
          <div class="page-actions">
            <ng-container [ngTemplateOutlet]="actions" />
          </div>
        }
      </header>
      <main class="content" #scroller data-page-scroller>
        <router-outlet />
      </main>
    </div>
    <mb-brand-picker />
  `,
  styles: `
    // La sidebar fa da cornice blu notte: la pagina è un pannello chiaro staccato di --frame dai bordi,
    // e scorre dentro il pannello, sotto la barra in alto.
    :host {
      --content-padding: 32px;
      --frame: 8px;
      display: flex;
      height: 100dvh;
      overflow: hidden;
      background: var(--surface-sidebar);
    }
    .sidebar {
      z-index: 20;
      display: flex;
      flex: none;
      flex-direction: column;
      gap: 6px;
      width: 272px;
      padding: 14px 12px;
      overflow: hidden;
      color: var(--sidebar-text);
      transition: width 200ms var(--ease);
    }
    .sidebar.collapsed {
      width: 72px;
    }
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-height: 40px;
      padding: 4px 6px 10px;
    }
    .brand-mark {
      display: flex;
      min-width: 0;
      color: var(--white);
      text-decoration: none;
    }
    .side-btn {
      display: grid;
      flex: none;
      place-items: center;
      width: 30px;
      height: 30px;
      padding: 0;
      border: 0;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--sidebar-muted);
      cursor: pointer;
      transition:
        background-color 120ms var(--ease),
        color 120ms var(--ease);
    }
    .side-btn:hover {
      background: var(--sidebar-hover);
      color: var(--white);
    }
    .toggle.wide {
      width: 48px;
      height: 36px;
      border-radius: 10px;
    }
    .quick {
      display: flex;
      gap: 6px;
      margin-top: 8px;
    }
    .new-chat {
      display: flex;
      flex: 1;
      align-items: center;
      justify-content: center;
      gap: 8px;
      height: 38px;
      border-radius: 10px;
      background: var(--accent);
      color: #1a1204;
      font-size: 14px;
      font-weight: 600;
      text-decoration: none;
      white-space: nowrap;
      transition: background-color 120ms var(--ease);
    }
    .new-chat:hover {
      background: var(--accent-hover);
    }
    .search {
      width: 38px;
      height: 38px;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.06);
      color: var(--sidebar-text);
    }
    .search:hover {
      background: rgba(255, 255, 255, 0.1);
    }
    .nav {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin-top: 14px;
    }
    .nav-item {
      display: flex;
      align-items: center;
      gap: 12px;
      height: 38px;
      padding: 0 12px;
      border-radius: 10px;
      color: var(--sidebar-text);
      font-size: 14px;
      font-weight: 500;
      text-decoration: none;
      white-space: nowrap;
      transition:
        background-color 120ms var(--ease),
        color 120ms var(--ease);
    }
    .nav-item:hover {
      background: var(--sidebar-hover);
      color: var(--white);
    }
    .nav-item.active {
      background: var(--surface-sidebar-active);
      color: var(--white);
    }
    .collapsed .nav-label {
      display: none;
    }
    .history {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 14px;
      min-height: 0;
      margin-top: 18px;
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: rgba(255, 255, 255, 0.12) transparent;
    }
    .group {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    .group-label {
      padding: 0 12px 6px;
      color: #5e6a82;
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .session {
      display: flex;
      flex: none;
      align-items: center;
      gap: 8px;
      height: 34px;
      padding: 0 12px;
      border-radius: var(--radius-sm);
      color: #9aa5ba;
      font-size: 13.5px;
      text-decoration: none;
      transition:
        background-color 120ms var(--ease),
        color 120ms var(--ease);
    }
    .session:hover {
      background: rgba(255, 255, 255, 0.05);
      color: var(--white);
    }
    .session.active {
      background: rgba(255, 255, 255, 0.07);
      color: var(--white);
    }
    .session-title {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .session .spinner {
      flex: none;
      width: 10px;
      height: 10px;
    }
    .show-all {
      display: inline-flex;
      align-self: flex-start;
      align-items: center;
      gap: 4px;
      padding: 4px 12px 8px;
      color: var(--sidebar-muted);
      font-size: 12.5px;
      text-decoration: none;
    }
    .show-all:hover {
      color: var(--white);
    }
    .foot {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding-top: 8px;
      border-top: 1px solid rgba(255, 255, 255, 0.07);
    }
    .account {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 6px;
    }
    .initials {
      display: grid;
      flex: none;
      place-items: center;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      background: var(--primary-soft);
      color: var(--white);
      font-size: 12px;
      font-weight: 600;
    }
    .account-texts {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-width: 0;
      line-height: 1.35;
    }
    .account-name,
    .account-email {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .account-name {
      color: var(--white);
      font-size: 13px;
      font-weight: 500;
    }
    .account-email {
      color: var(--sidebar-muted);
      font-size: 12px;
    }
    .collapsed {
      .nav-item {
        justify-content: center;
        width: 48px;
        padding: 0;
      }
      .quick {
        width: 48px;
      }
      .account {
        justify-content: center;
        width: 48px;
        padding: 8px 0;
      }
    }
    .main {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-width: 0;
      margin: var(--frame) var(--frame) var(--frame) 0;
      overflow: hidden;
      border-radius: var(--radius-lg);
      background: var(--surface-app);
    }
    .topbar {
      z-index: 10;
      display: flex;
      flex: none;
      align-items: center;
      gap: 16px;
      height: var(--topbar-height);
      padding: 0 24px;
      border-bottom: 1px solid var(--border-subtle);
    }
    .crumbs {
      display: flex;
      flex: 1;
      align-items: center;
      gap: 8px;
      min-width: 0;
      font-size: 14px;
    }
    .crumb {
      flex: none;
      max-width: 50vw;
      overflow: hidden;
      color: var(--text-body);
      text-decoration: none;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    a.crumb:hover {
      color: var(--text-title);
    }
    .crumb.current {
      flex: 0 1 auto;
      color: var(--text-title);
      font-weight: 500;
    }
    .crumb-sep {
      color: #c8ccd4;
    }
    .page-actions {
      display: flex;
      flex: none;
      align-items: center;
      gap: 8px;
    }
    .content {
      flex: 1;
      min-height: 0;
      padding: var(--content-padding);
      overflow-y: auto;
    }
    .burger,
    .scrim {
      display: none;
    }
    // Sul tablet la barra resta compressa: c'è posto solo per le icone.
    @media (max-width: 900px) {
      .toggle {
        display: none;
      }
    }
    // Sul telefono la barra laterale diventa un menu che entra da sinistra, aperto dal pulsante nella barra in alto;
    // la pagina occupa tutto lo schermo e i pulsanti della pagina vanno su una seconda riga.
    @media (max-width: 760px) {
      :host {
        --content-padding: 16px;
        --frame: 0px;
      }
      .sidebar {
        position: fixed;
        inset: 0 auto 0 0;
        z-index: 60;
        width: min(300px, 86vw);
        height: 100dvh;
        background: var(--surface-sidebar);
        transform: translateX(-100%);
        transition: transform 220ms var(--ease);
      }
      .sidebar.open {
        transform: none;
        box-shadow: var(--shadow-menu);
      }
      .scrim {
        position: fixed;
        inset: 0;
        z-index: 55;
        display: block;
        background: var(--scrim);
        animation: fade-in 160ms var(--ease);
      }
      .main {
        border-radius: 0;
      }
      .burger {
        display: inline-flex;
        flex: none;
        margin-left: -6px;
      }
      .topbar {
        flex-wrap: wrap;
        gap: 8px 10px;
        height: auto;
        min-height: 56px;
        padding: 8px 12px;
      }
      .crumbs {
        font-size: 15px;
      }
      .crumb:not(.current),
      .crumb-sep {
        display: none;
      }
      .crumb.current {
        max-width: none;
      }
      .page-actions {
        order: 3;
        width: 100%;
        padding: 0 0 2px;
        overflow-x: auto;
      }
      // Solo icone (il cestino della chat): stanno sulla prima riga.
      .page-actions:not(:has(.btn)) {
        order: 0;
        width: auto;
        padding: 0;
      }
    }
  `,
})
export class Shell {
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);
  protected readonly chat = inject(ChatService);
  protected readonly header = inject(PageHeader);
  private readonly picker = inject(BrandPickerService);
  protected readonly sections = SECTIONS;
  protected readonly recentCount = RECENT_CHATS;
  protected readonly shortcutLabel = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl+K';

  // Il menu sul telefono: si chiude cambiando pagina.
  protected readonly menuOpen = signal(false);
  protected readonly topbarHeight = signal<number | null>(null);
  private readonly topbar = viewChild.required<ElementRef<HTMLElement>>('topbar');
  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');

  // Compressa con il pulsante, e la scelta resta tra una visita e l'altra; sul tablet sempre, sul telefono mai (è un menu).
  private readonly userCollapsed = signal(readCollapsed());
  private readonly tablet = mediaQuery('(min-width: 761px) and (max-width: 900px)');
  private readonly phone = mediaQuery('(max-width: 760px)');
  protected readonly collapsed = computed(() => this.tablet() || (this.userCollapsed() && !this.phone()));

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  constructor() {
    // Cambiando pagina si chiude il menu e si riparte dall'alto; cambiando solo i parametri (il giorno del piano) no.
    let path = this.router.url.split(/[?#]/)[0];
    effect(() => {
      const next = this.url().split(/[?#]/)[0];
      this.menuOpen.set(false);
      if (next !== path) this.scroller().nativeElement.scrollTop = 0;
      path = next;
    });
    // Sul telefono la finestra dei brand si apre dal menu: il menu si chiude, resta la finestra.
    effect(() => {
      if (this.picker.isOpen()) this.menuOpen.set(false);
    });
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const element = this.topbar().nativeElement;
      const observer = new ResizeObserver(() => this.topbarHeight.set(element.offsetHeight));
      observer.observe(element);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  // Le ultime conversazioni, più quella aperta se è più vecchia (si vede sempre dove si è), divise per giorno.
  protected readonly chatGroups = computed(() => {
    const all = this.chat.conversations();
    const recent = all.slice(0, RECENT_CHATS);
    const openId = /^\/assistente\/([^/?#]+)/.exec(this.url())?.[1];
    const open = all.find((item) => item.id === openId);
    return groupByDay(open && !recent.includes(open) ? [...recent, open] : recent);
  });

  protected toggleCollapsed(): void {
    this.userCollapsed.update((collapsed) => !collapsed);
    try {
      localStorage.setItem(COLLAPSED_KEY, this.userCollapsed() ? '1' : '0');
    } catch {
      // Senza storage la scelta vale finché la pagina resta aperta.
    }
  }

  // ⌘K (Ctrl+K fuori dal Mac) apre la ricerca tra le conversazioni.
  protected shortcut(event: KeyboardEvent): void {
    if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
    event.preventDefault();
    void this.router.navigateByUrl('/conversazioni');
  }

  protected initials(name: string): string {
    return (
      name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((word) => word.charAt(0).toUpperCase())
        .join('') || '?'
    );
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/login');
  }
}

// Le conversazioni sono già dalla più recente: i gruppi seguono lo stesso ordine.
function groupByDay(items: ConversationSummary[]): { label: string; items: ConversationSummary[] }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = 24 * 60 * 60 * 1000;
  const labelOf = (date: string): string => {
    const age = today.getTime() - new Date(date).getTime();
    if (age <= 0) return 'Oggi';
    if (age <= day) return 'Ieri';
    if (age <= 6 * day) return 'Questa settimana';
    if (age <= 29 * day) return 'Questo mese';
    return 'Più vecchie';
  };
  const groups: { label: string; items: ConversationSummary[] }[] = [];
  for (const item of items) {
    const label = labelOf(item.updatedAt);
    const group = groups.find((entry) => entry.label === label);
    if (group) group.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

// Una media query come segnale, aggiornato quando cambia la finestra.
function mediaQuery(query: string) {
  const list = matchMedia(query);
  const matches = signal(list.matches);
  const listener = (event: MediaQueryListEvent) => matches.set(event.matches);
  list.addEventListener('change', listener);
  inject(DestroyRef).onDestroy(() => list.removeEventListener('change', listener));
  return matches.asReadonly();
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}
