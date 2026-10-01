import { Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

// Un numero che sale da `da` ad `a` tra `ritardo` e `ritardo + durata` fotogrammi, scritto all'italiana (1.250,5).
export const Contatore: React.FC<{
  a: number;
  da?: number;
  ritardo?: number;
  durata?: number;
  decimali?: number;
  prima?: string;
  dopo?: string;
  style?: React.CSSProperties;
}> = ({ a, da = 0, ritardo = 0, durata, decimali = 0, prima = '', dopo = '', style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const valore = interpolate(frame, [ritardo, ritardo + (durata ?? 1.5 * fps)], [da, a], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const testo = valore.toLocaleString('it-IT', { minimumFractionDigits: decimali, maximumFractionDigits: decimali, useGrouping: 'always' });

  // Cifre a larghezza fissa: il numero non balla mentre sale.
  return <span style={{ fontVariantNumeric: 'tabular-nums', ...style }}>{`${prima}${testo}${dopo}`}</span>;
};
