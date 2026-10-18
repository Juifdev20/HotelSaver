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
//      l’ancien apply-rls.js), puis l'enregistre avec le checksum SHA-256 du fichier,
//      exactement comme Prisma, pour que `prisma migrate status` et
//      `migrate dev` (via une connexion directe, un jour) la reconnaissent.
//
// Usage :  node scripts/appliquer-migrations.js            # applique (projet Test, voir cible.js)
//          node scripts/appliquer-migrations.js --verifier  # liste seulement
//          node scripts/appliquer-migrations.js --prod --oui-prod  # projet Prod
//
// Ne remplace pas `prisma migrate dev` pour CRÉER une migration : celui-ci
// reste à faire contre une base locale/direct (le fichier SQL généré est
// ensuite commité et appliqué ici).
require("./cible.js").chargerCible({ lectureSeule: process.argv.includes("--verifier") });
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const DOSSIER_MIGRATIONS = path.join(__dirname, "..", "prisma", "migrations");
const verifierSeulement = process.argv.includes("--verifier");
// --marquer <nom> : enregistre une migration comme appliquée SANS l'exécuter (équivalent de `prisma migrate resolve --applied`),
// seulement après avoir vérifié à la main que ses objets existent déjà et sont identiques à ceux de Test (voir DECISIONS.md, 18/10/2026).
const indexMarquer = process.argv.indexOf("--marquer");
const aMarquer = indexMarquer >= 0 ? process.argv[indexMarquer + 1] : null;

function nouveauClient() {
  return new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 30_000 });
}

/** La migration est-elle enregistrée et terminée ? Lu sur une connexion NEUVE (l'ancienne a pu être coupée). */
async function migrationEnregistree(nom) {
  const c = nouveauClient();
  await c.connect();
  try {
    const { rows } = await c.query('SELECT 1 FROM "_prisma_migrations" WHERE migration_name = $1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL', [nom]);
    return rows.length > 0;
  } finally {
    await c.end();
  }
}

async function marquer(nom) {
  const m = lireMigrationsLocales().find((x) => x.nom === nom);
  if (!m) throw new Error(`Migration inconnue : ${nom} (dossier absent de prisma/migrations).`);
  const c = nouveauClient();
  await c.connect();
  try {
    const { rows } = await c.query('SELECT 1 FROM "_prisma_migrations" WHERE migration_name = $1', [nom]);
    if (rows.length > 0) return console.log(`Déjà enregistrée : ${nom}`);
    await c.query(
      'INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at, finished_at, applied_steps_count, logs) VALUES ($1, $2, $3, now(), now(), 1, $4)',
      [crypto.randomUUID(), m.checksum, nom, "Marquée appliquée à la main (--marquer) : objets déjà présents, vérifiés."],
    );
    console.log(`Enregistrée comme appliquée : ${nom}`);
  } finally {
    await c.end();
  }
}

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
  if (indexMarquer >= 0) {
    if (!aMarquer) throw new Error("Usage : --marquer <nom de la migration>");
    return marquer(aMarquer);
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
      // UN SEUL message (protocole simple) : BEGIN, trace, SQL, fin de trace, COMMIT. Avant (18/10/2026), cinq messages séparés
      // à travers le pooler : une coupure réseau entre deux d'entre eux a laissé en Prod les objets créés SANS la trace. Ainsi,
      // objets et trace existent ensemble ou pas du tout. id / checksum / nom ne contiennent que [0-9a-z_-] : rien à échapper.
      if (!/^[0-9a-z_-]+$/i.test(m.nom)) throw new Error(`Nom de migration inattendu : ${m.nom}`);
      const tout =
        `BEGIN;\n` +
        `INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at) VALUES ('${id}', '${m.checksum}', '${m.nom}', now());\n` +
        `${m.sql}\n;\n` +
        `UPDATE "_prisma_migrations" SET finished_at = now(), applied_steps_count = 1 WHERE id = '${id}';\n` +
        `COMMIT;`;
      try {
        await client.query(tout);
        console.log(`  OK : ${m.nom}`);
      } catch (erreur) {
        await client.query("ROLLBACK").catch(() => undefined);
        // Coupure APRÈS le COMMIT côté serveur : la réponse s'est perdue mais tout est appliqué. On relit (nouvelle connexion).
        const appliquee = await migrationEnregistree(m.nom).catch(() => null);
        if (appliquee) {
          console.log(`  OK (confirmé après coupure de la réponse) : ${m.nom}`);
          continue;
        }
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
