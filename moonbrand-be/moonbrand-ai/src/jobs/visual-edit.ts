import type { ChannelId } from '@moonbrand/shared/domain/brand';

import { runExamples } from '../lib/examples';

const [brandDir, dir, sessionId, channelsJson, instruction] = process.argv.slice(2);
if (!brandDir || !dir || !sessionId || !channelsJson || !instruction) {
  console.error('Uso: npm run visual-edit -- <cartella del brand> <cartella degli esempi> <sessione> <canali in JSON> <richiesta>');
  process.exit(1);
}

const prompt = `${instruction}

Aggiorna gli esempi nella cartella ${dir} e restituisci l’elenco completo, anche quelli che non hai cambiato.`;

await runExamples({ brandDir, dir, channels: JSON.parse(channelsJson) as ChannelId[], prompt, resume: sessionId });
