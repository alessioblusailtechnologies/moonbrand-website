import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { Account, Me, Session, SignInRequest, SignUpRequest } from '@moonbrand/shared/api/contract';

type Status = 'unknown' | 'signed-in' | 'signed-out';

const REFRESH_MARGIN_SECONDS = 60;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private accessToken: string | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private refreshing: Promise<string | null> | null = null;

  readonly status = signal<Status>('unknown');
  readonly account = signal<Account | null>(null);
  readonly activeBrandId = signal<string | null>(null);
  readonly signedIn = computed(() => this.status() === 'signed-in');

  token(): string | null {
    return this.accessToken;
  }

  async restore(): Promise<void> {
    const token = await this.refresh();
    if (!token) return;
    try {
      await this.loadMe();
      this.status.set('signed-in');
    } catch {
      this.clear();
    }
  }

  async signIn(request: SignInRequest): Promise<void> {
    await this.start(await firstValueFrom(this.http.post<Session>('/v1/auth/sign-in', request, { withCredentials: true })));
  }

  async signUp(request: SignUpRequest): Promise<void> {
    await this.start(await firstValueFrom(this.http.post<Session>('/v1/auth/sign-up', request, { withCredentials: true })));
  }

  async signOut(): Promise<void> {
    await firstValueFrom(this.http.post('/v1/auth/sign-out', null, { withCredentials: true })).catch(() => undefined);
    this.clear();
  }

  refresh(): Promise<string | null> {
    this.refreshing ??= firstValueFrom(
      this.http.post<{ accessToken: string; expiresIn: number }>('/v1/auth/refresh', null, { withCredentials: true }),
    )
      .then(({ accessToken, expiresIn }) => {
        this.setToken(accessToken, expiresIn);
        return accessToken;
      })
      .catch(() => {
        this.clear();
        return null;
      })
      .finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  clear(): void {
    clearTimeout(this.refreshTimer);
    this.accessToken = null;
    this.account.set(null);
    this.activeBrandId.set(null);
    this.status.set('signed-out');
  }

  private async start(session: Session): Promise<void> {
    this.setToken(session.accessToken, session.expiresIn);
    this.account.set(session.account);
    await this.loadMe();
    this.status.set('signed-in');
  }

  private async loadMe(): Promise<void> {
    const me = await firstValueFrom(this.http.get<Me>('/v1/me'));
    this.account.set(me.account);
    this.activeBrandId.set(me.activeBrandId);
  }

  private setToken(token: string, expiresIn: number): void {
    this.accessToken = token;
    clearTimeout(this.refreshTimer);
    const delay = Math.max(10, expiresIn - REFRESH_MARGIN_SECONDS) * 1000;
    this.refreshTimer = setTimeout(() => void this.refresh(), delay);
  }
}
