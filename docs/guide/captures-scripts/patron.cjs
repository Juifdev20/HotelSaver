/**
 * Captures du guide « patron » — partie 1 : inscription, connexion, mot de passe oublié, accueil, paramètres, équipe.
 *   patron-hote.sh demarrer && GUIDE_PORT_BASE=40000 node docs/guide/captures-scripts/patron.cjs [partie…]
 * Parties : inscription, accueil, reglages, equipe (toutes par défaut). Les autres parties sont dans patron-*.cjs.
 */
const O = require("./patron-outils.cjs");

const demandees = process.argv.slice(2);
const veut = (nom) => demandees.length === 0 || demandees.includes(nom);
const ok = (nom) => console.log("  ✓", nom);

async function inscription(nav) {
  // Conditions d'utilisation : le texte réel de l'installateur (version 1), comme sur le serveur de production.
  const texte = require("node:fs").readFileSync(require("node:path").join(__dirname, "../../../apps/desktop/resources/conditions.txt"), "utf8").replace(/'/g, "''");
  O.sql(`insert into "ConditionsUtilisation"(id, version, texte, "publieLe") select gen_random_uuid()::text, 1, '${texte}', now() where not exists (select 1 from "ConditionsUtilisation" where version = 1)`);

  const ctx = await O.contexte(nav);
  const page = await O.pageConnexion(ctx);
  await O.photo(page, "patron-01-connexion"); ok("connexion");

  await page.getByRole("button", { name: "Créez votre hôtel" }).click();
  await page.waitForTimeout(1200);
  await page.getByLabel("Nom de l'hôtel *").fill("Hôtel Le Grand Bleu");
  await page.getByLabel("Adresse (optionnelle)").fill("Avenue de la Paix, Goma");
  await page.getByLabel("Adresse (optionnelle)").blur();
  await O.photo(page, "patron-02-inscription-1"); ok("inscription 1");

  await page.getByRole("button", { name: "Continuer" }).click();
  await page.waitForTimeout(800);
  await page.getByLabel("Votre nom *").fill("Jean Mukendi");
  await page.getByPlaceholder("970 000 000").fill("970123456");
  await page.getByLabel("Mot de passe *", { exact: true }).fill("motdepasse-test");
  await page.getByLabel("Confirmer le mot de passe *").fill("motdepasse-test");
  await O.photo(page, "patron-03-inscription-2", { fullPage: true }); ok("inscription 2");

  await page.getByRole("button", { name: "conditions d'utilisation" }).click();
  await page.waitForTimeout(1000);
  await O.photo(page, "patron-04-conditions"); ok("conditions");
  await page.getByRole("button", { name: "J'accepte" }).click();
  await page.waitForTimeout(500);
  await page.getByText("Payer mon abonnement maintenant").scrollIntoViewIfNeeded();
  await O.photo(page, "patron-05-inscription-fin"); ok("inscription fin");
  await ctx.close();

  // Mot de passe oublié
  const c2 = await O.contexte(nav);
  const p2 = await O.pageConnexion(c2);
  await p2.getByRole("button", { name: "Mot de passe oublié ?" }).click();
  await p2.waitForTimeout(800);
  await p2.getByPlaceholder("970 000 000").fill("970000001");
  await O.photo(p2, "patron-06-oubli"); ok("oubli");
  await p2.getByRole("button", { name: "Continuer" }).click();
  await p2.waitForTimeout(1500);
  await O.photo(p2, "patron-07-oubli-envoye"); ok("oubli envoyé");
  await c2.close();
}

(async () => {
  const nav = await O.navigateur();
  try {
    if (veut("inscription")) { console.log("inscription"); await inscription(nav); }
  } finally {
    await nav.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
