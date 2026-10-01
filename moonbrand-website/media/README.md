# Le immagini del sito

Il progetto Remotion che produce le immagini dei post di esempio della home, con gli stessi strumenti di moonbrand:
nato dal `video-kit` di moonbrand-ai, foto generate con Gemini come fa `genera_immagine`.

I brand sono inventati, ognuno con lo stile di un'azienda reale del suo settore:
Solco (elettronica minimal, alla Nothing), Pasticceria Aurora (pasticceria storica milanese), Forma Gym (boutique fitness con luci rosse),
Osteria del Porto (trattoria di mare), Studio Riva (studio di design, griglia svizzera), Libreria Nove (libreria indipendente).

## La cartella

- `scripts/foto.mts`: le descrizioni delle foto e la chiamata a Gemini (`gemini-3.1-flash-image`). Salva in `public/foto/`.
- `src/sito/Post.tsx`: i montaggi, foto più testi e grafica nello stile di ogni brand.
- `src/Root.tsx`: una `Still` per immagine.
- `scripts/render.mts`: esporta le Still in `../public/images/` alla misura del sito.

## I comandi

Da questa cartella, dopo `pnpm install`:

- `npx tsx --env-file=../../moonbrand-be/moonbrand-ai/.env scripts/foto.mts [nome...]`: genera le foto che mancano, o quelle passate per nome.
- `npx tsx scripts/render.mts [id...]`: esporta le immagini nel sito.
- `npx remotion studio`: per vedere e ritoccare i montaggi.
