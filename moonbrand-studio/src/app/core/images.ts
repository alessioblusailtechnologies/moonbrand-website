const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];

// Il lato massimo del logo del brand, caricato a mano o preso dal sito.
export const LOGO_SIDE = 512;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('immagine illeggibile'));
    };
    image.src = url;
  });
}

export async function resizedDataUri(file: File, maxSide: number, type: 'image/png' | 'image/jpeg'): Promise<string> {
  if (!ACCEPTED.includes(file.type) && file.type !== 'image/svg+xml') throw new Error('formato');
  const image = await loadImage(file);
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth || maxSide, image.naturalHeight || maxSide));
  const width = Math.max(1, Math.round((image.naturalWidth || maxSide) * scale));
  const height = Math.max(1, Math.round((image.naturalHeight || maxSide) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas');
  if (type === 'image/jpeg') {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
  }
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL(type, 0.86);
}

// Quanto deve essere trasparente l'immagine perché conti il colore del logo e non quello del suo sfondo,
// e quanto chiari devono essere i pixel visibili perché su bianco non si veda.
const MIN_TRANSPARENT = 0.1;
const LIGHT_LUMINANCE = 0.8;
const SAMPLE_SIDE = 48;

// Un logo chiaro su sfondo trasparente (bianco o quasi): su una pagina bianca sparisce e va messo su un fondo scuro.
export async function isLightLogo(src: string): Promise<boolean> {
  const image = new Image();
  image.src = src;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_SIDE;
  canvas.height = SAMPLE_SIDE;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return false;
  context.drawImage(image, 0, 0, SAMPLE_SIDE, SAMPLE_SIDE);
  const { data } = context.getImageData(0, 0, SAMPLE_SIDE, SAMPLE_SIDE);
  let transparent = 0;
  let weight = 0;
  let luminance = 0;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3] / 255;
    if (alpha < 0.15) {
      transparent += 1;
      continue;
    }
    luminance += alpha * ((0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255);
    weight += alpha;
  }
  const pixels = SAMPLE_SIDE * SAMPLE_SIDE;
  return transparent / pixels >= MIN_TRANSPARENT && weight > 0 && luminance / weight >= LIGHT_LUMINANCE;
}
