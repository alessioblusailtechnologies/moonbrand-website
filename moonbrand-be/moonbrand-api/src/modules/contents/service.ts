import type pg from 'pg';

import type {
  ContentCreated,
  ContentEditJobInput,
  ContentIdea,
  ContentJobInput,
  ContentResponse,
  ContentScriptRequest,
  ContentSummary,
  ContentVariantRequest,
  ContentVideoJobInput,
  CreateContentRequest,
} from '@moonbrand/shared/api/contract';
import type { ChannelId } from '@moonbrand/shared/domain/brand';
import { CHANNELS, channelName } from '@moonbrand/shared/domain/catalog';
import {
  cleanHashtags,
  FORMAT_ASPECT,
  formatAspects,
  hasDocument,
  hasScript,
  hasVideo,
  supportsFormat,
  type Content,
  type ContentFormat,
  type ContentStatus,
} from '@moonbrand/shared/domain/content';

import { withIdentity, type Identity } from '../../db/identity';
import type { Queryable } from '../../db/pool';
import { ApiError } from '../../errors';
import { insertJob } from '../ai/repository';
import type { BrandFiles } from '../brand-files/files';
import { ensureStyleJob } from '../brands/style';
import { findBrandForIdeas, findIdea, updateIdeaStatus } from '../ideas/repository';
import {
  activeContentJobs,
  bumpRevision,
  findContent,
  insertContent,
  lastContentSession,
  listContents,
  setContentChannels,
  setContentScript,
  setContentStatus,
  setContentVariants,
} from './repository';
import { listSlots, findSlot } from '../plan/repository';
import { slotViews, syncContentSlot } from '../plan/service';

const FORMAT_NAME: Record<ContentFormat, string> = { post: 'il post', carousel: 'il carosello', article: 'l’articolo', video: 'il video' };

// I canali nell'ordine del catalogo, come li mostra lo studio.
const inCatalogOrder = (channels: readonly ChannelId[]) => CHANNELS.map(({ id }) => id).filter((id) => channels.includes(id));

function requireSupported(format: ContentFormat, channels: readonly ChannelId[]): void {
  const unsupported = channels.filter((channel) => !supportsFormat(format, channel));
  if (unsupported.length > 0) {
    throw ApiError.invalid(`Su ${unsupported.map(channelName).join(' e ')} ${FORMAT_NAME[format]} non c’è: scegli un altro canale o un altro formato.`);
  }
}

// Il job del contenuto: il brand come lo vede l'AI e l'idea di partenza.
async function contentJobInput(db: Queryable, content: Pick<Content, 'id' | 'brandId' | 'ideaId' | 'title' | 'channels' | 'format'>) {
  const brand = await findBrandForIdeas(db, content.brandId);
  if (!brand) throw ApiError.notFound('Brand non trovato.');
  const idea = content.ideaId ? await findIdea(db, content.ideaId) : null;
  const theme = brand.themes.find((item) => item.id === idea?.themeId)?.name ?? null;
  const source: ContentIdea = idea
    ? { title: idea.title, angleLabel: idea.angleLabel, angle: idea.angle, rationale: idea.rationale, theme }
    : { title: content.title, angleLabel: '', angle: '', rationale: '', theme };
  const input: ContentJobInput = {
    brandId: content.brandId,
    contentId: content.id,
    format: content.format,
    channels: content.channels,
    brand: brand.context,
    idea: source,
  };
  return input;
}

// Crea la bozza e mette in coda il job che la scrive. Farne un contenuto salva l'idea.
export function createContent(pool: pg.Pool, identity: Identity, ideaId: string, request: CreateContentRequest): Promise<ContentCreated> {
  return withIdentity(pool, identity, async (db) => {
    const idea = await findIdea(db, ideaId);
    if (!idea) throw ApiError.notFound('Idea non trovata.');
    const brand = await findBrandForIdeas(db, idea.brandId);
    if (!brand) throw ApiError.notFound('Brand non trovato.');
    const channels = [...new Set(request.channels)];
    if (channels.some((channel) => !brand.context.channels.includes(channel))) {
      throw ApiError.invalid('Scegli tra i canali del brand.');
    }
    requireSupported(request.format, channels);
    await ensureStyleJob(db, identity.accountId, idea.brandId, brand.context.style);
    if (idea.status !== 'saved') await updateIdeaStatus(db, idea.id, 'saved');
    const id = await insertContent(db, {
      brandId: idea.brandId,
      accountId: identity.accountId,
      ideaId: idea.id,
      title: idea.title,
      themeId: idea.themeId,
      channels,
      format: request.format,
    });
    const input = await contentJobInput(db, { id, brandId: idea.brandId, ideaId: idea.id, title: idea.title, channels, format: request.format });
    const jobId = await insertJob(db, identity.accountId, 'content', input);
    return { id, jobId };
  });
}

