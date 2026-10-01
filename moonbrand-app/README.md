# Moonbrand (app)

L'app Android di Moonbrand: quello che fa lo studio, dal telefono. Expo SDK 57, Expo Router, React Native 0.86.

- **Idee**: le proposte si decidono con lo swipe (destra salva, sinistra scarta, con Annulla); le salvate vanno nel piano o diventano un contenuto in chat.
- **Assistente**: saluto e spunti del giorno, conversazioni con i passaggi in diretta, foto allegate, i contenuti salvati nel turno.
- **Contenuti**: anteprima per canale, testo da copiare o correggere, approva/riapri, programma nel piano, ritocchi, canali, copione e video.
- **Piano**: la settimana giorno per giorno, le uscite da creare/spostare/togliere, «Da programmare» e la proposta delle prossime settimane.
- **Altro**: profilo del brand (chi, obiettivo, canali, temi), conversazioni, nuovo brand, account.

Parla con la stessa API dello studio (`moonbrand-be/moonbrand-api`) e usa il codice di `moonbrand-shared` tramite l'alias `@moonbrand/shared` (vedi `metro.config.js`). Il server si cambia dalla schermata di accesso; di default è `http://45.14.185.228:3012`.

## Sviluppo

```bash
npm install
npx tsc --noEmit
npx expo run:android        # build di sviluppo su un telefono collegato
```

## APK

```bash
npx expo prebuild --platform android --clean
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
# android/app/build/outputs/apk/release/app-release.apk
```

La cartella `android/` si rigenera (è in `.gitignore`): la configurazione nativa sta in `app.json`. L'APK di prova è firmato con la chiave di debug.
