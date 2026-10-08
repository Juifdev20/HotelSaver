/* Migration ponctuelle : Produit.portionsDisponibles (portions d'un plat,
 * null = illimité). Pooler session Supabase — migrate deploy n'y passe pas. */
require("dotenv").config();
const { Client } = require("pg");

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query(`ALTER TABLE "Produit" ADD COLUMN IF NOT EXISTS "portionsDisponibles" INTEGER`);
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'Produit' AND column_name = 'portionsDisponibles'`
  );
  console.log("portionsDisponibles:", rows.length === 1 ? "créée" : "ABSENTE");
  await client.end();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
