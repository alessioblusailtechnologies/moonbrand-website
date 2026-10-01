import type { AiStep } from '../ai/steps';
import type { BrandDraft, BrandKind, ChannelId, Identity, MediaFile, Positioning, VoiceCard } from '../domain/brand';
import type { CarouselSlide, ChannelVariant, Content, ContentFile, ContentFormat, ContentStatus, VideoScene } from '../domain/content';
import type { Idea, IdeaSignalKind, IdeaStatus } from '../domain/idea';
import type { PlanRequest, PlanSlot, SlotDraft, SlotStatus } from '../domain/plan';
import type { Greeting, Occasion, WelcomeSuggestion } from '../domain/welcome';

export interface Account {
  id: string;
  email: string;
  name: string;
}

export interface SignUpRequest {
  name: string;
  email: string;
  password: string;
}

export interface SignInRequest {
  email: string;
  password: string;
}

export interface Session {
  accessToken: string;
  expiresIn: number;
  account: Account;
}

export interface Me {
  account: Account;
  activeBrandId: string | null;
}

export interface BrandSummary {
  id: string;
  kind: BrandKind;
  name: string;
  logoUri: string | null;
  color: string;
}

// referenceExamples: gli esempi scelti nell'onboarding, che diventano i riferimenti da seguire del brand.
export type CreateBrandRequest = BrandDraft & { id: string; referenceExamples?: string[] };

// Il brand nuovo e i lavori che lo preparano (lo stile dai riferimenti, le prime idee): l'onboarding li segue fino alla fine.
export type CreateBrandResponse = BrandSummary & { setupJobs: string[] };

// Il profilo di un brand com'è salvato, con i link ai file già firmati.
export interface BrandProfile {
  id: string;
  draft: BrandDraft;
}

// referenceExamples: gli esempi rifatti dal Profilo, che prendono il posto dei riferimenti da seguire.
export type UpdateBrandRequest = BrandDraft & { referenceExamples?: string[] };

export interface ActiveBrandRequest {
  brandId: string;
}

export interface ReferenceUploadRequest {
  dataUri: string;
}

export type ReferenceUploadResponse = MediaFile;

// stopped: fermato da chi l'aveva chiesto (per ora solo i turni della chat).
export type AiJobStatus = 'queued' | 'running' | 'done' | 'failed' | 'stopped';

export interface AiJob<Result = unknown> {
  id: string;
  kind: string;
  status: AiJobStatus;
  steps: AiStep[];
  result: Result | null;
  error: string | null;
}

export interface AiJobCreated {
  id: string;
}

export interface WebsiteJobRequest {
  site: string;
}

export interface WebsiteReading {
  site: string;
  name: string;
  sector: string;
  summary: string;
  pitch: string;
  themes: string[];
  goals: string[];
  audiences: string[];
  colors: string[];
  // Il logo del sito come data URI, pronto per il brand; null se non c'è o non si è riusciti a scaricarlo.
  logo: string | null;
}

export interface VisualBrandContext {
  identity: Identity;
  positioning: Positioning;
  channels: ChannelId[];
  themes: string[];
  voice: VoiceCard | null;
  palette: string[];
  notes: string;
}

export interface VisualJobRequest {
  brandId: string;
  brand: VisualBrandContext;
}

export interface VisualEditJobRequest {
  jobId: string;
  instruction: string;
}

// Quello che l'API mette in coda: la sessione, la cartella degli esempi e i canali vengono dal job da modificare.
export interface VisualEditJobInput {
  brandId: string;
  dir: string;
  sessionId: string;
  channels: ChannelId[];
  instruction: string;
  fromJobId: string;
}

export interface VisualExampleFile {
  channel: ChannelId;
  file: string;
  url: string;
  caption: string;
}

export interface VisualReading {
  examples: VisualExampleFile[];
}

