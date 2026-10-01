// Le foto dei post di esempio del sito, generate come fa genera_immagine nel motore (moonbrand-ai/src/tools/immagini.ts).
// Uso: npx tsx --env-file=../../moonbrand-be/moonbrand-ai/.env scripts/foto.mts [nome...]
// Salta le foto già presenti in public/foto: per rigenerarne una, cancellala o passala per nome.
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { GoogleGenAI } from '@google/genai';

const MODEL = 'gemini-3.1-flash-image';
const OUT = path.resolve('public/foto');

type Formato = '1:1' | '4:5' | '3:4' | '9:16' | '16:9';

const NO_TEXT = 'No text, no letters, no logos, no watermarks anywhere in the image.';

const foto: { nome: string; formato: Formato; descrizione: string }[] = [
  {
    // Solco: elettronica minimal, stile Nothing.
    nome: 'solco-buds',
    formato: '4:5',
    descrizione:
      'Studio product photo of a pair of minimalist wireless earbuds next to their fully transparent charging case, internal components visible through the clear shell, white and light grey parts with one tiny red detail. Seamless light grey paper backdrop, soft diffused light from the upper left, long soft shadow. The product sits in the lower half, the upper half is empty negative space. Industrial design catalogue aesthetic, medium format, 85mm. ' + NO_TEXT,
  },
  {
    nome: 'solco-colori',
    formato: '9:16',
    descrizione:
      'Top-down photo of two identical minimalist transparent earbud cases side by side, one white and one black, on a matte warm grey surface. Even soft light, crisp shadows. The cases sit slightly below the centre, with generous empty space above and below. Clean, precise, quiet tech aesthetic. ' + NO_TEXT,
  },
  {
    nome: 'solco-dentro',
    formato: '4:5',
    descrizione:
      'Knolling flat lay, shot straight from above: the parts of a disassembled minimalist wireless earbud laid out in a precise grid on a light grey surface — two transparent shells, a tiny circuit board, a small battery, two copper coils, silicone ear tips, tiny screws, a transparent charging case lid. Perfectly aligned, even soft light, crisp small shadows, clean industrial design aesthetic. The parts occupy the lower two thirds, the top third is empty grey. ' + NO_TEXT,
  },
  {
    nome: 'solco-team',
    formato: '1:1',
    descrizione:
      'A small industrial design studio: two designers seen from the side at a large white table covered with foam and 3D-printed prototypes of earbud cases, sketches and a few transparent parts, a big window with soft daylight, white walls, light wood, calm and focused atmosphere, candid editorial photo, faces not in sharp focus. ' + NO_TEXT,
  },
  {
    // Pasticceria Aurora: pasticceria storica milanese, stile Marchesi.
    nome: 'aurora-torta',
    formato: '4:5',
    descrizione:
      'A pear and dark chocolate tart with a light dusting of cinnamon, displayed on a silver stand inside the glass window of an elegant historic Milanese pastry shop with pale sage green woodwork and brass details. Warm morning light, subtle reflections on the glass, shallow depth of field, refined and inviting. ' + NO_TEXT,
  },
  {
    nome: 'aurora-laboratorio',
    formato: '4:5',
    descrizione:
      'Pastry laboratory at four in the morning: a baker’s hands dusting flour over laminated dough on a white marble counter, warm glow from an open oven in the background, a little steam in the air. Dark, moody tones with warm highlights, documentary photography, no faces. ' + NO_TEXT,
  },
  {
    // Forma Gym: boutique fitness al buio con luci rosse, stile Barry's.
    nome: 'forma-alba',
    formato: '1:1',
    descrizione:
      'Dark boutique fitness studio just before dawn: rows of treadmills in silhouette, deep red LED light strips along the floor and ceiling, a large window behind showing a sleeping city with a few lights on. Empty room, cinematic, the upper half is mostly dark negative space. ' + NO_TEXT,
  },
  {
    nome: 'forma-stacco',
    formato: '9:16',
    descrizione:
      'Vertical smartphone-style frame of an athlete in the middle of a deadlift in a dark gym lit by red neon light, low camera angle, chalk dust in the air, strong energy, slight film grain, face mostly in shadow. The upper third of the frame is darker and calmer. ' + NO_TEXT,
  },
  {
    // Osteria del Porto: trattoria di mare, luce naturale.
    nome: 'osteria-pescato',
    formato: '9:16',
    descrizione:
      'Vertical photo of the weathered hands of an old fisherman holding a wooden crate of freshly caught fish on crushed ice (sea bream, red mullet, a few prawns), a small Italian harbour at sunrise behind with colourful wooden fishing boats, natural soft golden light, authentic and unposed. The crate is in the lower half, the sky and harbour fill the top. ' + NO_TEXT,
  },
  {
    // Libreria Nove: libreria indipendente.
    nome: 'libreria-libri',
    formato: '4:5',
    descrizione:
      'A stack of three hardcover books with plain, unprinted cloth covers in terracotta, ochre and deep green on an old wooden table in a small independent bookshop, warm afternoon light through a window, shelves softly blurred behind, a pair of reading glasses beside the stack. The books are in the lower half, calm empty space above. The book spines and covers are completely blank. ' + NO_TEXT,
  },
  {
    // La sezione "Un giorno tipo, con Moonbrand".
    nome: 'social-manager',
    formato: '3:4',
    descrizione:
      'Editorial photo of a social media manager at a sunny wooden desk in the morning, seen over the shoulder, holding a smartphone that shows a colourful grid of photos, laptop open beside, a cup of coffee and a paper notebook. Natural window light, candid, warm and calm. Screens show only colours and shapes. ' + NO_TEXT,
  },
];

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error('GEMINI_API_KEY mancante: lancia con --env-file=../../moonbrand-be/moonbrand-ai/.env');

const ai = new GoogleGenAI({ apiKey });
const scelte = process.argv.slice(2);
const daFare = foto.filter((f) => (scelte.length ? scelte.includes(f.nome) : !existsSync(path.join(OUT, `${f.nome}.jpg`))));

await mkdir(OUT, { recursive: true });
const esiti = await Promise.allSettled(
  daFare.map(async ({ nome, formato, descrizione }) => {
    const interaction = await ai.interactions.create({
      model: MODEL,
      input: [{ type: 'text', text: descrizione }],
      response_format: { type: 'image', aspect_ratio: formato, image_size: '2K', mime_type: 'image/jpeg' },
    });
    const image = interaction.output_image;
    if (!image?.data) throw new Error('Gemini non ha restituito un’immagine');
    await writeFile(path.join(OUT, `${nome}.jpg`), Buffer.from(image.data, 'base64'));
    return nome;
  }),
);

esiti.forEach((esito, i) =>
  console.log(esito.status === 'fulfilled' ? `✓ ${esito.value}` : `✗ ${daFare[i].nome}: ${esito.reason?.message ?? esito.reason}`),
);
