import type { OnAiSteps, WebsiteInsights } from '@moonbrand/shared/ai/steps';
import type {
  AiJob,
  AiJobCreated,
  BrandProfile,
  BrandSummary,
  ChatAttachment,
  ChatMessageRequest,
  ChatTurnCreated,
  ContentCreated,
  ContentResponse,
  ContentScriptRequest,
  ContentSummary,
  ConversationResponse,
  ConversationSummary,
  CreateBrandResponse,
  CreateContentRequest,
  IdeasResponse,
  Me,
  PlanProposal,
  PlanProposalRequest,
  PlanResponse,
  Session,
  SignInRequest,
  SignUpRequest,
  SlotCreateRequest,
  SlotPatchRequest,
  SlotView,
  WebsiteReading,
  WelcomeResponse,
} from '@moonbrand/shared/api/contract';
import type { BrandDraft, ChannelId, Palette } from '@moonbrand/shared/domain/brand';
import type { Content } from '@moonbrand/shared/domain/content';
import type { Idea, IdeaStatus } from '@moonbrand/shared/domain/idea';
import { normalizeSite } from '@moonbrand/shared/lib/site';

import { ApiError, api, request } from './api';

// Le chiamate dello studio, una per una: stessi percorsi e stessi corpi.

export const auth = {
  signIn: (body: SignInRequest) => request<Session>('POST', '/v1/auth/sign-in', { body, auth: false }),
  signUp: (body: SignUpRequest) => request<Session>('POST', '/v1/auth/sign-up', { body, auth: false }),
  signOut: () => api.post<void>('/v1/auth/sign-out', null).catch(() => undefined),
  me: () => api.get<Me>('/v1/me'),
};

export const brandsApi = {
  list: () => api.get<BrandSummary[]>('/v1/brands'),
  setActive: (brandId: string) => api.put<void>('/v1/me/active-brand', { brandId }),
  create: (id: string, draft: BrandDraft) => api.post<CreateBrandResponse>('/v1/brands', { ...draft, id, referenceExamples: [] }),
  profile: (brandId: string) => api.get<BrandProfile>(`/v1/brands/${brandId}`),
  update: (brandId: string, draft: BrandDraft) => api.put<BrandSummary>(`/v1/brands/${brandId}`, draft),
};

export const ideasApi = {
  list: (brandId: string) => api.get<IdeasResponse>(`/v1/brands/${brandId}/ideas`),
  generate: (brandId: string) => api.post<AiJobCreated>(`/v1/brands/${brandId}/ideas/generate`),
  setStatus: (ideaId: string, status: IdeaStatus) => api.patch<Idea>(`/v1/ideas/${ideaId}`, { status }),
  createContent: (ideaId: string, body: CreateContentRequest) => api.post<ContentCreated>(`/v1/ideas/${ideaId}/content`, body),
};

export const contentsApi = {
  list: (brandId: string) => api.get<ContentSummary[]>(`/v1/brands/${brandId}/contents`),
  get: (contentId: string) => api.get<ContentResponse>(`/v1/contents/${contentId}`),
  edit: (contentId: string, instruction: string) => api.post<{ jobId: string }>(`/v1/contents/${contentId}/edit`, { instruction }),
  regenerate: (contentId: string) => api.post<{ jobId: string }>(`/v1/contents/${contentId}/regenerate`),
  saveScript: (contentId: string, body: ContentScriptRequest) => api.put<Content>(`/v1/contents/${contentId}/script`, body),
  generateVideo: (contentId: string) => api.post<{ jobId: string }>(`/v1/contents/${contentId}/video`),
  saveVariant: (contentId: string, channel: ChannelId, body: { text: string; hashtags: string[] }) =>
    api.put<Content>(`/v1/contents/${contentId}/variants/${channel}`, body),
  addChannel: (contentId: string, channel: ChannelId) => api.post<ContentResponse>(`/v1/contents/${contentId}/channels`, { channel }),
  removeChannel: (contentId: string, channel: ChannelId) => api.delete<Content>(`/v1/contents/${contentId}/channels/${channel}`),
  setApproved: (contentId: string, approved: boolean) => api.post<Content>(`/v1/contents/${contentId}/${approved ? 'approve' : 'reopen'}`),
  schedule: (contentId: string, date: string, time: string) => api.put<SlotView>(`/v1/contents/${contentId}/schedule`, { date, time }),
  unschedule: (contentId: string) => api.delete<void>(`/v1/contents/${contentId}/schedule`),
};