export interface BrandContext {
  identity: Identity;
  positioning: Positioning;
  channels: ChannelId[];
  themes: { id: string; name: string; weight: number }[];
  voice: VoiceCard | null;
  // Lo stile letto dai riferimenti dal job style: null se non è ancora stato letto, vuoto se non ci sono riferimenti.
  style: string | null;
  // Le impaginazioni degli ultimi contenuti, per farne una diversa.
  layouts: { title: string; format: ContentFormat; layout: string }[];
  // Le uscite delle prossime due settimane, con quello che hanno: l'assistente sa cosa esce e quando.
  plan: { id: string; date: string; time: string; channels: ChannelId[]; status: SlotStatus; theme: string | null; title: string | null }[];
}

// Il job style legge i riferimenti dalla cartella del brand: gli basta sapere quale.
export interface StyleJobInput {
  brandId: string;
}

// I gusti su tutta la storia del brand: ogni idea tenuta vale +1 per il suo tema e il suo segnale, ogni scartata -0,5.
export interface IdeaPreferences {
  decided: number;
  saved: number;
  themes: { themeId: string; score: number }[];
  signals: { kind: IdeaSignalKind; score: number }[];
}

// Quello che l'API mette in coda: il brand dal DB, le idee più recenti (per non ripetersi) e i gusti.
export interface IdeasJobInput {
  brandId: string;
  count: number;
  brand: BrandContext;
  recent: { title: string; status: IdeaStatus; themeId: string | null; signal: IdeaSignalKind }[];
  preferences: IdeaPreferences;
}

export interface IdeasResponse {
  ideas: Idea[];
  themes: { id: string; name: string; color: string }[];
  // I canali del brand: tra questi si sceglie dove far uscire un contenuto.
  channels: ChannelId[];
  // Il lavoro che sta preparando nuove idee, se c'è.
  jobId: string | null;
}

export interface IdeaStatusRequest {
  status: IdeaStatus;
}

export interface CreateContentRequest {
  format: ContentFormat;
  channels: ChannelId[];
}

export interface ContentCreated {
  id: string;
  jobId: string;
}

export interface ContentSummary {
  id: string;
  title: string;
  format: ContentFormat;
  channels: ChannelId[];
  status: ContentStatus;
  coverUrl: string | null;
  // La proporzione della copertina, es. 9:16: la griglia sa quanto è alta la card prima che l'immagine arrivi.
  coverAspect: string | null;
  updatedAt: string;
  preparing: boolean;
  // Quando esce, se è nel piano.
  scheduledFor: { date: string; time: string } | null;
}

export interface ContentResponse {
  content: Content;
  // La sua uscita nel piano, se c'è.
  slot: SlotView | null;
  // Il lavoro che sta preparando o ritoccando il contenuto, se c'è.
  jobId: string | null;
  // I canali del brand: tra questi si aggiungono canali al contenuto.
  brandChannels: ChannelId[];
}

export interface ContentEditRequest {
  instruction: string;
}

// Programmare un contenuto: crea la sua uscita o sposta quella che ha.
export interface ContentScheduleRequest {
  date: string;
  time: string;
}

// Il testo di un canale corretto a mano.
export interface ContentVariantRequest {
  text: string;
  hashtags: string[];
}

// Un canale in più: testo e immagini li prepara un job, tranne nel copione di un video, dove si aggiunge e basta.
export interface ContentChannelRequest {
  channel: ChannelId;
}

// Il copione di un video, come lo corregge l'utente prima di generare il video.
export interface ContentScriptRequest {
  script: string;
  scenes: VideoScene[];
}

// L'idea da cui nasce il contenuto, con il nome del tema invece dell'id.
export interface ContentIdea {
  title: string;
  angleLabel: string;
  angle: string;
  rationale: string;
  theme: string | null;
}

// Per un video il job content scrive solo il copione; il video lo fa content-video quando il copione è approvato.
export interface ContentJobInput {
  brandId: string;
  contentId: string;
  format: ContentFormat;
  channels: ChannelId[];
  brand: BrandContext;
  idea: ContentIdea;
}

