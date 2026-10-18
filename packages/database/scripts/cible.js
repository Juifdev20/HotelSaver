// Choix du projet Supabase visé par les scripts de ce dossier (17/10/2026, voir DECISIONS.md).
//
// Deux projets : « Hotelsaver Test » (développement, par défaut) et « Hotelsaver Prod » (version publiée). Chacun a son
// fichier, jamais commité : packages/database/.env.test et packages/database/.env.prod (modèle : .env.example), avec
// DATABASE_URL (pooler, port 6543), SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY.
//
//   node scripts/…                        (projet Test, par défaut)
//   node scripts/… --prod --oui-prod      (projet Prod : exige cette confirmation explicite)
//   CIBLE=prod … marche aussi (bash) ; --prod est là pour les scripts pnpm, que Windows lance via cmd.
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const CIBLES = ["test", "prod"];

/** Charge `.env.<cible>` dans process.env (écrase toute valeur déjà présente) et renvoie la cible.
 * `lectureSeule` : un simple contrôle (migrate:verifier) sur Prod n'exige pas --oui-prod. */
function chargerCible(options) {
  try {
    return charger(options);
  } catch (erreur) {
    console.error(`\nÉchec : ${erreur.message}`);
    process.exit(1);
  }
}

function charger({ lectureSeule = false } = {}) {
  const cible = process.argv.includes("--prod") ? "prod" : (process.env.CIBLE || "test").toLowerCase();
  if (!CIBLES.includes(cible)) throw new Error(`CIBLE inconnue « ${cible} » : test ou prod.`);

  const fichier = path.join(__dirname, "..", `.env.${cible}`);
  if (!fs.existsSync(fichier)) {
    throw new Error(`${fichier} absent — copier .env.example en .env.${cible} et le remplir avec les valeurs du projet Hotelsaver ${cible === "prod" ? "Prod" : "Test"}.`);
  }
  const valeurs = dotenv.parse(fs.readFileSync(fichier));
  for (const variable of ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!valeurs[variable]) throw new Error(`${variable} manquant dans .env.${cible}.`);
  }

  // Garde-fou : la base et l'URL Supabase doivent être du MÊME projet (utilisateur du pooler = postgres.<ref>).
  const ref = new URL(valeurs.SUPABASE_URL).hostname.split(".")[0];
  if (!valeurs.DATABASE_URL.includes(ref)) {
    throw new Error(`.env.${cible} incohérent : DATABASE_URL ne vise pas le projet ${ref} de SUPABASE_URL.`);
  }

  if (cible === "prod" && !lectureSeule && !process.argv.includes("--oui-prod")) {
    throw new Error(`Cible PROD (projet ${ref}) : relancer avec --oui-prod pour confirmer (pnpm … -- --oui-prod).`);
  }

  Object.assign(process.env, valeurs);
  console.log(`Projet visé : ${cible.toUpperCase()} (${ref})\n`);
  return cible;
}

module.exports = { chargerCible };
