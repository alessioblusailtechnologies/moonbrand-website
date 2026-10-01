---
name: video
description: Come si fa un video per il brand della cartella (Reels, TikTok, Shorts, video per il feed) con Remotion - copione, stile, animazione, clip, musica, voce e sottotitoli, controllo dei fotogrammi ed esportazione. Da usare ogni volta che si crea o si ritocca un video.
---

# Fare un video

Il brand è descritto in CLAUDE.md. I video si fanno con Remotion nel progetto video del brand, in video/: com'è fatto lo spiega video/README.md. Per scrivere codice Remotion segui la skill moonbrand:remotion-best-practices. In moonbrand però non si apre lo studio di Remotion: il video lo guarda Gemini con il tool guarda, e alla fine si esporta sempre.

## Il copione

Un video nasce in due tempi: prima il copione, che l'utente legge e corregge, poi il video. Non generare immagini, clip o audio finché il copione non è approvato, a meno che il lavoro non dica di andare dritto.

Il copione è l'idea in breve (tono, ritmo, musica, voce) e la lista delle inquadrature, in ordine. Ogni inquadratura ha:
- **durata** in secondi;
- **cosa si vede**: soggetto, tipo di inquadratura (dettaglio, primo piano, mezza figura, totale) e movimento di macchina;
- **da dove viene**: clip generata, foto generata, foto o clip dell'utente, solo grafica e testo;
- **testo a schermo**, se c'è;
- **voce fuori campo**, se c'è.

Scegli la fonte pensando a cosa sembrerà vero: persone, luoghi e lavori del brand rendono meglio con foto e clip dell'utente. Quando le proponi, chi legge il copione sa cosa preparare.

- I primi 1 o 2 secondi devono fermare lo scorrimento: una frase, un numero o un'immagine che fa venire voglia di restare.
- Un'inquadratura porta una sola idea. Il ritmo lo decide l'idea: tagli veloci per un elenco, più respiro per un racconto.
- Molti guardano senza audio: il testo a schermo deve bastare a capire il video. Frasi brevi, grandi, a contrasto, e ferme abbastanza da leggerle con calma.
- La durata è quella che serve all'idea, senza allungare.
- La chiusura lascia il brand riconoscibile, di solito con il logo o un'azione.

Testo a schermo e voce seguono le stesse regole dei testi del brand (skill moonbrand:contenuti): voce del brand, niente fatti, numeri o nomi inventati, segnaposto tra parentesi quadre per quello che non sai.

Quando fai il video, segui il copione approvato: se mentre lo fai serve cambiare qualcosa (una durata, una fonte che manca), cambialo e dillo.

## Formati

| Proporzione | Misure | Dove |
| --- | --- | --- |
| 9:16 | 1080×1920 | Reels di Instagram e Facebook, TikTok, YouTube Shorts |
| 4:5 | 1080×1350 | feed di Instagram, Facebook e LinkedIn |
| 1:1 | 1080×1080 | feed di tutti i canali |
| 16:9 | 1920×1080 | X, LinkedIn, YouTube |

- 30 fotogrammi al secondo.
- In 9:16 i social coprono i bordi con i loro pulsanti e le didascalie: tieni testi e logo lontani da circa 250 px in alto, 400 px in basso e 150 px a destra.
- Se servono più proporzioni, fai una composizione per ciascuna e ripensa l'impaginazione: non ritagliare quella di un'altra.

## Stile

- Lo stile del brand si prende come per le immagini: riferimenti-da-seguire e file-riferimento danno palette, font, tono delle foto e dettagli grafici, da seguire senza ricalcare l'impaginazione. Di solito sono già descritti in CLAUDE.md, sotto «Lo stile».
- video/src/brand.ts raccoglie colori, font e misure del brand per i video: se non c'è, crealo al primo video. I font si caricano con @remotion/google-fonts, oppure con @remotion/fonts dai file in video/public/brand.
- video/src/kit contiene i pezzi riusabili del brand. Usali, migliorali e aggiungi quelli che un video crea e che serviranno ancora, così i video del brand si riconoscono tra loro.
- Guarda le composizioni degli altri video in video/src/contenuti e fai qualcosa di diverso: ogni video deve essere riconoscibile come del brand e diverso dagli altri.
- Il movimento ha un senso: fa entrare le cose nell'ordine in cui vanno lette, mette in risalto il punto importante, dà ritmo. Niente animazioni messe tanto per muovere.

## Immagini e clip

- Foto e clip dell'utente sono in allegati/ o in file-riferimento/: copiale in video/public/contenuti/<id>/ e usale da lì. Quando ci sono, vengono prima di quelle generate.
- Le immagini nuove le generi con genera_immagine, salvandole direttamente in video/public/contenuti/<id>/.
- Le clip in movimento le generi con Higgsfield (i tool mcp__higgsfield__), e usale dove il movimento vero serve davvero:
  - scegli il modello con models_explore (con action «recommend» se non sai quale) in base a quello che serve: realismo, movimento di macchina, durata, proporzione;
  - genera con generate_video, con aspect_ratio della proporzione del video; più clip indipendenti insieme con generate_video_batch;
  - ci vogliono minuti: aspetta con jobs_wait finché ogni clip è finita, e non chiudere il lavoro con una clip ancora in corso;
  - per partire da un'immagine della cartella (per esempio una foto fatta con genera_immagine o una dell'utente): media_upload con il nome del file, carica il file con curl sull'upload_url che ti restituisce, media_confirm, poi passa il media_id a generate_video.
