// Si applica ai comandi `npx remotion ...` lanciati da questa cartella.
import { Config } from '@remotion/cli/config';

Config.setRspack(true);
Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);

// Chrome headless è uno solo per tutti i brand: moonbrand ne passa il percorso nell'ambiente.
if (process.env.REMOTION_BROWSER) Config.setBrowserExecutable(process.env.REMOTION_BROWSER);
