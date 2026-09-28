// Crée un compte du personnel : compte Supabase Auth + ligne Utilisateur liée.
// Les deux sont nécessaires pour se connecter (Supabase authentifie, notre
// table Utilisateur porte le rôle métier — voir SupabaseAuthGuard). Aucun
// écran de gestion des comptes n'existe encore : c'est le moyen de créer le
// premier compte PATRON.
//
// Usage (depuis la racine du dépôt) :
//   MOT_DE_PASSE='...' pnpm --filter database creer-utilisateur <email> "<nom>" <ROLE> <hotelId>
// ROLE : PATRON | RECEPTIONNISTE | CAFETARIA
// hotelId : id du Hotel auquel rattacher ce compte (voir `Hotel.id`, table
// créée en Phase 1 — utiliser `POST /super-admin/hotels` pour un nouvel
// hôtel, Phase 3). Argument obligatoire depuis que `Utilisateur.hotelId`
// n'a plus de valeur par défaut en base (Phase 2, DECISIONS.md).
// Lit DATABASE_URL (packages/database/.env) et SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY (apps/api/.env). Mot de passe via variable
// d'environnement pour ne pas le laisser dans l'historique des arguments.
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
require("dotenv").config({ path: path.join(__dirname, "..", "..", "..", "apps", "api", ".env") });
const { prisma } = require("../dist/index.js");

const ROLES = ["PATRON", "RECEPTIONNISTE", "CAFETARIA"];

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
  const [email, nom, role, hotelId] = process.argv.slice(2).filter((argument) => argument !== "--");
  const motDePasse = process.env.MOT_DE_PASSE;

  if (!email || !nom || !ROLES.includes(role) || !hotelId || !motDePasse) {
    throw new Error(
      `Usage : MOT_DE_PASSE='...' pnpm --filter database creer-utilisateur <email> "<nom>" <${ROLES.join("|")}> <hotelId>`
    );
  }
  for (const variable of ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!process.env[variable]) throw new Error(`${variable} manquant (voir les .env.example).`);
  }

  const compteAuth = await appelAdmin("POST", "/users", { email, password: motDePasse, email_confirm: true });

  try {
    const utilisateur = await prisma.utilisateur.create({
      data: { nom, role, actif: true, supabaseAuthId: compteAuth.id, hotelId, email },
    });
    console.log(`Compte créé : ${nom} <${email}> — rôle ${role} (Utilisateur ${utilisateur.id}).`);
  } catch (erreur) {
    // Ne jamais laisser un compte Supabase sans rôle : il pourrait s'authentifier
    // mais serait refusé partout, et bloquerait la réutilisation de l'email.
    await appelAdmin("DELETE", `/users/${compteAuth.id}`);
    throw erreur;
  }
}

main()
  .catch((erreur) => {
    // Les erreurs Prisma commencent par un saut de ligne : sans trim(), le
    // message affiché était vide (constaté en testant le retour arrière).
    console.error(`Échec : ${erreur.message.trim()}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
