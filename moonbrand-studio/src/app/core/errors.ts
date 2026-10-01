import { HttpErrorResponse } from '@angular/common/http';

import type { ApiErrorBody } from '@moonbrand/shared/api/contract';

export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return 'Non riesco a raggiungere il server. Controlla la connessione.';
    const body = error.error as Partial<ApiErrorBody> | null;
    if (body?.message && error.status < 500) return body.message;
  }
  return fallback;
}
