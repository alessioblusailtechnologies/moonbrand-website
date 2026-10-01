import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, linkedSignal, output, signal } from '@angular/core';

import type { ChannelId } from '@moonbrand/shared/domain/brand';
import { channelName } from '@moonbrand/shared/domain/catalog';
import {
  cleanHashtags,
  FORMAT_ASPECT,
  HASHTAGS,
  postText,
  TEXT_LIMIT,
  type ChannelVariant,
  type Content,
  type ContentFile,
} from '@moonbrand/shared/domain/content';

import { BrandsService } from '../../core/brands/brands.service';
import { ContentsService } from '../../core/contents/contents.service';
import { errorMessage } from '../../core/errors';
import { Icon } from '../../ui/icon';
import { LightboxService } from '../../ui/lightbox';
import { ToastService } from '../../ui/toast';
import { cssAspect, FOLD } from './labels';

const HASHTAG = /(#[\p{L}\p{N}_]+)/u;

// Il contenuto come si vede sul canale scelto: nella cornice del canale (chi pubblica, testo piegato a «…altro», immagini,
// slide o video nella proporzione del canale, azioni) e accanto il testo intero, da copiare o, se editable, da correggere a mano.
// Nella pagina del contenuto a tutta larghezza; nella chat (compact) dentro una card, più stretto.
@Component({
  selector: 'mb-content-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, NgTemplateOutlet],
  host: { '[class.compact]': 'compact()' },
  templateUrl: './content-preview.html',
  styleUrl: './content-preview.scss',
})
export class ContentPreview {
  private readonly toast = inject(ToastService);
  private readonly lightbox = inject(LightboxService);
  private readonly brands = inject(BrandsService);
  private readonly api = inject(ContentsService);

  readonly content = input.required<Content>();
  readonly compact = input(false);
  // Il testo si corregge a mano solo dove il contenuto si gestisce: nella sua pagina.
  readonly editable = input(false);
  readonly updated = output<Content>();

  // Il canale scelto resta finché il contenuto lo ha ancora; altrimenti il primo.
  protected readonly channel = linkedSignal<ChannelId[], ChannelId | null>({
    source: () => this.content().channels,
    computation: (channels, previous) => (previous?.value && channels.includes(previous.value) ? previous.value : (channels[0] ?? null)),
  });
  protected readonly slide = signal(0);
  // Il testo aperto oltre «…altro».
  protected readonly expanded = signal(false);
  // Punto di partenza di un trascinamento sullo slider; dragged evita che la fine del gesto apra la slide.
  protected dragFrom: number | null = null;
  private dragged = false;

  protected readonly editing = signal(false);
  protected readonly draftText = signal('');
  protected readonly draftTags = signal('');
  protected readonly saving = signal(false);

  protected readonly variant = computed(() => this.content().variants.find((item) => item.channel === this.channel()) ?? null);
  // La proporzione del canale scelto per il formato del contenuto.
  private readonly aspect = computed(() => {
    const channel = this.channel();
    return channel ? FORMAT_ASPECT[this.content().format][channel] : null;
  });

  // Chi pubblica: il brand attivo, con il suo logo o l'iniziale, e un nome utente ricavato dal nome.
  protected readonly author = computed(() => {
    const brand = this.brands.activeBrand();
    const name = brand?.name || 'Il tuo brand';
    const slug = name
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    return {
      name,
      handle: slug || 'brand',
      logo: brand?.logoUri ?? null,
      initial: name.charAt(0).toUpperCase(),
      color: brand?.color ?? 'var(--primary)',
      person: brand?.kind === 'person',
    };
  });

  // Le immagini del canale scelto: le slide nella sua proporzione (o le prime che ci sono, nei contenuti di prima),
  // oppure la copertina nella sua proporzione.
  protected readonly images = computed<ContentFile[]>(() => {
    const files = this.content().visual.files ?? [];
    const aspect = this.aspect();
    const slides = files.filter((file) => file.role === 'slide');
    if (slides.length > 0) {
      const fitting = slides.filter((file) => file.aspect === aspect);
      return fitting.length > 0 ? fitting : slides.filter((file) => file.aspect === slides[0].aspect);
    }
    const covers = files.filter((file) => file.role === 'cover');
    return [covers.find((file) => file.aspect === aspect) ?? covers[0]].filter((file): file is ContentFile => Boolean(file));
  });

  // Il video nella proporzione del canale scelto, con la sua copertina come fermo immagine.
  protected readonly video = computed(() => {
    const files = this.content().visual.files ?? [];
    const videos = files.filter((file) => file.role === 'video');
    const video = videos.find((file) => file.aspect === this.aspect()) ?? videos[0];
    if (!video) return null;
    const poster = files.find((file) => file.role === 'cover' && file.aspect === video.aspect);
    return { file: video, poster: poster?.url ?? null };
  });

  // Il documento PDF del carosello, per LinkedIn.
  protected readonly document = computed(() =>
    this.channel() === 'linkedin' ? ((this.content().visual.files ?? []).find((file) => file.role === 'document') ?? null) : null,
  );

  // Il testo nella cornice, come lo mostra il canale: piegato a «…altro» finché non si apre, con gli hashtag evidenziati.
  protected readonly caption = computed(() => {
    const variant = this.variant();
    const channel = this.channel();
    if (!variant || !channel) return { parts: [], folded: false };
    const full = postText(variant);
    const fold = FOLD[channel];
    const parts = (text: string) => text.split(HASHTAG).map((part, index) => ({ text: part, tag: index % 2 === 1 }));
    if (this.expanded() || fold === null || full.length <= fold + 20) return { parts: parts(full), folded: false };
    // Il taglio cade tra due parole, senza la punteggiatura che le separa.
    const cut = full.slice(0, fold);
    return { parts: parts(cut.slice(0, Math.max(cut.lastIndexOf(' '), fold / 2)).replace(/[\s.,;:!?]+$/, '')), folded: true };
  });

  // I caratteri del testo com'è (o come lo si sta correggendo), contro il limite del canale.
  private readonly counted = computed<Pick<ChannelVariant, 'text' | 'hashtags'> | null>(() => {
    const channel = this.channel();
    if (this.editing() && channel) return { text: this.draftText().trim(), hashtags: cleanHashtags(this.draftTags().split(/[\s,]+/), channel) };
    return this.variant();
  });
  protected readonly count = computed(() => {
    const counted = this.counted();
    return counted ? [...postText(counted)].length : 0;
  });
  protected readonly limit = computed(() => (this.channel() ? TEXT_LIMIT[this.channel()!] : 0));
  protected readonly maxTags = computed(() => (this.channel() ? HASHTAGS[this.channel()!] : 0));
  // Gli hashtag scritti oltre quelli che il canale regge: al salvataggio restano i primi.
  protected readonly extraTags = computed(() => {
    const written = this.draftTags().split(/[\s,]+/).filter(Boolean).length;
    return Math.max(0, written - this.maxTags());
  });

  protected readonly name = channelName;
  protected readonly cssAspect = cssAspect;
  private readonly numbers = new Intl.NumberFormat('it-IT');
  protected readonly digits = (value: number) => this.numbers.format(value);

  constructor() {
    // Cambiando canale o immagini lo slider riparte dalla prima slide e il testo torna piegato.
    effect(() => {
      this.images();
      this.channel();
      this.slide.set(0);
      this.expanded.set(false);
    });
  }

  protected async copy(): Promise<void> {
    const variant = this.variant();
    if (!variant) return;
    try {
      await navigator.clipboard.writeText(postText(variant));
      this.toast.show('Testo copiato.');
    } catch {
      this.toast.show('Non riesco a copiare: seleziona il testo a mano.');
    }
  }

  protected startEdit(): void {
    const variant = this.variant();
    if (!variant) return;
    this.draftText.set(variant.text);
    this.draftTags.set(variant.hashtags.join(' '));
    this.editing.set(true);
  }

  protected async saveEdit(): Promise<void> {
    const channel = this.channel();
    const text = this.draftText().trim();
    if (!channel || !text || this.saving()) return;
    this.saving.set(true);
    try {
      const saved = await this.api.saveVariant(this.content().id, channel, { text, hashtags: this.draftTags().split(/[\s,]+/).filter(Boolean) });
      this.editing.set(false);
      this.updated.emit(saved);
      this.toast.show(`Testo per ${channelName(channel)} salvato.`);
    } catch (error) {
      this.toast.show(errorMessage(error, 'Non sono riuscito a salvare il testo. Riprova.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected move(step: number): void {
    this.slide.update((index) => Math.min(this.images().length - 1, Math.max(0, index + step)));
  }

  protected dragStart(event: PointerEvent): void {
    this.dragFrom = event.clientX;
    this.dragged = false;
  }

  protected dragEnd(event: PointerEvent): void {
    if (this.dragFrom === null) return;
    const distance = event.clientX - this.dragFrom;
    this.dragFrom = null;
    if (Math.abs(distance) < 40) return;
    this.dragged = true;
    this.move(distance < 0 ? 1 : -1);
  }

  protected openSlide(index: number): void {
    if (this.dragged) {
      this.dragged = false;
      return;
    }
    this.open(index);
  }

  protected open(index: number): void {
    const channel = this.channel();
    this.lightbox.open(
      this.images().map((file, i) => ({ url: file.url ?? '', alt: `Immagine ${i + 1}${channel ? ` per ${channelName(channel)}` : ''}` })),
      index,
    );
  }
}
