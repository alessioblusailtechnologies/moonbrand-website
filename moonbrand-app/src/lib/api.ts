import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ApiErrorBody } from '@moonbrand/shared/api/contract';

// Il server di moonbrand: l'API dello studio. Si cambia dalla schermata di accesso, per provare un altro server.
export const DEFAULT_SERVER = 'http://45.14.185.228:3012';
const SERVER_KEY = 'moonbrand:server';

let server = DEFAULT_SERVER;
let accessToken: string | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let refreshing: Promise<string | null> | null = null;
let onSignedOut: (() => void) | null = null;

const REFRESH_MARGIN_SECONDS = 60;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

export async function loadServer(): Promise<string> {
  try {
    server = (await AsyncStorage.getItem(SERVER_KEY)) || DEFAULT_SERVER;
  } catch {
    server = DEFAULT_SERVER;
  }
  return server;
}

export function currentServer(): string {
  return server;
}

export async function saveServer(value: string): Promise<void> {
  const clean = value.trim().replace(/\/+$/, '') || DEFAULT_SERVER;
  server = /^https?:\/\//i.test(clean) ? clean : `http://${clean}`;
  await AsyncStorage.setItem(SERVER_KEY, server).catch(() => undefined);
}

// Un link dell'API (i file dei brand sono percorsi /v1/files/… firmati) diventa un indirizzo completo; data URI e link completi restano.
export function fileUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('/')) return `${server}${url}`;
  return url;
}

export function setSignedOutHandler(handler: (() => void) | null): void {
  onSignedOut = handler;
}

export function token(): string | null {
  return accessToken;
}

export function setToken(value: string | null, expiresIn = 0): void {
  accessToken = value;
  clearTimeout(refreshTimer);
  if (!value) return;
  const delay = Math.max(10, expiresIn - REFRESH_MARGIN_SECONDS) * 1000;
  refreshTimer = setTimeout(() => void refresh(), delay);
}

// Il token di refresh sta nel cookie mb_refresh, che il client HTTP di Android conserva da solo tra un avvio e l'altro.
export function refresh(): Promise<string | null> {
  refreshing ??= request<{ accessToken: string; expiresIn: number }>('POST', '/v1/auth/refresh', { auth: false })
    .then(({ accessToken: next, expiresIn }) => {
      setToken(next, expiresIn);
      return next;
    })
    .catch(() => {
      setToken(null);
      return null;
    })
    .finally(() => (refreshing = null));
  return refreshing;
}

interface Options {
  body?: unknown;
  // Il corpo così com'è, con il suo tipo (l'audio della dettatura).
  raw?: { data: Blob | ArrayBuffer; type: string };
  auth?: boolean;
  query?: Record<string, string>;
}

async function send(method: string, path: string, options: Options, bearer: string | null): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  let body: BodyInit | undefined;
  if (options.raw) {
    headers['Content-Type'] = options.raw.type;
    body = options.raw.data as BodyInit;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  const query = options.query ? `?${new URLSearchParams(options.query).toString()}` : '';
  try {
    return await fetch(`${server}${path}${query}`, { method, headers, body, credentials: 'include' });
  } catch {
    throw new ApiError(0, 'Non riesco a raggiungere il server. Controlla la connessione.');
  }
}

async function parse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!response.ok) {
    const body = (data ?? {}) as Partial<ApiErrorBody>;
    throw new ApiError(response.status, body.message ?? `Errore ${response.status}`, body.code);
  }
  return data as T;
}

// Una chiamata all'API con il token; a token scaduto si rinnova una volta e si riprova, altrimenti si esce.
export async function request<T>(method: string, path: string, options: Options = {}): Promise<T> {
  const auth = options.auth ?? true;
  let response = await send(method, path, options, auth ? accessToken : null);
  if (auth && response.status === 401) {
    const next = await refresh();
    if (!next) {
      onSignedOut?.();
      return parse<T>(response);
    }
    response = await send(method, path, options, next);
  }
  return parse<T>(response);
}

export const api = {
  get: <T>(path: string, query?: Record<string, string>) => request<T>('GET', path, { query }),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, { body }),
  put: <T>(path: string, body: unknown = {}) => request<T>('PUT', path, { body }),
  patch: <T>(path: string, body: unknown = {}) => request<T>('PATCH', path, { body }),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

// Il messaggio da mostrare: quello dell'API per gli errori di chi usa l'app, altrimenti quello di riserva.
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return error.message;
    if (error.status < 500 && error.message) return error.message;
  }
  return fallback;
}
