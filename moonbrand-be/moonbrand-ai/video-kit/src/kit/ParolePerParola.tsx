import { Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

// Una frase che compare una parola alla volta, a partire da `ritardo`, con `passo` fotogrammi tra una parola e l'altra.
// `evidenzia`: le parole (così come sono scritte nel testo) da mostrare con `stileEvidenza`.
export const ParolePerParola: React.FC<{
  testo: string;
  ritardo?: number;
  passo?: number;
  evidenzia?: string[];
  style?: React.CSSProperties;
  stileEvidenza?: React.CSSProperties;
}> = ({ testo, ritardo = 0, passo, evidenzia = [], style, stileEvidenza }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const intervallo = passo ?? Math.round(0.12 * fps);
  const durata = Math.round(0.4 * fps);

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: '0.28em', ...style }}>
      {testo.split(/\s+/).map((parola, indice) => {
        const inizio = ritardo + indice * intervallo;
        const opzioni = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.16, 1, 0.3, 1) } as const;
        return (
          <span
            key={indice}
            style={{
              display: 'inline-block',
              opacity: interpolate(frame, [inizio, inizio + durata], [0, 1], opzioni),
              translate: interpolate(frame, [inizio, inizio + durata], ['0px 0.4em', '0px 0em'], opzioni),
              ...(evidenzia.includes(parola) ? stileEvidenza : undefined),
            }}
          >
            {parola}
          </span>
        );
      })}
    </div>
  );
};
