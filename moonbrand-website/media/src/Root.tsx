import { Still } from 'remotion';

import {
  FormaSlide,
  FormaTikTok,
  LibreriaSlide,
  OsteriaReel,
  RivaCase,
  SolcoCountdown,
  SolcoDentro,
  SolcoPost,
  SolcoStory,
  SolcoSuono,
  SoloFoto,
} from './sito/Post';

// Le immagini dei post di esempio del sito: una Still per post, esportata da scripts/render.mts.
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Still id="solco-buds" component={SolcoPost} width={1080} height={1350} />
      <Still id="solco-colori" component={SolcoStory} width={1080} height={1920} />
      <Still id="aurora-torta" component={SoloFoto} defaultProps={{ nome: 'aurora-torta' }} width={1080} height={1350} />
      <Still id="aurora-laboratorio" component={SoloFoto} defaultProps={{ nome: 'aurora-laboratorio' }} width={1080} height={1350} />
      <Still id="forma-slide" component={FormaSlide} width={1080} height={1080} />
      <Still id="forma-stacco" component={FormaTikTok} width={1080} height={1920} />
      <Still id="osteria-pescato" component={OsteriaReel} width={1080} height={1920} />
      <Still id="riva-case" component={RivaCase} width={1200} height={628} />
      <Still id="libreria-libri" component={LibreriaSlide} width={1080} height={1350} />
      <Still id="solco-dentro" component={SolcoDentro} width={1080} height={1350} />
      <Still id="solco-suono" component={SolcoSuono} width={1080} height={1080} />
      <Still id="solco-countdown" component={SolcoCountdown} width={1080} height={1350} />
      <Still id="solco-team" component={SoloFoto} defaultProps={{ nome: 'solco-team' }} width={1080} height={1080} />
      <Still id="social-manager" component={SoloFoto} defaultProps={{ nome: 'social-manager' }} width={900} height={1200} />
    </>
  );
};
