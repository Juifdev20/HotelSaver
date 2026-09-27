// Équivalent de `prisma migrate deploy` pour une base atteinte via le pooler
// Supabase en mode transaction (port 6543).
//
// Pourquoi : le moteur de migration Prisma (v5 comme v7) échoue à travers ce
// pooler (P1017 « Server has closed the connection » en v5, « Schema engine
// error » en v7) — il a besoin d'une session stable (verrou advisory de
// session) que le mode transaction ne garantit pas. La connexion directe
// (db.<ref>.supabase.co) n'est qu'en IPv6, inaccessible depuis Kasindi, et le
// pooler en mode session (5432) ne répond pas (voir DECISIONS.md, 25 et
// 27/09/2026). Ce script reproduit ce que fait `migrate deploy` :
//   1. lit prisma/migrations/*/migration.sql dans l'ordre lexicographique ;
//   2. saute celles déjà présentes dans _prisma_migrations (terminées et non
//      annulées) ; refuse de continuer si une entrée est en échec ;
//   3. applique chaque SQL manquant dans une transaction, sur UNE connexion
//      `pg` (protocole simple : tout le fichier en un seul appel, comme
//      apply-rls.js), puis l'enregistre avec le checksum SHA-256 du fichier,
//      exactement comme Prisma, pour que `prisma migrate status` et
//      `migrate dev` (via une connexion directe, un jour) la reconnaissent.
//
// Usage :  node scripts/appliquer-migrations.js            # applique
//          node scripts/appliquer-migrations.js --verifier  # liste seulement
//
// Ne remplace pas `prisma migrate dev` pour CRÉER une migration : celui-ci
// reste à faire contre une base locale/direct (le fichier SQL généré est
// ensuite commité et appliqué ici).
require("dotenv").config();
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const DOSSIER_MIGRATIONS = path.join(__dirname, "..", "prisma", "migrations");
const verifierSeulement = process.argv.includes("--verifier");

function lireMigrationsLocales() {
  return fs
    .readdirSync(DOSSIER_MIGRATIONS, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .map((nom) => {
      const chemin = path.join(DOSSIER_MIGRATIONS, nom, "migration.sql");
      const sql = fs.readFileSync(chemin, "utf8");
      return { nom, sql, checksum: crypto.createHash("sha256").update(sql).digest("hex") };
    });
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL manquant — copier .env.example en .env dans packages/database.");
  }

  const locales = lireMigrationsLocales();
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    // Même DDL que Prisma (migration-engine) pour une base vierge.
    await client.query(`
      CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
        "id"                  VARCHAR(36) PRIMARY KEY NOT NULL,
        "checksum"            VARCHAR(64) NOT NULL,
        "finished_at"         TIMESTAMPTZ,
        "migration_name"      VARCHAR(255) NOT NULL,
        "logs"                TEXT,
        "rolled_back_at"      TIMESTAMPTZ,
        "started_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
        "applied_steps_count" INTEGER NOT NULL DEFAULT 0
      )`);

    const { rows } = await client.query(
      'SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at',
    );
    const appliquees = new Map(rows.map((r) => [r.migration_name, r]));

    const enEchec = rows.filter((r) => !r.finished_at && !r.rolled_back_at);
    if (enEchec.length > 0) {
      throw new Error(
        `Migration(s) en échec dans _prisma_migrations : ${enEchec.map((r) => r.migration_name).join(", ")}. ` +
          "À corriger à la main (marquer rolled_back_at ou finished_at) avant de continuer.",
      );
    }

    const aAppliquer = [];
    for (const m of locales) {
      const distante = appliquees.get(m.nom);
      if (!distante || distante.rolled_back_at) {
        aAppliquer.push(m);
        console.log(`  À appliquer : ${m.nom}`);
      } else if (distante.checksum !== m.checksum) {
        console.warn(`  ATTENTION : ${m.nom} déjà appliquée mais le fichier local a changé (checksum différent).`);
      } else {
        console.log(`  Déjà appliquée : ${m.nom}`);
      }
    }

    if (aAppliquer.length === 0) {
      console.log("\nBase à jour : aucune migration à appliquer.");
      return;
    }
    if (verifierSeulement) {
      console.log(`\n${aAppliquer.length} migration(s) en attente (mode --verifier, rien appliqué).`);
      return;
    }

    for (const m of aAppliquer) {
      console.log(`\nApplication de ${m.nom}...`);
      const id = crypto.randomUUID();
      await client.query("BEGIN");
      try {
        await client.query(
          'INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at) VALUES ($1, $2, $3, now())',
          [id, m.checksum, m.nom],
        );
        await client.query(m.sql);
        await client.query(
          'UPDATE "_prisma_migrations" SET finished_at = now(), applied_steps_count = 1 WHERE id = $1',
          [id],
        );
        await client.query("COMMIT");
        console.log(`  OK : ${m.nom}`);
      } catch (erreur) {
        await client.query("ROLLBACK");
        throw new Error(`Échec de ${m.nom} (transaction annulée, rien d'enregistré) : ${erreur.message}`);
      }
    }
    console.log(`\n${aAppliquer.length} migration(s) appliquée(s).`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("\nÉchec :", err.message);
  process.exit(1);
});