// I link alle immagini cambiano a ogni aggiornamento: il browser non mostra quelle vecchie dalla cache.
export function withUrls(content: Content, files: BrandFiles): Content {
  const version = new Date(content.updatedAt).getTime();
  return {
    ...content,
    visual: {
      ...content.visual,
      files: (content.visual.files ?? []).map((file) => ({ ...file, url: `${files.url(content.brandId, file.file)}&v=${version}` })),
    },
  };
}

// Per le card: la prima copertina o la prima slide, se un job ci sta lavorando e quando esce, se è nel piano.
export function summarize(
  content: Content,
  files: BrandFiles,
  preparing: boolean,
  scheduledFor: ContentSummary['scheduledFor'] = null,
): ContentSummary {
  const cover = withUrls(content, files).visual.files?.find((file) => file.index === 0 && (file.role === 'cover' || file.role === 'slide'));
  return {
    id: content.id,
    title: content.title,
    format: content.format,
    channels: content.channels,
    status: content.status,
    coverUrl: cover?.url ?? null,
    coverAspect: cover?.aspect ?? null,
    updatedAt: content.updatedAt,
    preparing,
    scheduledFor,
  };
}

export function listBrandContents(pool: pg.Pool, files: BrandFiles, identity: Identity, brandId: string): Promise<ContentSummary[]> {
  return withIdentity(pool, identity, async (db) => {
    const [contents, jobs, slots] = await Promise.all([listContents(db, brandId), activeContentJobs(db, brandId), listSlots(db, brandId)]);
    const when = new Map(slots.map((slot) => [slot.id, { date: slot.date, time: slot.time }]));
    return contents.map((content) => summarize(content, files, jobs.has(content.id), (content.slotId && when.get(content.slotId)) || null));
  });
}

export function getContent(pool: pg.Pool, files: BrandFiles, identity: Identity, contentId: string): Promise<ContentResponse> {
  return withIdentity(pool, identity, async (db) => {
    const content = await findContent(db, contentId);
    if (!content) throw ApiError.notFound('Contenuto non trovato.');
    const [jobs, brand, slot] = await Promise.all([
      activeContentJobs(db, content.brandId),
      findBrandForIdeas(db, content.brandId),
      content.slotId ? findSlot(db, content.slotId) : null,
    ]);
    return {
      content: withUrls(content, files),
      jobId: jobs.get(content.id) ?? null,
      brandChannels: brand?.context.channels ?? [],
      slot: slot ? (await slotViews(db, files, content.brandId, [slot]))[0] : null,
    };
  });
}

// Un contenuto nato in chat si ritocca nella sua conversazione, dove Claude sa come l'ha fatto.
function requireOutsideChat(content: Content): void {
  if (content.conversationId) throw ApiError.conflict('IN_CHAT', 'Questo contenuto è nato in chat: ritoccalo nella sua conversazione.');
}

async function requireIdle(db: Queryable, content: Content): Promise<void> {
  if ((await activeContentJobs(db, content.brandId)).has(content.id)) {
    throw ApiError.conflict('BUSY', 'Sto già lavorando su questo contenuto: aspetta che finisca.');
  }
}

// Un ritocco riprende la sessione dell'ultima scrittura: Claude sa come ha fatto testi e immagini.
export function editContent(pool: pg.Pool, identity: Identity, contentId: string, instruction: string): Promise<{ jobId: string }> {
  return withIdentity(pool, identity, async (db) => {
    const content = await findContent(db, contentId);
    if (!content) throw ApiError.notFound('Contenuto non trovato.');
    requireOutsideChat(content);
    await requireIdle(db, content);
    const sessionId = await lastContentSession(db, contentId);
    if (!sessionId) throw ApiError.conflict('NOT_EDITABLE', 'Questo contenuto non è ancora pronto da ritoccare.');
    const input: ContentEditJobInput = {
      brandId: content.brandId,
      contentId,
      sessionId,
      format: content.format,
      channels: content.channels,
      instruction,
      scriptOnly: content.format === 'video' && !hasVideo(content),
    };
    return { jobId: await insertJob(db, identity.accountId, 'content-edit', input) };
  });
}