- I file che Higgsfield genera arrivano già scaricati nella cartella di lavoro, e il risultato del tool ti dice dove: copiali in video/public/contenuti/<id>/. Gli indirizzi di Higgsfield scadono, usa sempre i file.
- Con Higgsfield fai le clip; le immagini restano con genera_immagine, la musica con Mureka, voce ed effetti con ElevenLabs.
- Le clip hanno un audio loro: toglilo o abbassalo se c'è già musica o voce.
- Per controllare una clip, o per capire una clip o un video dell’utente, passali interi al tool guarda: li guarda con l’audio e ti dice cosa succede e quando. Un fotogramma estrailo solo quando ti serve come immagine (per esempio una copertina): ffmpeg è in video/node_modules/@remotion/compositor-* ed è ridotto, senza filtri, quindi un fotogramma alla volta (`ffmpeg -ss <secondo> -i clip.mp4 -frames:v 1 f.jpg`).

## Audio

Non puoi ascoltare niente di quello che generi: descrivi tutto con precisione e controlla i tempi sui file.

- **Musica**: genera_musica (Mureka) compone un brano strumentale. Descrivi in inglese genere, atmosfera, strumenti, tempo e andamento, in accordo con la voce del brand. La durata la sceglie Mureka: nel video prendi la parte che serve, chiudila con una dissolvenza negli ultimi secondi e abbassala sotto la voce.
- **Canzone o jingle**: quando il video chiede una parte cantata, genera_canzone (Mureka) la compone sul testo che scrivi tu. Il testo segue la voce del brand, con le sezioni [Verse], [Chorus], [Bridge] e [Outro]; lo stile si descrive in inglese, con la voce che serve. Con una canzone, le parole cantate importanti vanno anche a schermo.
- **Voce fuori campo**: scegli la voce con cerca_voci partendo dalla voce del brand, poi salvane l'id in video/src/brand.ts. Se c'è già, usa quella: il brand parla sempre con la stessa voce. Il testo lo leggi con genera_voce. Scrivilo come si pronuncia e segui la voce del brand come per i testi.
- **Sottotitoli**: genera_voce salva accanto all'audio un .json con i tempi di ogni parola nel formato di @remotion/captions. Usalo per i sottotitoli (vedi le captions in moonbrand:remotion-best-practices) e per mettere a tempo scene e testi sulla voce. Con la voce, i sottotitoli ci vogliono sempre.
- **Parole di una canzone o di un audio che non hai fatto con genera_voce**: i tempi li trova tempi_parole, che separa la voce dalla musica e allinea il testo a quello che si sente, parola per parola. Passagli il testo esatto quando lo conosci; Mureka a volte ripete o allunga le strofe, quindi se non sei sicuro lascialo vuoto e il tool trascrive (e ti dice cosa ha sentito). Con da e a lavora solo sul pezzo del brano che usi. Non stimare i tempi a orecchio e non trascrivere per conto tuo con altri programmi: le parole che si accendono fuori tempo si notano subito.
- **Effetti**: genera_effetto per transizioni, colpi e ambienti, descritti in inglese. Pochi e al servizio del ritmo.

## Controllo

Non puoi guardare il video mentre scorre: lo guarda per te Gemini, con il tool guarda, e ti risponde a parole. Fagli sempre una lista precisa di cosa controllare.

- Mentre lavori, esporta in PNG il primo e l'ultimo fotogramma e, per ogni scena, quello in cui il testo è tutto visibile, a metà risoluzione (`--scale=0.5`), e passali a guarda: testo leggibile, niente tagli o sovrapposizioni, margini rispettati, colori del brand, nessun fotogramma vuoto per errore. Quando ritocchi una scena, riesporta e ricontrolla solo quella.
- Apri tu un fotogramma solo quando devi correggere un'impaginazione e la descrizione non basta: ogni immagine che apri resta nella conversazione fino alla fine.
- Correggi e riesporta finché è tutto a posto; lancia anche `pnpm check` per i tipi.
- Poi esporta il video finale in MP4 e passalo intero a guarda: oltre ai controlli di sopra, che testi e scene restino a schermo abbastanza da leggerli, che musica, voce ed effetti partano a tempo con le scene, che i sottotitoli seguano la voce, che i volumi siano giusti e che il finale si chiuda bene. Correggi quello che segnala, riesporta e ricontrolla.
- Esporta anche una copertina in JPEG o PNG, scegliendo il fotogramma che meglio rappresenta il video. Video finale e copertina a risoluzione piena, senza `--scale`.

## Dove vanno i file

<id> è l'id del contenuto; in chat, finché il video non è salvato, un nome breve e unico.

- La composizione in video/src/contenuti/<id>/, registrata in video/src/Root.tsx.
- Musica, immagini e clip in video/public/contenuti/<id>/.
- I fotogrammi di controllo, il video finale e la copertina nella cartella indicata dal lavoro.
