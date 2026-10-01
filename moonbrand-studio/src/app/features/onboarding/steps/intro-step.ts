import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { KIND_OPTIONS } from '@moonbrand/shared/domain/catalog';

import { OnboardingStore } from '../onboarding.store';

const LIST = [
  { label: 'Per chi scrivo e cosa fai', color: 'var(--accent)', square: true },
  { label: 'I canali su cui pubblicare', color: 'var(--primary)', square: false },
  { label: 'I temi, ognuno con il suo peso', color: 'var(--primary-soft)', square: true },
  { label: 'Come scrivi e come vuoi apparire', color: 'var(--mint-400)', square: false },
];

const SHAPES = [
  { color: 'var(--accent)', radius: '50%' },
  { color: 'var(--primary)', radius: '0 100% 0 0' },
  { color: 'var(--mint-400)', radius: '100% 0 100% 0' },
];

@Component({
  selector: 'mb-intro-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel intro">
      <h2 class="heading">Cinque minuti, una volta sola</h2>
      <p class="body">
        Ti chiedo chi sei, cosa vuoi ottenere, i canali, i temi, come scrivi e come vuoi apparire. Da lì genero proposte che
        sembrano scritte da te. Ogni cosa si cambia anche dopo, dalle Impostazioni brand.
      </p>
      <ul class="list">
        @for (item of list; track item.label) {
          <li><span class="dot" [class.square]="item.square" [style.background]="item.color"></span>{{ item.label }}</li>
        }
      </ul>
    </section>

    <p class="label">Per chi costruiamo la presenza</p>
    <div class="stack" role="radiogroup">
      @for (option of options; track option.kind; let i = $index) {
        @let selected = store.draft()?.identity?.kind === option.kind;
        <button class="option-card" type="button" role="radio" [attr.aria-checked]="selected" [class.selected]="selected"
          (click)="store.chooseKind(option.kind)">
          <span class="tile"><span [style.background]="shapes[i].color" [style.border-radius]="shapes[i].radius"></span></span>
          <span class="grow">
            <span class="strong">{{ option.title }}</span>
            <span class="caption">{{ option.meta }}</span>
          </span>
          <span class="radio-mark" [class.on]="selected"></span>
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .intro {
      gap: 10px;
    }
    .list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin: 4px 0 0;
      padding: 0;
      list-style: none;
    }
    .list li {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 14px;
    }
    .label {
      margin-top: 6px;
    }
    .tile {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: var(--grey-100);
    }
    .tile span {
      width: 22px;
      height: 22px;
    }
  `,
})
export class IntroStep {
  protected readonly store = inject(OnboardingStore);
  protected readonly options = KIND_OPTIONS;
  protected readonly list = LIST;
  protected readonly shapes = SHAPES;
}
