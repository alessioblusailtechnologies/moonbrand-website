import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import type { ChannelId } from '@moonbrand/shared/domain/brand';

import { CHANNEL_ICONS } from './channel-icons';

@Component({
  selector: 'mb-channel-mark',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: inline-flex; flex: none; align-items: center; justify-content: center' },
  template: `
    <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 24 24" aria-hidden="true">
      <path [attr.d]="icon().path" [attr.fill]="active() ? icon().color : '#CDD1D4'" />
    </svg>
  `,
})
export class ChannelMark {
  readonly channel = input.required<ChannelId>();
  readonly active = input(false);
  readonly size = input(28);
  protected readonly icon = computed(() => CHANNEL_ICONS[this.channel()]);
}
