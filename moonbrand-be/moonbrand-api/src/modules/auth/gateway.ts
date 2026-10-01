import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Config } from '../../config';
import { ApiError } from '../../errors';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthGateway {
  createUser(email: string, password: string): Promise<{ id: string } | null>;
  signIn(email: string, password: string): Promise<(Tokens & { userId: string }) | null>;
  refresh(refreshToken: string): Promise<Tokens | null>;
  signOut(accessToken: string): Promise<void>;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: { id: string };
}

export function supabaseAuthGateway(config: Pick<Config, 'SUPABASE_URL' | 'SUPABASE_ANON_KEY' | 'SUPABASE_SERVICE_ROLE_KEY'>): AuthGateway {
  let admin: SupabaseClient | undefined;

  const requestToken = async (grant: 'password' | 'refresh_token', body: Record<string, string>) => {
    const response = await fetch(new URL(`/auth/v1/token?grant_type=${grant}`, config.SUPABASE_URL), {
      method: 'POST',
      headers: { apikey: config.SUPABASE_ANON_KEY, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (response.status === 429) throw new ApiError(429, 'TOO_MANY_REQUESTS', 'Troppi tentativi: riprova tra qualche minuto.');
    if (response.status >= 500) throw new Error(`Supabase Auth risponde ${response.status}`);
    if (!response.ok) return null;
    const data = (await response.json()) as TokenResponse;
    return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in, userId: data.user.id };
  };

  return {
    async createUser(email, password) {
      admin ??= createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (!error) return { id: data.user.id };
      if (error.code === 'email_exists' || error.code === 'user_already_exists') return null;
      if (error.code === 'weak_password') throw ApiError.invalid('La password è troppo debole: allungala o aggiungi numeri e simboli.');
      throw error;
    },
    signIn: (email, password) => requestToken('password', { email, password }),
    async refresh(refreshToken) {
      const result = await requestToken('refresh_token', { refresh_token: refreshToken });
      return result && { accessToken: result.accessToken, refreshToken: result.refreshToken, expiresIn: result.expiresIn };
    },
    async signOut(accessToken) {
      await fetch(new URL('/auth/v1/logout?scope=local', config.SUPABASE_URL), {
        method: 'POST',
        headers: { apikey: config.SUPABASE_ANON_KEY, authorization: `Bearer ${accessToken}` },
      }).catch(() => undefined);
    },
  };
}
