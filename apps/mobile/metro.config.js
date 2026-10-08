const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const racineProjet   = __dirname;
const racineWorkspace = path.resolve(racineProjet, "../..");
// Store virtuel pnpm raccourci (pnpm-workspace.yaml, virtualStoreDir) : posé
// HORS de l'arborescence du monorepo pour rester sous la limite de chemin
// Windows (voir DECISIONS.md).
const storeVirtuelPnpm = "C:/.pnpm-hc";

const config = getDefaultConfig(racineProjet);

// Ne surveiller QUE les packages workspace utilisés par le mobile — pas
// l'intégralité du monorepo (API, desktop, etc.) qui fait observer à Metro
// des milliers de fichiers inutiles et ralentit le démarrage.
config.watchFolders = [
  path.resolve(racineWorkspace, "packages/api-client"),
  path.resolve(racineWorkspace, "packages/types"),
  path.resolve(racineWorkspace, "packages/receipts"),
  path.resolve(racineWorkspace, "packages/sync-engine"),
  path.resolve(racineWorkspace, "packages/database"), // types Prisma partagés
  storeVirtuelPnpm,
];

config.resolver.nodeModulesPaths = [
  path.resolve(racineProjet, "node_modules"),
  path.resolve(racineWorkspace, "node_modules"),
];

// Exclure le code API, desktop et dossiers lourds inutiles au mobile.
config.resolver.blockList = [
  /apps\/api\/.*/,
  /apps\/desktop\/.*/,
  /.*\/__tests__\/.*/,
  /.*\/\.git\/.*/,
  /.*\/dist\/.*/,
];

config.resolver.disableHierarchicalLookup = false;

// inlineRequires : les modules ne sont évalués qu'à leur premier usage —
// nettement plus rapide au démarrage sur les appareils modestes.
config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: false,
    inlineRequires: true,
  },
});

// Utiliser plus de workers CPU pour paralléliser la transformation.
config.maxWorkers = 4;

module.exports = config;