// scriptOnly: un video di cui c'è solo il copione, quindi si ritocca il copione.
export interface ContentEditJobInput {
  brandId: string;
  contentId: string;
  sessionId: string;
  format: ContentFormat;
  channels: ChannelId[];
  instruction: string;
  scriptOnly: boolean;
}

// Il video dal copione approvato, com'è sul DB dopo le correzioni dell'utente.
export interface ContentVideoJobInput {
  brandId: string;
  contentId: string;
  sessionId: string;
  format: 'video';
  channels: ChannelId[];
  script: string;
  scenes: VideoScene[];
}

// La chat: tante conversazioni per brand, ognuna una sessione di Claude nella cartella del brand.
// Ogni messaggio è un turno, cioè un job chat che riprende la sessione del turno prima.

export interface ConversationSummary {
  id: string;
  brandId: string;
  title: string;
  updatedAt: string;
  // Un turno in coda o in corso.
  busy: boolean;
}

// La risposta finale di Claude al turno; il resto (testi intermedi e tool) sta negli step del job.
export interface ChatReply {
  text: string;
}

// Una foto o un video allegato a un messaggio: il percorso nella cartella del brand e il link firmato.
// Un video è sempre un MP4, con il link alla sua copertina.
export interface ChatAttachment {
  file: string;
  url: string;
  poster?: string;
}

export interface ChatAttachmentUpload {
  dataUri: string;
}

export interface ConversationTurn {
  id: string;
  message: string;
  attachments: ChatAttachment[];
  // L'idea e l'uscita del piano menzionate nel messaggio, se ci sono.
  idea: { id: string; title: string } | null;
  slot: Pick<ChatSlot, 'id' | 'date' | 'time' | 'channels'> | null;
  createdAt: string;
  job: AiJob<ChatReply>;
}

export interface ConversationResponse {
  conversation: ConversationSummary;
  turns: ConversationTurn[];
  // I contenuti nati in questa conversazione, completi: la chat li mostra interi, con i link alle immagini.
  contents: Content[];
}

// La dettatura: il testo di quello che si è detto al microfono, da rileggere nella casella.
export interface TranscriptionResponse {
  text: string;
}

// attachments: i percorsi delle foto già caricate con /attachments; ideaId e slotId: l'idea o l'uscita del piano menzionate.
export interface ChatMessageRequest {
  message: string;
  attachments?: string[];
  ideaId?: string;
  slotId?: string;
}

// L'uscita menzionata in un messaggio, per Claude: quando, dove, con quale tema.
export interface ChatSlot {
  id: string;
  date: string;
  time: string;
  channels: ChannelId[];
  theme: string | null;
}

// L'idea menzionata in un messaggio, per Claude: tutta, con il nome del tema.
export interface ChatIdea extends ContentIdea {
  id: string;
}

export interface ChatTurnCreated {
  conversationId: string;
  turnId: string;
  jobId: string;
}

export interface ChatJobInput {
  brandId: string;
  conversationId: string;
  // La sessione da riprendere: null al primo turno.
  sessionId: string | null;
  brand: BrandContext;
  message: string;
  attachments: string[];
  idea: ChatIdea | null;
  slot: ChatSlot | null;
}

// L'API che i tool della chat chiamano con il token del job: agisce solo sul brand del job.

export interface AgentContentRequest {
  // L'uscita del piano in cui esce il contenuto, se l'utente l'ha chiesto per quella.
  slotId?: string;
  title: string;
  format: ContentFormat;
  channels: ChannelId[];
  variants: ChannelVariant[];
  headline: string;
  slides: CarouselSlide[];
  // Solo nei video: l'idea in breve e le inquadrature del copione.
  script?: string;
  scenes?: VideoScene[];
  // L'impaginazione in una frase (vedi ContentVisual.layout).
  layout?: string;
  // Le immagini e i video finali, ovunque siano nella cartella del brand: l'API li copia in quella del contenuto.
  files: { file: string; role: ContentFile['role']; index: number; aspect: string }[];
}

