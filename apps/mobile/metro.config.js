// Metro (le bundler React Native) en monorepo pnpm — configuration standard
// recommandée par Expo (https://docs.expo.dev/guides/monorepos/), nécessaire
// pour résoudre @hotel-chicago/types et @hotel-chicago/api-client, qui vivent
// hors de apps/mobile.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const racineProjet = __dirname;
const racineWorkspace = path.resolve(racineProjet, "../..");
// Store virtuel pnpm raccourci (pnpm-workspace.yaml, virtualStoreDir) : posé
// HORS de l'arborescence du monorepo pour rester sous la limite de chemin
// Windows (voir DECISIONS.md). Metro ne suit les symlinks vers des fichiers
// EN DEHORS de ses `watchFolders` que si ce dossier y est explicitement
// ajouté — sinon "Unable to resolve" pour tout paquet qui y pointe (dont
// "expo" lui-même).
const storeVirtuelPnpm = "C:/.pnpm-hc";

const config = getDefaultConfig(racineProjet);

config.watchFolders = [racineWorkspace, storeVirtuelPnpm];
config.resolver.nodeModulesPaths = [
  path.resolve(racineProjet, "node_modules"),
  path.resolve(racineWorkspace, "node_modules"),
];
// La recette standard d'Expo pour les monorepos désactive la recherche
// hiérarchique (`disableHierarchicalLookup = true`) — mais elle suppose un
// node_modules à plat façon npm/yarn. pnpm garde, pour chaque paquet, son
// PROPRE node_modules avec exactement ses dépendances directes (ex.
// `expo-modules-core` n'existe QUE dans le node_modules propre à `expo`,
// jamais à la racine) : désactiver la recherche hiérarchique empêchait Metro
// de le trouver ("Unable to resolve module expo-modules-core from
// .../node_modules/expo/src/Expo.ts"). La recherche hiérarchique classique
// (comportement par défaut de Metro/Node) reste donc active ; `watchFolders`
// ci-dessus (qui inclut désormais le store pnpm) est ce qui manquait
// réellement pour que Metro sache que ces fichiers existent.
config.resolver.disableHierarchicalLookup = false;

// inlineRequires : les modules ne sont évalués qu'à leur premier usage —
// nettement plus rapide au démarrage sur les appareils modestes.
config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: false,
    inlineRequires: true,
  },
});

module.exports = config;
