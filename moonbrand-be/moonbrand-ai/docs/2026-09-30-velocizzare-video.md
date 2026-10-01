# Velocizzare le chat con i video: il tentativo del 30 settembre 2026

Un tentativo di rendere più veloci le chat che montano video, senza perdere qualità. È stato fatto nel commit
`76a4343` e annullato in `85a49ef`: qui c'è cosa si è provato, cosa si è misurato e perché si è tornati indietro,
per poterlo riprendere.

## Da dove si partiva

La chat di riferimento è quella del reel del salone (conversazione `e90aca32`, brand `6c77e52a`): 7 messaggi, tre
video allegati, un reel e poi uno spot del prodotto Kérastase Gloss Absolu rifatto in chiave più «instagrammabile».
Per le prove gli stessi 7 messaggi sono stati rimandati in conversazioni nuove dello stesso brand, messi in coda
come fa l'API e uno alla volta, con Higgsfield spento perché il confronto fosse equo e non consumasse crediti.

| Giro | Durata | Costo Claude | Chiamate | Contesto massimo | Lavoro fatto |
| --- | --- | --- | --- | --- | --- |
| 29/09, Opus 5.5, prima di ogni ottimizzazione | 36 min | $7,37 | 86 | 329k token | reel + spot |
| 30/09 mattina, Opus 5.5, con Gemini che guarda e fotogrammi a metà risoluzione | 29,7 min | $4,56 | 51 | 222k | reel + spot + rifacimento |
| 30/09 mattina, Sonnet 5.5, stesse condizioni | 20,7 min | ≈ $2,5 (registrati $4,10, vedi sotto) | 48 | 165k | reel; dello spot solo i copioni |
| 30/09, Opus 5.5 con le modifiche di `76a4343` | 23,8 min | $3,78 | – | – | reel + spot + rifacimento |

Il giro di Sonnet non è confrontabile sullo spot: ha seguito la regola «proponi il copione e aspetta l'ok» e i
messaggi registrati non contengono un «ok, vai». Sul reel, l'unica parte fatta da tutti e due, Sonnet ha speso
circa $1,90 contro $1,69 di Opus e ci ha messo 13,9 minuti contro 5,1: costa la metà a token ma ne ha usati di
più, con molti più giri di controllo. Per questo si è rimasti su Opus.

## Dove andava il tempo

Nel giro di Opus della mattina (29,7 minuti; la somma supera la durata perché alcune chiamate girano in parallelo):

| Voce | Chiamate | Totale | Media |
| --- | --- | --- | --- |
| Claude che pensa e scrive, quasi tutto codice Remotion | – | 12,3 min | – |
| `genera_immagine` (Gemini) | 9 | 7,7 min | 51 s |
| `guarda` (Gemini) | 14 | 6,4 min | 27 s |
| Fotogrammi con `remotion still` | 15 | 6,1 min | 24 s |
| `genera_musica` (Mureka) | 3 | 4,7 min | 93 s |

## Cosa è stato provato (`76a4343`)

Solo interventi che non toccano la qualità; modello, effort, risoluzione delle immagini e modello di Gemini
sono rimasti com'erano.

1. **Tool `fotogrammi`** (`src/tools/fotogrammi.ts`, server MCP `video`): un solo `npx remotion bundle` e un solo
   browser per tutti i fotogrammi di controllo, con `renderStill` di `@remotion/renderer`. 7 fotogrammi in circa
   10 secondi invece di quasi tre minuti; un fotogramma confrontato con quello di `remotion still` è risultato
   identico a vista. Serviva un tool perché `remotion render --frames=0,30,90` con fotogrammi non consecutivi si
   rompe nel mixaggio dell'audio (`inline-audio-mixing.js`, `writeSync` con una posizione negativa: `EINVAL`),
   anche con `--muted`: i file escono ma il comando finisce con codice 1.
2. **Connettori claude.ai spenti nei job**: con il login di un abbonamento Claude Code carica anche i connettori
   dell'account claude.ai. Nei job ne comparivano 10 (Claude Docs, Higgsfield, Atlassian, Excalidraw, Lucid,
   Canva, Google Drive, Google Calendar, Gmail, Gamma); nel giro della mattina Opus ha chiamato
   `mcp__claude_ai_Higgsfield__models_explore`. Il worker impostava `ENABLE_CLAUDEAI_MCP_SERVERS=false`.
3. **Skill video**: tutti i fotogrammi di una revisione a `guarda` in una sola chiamata; le generazioni
   indipendenti (musica, voce, effetti, immagini, clip) nello stesso messaggio, così partono insieme; nei
   ritocchi si tengono musica, voce e immagini già fatte.
