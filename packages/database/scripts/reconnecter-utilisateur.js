// Recrée le compte Supabase Auth d'un utilisateur existant et le relie à sa
// ligne Utilisateur déjà en base (par id), sans toucher à son nom/rôle/id.
// Cas d'usage : mot de passe oublié, ou compte Supabase Auth supprimé par
// erreur — voir DECISIONS.md (incident du 25/09/2026). Contrairement à
// creer-utilisateur.js, ne crée PAS de nouvelle ligne Utilisateur.
//
// Usage (depuis la racine du dépôt) :
//   MOT_DE_PASSE='...' pnpm --filter database reconnecter-utilisateur <email> <idUtilisateur>
//
// Note (25/09/2026) : le pooler Supabase en mode session (port 5432, celui
// utilisé normalement par DATABASE_URL — voir DECISIONS.md) ne répond plus
// depuis un incident côté Supabase sans rapport avec l'app (TCP s'établit
// mais aucune réponse au protocole Postgres ; le pooler en mode transaction,
// port 6543, répond normalement). Ce script bascule donc temporairement sur
// le port 6543 pour cette seule opération. À enlever une fois le pooler en
// mode session de nouveau opérationnel (revérifier avant de l'enlever).
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
require("dotenv").config({ path: path.join(__dirname, "..", "..", "..", "apps", "api", ".env") });
if (process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.DATABASE_URL.replace(":5432/", ":6543/");
}
const { prisma } = require("../dist/index.js");

async function appelAdmin(methode, chemin, corps) {
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const reponse = await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin${chemin}`, {
    method: methode,
    headers: { apikey: cle, Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  const json = await reponse.json().catch(() => ({}));
  if (!reponse.ok) {
    throw new Error(`Supabase Auth a refusé (${reponse.status}) : ${json.msg || json.message || JSON.stringify(json)}`);
  }
  return json;
}

async function main() {
  const [email, idUtilisateur] = process.argv.slice(2).filter((argument) => argument !== "--");
  const motDePasse = process.env.MOT_DE_PASSE;

  if (!email || !idUtilisateur || !motDePasse) {
    throw new Error("Usage : MOT_DE_PASSE='...' pnpm --filter database reconnecter-utilisateur <email> <idUtilisateur>");
  }
  for (const variable of ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!process.env[variable]) throw new Error(`${variable} manquant (voir les .env.example).`);
  }

  const utilisateurExistant = await prisma.utilisateur.findUnique({ where: { id: idUtilisateur } });
  if (!utilisateurExistant) {
    throw new Error(`Aucune ligne Utilisateur avec l'id ${idUtilisateur}.`);
  }

  const compteAuth = await appelAdmin("POST", "/users", { email, password: motDePasse, email_confirm: true });

  try {
    const utilisateur = await prisma.utilisateur.update({
      where: { id: idUtilisateur },
      data: { supabaseAuthId: compteAuth.id },
    });
    console.log(
      `Reconnecté : ${utilisateur.nom} <${email}> — rôle ${utilisateur.role} (Utilisateur ${utilisateur.id}, ` +
        `nouveau supabaseAuthId ${compteAuth.id}).`
    );
  } catch (erreur) {
    // Même filet de sécurité que creer-utilisateur.js : jamais de compte
    // Supabase orphelin si le lien en base échoue.
    await appelAdmin("DELETE", `/users/${compteAuth.id}`);
    throw erreur;
  }
}

main()
  .catch((erreur) => {
    console.error(`Échec : ${erreur.message.trim()}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
