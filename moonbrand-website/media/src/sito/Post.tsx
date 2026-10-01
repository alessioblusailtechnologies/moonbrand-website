// I post di esempio della home del sito: foto di Gemini (scripts/foto.mts) montate con testi e grafica, come fa moonbrand.
// Ogni brand è inventato ma prende lo stile di un'azienda reale del suo settore.
import { loadFont as loadCaveat } from '@remotion/google-fonts/Caveat';
import { loadFont as loadDoto } from '@remotion/google-fonts/Doto';
import { loadFont as loadFraunces } from '@remotion/google-fonts/Fraunces';
import { loadFont as loadInterTight } from '@remotion/google-fonts/InterTight';
import { AbsoluteFill, Img, staticFile } from 'remotion';

const doto = loadDoto('normal', { weights: ['400', '700', '900'], subsets: ['latin'] }).fontFamily;
const inter = loadInterTight('normal', { weights: ['400', '500', '700', '800', '900'], subsets: ['latin'] }).fontFamily;
const fraunces = loadFraunces('normal', { weights: ['400', '600'], subsets: ['latin'] }).fontFamily;
const caveat = loadCaveat('normal', { weights: ['700'], subsets: ['latin'] }).fontFamily;

const Foto: React.FC<{ nome: string; style?: React.CSSProperties }> = ({ nome, style }) => (
  <Img src={staticFile(`foto/${nome}.jpg`)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', ...style }} />
);

/** Solo la foto, per i post dove parla l'immagine. */
export const SoloFoto: React.FC<{ nome: string }> = ({ nome }) => (
  <AbsoluteFill>
    <Foto nome={nome} />
  </AbsoluteFill>
);

// Solco: elettronica minimal, stile Nothing. Tipografia a puntini, un solo rosso.
const SOLCO_RED = '#E5322D';

export const SolcoPost: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: inter, color: '#111' }}>
    <Foto nome="solco-buds" />
    <div style={{ position: 'absolute', top: 76, left: 76, right: 76, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <span style={{ fontFamily: doto, fontWeight: 900, fontSize: 132, lineHeight: 0.9, letterSpacing: '-0.02em' }}>BUDS (2)</span>
        <span style={{ fontSize: 34, fontWeight: 500, color: '#555' }}>Trasparenti per scelta.</span>
      </div>
      <span style={{ width: 28, height: 28, borderRadius: '50%', background: SOLCO_RED, marginTop: 14 }} />
    </div>
    <div style={{ position: 'absolute', left: 76, right: 76, bottom: 64, display: 'flex', justifyContent: 'space-between', fontFamily: doto, fontWeight: 700, fontSize: 38 }}>
      <span>DAL 14.10</span>
      <span>SOLCO</span>
    </div>
  </AbsoluteFill>
);

export const SolcoStory: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: inter, color: '#111' }}>
    <Foto nome="solco-colori" />
    <div style={{ position: 'absolute', top: 250, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
      <span style={{ fontFamily: doto, fontWeight: 900, fontSize: 124, lineHeight: 0.9 }}>(2) COLORI</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 36, fontWeight: 500, color: '#444' }}>
        <span style={{ width: 16, height: 16, borderRadius: '50%', background: SOLCO_RED }} />
        Buds 2 · dal 14 ottobre
      </span>
    </div>
  </AbsoluteFill>
);

// I contenuti di Solco che si vedono nello studio, nella griglia dei Contenuti.
export const SolcoDentro: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: inter, color: '#111' }}>
    <Foto nome="solco-dentro" />
    <div style={{ position: 'absolute', top: 76, left: 76, right: 76, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <span style={{ fontFamily: doto, fontWeight: 900, fontSize: 132, lineHeight: 0.9 }}>DENTRO (2)</span>
        <span style={{ fontSize: 34, fontWeight: 500, color: '#555' }}>23 pezzi. Nessuno di troppo.</span>
      </div>
      <span style={{ width: 28, height: 28, borderRadius: '50%', background: SOLCO_RED, marginTop: 14 }} />
    </div>
  </AbsoluteFill>
);

/** L'onda sonora a puntini: colonne di punti, più alte al centro. */
export const SolcoSuono: React.FC = () => {
  const colonne = 23;
  return (
    <AbsoluteFill style={{ fontFamily: inter, background: '#0E0E0E', color: '#F2F2F0', padding: 84, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: doto, fontWeight: 700, fontSize: 34 }}>
        <span>SUONO (2)</span>
        <span style={{ color: SOLCO_RED }}>●</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 380 }}>
        {Array.from({ length: colonne }, (_, i) => {
          const centro = 1 - Math.abs(i - (colonne - 1) / 2) / ((colonne - 1) / 2);
          const punti = Math.max(1, Math.round(2 + 13 * centro * (0.6 + 0.4 * Math.abs(Math.sin(i * 1.7)))));
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Array.from({ length: punti }, (_, j) => (
                <span key={j} style={{ width: 14, height: 14, borderRadius: '50%', background: i === 11 && j === 0 ? SOLCO_RED : '#F2F2F0' }} />
              ))}
            </div>
          );
        })}
      </div>
      <span style={{ fontSize: 64, fontWeight: 500, lineHeight: 1.05, letterSpacing: '-0.03em' }}>
        Il suono, spiegato
        <br />
        senza tecnicismi.
      </span>
    </AbsoluteFill>
  );
};