// Da zero: una sessione nuova, e il contenuto torna bozza.
export function regenerateContent(pool: pg.Pool, identity: Identity, contentId: string): Promise<{ jobId: string }> {
  return withIdentity(pool, identity, async (db) => {
    const content = await findContent(db, contentId);
    if (!content) throw ApiError.notFound('Contenuto non trovato.');
    requireOutsideChat(content);
    await requireIdle(db, content);
    const input = await contentJobInput(db, content);
    await bumpRevision(db, contentId);
    await syncContentSlot(db, { slotId: content.slotId, status: 'draft' });
    return { jobId: await insertJob(db, identity.accountId, 'content', input) };
  });
}

// Il copione corretto dall'utente: vale per il prossimo "Genera il video", e il contenuto torna bozza.
export function saveContentScript(
  pool: pg.Pool,
  files: BrandFiles,
  identity: Identity,
  contentId: string,
  request: ContentScriptRequest,
): Promise<Content> {
  return withIdentity(pool, identity, async (db) => {
    const content = await findContent(db, contentId);
    if (!content) throw ApiError.notFound('Contenuto non trovato.');
    if (!hasScript(content)) throw ApiError.conflict('NO_SCRIPT', 'Questo contenuto non ha un copione.');
    requireOutsideChat(content);
    await requireIdle(db, content);
    const saved = await setContentScript(db, contentId, request.script.trim(), request.scenes);
    if (!saved) throw ApiError.notFound('Contenuto non trovato.');
    await syncContentSlot(db, saved);
    return withUrls(saved, files);
  });
}

// Il video dal copione com'è adesso sul DB, nella sessione che l'ha scritto: Claude sa perché ha scelto ogni inquadratura.
export function generateContentVideo(pool: pg.Pool, identity: Identity, contentId: string): Promise<{ jobId: string }> {
  return withIdentity(pool, identity, async (db) => {
    const content = await findContent(db, contentId);
    if (!content) throw ApiError.notFound('Contenuto non trovato.');
    if (!hasScript(content)) throw ApiError.conflict('NO_SCRIPT', 'Prima serve il copione del video.');
    requireOutsideChat(content);
    await requireIdle(db, content);
    const sessionId = await lastContentSession(db, contentId);
    if (!sessionId) throw ApiError.conflict('NOT_EDITABLE', 'Il copione non è ancora pronto.');
    const input: ContentVideoJobInput = {
      brandId: content.brandId,
      contentId,
      sessionId,
      format: 'video',
      channels: content.channels,
      script: content.visual.script,
      scenes: content.visual.scenes,
    };
    return { jobId: await insertJob(db, identity.accountId, 'content-video', input) };
  });
}

export function changeContentStatus(
  pool: pg.Pool,
  files: BrandFiles,
  identity: Identity,
  contentId: string,
  status: ContentStatus,
): Promise<Content> {
  return withIdentity(pool, identity, async (db) => {
    const content = await setContentStatus(db, contentId, status);
    if (!content) throw ApiError.notFound('Contenuto non trovato.');
    await syncContentSlot(db, content);
    return withUrls(content, files);
  });
}

// Il testo di un canale corretto a mano. Vale anche per un contenuto nato in chat: Claude rilegge il contenuto prima di ritoccarlo.
export function saveContentVariant(
  pool: pg.Pool,
  files: BrandFiles,
  identity: Identity,
  contentId: string,
  channel: ChannelId,
  request: ContentVariantRequest,
): Promise<Content> {
  return withIdentity(pool, identity, async (db) => {
    const content = await findContent(db, contentId);
    if (!content) throw ApiError.notFound('Contenuto non trovato.');
    await requireIdle(db, content);
    if (!content.variants.some((variant) => variant.channel === channel)) {
      throw ApiError.notFound(`Questo contenuto non ha un testo per ${channelName(channel)}.`);
    }
    const variants = content.variants.map((variant) =>
      variant.channel === channel ? { channel, text: request.text.trim(), hashtags: cleanHashtags(request.hashtags, channel) } : variant,
    );
    const saved = await setContentVariants(db, contentId, variants);
    if (!saved) throw ApiError.notFound('Contenuto non trovato.');
    await syncContentSlot(db, saved);
    return withUrls(saved, files);
  });
}

