const { withProjectBuildGradle } = require("expo/config-plugins");

/**
 * Dossiers de compilation native courts pour la version publiée (18/10/2026).
 *
 * Chaque module natif compile dans `<module>/android/.cxx/RelWithDebInfo/<hash>/<abi>/`, au fond du store pnpm
 * (C:/.pnpm-hc/<paquet>@<version>_<hash>/node_modules/<paquet>/…). Pour armeabi-v7a, le fichier
 * `../prefab/armeabi-v7a/prefab/lib/arm-linux-androideabi/cmake/ReactAndroid/ReactAndroidConfigVersion.cmake` de
 * react-native-screens atteint 261 caractères : le ninja du SDK (non compatible chemins longs) ne le voit pas et relance CMake
 * en boucle (« manifest 'build.ninja' still dirty after 100 tries »). arm64-v8a passe de justesse (257).
 *
 * Avec `-Photelsaver.cxxCourt=true` (build release, voir AGENTS.md), chaque module compile dans C:/cx/<module> : chemins
 * courts, plus de boucle. Sans l'option rien ne change (le build debug quotidien garde ses dossiers déjà compilés).
 */
const BLOC = `
// Dossiers de compilation native courts (-Photelsaver.cxxCourt=true) : voir apps/mobile/plugins/withCxxCourt.js.
if (findProperty("hotelsaver.cxxCourt") == "true") {
  subprojects { sousProjet ->
    ["com.android.library", "com.android.application"].each { idPlugin ->
      sousProjet.plugins.withId(idPlugin) {
        sousProjet.android.externalNativeBuild.cmake.buildStagingDirectory = new File("C:/cx/" + sousProjet.name)
      }
    }
  }
}
`;

function ajouterCxxCourt(src) {
  if (src.includes("hotelsaver.cxxCourt")) return src;
  // AVANT les « apply plugin » : com.facebook.react.rootproject force l'évaluation des modules (evaluationDependsOn), après
  // quoi Gradle refuse de changer buildStagingDirectory (« It is too late to set buildStagingDirectory »).
  const ancre = src.indexOf('apply plugin: "expo-root-project"');
  if (ancre < 0) return src.replace(/\s*$/, "\n") + BLOC;
  return src.slice(0, ancre) + BLOC.trimStart() + "\n" + src.slice(ancre);
}

module.exports = (config) =>
  withProjectBuildGradle(config, (cfg) => {
    cfg.modResults.contents = ajouterCxxCourt(cfg.modResults.contents);
    return cfg;
  });
module.exports.ajouterCxxCourt = ajouterCxxCourt;
