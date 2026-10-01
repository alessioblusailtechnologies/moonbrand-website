import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Config } from '../../config';

export interface MediaStorage {
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  sign(path: string): Promise<string>;
}

const SIGNED_URL_SECONDS = 24 * 60 * 60;

export function supabaseStorage(config: Pick<Config, 'SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY' | 'MEDIA_BUCKET'>): MediaStorage {
  let client: SupabaseClient | undefined;
  const bucket = () => {
    client ??= createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    return client.storage.from(config.MEDIA_BUCKET);
  };

  return {
    async upload(path, bytes, contentType) {
      const { error } = await bucket().upload(path, bytes, { contentType, cacheControl: '31536000', upsert: false });
      if (error) throw new Error(`caricamento di ${path} non riuscito: ${error.message}`);
    },
    async sign(path) {
      const { data, error } = await bucket().createSignedUrl(path, SIGNED_URL_SECONDS);
      if (error || !data) throw new Error(`firma di ${path} non riuscita: ${error?.message ?? 'vuota'}`);
      return data.signedUrl;
    },
  };
}
