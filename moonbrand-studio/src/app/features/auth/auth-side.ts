import { ChangeDetectionStrategy, Component } from '@angular/core';

import { Logo } from '../../ui/logo';

const SHAPES = [
  { color: 'var(--accent)', radius: '50%' },
  { color: 'var(--accent-soft)', radius: '0 100% 0 0' },
  { color: 'var(--primary-soft)', radius: '24px' },
  { color: 'var(--mint-400)', radius: '100% 0 100% 0' },
  { color: 'var(--accent-soft)', radius: '50%' },
  { color: 'var(--accent)', radius: '0 0 100% 0' },
  { color: 'var(--grey-100)', radius: '0 100% 0 100%' },
  { color: 'var(--primary)', radius: '50% 50% 0 0' },
  { color: 'var(--accent-soft)', radius: '50%' },
];

@Component({
  selector: 'mb-auth-side',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Logo],
  template: `
    <mb-logo />
    <div class="claim-block">
      <p class="claim">La tua presenza sui social, scritta come la scriveresti tu.</p>
      <p class="note">Brand, idee, piano e contenuti in un solo studio.</p>
    </div>
    <div class="shapes" aria-hidden="true">
      @for (shape of shapes; track $index) {
        <span [style.background]="shape.color" [style.border-radius]="shape.radius"></span>
      }
    </div>
  `,
  styles: `
    :host {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 48px;
      padding: 40px;
      overflow: hidden;
      background: var(--ink);
      color: var(--white);
    }
    .claim-block {
      position: relative;
      z-index: 1;
      max-width: 440px;
      margin-top: 12vh;
    }
    .claim {
      font-size: 36px;
      font-weight: 700;
      line-height: 1.12;
      letter-spacing: -0.02em;
    }
    .note {
      margin-top: 16px;
      color: rgba(255, 255, 255, 0.72);
      font-size: 15px;
    }
    .shapes {
      position: absolute;
      right: -48px;
      bottom: -48px;
      display: grid;
      grid-template-columns: repeat(3, 128px);
      gap: 12px;
    }
    .shapes span {
      width: 128px;
      height: 128px;
      animation: fade-up 480ms var(--ease) both;
    }
  `,
})
export class AuthSide {
  protected readonly shapes = SHAPES;
}
