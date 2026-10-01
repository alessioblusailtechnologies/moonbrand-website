import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, type OnInit, type WritableSignal } from '@angular/core';

import type { AiStep } from '@moonbrand/shared/ai/steps';
import type { VisualBrandContext, VisualExampleFile } from '@moonbrand/shared/api/contract';
import { currentVoiceCard, type BrandDraft, type ChannelId, type MediaFile, type Palette, type Visual } from '@moonbrand/shared/domain/brand';
import { CHANNELS, channelName, exampleChannels, PALETTE_SLOT_LABELS } from '@moonbrand/shared/domain/catalog';

import { AiJobsService } from '../../../core/ai/ai-jobs.service';
import { BrandsService } from '../../../core/brands/brands.service';
import { errorMessage } from '../../../core/errors';
import { Icon } from '../../../ui/icon';
import { PendingMedia, pendingFromSteps } from '../../../ui/pending-media';
import { LogoBackdrop } from '../../../ui/logo-backdrop';
import { LightboxService } from '../../../ui/lightbox';
import { StepList } from '../../../ui/step-list';
import { ToastService } from '../../../ui/toast';
import { DraftStore } from '../draft-store';
import { LOGO_SIDE, resizedDataUri } from '../../../core/images';

const MAX_REFERENCES = 6;

// I lavori sugli esempi che si stanno seguendo, per id: tornando al passo il lavoro si riprende senza seguirlo due volte,
// e il risultato va nella bozza una volta sola.
const running = new Map<string, { steps: WritableSignal<AiStep[]>; result: Promise<VisualExampleFile[]> }>();

function normalizeHex(input: string): string | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(input.trim());
  return match ? `#${match[1].toUpperCase()}` : null;
}

@Component({
  selector: 'mb-visual-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, LogoBackdrop, StepList, PendingMedia],
  templateUrl: './visual-step.html',
  styleUrl: './visual-step.scss',
})
export class VisualStep implements OnInit {
  // Gli esempi in arrivo, dai passaggi del job.
  protected readonly pending = pendingFromSteps;

  private readonly ai = inject(AiJobsService);
  private readonly brands = inject(BrandsService);
  private readonly toast = inject(ToastService);
  private readonly lightbox = inject(LightboxService);
  protected readonly store = inject(DraftStore);
  readonly draft = input.required<BrandDraft>();

  protected readonly slotLabels = PALETTE_SLOT_LABELS;
  protected readonly maxReferences = MAX_REFERENCES;
  protected readonly notes = signal('');
  protected readonly uploading = signal(0);
  protected readonly preparing = signal(false);
  // Gli step del lavoro che si sta seguendo.
  private readonly stepsSource = signal<WritableSignal<AiStep[]>>(signal([]));
  protected readonly steps = computed(() => this.stepsSource()());
  protected readonly hexDrafts = signal<string[]>([]);

  protected readonly visual = computed(() => this.draft().visual);
  protected readonly references = computed(() => this.visual().references ?? []);
  protected readonly sitePalette = computed(() => this.store.insights()?.palette ?? (this.visual().palette.origin === 'site' ? this.visual().palette : null));
  protected readonly custom = computed(() => this.visual().palette.origin !== 'site');
  protected readonly placeholders = computed(() => Array.from({ length: this.uploading() }, (_, i) => i));
  // Un canale dopo l'altro, nell'ordine del catalogo.
  protected readonly examples = computed(() => {
    const examples = this.store.examples() ?? [];
    const unselected = this.store.unselectedExamples();
    return CHANNELS.flatMap(({ id }) =>
      examples
        .filter((example) => example.channel === id)
        .map((example) => ({ ...example, name: channelName(id), selected: !unselected.includes(example.file) })),
    );
  });
  protected readonly selectedCount = computed(() => this.examples().filter((example) => example.selected).length);

  constructor() {
    effect(() => {
      this.hexDrafts.set(this.visual().palette.colors.map((color) => color.toUpperCase()));
    });
  }

  ngOnInit(): void {
    this.notes.set(this.visual().notes ?? '');
    // Un lavoro partito prima (anche prima di un ricaricamento della pagina) si riprende da dove è.
    const pending = this.store.examplesPending();
    if (pending) void this.track(pending.jobId, pending.edit);
  }

  private selectedChannels(): ChannelId[] {
    const selected = CHANNELS.filter(({ id }) => this.draft().channels[id].selected).map(({ id }) => id);
    return selected.length > 0 ? selected : ['instagram'];
  }

  private current(): Visual {
    return this.store.draft()?.visual ?? this.visual();
  }

  protected set(patch: Partial<Visual>): void {
    this.store.patch({ key: 'visual', value: { ...this.current(), ...patch } });
  }

  protected async pickLogo(event: Event): Promise<void> {
    const inputEl = event.target as HTMLInputElement;
    const file = inputEl.files?.[0];
    inputEl.value = '';
    if (!file) return;
    try {
      this.set({ logoUri: await resizedDataUri(file, LOGO_SIDE, 'image/png') });
      this.toast.show('Logo caricato.');
    } catch {
      this.toast.show('Questo file non è un’immagine che riesco a leggere: usa un PNG, un JPEG o un SVG.');
    }
  }

