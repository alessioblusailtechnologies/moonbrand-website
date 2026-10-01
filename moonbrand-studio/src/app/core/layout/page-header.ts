import { DestroyRef, Injectable, type TemplateRef, effect, inject, signal, untracked } from '@angular/core';

// Un passo del percorso nella topbar: con link si torna lì, l'ultimo è la pagina in cui si è.
export interface Crumb {
  label: string;
  link?: string;
}

// Il percorso e i pulsanti della pagina aperta: li mostra la topbar dello shell, a sinistra e accanto al brand.
@Injectable({ providedIn: 'root' })
export class PageHeader {
  readonly crumbs = signal<Crumb[]>([]);
  readonly actions = signal<TemplateRef<unknown> | null>(null);
  owner: object | null = null;
}

// Da chiamare nel costruttore di una pagina: percorso e pulsanti seguono i suoi segnali e spariscono con lei.
// Il template dei pulsanti è della pagina, quindi i suoi click chiamano i metodi della pagina.
export function pageHeader(crumbs: () => Crumb[], actions?: () => TemplateRef<unknown> | undefined): void {
  const header = inject(PageHeader);
  const owner = {};
  effect(() => {
    const next = crumbs();
    const template = actions?.() ?? null;
    untracked(() => {
      header.owner = owner;
      header.crumbs.set(next);
      header.actions.set(template);
    });
  });
  // La pagina nuova può essere già arrivata: si pulisce solo se il percorso è ancora di questa.
  inject(DestroyRef).onDestroy(() => {
    if (header.owner !== owner) return;
    header.owner = null;
    header.crumbs.set([]);
    header.actions.set(null);
  });
}
