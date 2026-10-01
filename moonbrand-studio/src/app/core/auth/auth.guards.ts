import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { BrandsService } from '../brands/brands.service';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.signedIn() || inject(Router).createUrlTree(['/login']);
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return !auth.signedIn() || inject(Router).createUrlTree(['/']);
};

export const hasBrandsGuard: CanActivateFn = async () => {
  const brands = inject(BrandsService);
  await brands.ensureLoaded();
  return brands.brands().length > 0 || inject(Router).createUrlTree(['/onboarding']);
};
