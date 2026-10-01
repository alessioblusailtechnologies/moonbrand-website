import { Directive, effect, input, signal } from '@angular/core';

import { isLightLogo } from '../core/images';

// Sull'elemento che mostra un logo: se il logo è chiaro su trasparente, gli dà un fondo scuro perché si veda sul bianco.
@Directive({
  selector: '[mbLogoBackdrop]',
  host: { '[style.background]': 'light() ? "var(--primary)" : null' },
})
export class LogoBackdrop {
  readonly mbLogoBackdrop = input<string | null>(null);
  protected readonly light = signal(false);

  constructor() {
    effect((onCleanup) => {
      const src = this.mbLogoBackdrop();
      let current = true;
      onCleanup(() => (current = false));
      this.light.set(false);
      if (!src) return;
      isLightLogo(src)
        .then((light) => current && this.light.set(light))
        .catch(() => undefined);
    });
  }
}
