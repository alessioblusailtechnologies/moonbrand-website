import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { Confirm } from './ui/confirm';
import { Lightbox } from './ui/lightbox';
import { Toasts } from './ui/toast';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, Confirm, Lightbox, Toasts],
  template: `
    <router-outlet />
    <mb-lightbox />
    <mb-confirm />
    <mb-toasts />
  `,
})
export class App {}
