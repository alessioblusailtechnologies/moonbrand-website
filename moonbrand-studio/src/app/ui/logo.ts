import { ChangeDetectionStrategy, Component, input } from '@angular/core';

// La luna e il nome; compact lascia solo la luna (la sidebar compressa).
// La parte in ombra della luna è blu notte: sulla sidebar, dello stesso blu, resta solo la falce.
@Component({
  selector: 'mb-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="moon"></span>
    @if (!compact()) {
      <span class="word">Moonbrand <span class="studio">Studio</span></span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      font-size: 16px;
      font-weight: 600;
      letter-spacing: -0.01em;
      white-space: nowrap;
    }
    .moon {
      position: relative;
      flex: none;
      width: 26px;
      height: 26px;
      overflow: hidden;
      border-radius: 50%;
      background: var(--accent);
    }
    .moon::after {
      position: absolute;
      top: -3px;
      left: -7px;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: var(--primary);
      content: '';
    }
    .studio {
      font-weight: 500;
      opacity: 0.55;
    }
  `,
})
export class Logo {
  readonly compact = input(false);
}
