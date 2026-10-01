import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';

import { kindLabel } from '@moonbrand/shared/domain/catalog';

import { BrandsService } from '../../core/brands/brands.service';
import { BrandAvatar } from '../../ui/brand-avatar';
import { Icon } from '../../ui/icon';
import { BrandPickerService } from './brand-picker';

// Il brand attivo in cima alla sidebar: apre la finestra per sceglierne un altro, aprire le impostazioni o crearne uno nuovo.
// compact: la sidebar compressa, resta solo il logo del brand.
@Component({
  selector: 'mb-brand-switcher',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BrandAvatar, Icon],
  templateUrl: './brand-switcher.html',
  styleUrl: './brand-switcher.scss',
})
export class BrandSwitcher {
  protected readonly brands = inject(BrandsService);
  protected readonly picker = inject(BrandPickerService);
  readonly compact = input(false);
  protected readonly kindLabel = kindLabel;
}