  protected async pickReferences(event: Event): Promise<void> {
    const inputEl = event.target as HTMLInputElement;
    const brandId = this.store.brandId();
    const room = MAX_REFERENCES - this.references().length - this.uploading();
    const files = Array.from(inputEl.files ?? []).slice(0, Math.max(0, room));
    inputEl.value = '';
    if (!brandId) return;
    if (files.length === 0) {
      this.toast.show(`Al massimo ${MAX_REFERENCES} immagini: togline una per aggiungerne altre.`);
      return;
    }
    this.uploading.update((count) => count + files.length);
    for (const file of files) {
      try {
        const uploaded = await this.brands.uploadReference(brandId, await resizedDataUri(file, 1600, 'image/jpeg'));
        this.set({ references: [...(this.current().references ?? []), uploaded] });
      } catch (error) {
        this.toast.show(errorMessage(error, 'Un’immagine è troppo pesante o non si legge: l’ho saltata.'));
      } finally {
        this.uploading.update((count) => Math.max(0, count - 1));
      }
    }
  }

  protected async removeReference(file: MediaFile): Promise<void> {
    try {
      await this.store.removeReference(file);
    } catch (error) {
      this.toast.show(errorMessage(error, 'Non sono riuscito a togliere l’immagine. Riprova.'));
    }
  }

  protected openReference(index: number): void {
    this.lightbox.open(
      this.references().map((file, i) => ({ url: file.url, alt: `Riferimento ${i + 1}` })),
      index,
    );
  }

  protected openExample(index: number): void {
    this.lightbox.open(
      this.examples().map((example) => ({ url: example.url, alt: `Esempio per ${example.name}`, caption: example.caption })),
      index,
    );
  }

  protected chooseSitePalette(): void {
    const palette = this.sitePalette();
    if (palette) this.set({ palette });
  }

  protected chooseCustom(): void {
    const { palette } = this.current();
    this.set({ palette: { id: 'custom', name: 'I miei colori', colors: [...palette.colors], origin: 'custom' } });
  }

  protected editHex(index: number, text: string): void {
    this.hexDrafts.update((drafts) => drafts.map((draft, i) => (i === index ? text : draft)));
    const hex = normalizeHex(text);
    if (!hex) return;
    const colors: Palette['colors'] = [...this.current().palette.colors];
    colors[index] = hex;
    this.set({ palette: { id: 'custom', name: 'I miei colori', colors, origin: 'custom' } });
  }

  // Con gli esempi già pronti le indicazioni li modificano (stessa sessione di Claude), altrimenti ne guidano la generazione.
  protected sendNotes(): void {
    const instruction = this.notes().trim();
    const jobId = this.store.examplesJobId();
    if (!instruction || this.preparing()) return;
    if (jobId && this.examples().length > 0) void this.editExamples(jobId, instruction);
    else void this.createExamples();
  }

  private async editExamples(jobId: string, instruction: string): Promise<void> {
    this.preparing.set(true);
    try {
      const editJobId = await this.ai.queueExamplesEdit({ jobId, instruction });
      this.store.setExamplesPending({ jobId: editJobId, edit: true });
      if (await this.track(editJobId, true)) this.notes.set('');
    } catch (error) {
      this.preparing.set(false);
      this.toast.show(errorMessage(error, 'Non sono riuscito a modificare gli esempi. Riprova.'));
    }
  }

  // Segue il lavoro fino agli esempi e li mette nella bozza; true se sono arrivati.
  private async track(jobId: string, edit: boolean): Promise<boolean> {
    let run = running.get(jobId);
    if (!run) {
      const steps = signal<AiStep[]>([]);
      const result = this.ai
        .followExamples(jobId, (value) => steps.set(value))
        .then((examples) => {
          // Una modifica tiene la selezione (i file hanno gli stessi nomi), una generazione nuova la azzera.
          this.store.setExamples(examples, jobId, edit);
          return examples;
        })
        .finally(() => {
          running.delete(jobId);
          if (this.store.examplesPending()?.jobId === jobId) this.store.setExamplesPending(null);
        });
      run = { steps, result };
      running.set(jobId, run);
    }
    this.stepsSource.set(run.steps);
    this.preparing.set(true);
    try {
      await run.result;
      return true;
    } catch (error) {
      this.toast.show(
        errorMessage(error, edit ? 'Non sono riuscito a modificare gli esempi. Riprova.' : 'Non sono riuscito a preparare gli esempi. Riprova.'),
      );
      return false;
    } finally {
      this.preparing.set(false);
    }
  }

  protected async createExamples(): Promise<void> {
    const brandId = this.store.brandId();
    if (this.preparing() || !brandId) return;
    const notes = this.notes().trim();
    this.set({ notes });
    const draft = this.draft();
    const brand: VisualBrandContext = {
      identity: draft.identity,
      positioning: draft.positioning,
      channels: exampleChannels(this.selectedChannels()),
      themes: draft.themes.map((theme) => theme.name).filter(Boolean),
      voice: currentVoiceCard(draft.voice),
      palette: [...this.current().palette.colors],
      notes,
    };
    this.preparing.set(true);
    try {
      const jobId = await this.ai.queueExamples({ brandId, brand });
      this.store.setExamplesPending({ jobId, edit: false });
      await this.track(jobId, false);
    } catch (error) {
      this.preparing.set(false);
      this.toast.show(errorMessage(error, 'Non sono riuscito a preparare gli esempi. Riprova.'));
    }
  }
}