export const SolcoCountdown: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: inter, background: '#EDEDEB', color: '#111', padding: 84, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: doto, fontWeight: 700, fontSize: 36 }}>
      <span>BUDS (2)</span>
      <span>14.10</span>
    </div>
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 36 }}>
      <span style={{ fontFamily: doto, fontWeight: 400, fontSize: 560, lineHeight: 0.8 }}>3</span>
      <span style={{ display: 'flex', alignItems: 'flex-end', gap: 14, fontFamily: doto, fontWeight: 900, fontSize: 96, lineHeight: 1, paddingBottom: 24 }}>
        GIORNI
        <span style={{ width: 22, height: 22, borderRadius: '50%', background: SOLCO_RED, marginBottom: 10 }} />
      </span>
    </div>
    <span style={{ fontSize: 34, fontWeight: 500, color: '#555' }}>Il conto alla rovescia è iniziato.</span>
  </AbsoluteFill>
);

// Forma Gym: boutique fitness al buio, luci rosse, stile Barry's.
const FORMA_RED = '#FF2D2D';

export const FormaSlide: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: inter, color: '#fff', background: '#000' }}>
    <Foto nome="forma-alba" />
    <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.15) 60%, rgba(0,0,0,0.5) 100%)' }} />
    <div style={{ position: 'absolute', top: 84, left: 84, display: 'flex', flexDirection: 'column', fontWeight: 900, fontSize: 118, lineHeight: 0.9, letterSpacing: '-0.035em', textTransform: 'uppercase' }}>
      <span>Alle 7</span>
      <span>la città</span>
      <span>dorme.</span>
      <span style={{ color: FORMA_RED, marginTop: 18 }}>Tu no.</span>
    </div>
    <div style={{ position: 'absolute', left: 84, right: 84, bottom: 72, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 28, fontWeight: 700 }}>
      <span style={{ letterSpacing: '0.35em' }}>FORMA</span>
      <span style={{ fontWeight: 500 }}>Scorri →</span>
    </div>
  </AbsoluteFill>
);

/** Il testo sovrimpresso alla maniera di TikTok: righe su fondo bianco. */
export const FormaTikTok: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: inter }}>
    <Foto nome="forma-stacco" />
    <div style={{ position: 'absolute', top: 560, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
      {['POV: sono le 7:00', 'e sei già qui'].map((riga) => (
        <span key={riga} style={{ background: '#fff', color: '#111', fontWeight: 700, fontSize: 60, lineHeight: 1.25, padding: '4px 22px', borderRadius: 14 }}>
          {riga}
        </span>
      ))}
    </div>
  </AbsoluteFill>
);

// Osteria del Porto: trattoria di mare, scritta a mano come la lavagna del giorno.
export const OsteriaReel: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: inter, color: '#fff' }}>
    <Foto nome="osteria-pescato" />
    <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 40%)' }} />
    <div style={{ position: 'absolute', top: 260, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, textShadow: '0 4px 24px rgba(0,0,0,0.45)' }}>
      <span style={{ fontFamily: caveat, fontWeight: 700, fontSize: 168, lineHeight: 0.85, textAlign: 'center', transform: 'rotate(-3deg)' }}>
        Il pescato
        <br />
        di oggi
      </span>
      <span style={{ fontSize: 38, fontWeight: 500 }}>scelto da Franco, alle 6:00</span>
    </div>
  </AbsoluteFill>
);

// Studio Riva: studio di design, griglia svizzera e un solo colore pieno, stile Pentagram.
const toni = ['Diretto', 'Caldo', 'Ironico', 'Tecnico', 'Gentile', 'Schietto', 'Energico', 'Curioso', 'Essenziale', 'Chiaro'];

export const RivaCase: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: inter, background: '#F2F1ED', color: '#111', padding: 56, display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 48 }}>
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Case study — 04</span>
      <span style={{ fontSize: 118, fontWeight: 800, lineHeight: 0.88, letterSpacing: '-0.045em' }}>
        10 clienti.
        <br />
        10 voci.
      </span>
      <span style={{ fontSize: 22, fontWeight: 500, color: '#555' }}>Come teniamo separato il tono di ognuno.</span>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderLeft: '2px solid #111', paddingLeft: 40 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {toni.map((tono, i) => (
          <span
            key={tono}
            style={{
              fontSize: 26,
              fontWeight: 600,
              padding: '10px 18px',
              borderRadius: 999,
              border: '2px solid #111',
              background: i === 3 ? '#FF4A1C' : 'transparent',
              borderColor: i === 3 ? '#FF4A1C' : '#111',
              color: i === 3 ? '#fff' : '#111',
            }}
          >
            {tono}
          </span>
        ))}
      </div>
      <span style={{ alignSelf: 'flex-end', fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em' }}>Studio Riva</span>
    </div>
  </AbsoluteFill>
);

// Libreria Nove: libreria indipendente, serif caldo e carta.
// Il testo sta su una fascia color carta, come il biglietto dei consigli in libreria: la foto resta pulita, sotto.
const CARTA = '#F4ECDF';
const INCHIOSTRO = '#2A1E14';
const TERRACOTTA = '#B4553A';

export const LibreriaSlide: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: inter, color: INCHIOSTRO, background: CARTA }}>
    <div style={{ height: 520, padding: '76px 84px 0', display: 'flex', flexDirection: 'column', gap: 30 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 24, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
        <span>Libreria Nove</span>
        <span style={{ color: TERRACOTTA }}>Consigli di settembre</span>
      </div>
      <div style={{ height: 2, background: INCHIOSTRO }} />
      <span style={{ fontFamily: fraunces, fontSize: 82, fontWeight: 600, lineHeight: 1.02, letterSpacing: '-0.02em' }}>
        Tre libri per chi ha finito le vacanze,{' '}
        <em style={{ fontWeight: 400, color: TERRACOTTA }}>ma non la voglia di partire.</em>
      </span>
    </div>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 520 }}>
      <Foto nome="libreria-libri" style={{ objectPosition: '50% 78%' }} />
    </div>
  </AbsoluteFill>
);
