/**
 * Captures de la page de paiement du site (/payer), dans le navigateur d'un téléphone (390 × 844, ×2).
 *   patron-hote.sh demarrer ; node patron-serveur-web.cjs <dossier du site compilé> 40020 ; GUIDE_PORT_BASE=40000 node patron-web.cjs
 */
const O = require("./patron-outils.cjs");

(async () => {
  const nav = await O.navigateur();
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "fr-FR", timezoneId: "Africa/Lubumbashi" });
  const page = await ctx.newPage();
  await page.goto("http://127.0.0.1:40020/payer");
  await page.waitForTimeout(2500);
  await O.photo(page, "patron-90-web-connexion");
  const c = "patron-90-web-connexion";
  await O.mes(page, c, "telephone", page.getByPlaceholder("970 000 000"));
  await O.mes(page, c, "motdepasse", page.locator("#payer-mdp"));
  await O.mes(page, c, "continuer", page.getByRole("button", { name: "Continuer" }));
  await page.getByPlaceholder("970 000 000").fill("970000001");
  await page.locator("#payer-mdp").fill("motdepasse-test");
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.waitForTimeout(4500);
  await O.photo(page, "patron-91-web-formules");
  await O.mes(page, "patron-91-web-formules", "etat", page.getByText("Abonnement actif").first());
  const defile = async (nom, loc, d = 130) => { await loc.first().scrollIntoViewIfNeeded(); await page.evaluate((x) => window.scrollBy(0, -x), d); await page.waitForTimeout(600); await O.photo(page, nom); };
  await defile("patron-92-web-formules", page.getByText("Choisissez votre formule"));
  await O.mes(page, "patron-92-web-formules", "titre", page.getByText("Choisissez votre formule"));
  await defile("patron-93-web-duree", page.getByText("Pour combien de temps ?"));
  await O.mes(page, "patron-93-web-duree", "titre", page.getByText("Pour combien de temps ?"));
  await O.mes(page, "patron-93-web-duree", "monnaie", page.getByText("Dans quelle monnaie ?"));
  await defile("patron-94-web-reseau", page.getByText("Votre réseau Mobile Money"));
  await O.mes(page, "patron-94-web-reseau", "reseau", page.getByText("Votre réseau Mobile Money"));
  await O.mes(page, "patron-94-web-reseau", "numero", page.locator("input[type=tel]"));
  await page.locator("input[type=tel]").fill("0828497218");
  await defile("patron-95-web-recap", page.getByText("Récapitulatif"), 130);
  await O.mes(page, "patron-95-web-recap", "recap", page.getByText("Récapitulatif"));
  await O.mes(page, "patron-95-web-recap", "payer", page.getByRole("button", { name: /^Payer/ }));
  await nav.close();
})().catch((e) => { console.error(e); process.exit(1); });
