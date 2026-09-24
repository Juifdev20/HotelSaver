// Applique prisma/rls-policies.sql à l'instance Supabase de production.
// Prisma ne gère pas la RLS/les triggers nativement (voir DECISIONS.md) :
// ce script exécute le fichier SQL tel quel via `pg`, qui envoie le script
// entier au serveur en une fois (protocole "simple query"), ce qui permet
// les blocs de fonction PL/pgSQL délimités par $$ ... $$ sans les découper
// nous-mêmes sur les points-virgules.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

async function main() {
  const sqlPath = path.join(__dirname, "..", "prisma", "rls-policies.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL manquant — copier .env.example en .env dans packages/database.");
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log(`Connecté. Application de ${sqlPath}...`);

  try {
    await client.query(sql);
    console.log("Policies RLS et triggers appliqués avec succès.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Échec de l'application des policies RLS :", err.message);
  process.exit(1);
});
