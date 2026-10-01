import { randomBytes, randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';

import type pg from 'pg';

import type {
  ChatAttachment,
  ChatIdea,
  ChatJobInput,
  ChatSlot,
  ChatTurnCreated,
  ConversationResponse,
  ConversationSummary,
} from '@moonbrand/shared/api/contract';
import { channelName } from '@moonbrand/shared/domain/catalog';
import { formatWeekdayShort } from '@moonbrand/shared/lib/dates';

import { withIdentity, type Identity } from '../../db/identity';
import type { Queryable } from '../../db/pool';
import { ApiError } from '../../errors';
import { insertJob } from '../ai/repository';
import { ATTACHMENTS_DIR, type BrandFiles } from '../brand-files/files';
import { ensureStyleJob } from '../brands/style';
import { listConversationContents } from '../contents/repository';
import { withUrls } from '../contents/service';
import { findBrandForIdeas, findIdea, updateIdeaStatus } from '../ideas/repository';
import { EXTENSIONS, parseImage } from '../media/routes';
import { normalizeVideo } from '../media/video';
import { findSlot } from '../plan/repository';
import {
  activeJob,
  deleteConversation,
  findConversation,
  insertConversation,
  insertTurn,
  lastSession,
  listConversations,
  listTurns,
} from './repository';

const TITLE_MAX = 80;

// Un messaggio: il testo, le foto già caricate nella cartella del brand, l'idea e l'uscita del piano menzionate.
// Il testo può mancare se ci sono foto, l'idea o l'uscita.
export interface ChatMessage {
  message: string;
  attachments: string[];
  ideaId?: string;
  slotId?: string;
}

interface Mentions {
  idea: ChatIdea | null;
  slot: ChatSlot | null;
}

// Il titolo è l'idea da cui parte la conversazione, o l'uscita, o il primo messaggio, accorciato.
function titleOf({ message }: ChatMessage, { idea, slot }: Mentions): string {
  const fromSlot = slot && `Uscita di ${formatWeekdayShort(slot.date)} alle ${slot.time} su ${slot.channels.map(channelName).join(', ')}`;
  const line = (idea?.title ?? fromSlot ?? message).replace(/\s+/g, ' ').trim();
  if (!line) return 'Foto allegate';
  return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1).trimEnd()}…` : line;
}

// L'idea menzionata, per Claude: tutta, con il nome del tema. Partire da un'idea la tiene, come farne un contenuto.
async function mentionedIdea(db: Queryable, brandId: string, ideaId: string | undefined): Promise<ChatIdea | null> {
  if (!ideaId) return null;
  const idea = await findIdea(db, ideaId);
  if (!idea || idea.brandId !== brandId) throw ApiError.notFound('Idea non trovata in questo brand.');
  const brand = await findBrandForIdeas(db, brandId);
  if (idea.status !== 'saved') await updateIdeaStatus(db, idea.id, 'saved');
  return {
    id: idea.id,
    title: idea.title,
    angleLabel: idea.angleLabel,
    angle: idea.angle,
    rationale: idea.rationale,
    theme: brand?.themes.find((theme) => theme.id === idea.themeId)?.name ?? null,
  };
}

// L'uscita menzionata, e la sua idea se il messaggio non ne menziona un'altra.
async function mentionsOf(db: Queryable, brandId: string, message: ChatMessage): Promise<Mentions> {
  if (!message.slotId) return { idea: await mentionedIdea(db, brandId, message.ideaId), slot: null };
  const found = await findSlot(db, message.slotId);
  if (!found || found.brandId !== brandId) throw ApiError.notFound('Uscita non trovata in questo brand.');
  const brand = await findBrandForIdeas(db, brandId);
  const slot: ChatSlot = {
    id: found.id,
    date: found.date,
    time: found.time,
    channels: found.channels,
    theme: brand?.themes.find((theme) => theme.id === found.themeId)?.name ?? null,
  };
  return { idea: await mentionedIdea(db, brandId, message.ideaId ?? found.ideaId ?? undefined), slot };
}

// Un turno: il job chat riprende la sessione della conversazione, con il brand com'è adesso.
// Il token è la chiave dei tool per l'API: vale solo per questo job e solo mentre gira.
// L'idea e l'uscita menzionate stanno nell'input del job: da lì le legge Claude e le mostra la conversazione.
async function queueTurn(
  db: Queryable,
  identity: Identity,
  conversation: Pick<ConversationSummary, 'id' | 'brandId'>,
  { message, attachments }: ChatMessage,
  { idea, slot }: Mentions,
): Promise<ChatTurnCreated> {
  const brand = await findBrandForIdeas(db, conversation.brandId);
  if (!brand) throw ApiError.notFound('Brand non trovato.');
  await ensureStyleJob(db, identity.accountId, conversation.brandId, brand.context.style);
  const input: ChatJobInput = {
    brandId: conversation.brandId,
    conversationId: conversation.id,
    sessionId: await lastSession(db, conversation.id),
    brand: brand.context,
    message,
    attachments,
    idea,
    slot,
  };
  const jobId = await insertJob(db, identity.accountId, 'chat', input, randomBytes(32).toString('base64url'));
  const turnId = await insertTurn(db, { conversationId: conversation.id, accountId: identity.accountId, message, attachments, jobId });
  return { conversationId: conversation.id, turnId, jobId };
}

export function getConversations(pool: pg.Pool, identity: Identity, brandId: string): Promise<ConversationSummary[]> {
  return withIdentity(pool, identity, (db) => listConversations(db, brandId));
}

export function startConversation(pool: pg.Pool, identity: Identity, brandId: string, message: ChatMessage): Promise<ChatTurnCreated> {
  return withIdentity(pool, identity, async (db) => {
    const mentions = await mentionsOf(db, brandId, message);
    const id = await insertConversation(db, brandId, identity.accountId, titleOf(message, mentions));
    return queueTurn(db, identity, { id, brandId }, message, mentions);
  });
}

export function sendMessage(pool: pg.Pool, identity: Identity, conversationId: string, message: ChatMessage): Promise<ChatTurnCreated> {
  return withIdentity(pool, identity, async (db) => {
    const conversation = await findConversation(db, conversationId);
    if (!conversation) throw ApiError.notFound('Conversazione non trovata.');
    if (conversation.busy) throw ApiError.conflict('BUSY', 'Sto ancora rispondendo al messaggio di prima.');
    return queueTurn(db, identity, conversation, message, await mentionsOf(db, conversation.brandId, message));
  });
}

export function getConversation(pool: pg.Pool, files: BrandFiles, identity: Identity, conversationId: string): Promise<ConversationResponse> {
  return withIdentity(pool, identity, async (db) => {
    const conversation = await findConversation(db, conversationId);
    if (!conversation) throw ApiError.notFound('Conversazione non trovata.');
    const [turns, contents] = await Promise.all([listTurns(db, conversationId), listConversationContents(db, conversationId)]);
    return {
      conversation,
      turns: turns.map((turn) => ({ ...turn, attachments: turn.attachments.map((file) => attachment(files, conversation.brandId, file)) })),
      contents: contents.map((content) => withUrls(content, files)),
    };
  });
}

// Mentre risponde no: i tool del turno in corso salverebbero contenuti in una conversazione che non c'è più.
export function removeConversation(pool: pg.Pool, identity: Identity, conversationId: string): Promise<void> {
  return withIdentity(pool, identity, async (db) => {
    const conversation = await findConversation(db, conversationId);
    if (!conversation) throw ApiError.notFound('Conversazione non trovata.');
    if (conversation.busy) throw ApiError.conflict('BUSY', 'Sto ancora rispondendo: aspetta che finisca per eliminarla.');
    await deleteConversation(db, conversationId);
  });
}

// Accanto a un video allegato c'è la sua copertina, con lo stesso nome in JPEG.
function attachment(files: BrandFiles, brandId: string, file: string): ChatAttachment {
  const url = files.url(brandId, file);
  return file.endsWith('.mp4') ? { file, url, poster: files.url(brandId, file.replace(/\.mp4$/, '.jpg')) } : { file, url };
}

// Una foto per la chat: finisce in allegati/ nella cartella del brand, e il messaggio la cita per percorso.
export async function uploadAttachment(files: BrandFiles, identity: Identity, brandId: string, dataUri: string): Promise<ChatAttachment> {
  const { bytes, mimeType } = parseImage(dataUri);
  await files.claim(brandId, identity.accountId);
  const file = `${ATTACHMENTS_DIR}/${randomUUID()}.${EXTENSIONS[mimeType]}`;
  await files.save(brandId, file, bytes);
  return { file, url: files.url(brandId, file) };
}

// Un video per la chat, com'è uscito dal telefono: arriva a pezzi su disco, poi diventa un MP4 che si guarda
// ovunque e che Remotion sa montare, con la copertina accanto. L'originale non resta.
export const MAX_VIDEO_BYTES = 2 * 1024 ** 3;

export async function uploadVideoAttachment(files: BrandFiles, identity: Identity, brandId: string, stream: Readable): Promise<ChatAttachment> {
  await files.claim(brandId, identity.accountId);
  const id = randomUUID();
  const upload = `${ATTACHMENTS_DIR}/${id}.upload`;
  const file = `${ATTACHMENTS_DIR}/${id}.mp4`;
  const poster = `${ATTACHMENTS_DIR}/${id}.jpg`;
  await files.saveStream(brandId, upload, stream, MAX_VIDEO_BYTES);
  try {
    await normalizeVideo(files.localPath(brandId, upload), files.localPath(brandId, file), files.localPath(brandId, poster));
  } catch {
    await Promise.all([files.remove(brandId, file), files.remove(brandId, poster)]);
    throw ApiError.invalid('Non riesco a leggere questo video: prova con un MP4 o un MOV.');
  } finally {
    await files.remove(brandId, upload);
  }
  return attachment(files, brandId, file);
}

// Ferma il turno in corso: se è ancora in coda si chiude subito, altrimenti lo chiude il worker quando vede la richiesta.
// Il ruolo dell'utente non aggiorna i job: la conversazione si controlla con la sua identità, lo stop va col pool.
export async function stopTurn(pool: pg.Pool, identity: Identity, conversationId: string): Promise<void> {
  const jobId = await withIdentity(pool, identity, async (db) => {
    if (!(await findConversation(db, conversationId))) throw ApiError.notFound('Conversazione non trovata.');
    return activeJob(db, conversationId);
  });
  if (!jobId) return;
  await pool.query(
    `update presenza.ai_jobs set cancel_requested = true,
       status = case when status = 'queued' then 'stopped' else status end,
       finished_at = case when status = 'queued' then now() else finished_at end
     where id = $1 and status in ('queued', 'running')`,
    [jobId],
  );
}
