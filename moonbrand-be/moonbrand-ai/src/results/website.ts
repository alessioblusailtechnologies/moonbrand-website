// Il logo scelto da Claude diventa un data URI: lo studio lo riporta a un PNG come quello caricato a mano nell'onboarding.
// Qui valgono le regole che il modello non può garantire: che l'indirizzo risponda, che sia davvero un'immagine e che non pesi troppo.

const TIMEOUT_MS = 10_000;
// Il campo del logo nel brand regge 3 milioni di caratteri: in base64 un file così ci sta con margine.
const MAX_BYTES = 1_500_000;
// Generico, come fa Claude con curl: un user agent completo da Chrome, senza il resto di Chrome, fa scattare i filtri anti-bot.
const BROWSER_AGENT = 'Mozilla/5.0';

const RASTER: Record<string, (bytes: Uint8Array) => boolean> = {
  'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/webp': (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45,
};

// Il tipo si riconosce dai byte, non dall'intestazione: molti siti servono i loghi con un content-type sbagliato.
function imageType(bytes: Uint8Array): string | null {
  for (const [type, matches] of Object.entries(RASTER)) if (bytes.length > 12 && matches(bytes)) return type;
  const head = new TextDecoder().decode(bytes.slice(0, 1024)).toLowerCase();
  return head.includes('<svg') ? 'image/svg+xml' : null;
}

async function logoDataUri(url: string): Promise<string | null> {
  try {
    // Molti siti rifiutano i programmi che si presentano come tali (403), anche per le immagini.
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'user-agent': BROWSER_AGENT, accept: 'image/*,*/*;q=0.8', referer: new URL(url).origin + '/' },
    });
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) return null;
    const type = imageType(bytes);
    return type ? `data:${type};base64,${Buffer.from(bytes).toString('base64')}` : null;
  } catch {
    return null;
  }
}

// Al posto dell'indirizzo, il logo pronto; null se non si riesce a prenderlo.
export async function withLogo(result: unknown): Promise<unknown> {
  const reading = result as { logo?: string | null };
  return { ...reading, logo: reading.logo ? await logoDataUri(reading.logo) : null };
}
