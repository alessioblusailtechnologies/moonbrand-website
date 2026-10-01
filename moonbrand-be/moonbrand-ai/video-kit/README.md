# Il progetto video del brand

Il progetto Remotion di questo brand: i video sono pagine React che cambiano fotogramma per fotogramma. È nato da un progetto di partenza uguale per tutti ed è del brand: cambialo, allargalo, aggiungi librerie (`pnpm add <libreria>` in questa cartella).

## La cartella

- `src/Root.tsx`: registra le composizioni, una per video e per proporzione.
- `src/brand.ts`: colori, font, misure e voce fuori campo del brand per i video. Se non c'è ancora, crealo al primo video partendo dai riferimenti del brand.
- `src/kit/`: i pezzi riusabili del brand (entrate, titoli, logo animato, sottotitoli, transizioni…). Si parte da pochi pezzi generici: migliorali e aggiungine quando un video ne crea uno che servirà ancora.
- `src/contenuti/<id>/`: la composizione di ogni video.
- `public/brand/`: logo e file del brand usati nei video.
- `public/contenuti/<id>/`: musica, voce, clip e immagini di ogni video, da usare con `staticFile('contenuti/<id>/…')`.

## I comandi

Da questa cartella:

- `npx remotion still <composizione> <file.png> --frame=<n> --scale=0.5`: un fotogramma a metà risoluzione, per controllare il video.
- `npx remotion render <composizione> <cartella> --frames=0,30,90 --image-format=png --scale=0.5`: più fotogrammi in una volta sola, salvati nella cartella.
- `npx remotion render <composizione> <file.mp4>`: il video finale in MP4.
- `pnpm check`: controlla i tipi.

Per salvare fuori da questa cartella (fotogrammi, video finale) usa percorsi assoluti: con quelli relativi che contengono `..` Remotion può sbagliare cartella.
