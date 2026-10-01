import { ChangeDetectionStrategy, Component, computed, inject, input, signal, type OnInit } from '@angular/core';

import type { AiStep } from '@moonbrand/shared/ai/steps';
import type { BrandDraft, Theme, ThemeLevel } from '@moonbrand/shared/domain/brand';
import { addTheme, createThemes, MAX_THEMES, removeTheme, setThemeLevel, THEME_LEVELS, themeLevel } from '@moonbrand/shared/domain/themes';

import { Icon } from '../../../ui/icon';
import { StepList } from '../../../ui/step-list';
import { ToastService } from '../../../ui/toast';
import { DraftStore } from '../draft-store';
import { MockAi } from '../mock-ai';

@Component({
  selector: 'mb-themes-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, StepList],
  template: `
    @if (themes().length === 0) {
      <div class="panel">
        @if (suggesting()) {
          <p class="strong-sm">Sto proponendo i temi a partire da quello che fai</p>
          <mb-step-list [steps]="steps()" />
        } @else {
          <p class="strong-sm">Nessun tema per ora</p>
          <button class="link-btn" type="button" (click)="save(addTheme(themes()))">Aggiungi un tema</button>
        }
      </div>
    } @else {
      @if (store.insights(); as insights) {
        <p class="caption">Proposti leggendo {{ insights.site }}, dal più importante. Rinominali e scegli quanto spesso usarli.</p>
      }
      @for (theme of themes(); track theme.id; let i = $index) {
        <div class="panel theme">
          <div class="row">
            <span class="dot" [style.background]="theme.color"></span>
            <input class="name grow" placeholder="Nome del tema" [attr.aria-label]="'Nome del tema ' + (i + 1)" [value]="theme.name"
              (input)="rename(i, $any($event.target).value)" />
            @if (themes().length > 1) {
              <button class="icon-btn" type="button" [attr.aria-label]="'Rimuovi ' + (theme.name || 'il tema')" (click)="save(removeTheme(themes(), i))">
                <mb-icon name="x" [size]="16" />
              </button>
            }
          </div>
          <div class="segmented" role="radiogroup" [attr.aria-label]="'Quanto spesso esce ' + (theme.name || 'questo tema')">
            @for (level of levels; track level.value) {
              <button type="button" role="radio" [attr.aria-checked]="level.value === themeLevel(theme)"
                [class.selected]="level.value === themeLevel(theme)" (click)="setLevel(i, level.value)">
                {{ level.label }}
              </button>
            }
          </div>
        </div>
      }
      <div class="row footer">
        <p class="caption grow">Nel piano escono più spesso i temi «Spesso», meno quelli «Di rado».</p>
        @if (themes().length < maxThemes) {
          <button class="link-btn" type="button" (click)="save(addTheme(themes()))">Aggiungi un tema</button>
        } @else {
          <p class="caption">Al massimo {{ maxThemes }} temi: togline uno per aggiungerne un altro.</p>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .theme {
      gap: 10px;
      padding: 14px 16px;
    }
    .theme .row {
      gap: 10px;
    }
    .name {
      min-height: 32px;
      padding: 0;
      border: 0;
      outline: 0;
      background: none;
      font-size: 15px;
      font-weight: 600;
    }
    .footer {
      padding: 0 2px;
    }
  `,
})
export class ThemesStep implements OnInit {
  private readonly ai = inject(MockAi);
  private readonly toast = inject(ToastService);
  protected readonly store = inject(DraftStore);
  readonly draft = input.required<BrandDraft>();

  protected readonly levels = THEME_LEVELS;
  protected readonly maxThemes = MAX_THEMES;
  protected readonly themeLevel = themeLevel;
  protected readonly addTheme = addTheme;
  protected readonly removeTheme = removeTheme;
  protected readonly suggesting = signal(false);
  protected readonly steps = signal<AiStep[]>([]);
  protected readonly themes = computed(() => this.draft().themes);

  ngOnInit(): void {
    if (this.themes().length > 0) return;
    this.suggesting.set(true);
    this.ai
      .suggestThemes(this.draft().identity, (steps) => this.steps.set(steps))
      .then((names) => this.save(createThemes(names)))
      .catch(() => this.toast.show('Non riesco a proporre i temi: aggiungili a mano.'))
      .finally(() => this.suggesting.set(false));
  }

  protected save(themes: Theme[]): void {
    this.store.patch({ key: 'themes', value: themes });
  }

  protected rename(index: number, name: string): void {
    this.save(this.themes().map((theme, i) => (i === index ? { ...theme, name } : theme)));
  }

  protected setLevel(index: number, level: ThemeLevel): void {
    this.save(setThemeLevel(this.themes(), index, level));
  }
}
