import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  ChatAttachment,
  ChatAttachmentUpload,
  ChatMessageRequest,
  ChatTurnCreated,
  ConversationResponse,
  ConversationSummary,
  TranscriptionResponse,
  WelcomeResponse,
} from '@moonbrand/shared/api/contract';

import { AuthService } from '../auth/auth.service';
import { BrandsService } from '../brands/brands.service';

// Le conversazioni con l'assistente: ogni messaggio mette in coda un turno, che si segue con AiJobsService.follow.
// L'elenco del brand attivo sta qui: lo mostra la sidebar e lo aggiorna la pagina della chat.
@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly brands = inject(BrandsService);

  readonly conversations = signal<ConversationSummary[]>([]);

  constructor() {
    effect(() => {
      const brand = this.brands.activeBrand();
      this.conversations.set([]);
      if (brand) untracked(() => void this.refresh());
    });
  }

  async refresh(): Promise<void> {
    const brand = this.brands.activeBrand();
    if (!brand) return;
    try {
      const list = await firstValueFrom(this.http.get<ConversationSummary[]>(`/v1/brands/${brand.id}/conversations`));
      if (this.brands.activeBrand()?.id === brand.id) this.conversations.set(list);
    } catch {
      // L'elenco resta quello di prima: si riprova al prossimo aggiornamento.
    }
  }

  // Il saluto e gli spunti di oggi per il brand; se li sta ancora scrivendo, jobId è il lavoro da seguire.
  welcome(brandId: string): Promise<WelcomeResponse> {
    return firstValueFrom(this.http.get<WelcomeResponse>(`/v1/brands/${brandId}/welcome`));
  }

  start(brandId: string, request: ChatMessageRequest): Promise<ChatTurnCreated> {
    return firstValueFrom(this.http.post<ChatTurnCreated>(`/v1/brands/${brandId}/conversations`, request));
  }

  get(conversationId: string): Promise<ConversationResponse> {
    return firstValueFrom(this.http.get<ConversationResponse>(`/v1/conversations/${conversationId}`));
  }

  send(conversationId: string, request: ChatMessageRequest): Promise<ChatTurnCreated> {
    return firstValueFrom(this.http.post<ChatTurnCreated>(`/v1/conversations/${conversationId}/messages`, request));
  }

  async stop(conversationId: string): Promise<void> {
    await firstValueFrom(this.http.post(`/v1/conversations/${conversationId}/stop`, {}));
  }

  // Un video parte così com'è, anche di qualche GB: con XMLHttpRequest, perché fetch non dice quanto è già partito.
  // progress va da 0 a 1; a 1 il server sta ancora convertendo il video. Come l'interceptor, a token scaduto riprova una volta.
  async uploadVideo(brandId: string, file: File, progress: (fraction: number) => void): Promise<ChatAttachment> {
    const send = (token: string | null) =>
      new Promise<{ status: number; body: unknown }>((resolve) => {
        const request = new XMLHttpRequest();
        request.open('POST', `/v1/brands/${brandId}/attachments/video`);
        if (token) request.setRequestHeader('Authorization', `Bearer ${token}`);
        request.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        request.responseType = 'json';
        request.upload.onprogress = (event) => event.lengthComputable && progress(event.loaded / event.total);
        request.onload = () => resolve({ status: request.status, body: request.response });
        request.onerror = () => resolve({ status: 0, body: null });
        request.send(file);
      });
    let response = await send(this.auth.token());
    if (response.status === 401) {
      const token = await this.auth.refresh();
      if (token) response = await send(token);
    }
    if (response.status < 200 || response.status >= 300) throw new HttpErrorResponse({ status: response.status, error: response.body });
    return response.body as ChatAttachment;
  }

  // La dettatura: l'audio del microfono così com'è, e torna il testo da rileggere nella casella.
  async transcribe(brandId: string, audio: Blob): Promise<string> {
    const { text } = await firstValueFrom(
      this.http.post<TranscriptionResponse>(`/v1/brands/${brandId}/transcriptions`, audio, { headers: { 'Content-Type': audio.type || 'audio/webm' } }),
    );
    return text;
  }

  upload(brandId: string, dataUri: string): Promise<ChatAttachment> {
    return firstValueFrom(
      this.http.post<ChatAttachment>(`/v1/brands/${brandId}/attachments`, { dataUri } satisfies ChatAttachmentUpload),
    );
  }

  async remove(conversationId: string): Promise<void> {
    await firstValueFrom(this.http.delete(`/v1/conversations/${conversationId}`));
    this.conversations.update((list) => list.filter((item) => item.id !== conversationId));
  }
}
