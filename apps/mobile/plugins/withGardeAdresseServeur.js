const { withAppBuildGradle } = require("expo/config-plugins");

/**
 * Garde de la version publiée (26/10/2026) : un APK « release » construit SANS l'adresse https du serveur (`EXPO_PUBLIC_API_URL`)
 * cherche le serveur sur le téléphone lui-même (localhost) et reste « Hors ligne » pour toujours, sans que rien ne le dise.
 * Cette garde fait échouer `assembleRelease` / `bundleRelease` avec un message clair AVANT de construire. L'adresse est lue, comme le
 * fait Expo, dans la variable d'environnement puis dans apps/mobile/.env(.production)(.local).
 *
 * Le dossier android/ est regénéré par Expo (prebuild) et ignoré par Git : ce plugin l'écrit à chaque prebuild, et
 * `scripts/appliquer-garde-apk.js` (`pnpm --filter mobile garde-apk`) l'ajoute à un dossier android/ déjà généré.
 */
const MARQUEUR = "// GARDE ADRESSE SERVEUR";

const GARDE = `
${MARQUEUR} (voir plugins/withGardeAdresseServeur.js)
gradle.taskGraph.whenReady { graphe ->
    def construitUneRelease = graphe.allTasks.any { t ->
        (t.name.startsWith("assemble") || t.name.startsWith("bundle")) && t.name.endsWith("Release")
    }
    if (construitUneRelease) {
        def adresse = System.getenv("EXPO_PUBLIC_API_URL") ?: ""
        if (adresse.isEmpty()) {
            [".env.production.local", ".env.local", ".env.production", ".env"].each { nom ->
                def fichier = rootProject.file("../" + nom)
                if (adresse.isEmpty() && fichier.exists()) {
                    fichier.eachLine { ligne ->
                        def m = ligne.trim() =~ /^EXPO_PUBLIC_API_URL\\s*=\\s*["']?([^"'\\s#]+)/
                        if (m.find()) adresse = m.group(1)
                    }
                }
            }
        }
        if (!adresse.startsWith("https://")) {
            throw new GradleException(
                "ARRÊT : EXPO_PUBLIC_API_URL n'est pas défini en https:// (valeur lue : '" + adresse + "'). " +
                "Sans elle, l'application publiée cherche le serveur sur le téléphone et reste « Hors ligne ». " +
                "Définissez-la puis recommencez, par exemple : \\$env:EXPO_PUBLIC_API_URL='https://hotelsaver-api.onrender.com' " +
                "(avec aussi EXPO_PUBLIC_SITE_URL, EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_ANON_KEY — voir AGENTS.md)."
            )
        }
    }
}
`;

/** Transformation pure du build.gradle (réutilisée pour mettre à jour un dossier android/ déjà généré). */
function ajouterGarde(src) {
  if (src.includes(MARQUEUR)) return src;
  return `${src.trimEnd()}\n${GARDE}`;
}

module.exports = (config) =>
  withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = ajouterGarde(cfg.modResults.contents);
    return cfg;
  });
module.exports.ajouterGarde = ajouterGarde;
