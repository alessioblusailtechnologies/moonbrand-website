import type { ReactNode } from 'react';
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

type Direzione = 'basso' | 'alto' | 'sinistra' | 'destra' | 'nessuna';

const SPOSTAMENTO: Record<Direzione, [number, number]> = {
  basso: [0, 1],
  alto: [0, -1],
  sinistra: [-1, 0],
  destra: [1, 0],
  nessuna: [0, 0],
};

// Fa entrare il contenuto con una dissolvenza e un piccolo spostamento, dopo `ritardo` fotogrammi.
export const Entrata: React.FC<{
  children: ReactNode;
  ritardo?: number;
  durata?: number;
  da?: Direzione;
  distanza?: number;
  style?: React.CSSProperties;
}> = ({ children, ritardo = 0, durata, da = 'basso', distanza = 60, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fine = ritardo + (durata ?? Math.round(0.6 * fps));
  const [x, y] = SPOSTAMENTO[da];
  const opzioni = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.16, 1, 0.3, 1) } as const;

  return (
    <div
      style={{
        ...style,
        opacity: interpolate(frame, [ritardo, fine], [0, 1], opzioni),
        translate: interpolate(frame, [ritardo, fine], [`${x * distanza}px ${y * distanza}px`, '0px 0px'], opzioni),
      }}
    >
      {children}
    </div>
  );
};
