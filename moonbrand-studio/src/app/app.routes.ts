import type { Routes, UrlMatcher } from '@angular/router';

import { authGuard, guestGuard, hasBrandsGuard } from './core/auth/auth.guards';

const assistantMatcher: UrlMatcher = (segments) => {
  const [section, conversationId] = segments;
  if (section?.path !== 'assistente' || segments.length > 2) return null;
  return { consumed: segments, ...(conversationId && { posParams: { conversationId } }) };
};

export const routes: Routes = [
  { path: 'login', canActivate: [guestGuard], loadComponent: () => import('./features/auth/login').then((m) => m.Login) },
  { path: 'register', canActivate: [guestGuard], loadComponent: () => import('./features/auth/register').then((m) => m.Register) },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./features/shell/shell').then((m) => m.Shell),
    children: [
      {
        // Le idee sono la prima sezione; l'onboarding è una modale sopra, con l'app visibile sotto.
        path: '',
        loadComponent: () => import('./features/ideas/ideas-page').then((m) => m.IdeasPage),
        children: [
          { path: '', canActivate: [hasBrandsGuard], children: [] },
          { path: 'onboarding', loadComponent: () => import('./features/onboarding/onboarding').then((m) => m.Onboarding) },
        ],
      },
      {
        // /assistente e /assistente/:conversationId sono la stessa rotta: la pagina resta, cambia solo la conversazione.
        matcher: assistantMatcher,
        canActivate: [hasBrandsGuard],
        loadComponent: () => import('./features/chat/chat-page').then((m) => m.ChatPage),
      },
      {
        path: 'conversazioni',
        canActivate: [hasBrandsGuard],
        loadComponent: () => import('./features/chat/conversations-page').then((m) => m.ConversationsPage),
      },
      {
        path: 'contenuti',
        canActivate: [hasBrandsGuard],
        loadComponent: () => import('./features/contents/contents-page').then((m) => m.ContentsPage),
      },
      {
        path: 'contenuti/:contentId',
        canActivate: [hasBrandsGuard],
        loadComponent: () => import('./features/contents/content-page').then((m) => m.ContentPage),
      },
      {
        path: 'piano',
        canActivate: [hasBrandsGuard],
        loadComponent: () => import('./features/plan/plan-page').then((m) => m.PlanPage),
      },
      {
        path: 'impostazioni',
        canActivate: [hasBrandsGuard],
        loadComponent: () => import('./features/profile/profile-page').then((m) => m.ProfilePage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
