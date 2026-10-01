import { fileURLToPath } from 'node:url';

import type { Options } from '@anthropic-ai/claude-agent-sdk';

// Le skill di moonbrand (plugin/skills): le regole per scrivere contenuti e proporre idee,
// le stesse per i job e per la chat. Si chiamano per nome, es. «usa la skill moonbrand:contenuti».
export const MOONBRAND_PLUGINS: NonNullable<Options['plugins']> = [{ type: 'local', path: fileURLToPath(new URL('../../plugin', import.meta.url)) }];
