// Il codice condiviso con lo studio e l'API sta in ../moonbrand-shared: Metro lo legge da lì con l'alias @moonbrand/shared.
// Le date del piano si leggono con una versione che non dipende da Intl (su Hermes i fusi orari non sono garantiti).
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const shared = path.resolve(__dirname, '../moonbrand-shared/src');
const dates = path.resolve(__dirname, 'src/lib/dates.ts');

const config = getDefaultConfig(__dirname);
config.watchFolders = [...(config.watchFolders ?? []), shared];

const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const fromShared = context.originModulePath.startsWith(shared);
  if (moduleName === '@moonbrand/shared/lib/dates' || (fromShared && /(^|\/)lib\/dates$/.test(moduleName))) {
    return { type: 'sourceFile', filePath: dates };
  }
  const target = moduleName.startsWith('@moonbrand/shared/') ? path.join(shared, moduleName.slice('@moonbrand/shared/'.length)) : moduleName;
  return (resolveRequest ?? context.resolveRequest)(context, target, platform);
};

module.exports = config;