export const planApi = {
  get: (brandId: string, from: string, to: string) => api.get<PlanResponse>(`/v1/brands/${brandId}/plan`, { from, to }),
  propose: (brandId: string, body: PlanProposalRequest) => api.post<PlanProposal>(`/v1/brands/${brandId}/plan/proposal`, body),
  confirm: (brandId: string, drafts: PlanProposal['drafts']) => api.post<SlotView[]>(`/v1/brands/${brandId}/plan/confirm`, { drafts }),
  addIdea: (brandId: string, ideaId: string) => api.post<SlotView>(`/v1/brands/${brandId}/plan/ideas`, { ideaId }),
  create: (brandId: string, body: SlotCreateRequest) => api.post<SlotView>(`/v1/brands/${brandId}/slots`, body),
  update: (slotId: string, body: SlotPatchRequest) => api.patch<SlotView>(`/v1/slots/${slotId}`, body),
  remove: (slotId: string) => api.delete<void>(`/v1/slots/${slotId}`),
};

export const chatApi = {
  list: (brandId: string) => api.get<ConversationSummary[]>(`/v1/brands/${brandId}/conversations`),
  welcome: (brandId: string) => api.get<WelcomeResponse>(`/v1/brands/${brandId}/welcome`),
  start: (brandId: string, body: ChatMessageRequest) => api.post<ChatTurnCreated>(`/v1/brands/${brandId}/conversations`, body),
  get: (conversationId: string) => api.get<ConversationResponse>(`/v1/conversations/${conversationId}`),
  send: (conversationId: string, body: ChatMessageRequest) => api.post<ChatTurnCreated>(`/v1/conversations/${conversationId}/messages`, body),
  stop: (conversationId: string) => api.post<void>(`/v1/conversations/${conversationId}/stop`),
  remove: (conversationId: string) => api.delete<void>(`/v1/conversations/${conversationId}`),
  upload: (brandId: string, dataUri: string) => api.post<ChatAttachment>(`/v1/brands/${brandId}/attachments`, { dataUri }),
};

// Un lavoro fermato da chi l'aveva chiesto.
export class StoppedJobError extends Error {}

const POLL_MS = 1000;
const MAX_WAIT_MS = 10_000;
const MAX_FAILURES = 30;
const transient = (error: unknown) => error instanceof ApiError && (error.status === 0 || error.status >= 502);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Segue un lavoro fino al risultato, passando gli step man mano. cancelled: chi lo segue non c'è più (schermata chiusa).
export async function followJob<Result>(
  jobId: string,
  onSteps?: OnAiSteps,
  { pollMs = POLL_MS, cancelled }: { pollMs?: number; cancelled?: () => boolean } = {},
): Promise<Result> {
  let failures = 0;
  for (;;) {
    if (cancelled?.()) throw new StoppedJobError('Non più seguito.');
    let job: AiJob<Result>;
    try {
      job = await api.get<AiJob<Result>>(`/v1/ai/jobs/${jobId}`);
      failures = 0;
    } catch (error) {
      if (!transient(error) || ++failures > MAX_FAILURES) throw error;
      await wait(Math.min(pollMs * 2 ** failures, MAX_WAIT_MS));
      continue;
    }
    if (cancelled?.()) throw new StoppedJobError('Non più seguito.');
    onSteps?.(job.steps);
    if (job.status === 'done' && job.result) return job.result;
    if (job.status === 'stopped') throw new StoppedJobError('Fermato.');
    if (job.status === 'failed' || job.status === 'done') throw new Error(job.error ?? 'Lavoro AI senza risultato.');
    await wait(pollMs);
  }
}

// La lettura del sito dell'onboarding: nome, settore, frase, temi, pubblico e palette.
export async function readWebsite(site: string, onSteps?: OnAiSteps, cancelled?: () => boolean): Promise<WebsiteInsights> {
  const host = normalizeSite(site);
  const { id } = await api.post<AiJobCreated>('/v1/ai/website', { site });
  const reading = await followJob<WebsiteReading>(id, onSteps, { cancelled });
  return {
    site: host,
    name: reading.name,
    sector: reading.sector,
    summary: reading.summary,
    pitch: reading.pitch,
    themes: reading.themes,
    goals: reading.goals,
    audiences: reading.audiences,
    palette: { id: `site-${host}`, name: 'Dal sito', colors: reading.colors as Palette['colors'], origin: 'site' },
    // Un logo SVG lo studio lo rifà in PNG con il canvas; qui non si riesce, e un brand senza logo è meglio di uno che non si vede.
    logoUri: reading.logo && !reading.logo.startsWith('data:image/svg') ? reading.logo : null,
  };
}
