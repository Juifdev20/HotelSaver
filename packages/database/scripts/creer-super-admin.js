// Crée un compte Super-Admin : compte Supabase Auth + ligne SuperAdmin liée.
// Copie conforme de creer-utilisateur.js (voir ce fichier pour le
// raisonnement) — un Super-Admin est indépendant de tout hôtel, voir
// DECISIONS.md, Phase 3. C'est le seul moyen de créer le tout premier
// compte capable de s'authentifier contre le module Super-Admin
// (POST /super-admin/hotels).
//
// Usage (depuis la racine du dépôt) :
//   MOT_DE_PASSE='...' pnpm --filter database creer-super-admin <email> "<nom>"
// Lit DATABASE_URL (packages/database/.env) et SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY (apps/api/.env). Mot de passe via variable
// d'environnement pour ne pas le laisser dans l'historique des arguments.
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
require("dotenv").config({ path: path.join(__dirname, "..", "..", "..", "apps", "api", ".env") });
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
  // pnpm transmet un "--" littéral s'il est tapé : on l'ignore.
  const [email, nom] = process.argv.slice(2).filter((argument) => argument !== "--");
  const motDePasse = process.env.MOT_DE_PASSE;

  if (!email || !nom || !motDePasse) {
    throw new Error(`Usage : MOT_DE_PASSE='...' pnpm --filter database creer-super-admin <email> "<nom>"`);
  }
  for (const variable of ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!process.env[variable]) throw new Error(`${variable} manquant (voir les .env.example).`);
  }

  const compteAuth = await appelAdmin("POST", "/users", { email, password: motDePasse, email_confirm: true });

  try {
    const superAdmin = await prisma.superAdmin.create({
      data: { nom, actif: true, supabaseAuthId: compteAuth.id },
    });
    console.log(`Compte Super-Admin créé : ${nom} <${email}> (SuperAdmin ${superAdmin.id}).`);
  } catch (erreur) {
    // Ne jamais laisser un compte Supabase orphelin : il pourrait s'authentifier
    // mais serait refusé partout, et bloquerait la réutilisation de l'email.
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
