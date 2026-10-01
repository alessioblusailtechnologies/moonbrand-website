import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  ContentScheduleRequest,
  PlanConfirmRequest,
  PlanIdeaRequest,
  PlanProposal,
  PlanProposalRequest,
  PlanResponse,
  SlotCreateRequest,
  SlotPatchRequest,
  SlotView,
} from '@moonbrand/shared/api/contract';

// Il piano del brand: le uscite di un periodo, la proposta delle prossime settimane e le uscite da creare, spostare, togliere.
@Injectable({ providedIn: 'root' })
export class PlanService {
  private readonly http = inject(HttpClient);

  get(brandId: string, from: string, to: string): Promise<PlanResponse> {
    return firstValueFrom(this.http.get<PlanResponse>(`/v1/brands/${brandId}/plan`, { params: { from, to } }));
  }

  propose(brandId: string, request: PlanProposalRequest): Promise<PlanProposal> {
    return firstValueFrom(this.http.post<PlanProposal>(`/v1/brands/${brandId}/plan/proposal`, request));
  }

  confirm(brandId: string, request: PlanConfirmRequest): Promise<SlotView[]> {
    return firstValueFrom(this.http.post<SlotView[]>(`/v1/brands/${brandId}/plan/confirm`, request));
  }

  // Un'idea nel piano: la prima uscita vuota del suo tema, altrimenti il primo giorno buono libero.
  addIdea(brandId: string, ideaId: string): Promise<SlotView> {
    return firstValueFrom(this.http.post<SlotView>(`/v1/brands/${brandId}/plan/ideas`, { ideaId } satisfies PlanIdeaRequest));
  }

  create(brandId: string, request: SlotCreateRequest): Promise<SlotView> {
    return firstValueFrom(this.http.post<SlotView>(`/v1/brands/${brandId}/slots`, request));
  }

  update(slotId: string, request: SlotPatchRequest): Promise<SlotView> {
    return firstValueFrom(this.http.patch<SlotView>(`/v1/slots/${slotId}`, request));
  }

  async remove(slotId: string): Promise<void> {
    await firstValueFrom(this.http.delete(`/v1/slots/${slotId}`));
  }

  // Programmare un contenuto: crea la sua uscita o sposta quella che ha.
  schedule(contentId: string, request: ContentScheduleRequest): Promise<SlotView> {
    return firstValueFrom(this.http.put<SlotView>(`/v1/contents/${contentId}/schedule`, request));
  }

  async unschedule(contentId: string): Promise<void> {
    await firstValueFrom(this.http.delete(`/v1/contents/${contentId}/schedule`));
  }
}
