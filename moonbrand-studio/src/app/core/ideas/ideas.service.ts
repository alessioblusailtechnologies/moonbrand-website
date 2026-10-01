import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { AiJobCreated, IdeasResponse, IdeaStatusRequest } from '@moonbrand/shared/api/contract';
import type { Idea, IdeaStatus } from '@moonbrand/shared/domain/idea';

@Injectable({ providedIn: 'root' })
export class IdeasService {
  private readonly http = inject(HttpClient);

  list(brandId: string): Promise<IdeasResponse> {
    return firstValueFrom(this.http.get<IdeasResponse>(`/v1/brands/${brandId}/ideas`));
  }

  // Restituisce il lavoro che prepara le idee: si segue con AiJobsService.follow.
  generate(brandId: string): Promise<AiJobCreated> {
    return firstValueFrom(this.http.post<AiJobCreated>(`/v1/brands/${brandId}/ideas/generate`, {}));
  }

  setStatus(ideaId: string, status: IdeaStatus): Promise<Idea> {
    return firstValueFrom(this.http.patch<Idea>(`/v1/ideas/${ideaId}`, { status } satisfies IdeaStatusRequest));
  }
}