4. **Modello per tipo di job**: `CLAUDE_MODEL_<TIPO>` nel `.env` (o `model` nell'input del job), passato agli
   script in `MOONBRAND_MODEL` (`src/lib/model.ts`). Non cambiava niente finché non si impostava.

### Cosa hanno dato

Da 29,7 a 23,8 minuti (−20%) e da $4,56 a $3,78 (−17%) sullo stesso lavoro:

- fotogrammi: 5 chiamate al tool da 12 s invece di 15 render da 24 s;
- musica: 2 brani invece di 3, perché nel rifacimento ha tenuto quello che c'era;
- controlli con `guarda`: 11 invece di 14;
- primo turno più leggero con i connettori spenti ($0,37 invece di $0,44).

Restavano Claude che scrive (10,7 minuti), le immagini Gemini (5 da circa 75 s, in parallelo), i controlli con
`guarda` (11 da circa 25 s) e i render finali.

## Perché è stato annullato

Dopo il rilascio un carosello chiesto in chat («fammi un carosello partendo dall'idea di halloween») ha generato
5 foto con Gemini per 6 slide e fatto 5 controlli con `guarda`, e si è deciso di tornare indietro. Le modifiche di
`76a4343` riguardano i video e non i caroselli: le immagini di un carosello le decide Claude seguendo la skill
contenuti (il carosello della sera prima ne aveva generate 4), quindi il numero di foto va affrontato lì, se si
vuole un limite.

## Cosa resta dopo il revert

Restano attive le modifiche precedenti dello stesso giorno (commit `11a738a`): gli step leggibili con Haiku, il
costo per job con `session_cost_usd`, le generazioni in `ai_usage`, il tool `guarda` con Gemini e i fotogrammi di
controllo a metà risoluzione.

Tornano com'erano:

- **i connettori claude.ai sono di nuovo visibili ai job**, compresi Gmail, Drive e il Higgsfield di claude.ai, sul
  quale i controlli di `src/tools/higgsfield.ts` non valgono (guardano solo il prefisso `mcp__higgsfield__`) e i
  file non si scaricano da soli. Anche solo questo punto andrebbe rimesso;
- i fotogrammi di controllo si esportano di nuovo uno alla volta con `remotion still`.

## Problemi aperti trovati durante le prove

- **Sonnet 5.5 e il costo registrato**: la versione di Claude Code dell'SDK non ha ancora il listino di Sonnet 5.5
  (`costBasis: "unknown"` nel risultato) e lo prezza come Opus 5.5, quindi `cost_usd` dei job su Sonnet è gonfiato.
- **ElevenLabs in `ai_usage`**: la voce risulta a 0 crediti; il contatore dell'account letto prima e dopo la
  chiamata non si aggiorna in tempo. Va letto dallo storico delle generazioni.
- **Le prove si vedono tra loro**: condividono il progetto video del brand, e una prova ha notato la composizione
  dell'altra.

## Idee non provate

- **Componenti pronti nel progetto video** (sottotitoli a tempo, barra dei passi, fasce di testo, palcoscenico del
  prodotto): Claude scriverebbe meno codice, che è la voce più lunga. Da pesare con la regola della skill che ogni
  video sia diverso dagli altri.
- **Fast mode di Opus 5.5**: stesso modello, fino a 2,5 volte più veloce in output, $8/$40 invece di $4/$20. Con un
  abbonamento si paga con gli usage credits e non con i limiti del piano; sull'account oggi è spento
  (`fast_mode_disabled_reason: extra_usage_disabled`). Nell'SDK si attiva con `settings: { fastMode: true }`. Sui
  numeri della prova accorcerebbe solo il tempo di Claude: da circa 30 a circa 24 minuti, a circa il doppio del costo.
- **Musica asincrona**: `genera_musica` che restituisce subito e un secondo passaggio che aspetta il file, così
  Claude scrive il codice mentre Mureka compone.

## Per riprenderlo

`git revert 85a49ef` rimette tutto `76a4343`. Per rimettere solo una parte, i pezzi sono indipendenti: i
connettori sono tre righe all'inizio di `src/worker.ts`, il tool fotogrammi è `src/tools/fotogrammi.ts` più la
registrazione in `src/jobs/chat.ts` e `src/lib/content.ts`, il modello è `src/lib/model.ts` più `modelOf()` nel
worker e `...claudeModel()` nelle cinque `query()`.
