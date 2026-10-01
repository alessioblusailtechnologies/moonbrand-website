import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { query } from '@anthropic-ai/claude-agent-sdk';

const site = process.argv[2];
if (!site) {
  console.error('Uso: npm run website -- <url>');
  process.exit(1);
}

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['site', 'name', 'sector', 'summary', 'pitch', 'themes', 'goals', 'audiences', 'colors', 'logo'],
  properties: {
    site: { type: 'string', description: 'Dominio del sito, senza protocollo né www' },
    name: { type: 'string', description: 'Nome del brand come appare sul sito' },
    sector: { type: 'string', description: 'Settore in poche parole, in italiano (es. "Parrucchiere", "Panificio artigianale")' },
    summary: { type: 'string', description: 'Cosa fa il brand, 2-3 frasi' },
    pitch: { type: 'string', description: 'Il pitch del brand in una frase, in prima persona' },
    themes: { type: 'array', items: { type: 'string' }, description: 'Temi editoriali per i social, 3-5, dal più importante' },
    goals: { type: 'array', items: { type: 'string' }, description: 'Perché il brand pubblica sui social: obiettivi brevi, 3-5, dal più importante' },
    audiences: { type: 'array', items: { type: 'string' }, description: 'Chi vuole raggiungere con i social: pubblici brevi, 2-5, dal più importante' },
    colors: {
      type: 'array',
      items: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
      minItems: 4,
      maxItems: 4,
      description: 'Palette del sito in esadecimale: primario, secondario, accento, sfondo',
    },
    logo: {
      type: ['string', 'null'],
      pattern: '^https?://',
      description: 'L’indirizzo completo dell’immagine del logo (PNG, JPEG, WebP o SVG), dopo averla guardata; null se il sito non ha un logo riconoscibile',
    },
  },
};

// Una cartella solo per questo job: i candidati per il logo si scaricano qui e si guardano, poi si butta tutto.
const workDir = await mkdtemp(path.join(tmpdir(), 'moonbrand-website-'));

const prompt = `Leggi il sito ${site} e ricava le informazioni sul brand. Rispondi in italiano.

Trova anche il logo: di solito è in testata o nel footer, a volte è la prima immagine della pagina o un'immagine con il nome del brand; l'immagine dell'anteprima social e la favicon sono ripieghi. Scarica i candidati con curl nella cartella corrente e guardali con Read prima di scegliere: il logo è il marchio o la scritta del brand, non un banner, una foto o un'icona generica.`;

try {
  for await (const message of query({
    prompt,
    options: {
      cwd: workDir,
      allowedTools: ['WebFetch', 'WebSearch', 'Bash', 'Read'],
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      outputFormat: { type: 'json_schema', schema },
    },
  })) {
    console.log(JSON.stringify(message));
  }
} finally {
  await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
}
