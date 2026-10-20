/**
 * Captures du chapitre commun (installation, connexion). Il faut :
 *  - l'hôte de démonstration (outils/hote.sh) : GUIDE_PORT_BASE=… ;
 *  - le site compilé et servi sur le port 4398 :
 *      cd apps/web && VITE_API_URL=http://127.0.0.1:<API> ./node_modules/.bin/vite build --outDir dist-guide
 *      ./node_modules/.bin/vite preview --outDir dist-guide --port 4398
 */
const L = require("../outils/lib.cjs");
const SITE = "http://127.0.0.1:4398/";

(async () => {
  const nav = await L.navigateur();

  // ---- Le site public : accueil sur téléphone et sur ordinateur
  const tel = await nav.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "fr-FR" });
  const p1 = await tel.newPage();
  await p1.goto(SITE);
  await p1.waitForTimeout(3000);
  await L.photo(p1, "commun-site-mobile-haut");
  await p1.mouse.wheel(0, 380);
  await p1.waitForTimeout(1200);
  await L.photo(p1, "commun-site-mobile-boutons");
  console.log("MOBILE\n" + (await L.inventaire(p1)).filter((x) => /Android|Windows|Play|Store/.test(x)).join("\n"));

  const pc = await nav.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, locale: "fr-FR" });
  const p2 = await pc.newPage();
  await p2.goto(SITE);
  await p2.waitForTimeout(3000);
  await L.photo(p2, "commun-site-bureau");

  // ---- Connexion
  const ctx = await L.contexte(nav);
  const page = await ctx.newPage();
  await page.goto(L.HOTE.site);
  await page.waitForTimeout(2000);
  await L.photo(page, "commun-connexion");
  await page.getByLabel("Mot de passe").fill("monmotdepasse");
  await page.getByRole("button", { name: /Afficher la saisie/ }).click().catch(() => {});
  await page.waitForTimeout(400);
  await L.photo(page, "commun-connexion-mdp-visible");
  await page.getByRole("button", { name: "Mot de passe oublié ?" }).click();
  await page.waitForTimeout(900);
  await L.photo(page, "commun-oubli");
  await page.getByRole("button", { name: /Retour à la connexion/ }).click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: /Ancien compte/ }).click();
  await page.waitForTimeout(500);
  await L.photo(page, "commun-connexion-email");
  await page.getByLabel("Adresse e-mail").fill("gl-recep@exemple.test");
  await page.getByLabel("Mot de passe").fill("mauvais");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForTimeout(2500);
  await L.photo(page, "commun-connexion-erreur");
  await nav.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
