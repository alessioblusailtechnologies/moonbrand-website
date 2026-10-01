import { HttpErrorResponse, type HttpInterceptorFn, type HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';

import { AuthService } from './auth.service';

const withToken = (request: HttpRequest<unknown>, token: string | null) =>
  token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request;

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith('/v1/')) return next(request);
  const auth = inject(AuthService);
  const router = inject(Router);

  if (request.url.startsWith('/v1/auth/') && !request.url.endsWith('/sign-out')) return next(request);

  return next(withToken(request, auth.token())).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401 || request.url.endsWith('/sign-out')) {
        return throwError(() => error);
      }
      return from(auth.refresh()).pipe(
        switchMap((token) => {
          if (!token) {
            void router.navigateByUrl('/login');
            return throwError(() => error);
          }
          return next(withToken(request, token));
        }),
      );
    }),
  );
};