export interface AgentContentSaved {
  id: string;
  title: string;
  files: string[];
}

export interface AgentIdeaRequest {
  title: string;
  angleLabel: string;
  angle: string;
  rationale: string;
  themeId: string | null;
}

export interface ApiErrorBody {
  status: number;
  code: string;
  message: string;
}

export const PASSWORD_MIN = 8;
export const REFRESH_COOKIE = 'mb_refresh';

// Il piano: le uscite di un periodo, con quello che hanno, e quello che si può ancora mettere in calendario.

// Un'uscita come la mostra il piano: con l'idea e il contenuto che ha, e lo stato che ne segue.
export interface SlotView extends PlanSlot {
  idea: { id: string; title: string } | null;
  content: ContentSummary | null;
}

export interface PlanResponse {
  // Le uscite tra from e to, in ordine di data e ora.
  slots: SlotView[];
  // I contenuti che non hanno un'uscita: si trascinano sul calendario.
  unscheduled: ContentSummary[];
  // Le idee tenute che non sono ancora nel piano.
  ideas: Idea[];
  themes: { id: string; name: string; color: string; weight: number }[];
  channels: ChannelId[];
  postsPerWeek: number;
  // Oggi, a Roma.
  today: string;
}

export type PlanProposalRequest = PlanRequest;

export interface PlanProposal {
  drafts: SlotDraft[];
}

export interface PlanConfirmRequest {
  drafts: SlotDraft[];
}

// Un'uscita nuova: vuota (con il tema), con un'idea o con un contenuto già fatto. Senza canali, quelli dell'idea o del contenuto.
export interface SlotCreateRequest {
  date: string;
  time: string;
  channels?: ChannelId[];
  themeId?: string | null;
  ideaId?: string | null;
  contentId?: string | null;
}

// Spostare un'uscita o cambiarne canali, tema e idea. I canali di un'uscita con il contenuto sono quelli del contenuto.
export interface SlotPatchRequest {
  date?: string;
  time?: string;
  channels?: ChannelId[];
  themeId?: string | null;
  ideaId?: string | null;
}

// Aggiungere un'idea al piano: la prima uscita vuota del suo tema, altrimenti il primo giorno buono libero.
export interface PlanIdeaRequest {
  ideaId: string;
}

// Il benvenuto della chat: i saluti e gli spunti di oggi per il brand, vuoti se non sono ancora pronti.
// jobId: il job che li sta scrivendo, da seguire per mostrarli appena arrivano.
export interface WelcomeResponse {
  greetings: Greeting[];
  suggestions: WelcomeSuggestion[];
  jobId: string | null;
}

// Quello che succede nel brand, contato dall'API: gli spunti nascono da qui e dal piano del BrandContext.
export interface WelcomeSignals {
  // Le ricorrenze e le date del brand da oggi alla settimana prossima.
  occasions: Occasion[];
  milestones: { label: string; date: string; anniversary: boolean }[];
  // Le uscite di questa settimana (da lunedì a domenica) con qualcosa dentro, e quante ne chiede il ritmo del brand.
  week: { planned: number; target: number };
  // L'ultima uscita già pubblicata, se c'è.
  lastPublished: string | null;
  // Le bozze non ancora approvate e le idee tenute ma non ancora nel piano né in un contenuto, le più recenti.
  drafts: { title: string; updatedAt: string }[];
  savedIdeas: string[];
  // I titoli delle ultime conversazioni con l'assistente.
  recentChats: string[];
}

// day: il giorno (a Roma) per cui valgono; fingerprint: lo stato del brand da cui nascono, per sapere quando rifarli.
export interface WelcomeJobInput {
  brandId: string;
  day: string;
  fingerprint: string;
  // Il nome di chi usa l'app, com'è nell'account.
  name: string;
  brand: BrandContext;
  signals: WelcomeSignals;
}
