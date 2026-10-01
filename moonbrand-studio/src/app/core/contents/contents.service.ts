import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  ContentChannelRequest,
  ContentCreated,
  ContentEditRequest,
  ContentResponse,
  ContentScriptRequest,
  ContentSummary,
  ContentVariantRequest,
  CreateContentRequest,
} from '@moonbrand/shared/api/contract';
import type { ChannelId } from '@moonbrand/shared/domain/brand';
import type { Content } from '@moonbrand/shared/domain/content';

@Injectable({ providedIn: 'root' })
export class ContentsService {
  private readonly http = inject(HttpClient);

  // Crea la bozza dall'idea (e salva l'idea): il lavoro che la scrive si segue con AiJobsService.follow.
  create(ideaId: string, request: CreateContentRequest): Promise<ContentCreated> {
    return firstValueFrom(this.http.post<ContentCreated>(`/v1/ideas/${ideaId}/content`, request));
  }

  list(brandId: string): Promise<ContentSummary[]> {
    return firstValueFrom(this.http.get<ContentSummary[]>(`/v1/brands/${brandId}/contents`));
  }

  get(contentId: string): Promise<ContentResponse> {
    return firstValueFrom(this.http.get<ContentResponse>(`/v1/contents/${contentId}`));
  }

  edit(contentId: string, instruction: string): Promise<{ jobId: string }> {
    return firstValueFrom(this.http.post<{ jobId: string }>(`/v1/contents/${contentId}/edit`, { instruction } satisfies ContentEditRequest));
  }

  regenerate(contentId: string): Promise<{ jobId: string }> {
    return firstValueFrom(this.http.post<{ jobId: string }>(`/v1/contents/${contentId}/regenerate`, {}));
  }

  // Il copione di un video corretto a mano.
  saveScript(contentId: string, request: ContentScriptRequest): Promise<Content> {
    return firstValueFrom(this.http.put<Content>(`/v1/contents/${contentId}/script`, request));
  }

  // Il video dal copione: il lavoro si segue con AiJobsService.follow.
  generateVideo(contentId: string): Promise<{ jobId: string }> {
    return firstValueFrom(this.http.post<{ jobId: string }>(`/v1/contents/${contentId}/video`, {}));
  }

  // Il testo di un canale corretto a mano.
  saveVariant(contentId: string, channel: ChannelId, request: ContentVariantRequest): Promise<Content> {
    return firstValueFrom(this.http.put<Content>(`/v1/contents/${contentId}/variants/${channel}`, request));
  }

  // Un canale in più: se c'è jobId, testo e immagini li sta preparando un lavoro.
  addChannel(contentId: string, channel: ChannelId): Promise<ContentResponse> {
    return firstValueFrom(this.http.post<ContentResponse>(`/v1/contents/${contentId}/channels`, { channel } satisfies ContentChannelRequest));
  }

  removeChannel(contentId: string, channel: ChannelId): Promise<Content> {
    return firstValueFrom(this.http.delete<Content>(`/v1/contents/${contentId}/channels/${channel}`));
  }

  setApproved(contentId: string, approved: boolean): Promise<Content> {
    return firstValueFrom(this.http.post<Content>(`/v1/contents/${contentId}/${approved ? 'approve' : 'reopen'}`, {}));
  }
}
