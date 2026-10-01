---
name: piano
description: Come si pianificano le uscite del brand della cartella - ritmo, giorni e orari per canale, equilibrio dei temi, idee e contenuti nel calendario, spostare e togliere uscite. Da usare ogni volta che si legge, si propone o si cambia il piano.
---

# Pianificare le uscite

Il piano è il calendario del brand nella sezione Piano. Ogni uscita è un contenuto in un giorno e a un’ora, su uno o più canali (un’ora sola per tutti). Le uscite dei prossimi 14 giorni sono in CLAUDE.md; per altri periodi usa piano_leggi.

## Cosa può avere un’uscita

- **niente** (empty, da riempire): c’è solo il tema che il piano chiede;
- **un’idea** tenuta (toPrepare, da preparare): il contenuto si fa dopo;
- **un contenuto**: in bozza (toApprove, da approvare) o approvato (scheduled, programmata). Passata l’ora, un’uscita programmata risulta pubblicata (published): la pubblicazione vera non c’è ancora, è l’utente a pubblicare.

Un contenuto sta in una sola uscita; un’uscita ha al massimo un contenuto.

## Il ritmo e i giorni

- Il ritmo è quello del brand (uscite a settimana, in CLAUDE.md): conta i contenuti, non i canali. Un post su LinkedIn e Instagram insieme è un’uscita.
- Non mettere due uscite nello stesso giorno se non te lo chiedono.
- Giorni e ore che funzionano, finché non avremo le statistiche dei canali: LinkedIn martedì-giovedì alle 8:30, Instagram lunedì, mercoledì, venerdì e sabato alle 18:30, Facebook martedì, giovedì e sabato alle 13:00, TikTok martedì, giovedì, sabato e domenica alle 19:00, X da lunedì a venerdì alle 9:00. Un’uscita su più canali prende l’ora del canale principale.
- Tieni conto di ricorrenze, eventi e milestone del brand: un contenuto legato a una data esce prima della data, non dopo.

## L’equilibrio

- I temi escono in proporzione al loro peso, alternati: mai lo stesso tema due volte di fila se c’è altro da mettere.
- Riempi le uscite con le idee tenute dello stesso tema; se per un tema non ce ne sono, lascia l’uscita vuota con il tema e dillo, invece di forzare un’idea di un altro tema.
- Un’idea sta nel piano una volta sola.

## Come si lavora

- Per le prossime settimane parti da piano_proponi: applica già ritmo, giorni, orari, temi e idee. Ritocca la proposta con quello che sai (date importanti, richieste dell’utente) e mostrala in breve prima di crearla, a meno che l’utente non ti abbia chiesto di farlo e basta.
- Crea le uscite con uscite_crea, tutte insieme; sposta con uscita_cambia e togli con uscita_togli. Per ogni uscita toccata, di’ giorno, ora e canali.
- Per preparare il contenuto di un’uscita segui la skill moonbrand:contenuti, sui canali dell’uscita, e salvalo con contenuto_salva passando il suo slotId.
- Per programmare un contenuto già salvato: uscite_crea con il suo contentId, o uscita_cambia se è già nel piano.
- Date e ore sono di Roma, da adesso in poi: il passato non si pianifica.