// Un canale tolto: via il suo testo e i file che servivano solo a lui (le immagini nella sua proporzione, il documento di LinkedIn).
export function removeContentChannel(pool: pg.Pool, files: BrandFiles, identity: Identity, contentId: string, channel: ChannelId): Promise<Content> {
  return withIdentity(pool, identity, async (db) => {
    const content = await findContent(db, contentId);
    if (!content) throw ApiError.notFound('Contenuto non trovato.');
    await requireIdle(db, content);
    if (!content.channels.includes(channel)) throw ApiError.notFound(`Questo contenuto non esce su ${channelName(channel)}.`);
    if (content.channels.length === 1) throw ApiError.invalid('Un contenuto esce almeno su un canale.');
    const channels = content.channels.filter((item) => item !== channel);
    const needed = formatAspects(content.format, channels);
    const onlyHis = FORMAT_ASPECT[content.format][channel];
    const kept = (content.visual.files ?? []).filter((file) =>
      file.role === 'document' ? hasDocument(content.format, channels) : file.aspect !== onlyHis || needed.includes(file.aspect),
    );
    const variants = content.variants.filter((variant) => variant.channel !== channel);
    const saved = await setContentChannels(db, contentId, channels, variants, kept);
    if (!saved) throw ApiError.notFound('Contenuto non trovato.');
    const keptFiles = new Set(kept.map((file) => file.file));
    for (const file of content.visual.files ?? []) {
      if (!keptFiles.has(file.file)) await files.remove(content.brandId, file.file).catch(() => undefined);
    }
    return withUrls(saved, files);
  });
}

// Un canale in più. Al copione di un video si aggiunge e basta: testi e proporzioni arrivano con il video.
// Altrimenti un ritocco nella sessione che ha fatto il contenuto scrive il testo del canale e le immagini nella sua proporzione.
export function addContentChannel(
  pool: pg.Pool,
  files: BrandFiles,
  identity: Identity,
  contentId: string,
  channel: ChannelId,
): Promise<ContentResponse> {
  return withIdentity(pool, identity, async (db) => {
    const content = await findContent(db, contentId);
    if (!content) throw ApiError.notFound('Contenuto non trovato.');
    await requireIdle(db, content);
    const brand = await findBrandForIdeas(db, content.brandId);
    if (!brand) throw ApiError.notFound('Brand non trovato.');
    const brandChannels = brand.context.channels;
    if (!brandChannels.includes(channel)) throw ApiError.invalid('Scegli tra i canali del brand.');
    if (content.channels.includes(channel)) throw ApiError.conflict('ALREADY_THERE', `Il contenuto esce già su ${channelName(channel)}.`);
    requireSupported(content.format, [channel]);
    const channels = inCatalogOrder([...content.channels, channel]);

    if (content.format === 'video' && hasScript(content) && !hasVideo(content)) {
      const saved = await setContentChannels(db, contentId, channels, content.variants, content.visual.files);
      if (!saved) throw ApiError.notFound('Contenuto non trovato.');
      return { content: withUrls(saved, files), jobId: null, brandChannels, slot: null };
    }

    if (content.conversationId) {
      throw ApiError.conflict('IN_CHAT', `Questo contenuto è nato in chat: chiedi nella sua conversazione di aggiungere ${channelName(channel)}.`);
    }
    const sessionId = await lastContentSession(db, contentId);
    if (content.variants.length === 0 || !sessionId) throw ApiError.conflict('NOT_EDITABLE', 'Questo contenuto non è ancora pronto.');
    const aspect = FORMAT_ASPECT[content.format][channel] ?? '';
    const outputs = content.format === 'video' ? 'il video e la sua copertina' : 'le immagini';
    const input: ContentEditJobInput = {
      brandId: content.brandId,
      contentId,
      sessionId,
      format: content.format,
      channels,
      instruction:
        `Aggiungi il canale ${channelName(channel)}: scrivi il suo testo seguendo la skill moonbrand:contenuti` +
        (formatAspects(content.format, content.channels).includes(aspect)
          ? `; ${outputs} in ${aspect} ci sono già.`
          : ` e adatta anche al ${aspect} ${outputs}, con lo stesso visivo.`) +
        ' Non cambiare testi e file degli altri canali.',
      scriptOnly: false,
    };
    const jobId = await insertJob(db, identity.accountId, 'content-edit', input);
    return { content: withUrls(content, files), jobId, brandChannels, slot: null };
  });
}
