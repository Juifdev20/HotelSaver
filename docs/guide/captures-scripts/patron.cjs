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
  await O.mes(page, "patron-01-connexion", "telephone", page.getByPlaceholder("970 000 000"));
  await O.mes(page, "patron-01-connexion", "motdepasse", page.getByPlaceholder("Votre mot de passe"));
  await O.mes(page, "patron-01-connexion", "connecter", page.getByRole("button", { name: "Se connecter", exact: true }));
  await O.mes(page, "patron-01-connexion", "creer", page.getByRole("button", { name: "Créez votre hôtel" }));
  await O.mes(page, "patron-01-connexion", "oubli", page.getByRole("button", { name: "Mot de passe oublié ?" }));

  await page.getByRole("button", { name: "Créez votre hôtel" }).click();
  await page.waitForTimeout(1200);
  await page.getByLabel("Nom de l'hôtel *").fill("Hôtel Le Grand Bleu");
  await page.getByLabel("Adresse (optionnelle)").fill("Avenue de la Paix, Goma");
  await page.getByLabel("Adresse (optionnelle)").blur();
  await O.photo(page, "patron-02-inscription-1"); ok("inscription 1");
  await O.mes(page, "patron-02-inscription-1", "nom", page.getByLabel("Nom de l'hôtel *"));
  await O.mes(page, "patron-02-inscription-1", "sousdomaine", page.getByLabel("Sous-domaine *"));
  await O.mes(page, "patron-02-inscription-1", "adresse", page.getByLabel("Adresse (optionnelle)"));
  await O.mes(page, "patron-02-inscription-1", "continuer", page.getByRole("button", { name: "Continuer" }));

  await page.getByRole("button", { name: "Continuer" }).click();
  await page.waitForTimeout(800);
  await page.getByLabel("Votre nom *").fill("Jean Mukendi");
  await page.getByPlaceholder("970 000 000").fill("970123456");
  await page.getByLabel("Mot de passe *", { exact: true }).fill("motdepasse-test");
  await page.getByLabel("Confirmer le mot de passe *").fill("motdepasse-test");
  await O.photo(page, "patron-03-inscription-2", { fullPage: true }); ok("inscription 2");
  const c3 = "patron-03-inscription-2";
  const pl = { complet: true };
  await O.mes(page, c3, "nom", page.getByLabel("Votre nom *"), pl);
  await O.mes(page, c3, "telephone", page.getByPlaceholder("970 000 000"), pl);
  await O.mes(page, c3, "mdp", page.getByLabel("Mot de passe *", { exact: true }), pl);
  await O.mes(page, c3, "confirmation", page.getByLabel("Confirmer le mot de passe *"), pl);
  await O.mes(page, c3, "demarrage", page.locator("fieldset.hc-auth__demarrage"), pl);
  await O.mes(page, c3, "essai", page.getByText("Essai gratuit").first(), pl);
  await O.mes(page, c3, "conditions", page.locator("label.hc-auth__conditions"), pl);
  await O.mes(page, c3, "creer", page.getByRole("button", { name: "Créer mon compte" }), pl);

  await page.getByRole("button", { name: "conditions d'utilisation" }).click();
  await page.waitForTimeout(1000);
  await O.photo(page, "patron-04-conditions"); ok("conditions");
  await O.mes(page, "patron-04-conditions", "accepte", page.getByRole("button", { name: "J'accepte" }));
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
  await O.mes(p2, "patron-06-oubli", "telephone", p2.getByPlaceholder("970 000 000"));
  await O.mes(p2, "patron-06-oubli", "continuer", p2.getByRole("button", { name: "Continuer" }));
  await p2.getByRole("button", { name: "Continuer" }).click();
  await p2.waitForTimeout(1500);
  await O.photo(p2, "patron-07-oubli-envoye"); ok("oubli envoyé");
  await O.mes(p2, "patron-07-oubli-envoye", "retour", p2.getByRole("button", { name: "Retour à la connexion" }));
  await c2.close();
}


async function accueil(nav) {
  const hotel = O.sql(`select id from "Hotel" limit 1`);
  const notif = (type, titre, corps, lien, minutes) =>
    O.sql(`insert into "Notification"(id,"hotelId",type,titre,corps,roles,lien,"createdAt") values (gen_random_uuid()::text,'${hotel}','${type}','${titre.replace(/'/g, "''")}','${corps.replace(/'/g, "''")}','{PATRON}','${lien}', now() - interval '${minutes} minutes')`);
  O.sql(`delete from "Notification"`);
  notif("STOCK_BAS", "Stock bas", "Fanta 33 cl : plus que 4 en stock", '{"ecran":"stock"}', 25);
  notif("ARRIVEES_DU_JOUR", "Aujourd'hui à l'hôtel", "1 arrivée aujourd'hui", '{"ecran":"arrivees-departs"}', 190);
  notif("RECAP_QUOTIDIEN", "Récap du jour", "Recette : 153.00 $ · 0 FC", '{"ecran":"tableau-de-bord"}', 600);

  const ctx = await O.contexte(nav);
  const page = await O.ouvrirSession(ctx, "patron");
  await O.photo(page, "patron-10-accueil");
  const c = "patron-10-accueil";
  await O.mes(page, c, "menu", page.getByRole("button", { name: "Ouvrir le menu" }));
  await O.mes(page, c, "synchro", page.getByTestId("indicateur-synchro"));
  await O.mes(page, c, "cloche", page.getByRole("button", { name: /^Notifications/ }));
  await O.mes(page, c, "bonjour", page.getByTestId("accueil-mobile"));
  await O.mes(page, c, "hero", page.locator(".hero"));
  await O.mes(page, c, "dollars", page.locator(".grille-stats > *").nth(0));
  await O.mes(page, c, "francs", page.locator(".grille-stats > *").nth(1));
  await O.mes(page, c, "barre", page.getByRole("navigation", { name: "Navigation rapide" }));
  ok("accueil");

  await page.evaluate(() => window.scrollTo(0, 520));
  await O.photo(page, "patron-11-accueil-milieu");
  const c2 = "patron-11-accueil-milieu";
  await O.mes(page, c2, "occupation", page.locator(".carte-simple--occupation"));
  await O.mes(page, c2, "repartition", page.locator(".carte-simple", { hasText: "Répartition des chambres" }));
  await O.mes(page, c2, "stock", page.locator(".carte-simple", { hasText: "Stock bas" }).first());
  ok("accueil milieu");
  await page.evaluate(() => window.scrollTo(0, 100000));
  await O.photo(page, "patron-12-accueil-bas");
  const c3 = "patron-12-accueil-bas";
  await O.mes(page, c3, "activite", page.locator(".carte-simple", { hasText: "Activité récente" }));
  ok("accueil bas");
  await O.haut(page);

  await page.getByRole("button", { name: /^Notifications/ }).click();
  await page.waitForTimeout(800);
  await O.photo(page, "patron-13-notifications");
  await O.mes(page, "patron-13-notifications", "panneau", page.locator("#panneau-notifications"));
  ok("notifications");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  await page.getByTestId("indicateur-synchro").click();
  await page.waitForTimeout(1500);
  await O.photo(page, "patron-14-synchronisation", { fullPage: true });
  ok("synchronisation");

  // Tiroir « Plus » (thème sombre : le tiroir clair de l'application bureau est peu lisible) — écarté du guide, gardé pour contrôle.
  await ctx.close();
}

async function reglages(nav) {
  const ctx = await O.contexte(nav);
  const page = await O.ouvrirSession(ctx, "patron");
  page.on("dialog", (d) => d.accept());
  await O.aller(page, "Paramètres");
  await O.photo(page, "patron-20-parametres");
  await O.photo(page, "patron-20b-parametres-long", { fullPage: true });
  ok("paramètres");
  const section = (t) => page.locator(".carte-formulaire", { hasText: t }).first();
  const bloc = async (nom, titre, decalage = 120) => {
    await section(titre).scrollIntoViewIfNeeded();
    await page.evaluate((d) => window.scrollBy(0, -d), decalage);
    await page.waitForTimeout(400);
    await O.photo(page, nom);
  };
  await bloc("patron-21-securite", "Sécurité");
  await bloc("patron-22-administration", "Administration", 100);
  await O.mes(page, "patron-22-administration", "bloc", section("Administration"));
  ok("blocs");
  // Taux de change : en bas du bloc Administration.
  const champTaux = page.getByLabel("Nouveau taux USD/CDF");
  await champTaux.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 250));
  await page.waitForTimeout(400);
  await O.photo(page, "patron-23-taux");
  await champTaux.fill("2800");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).first().click();
  await page.waitForTimeout(1500);
  await O.photo(page, "patron-24-taux-enregistre");
  await O.mes(page, "patron-24-taux-enregistre", "champ", champTaux);
  ok("taux");

  // Imprimante
  await O.haut(page);
  await section("Impression").scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "Configurer" }).click();
  await page.waitForTimeout(1500);
  await O.photo(page, "patron-25-imprimante", { fullPage: true });
  ok("imprimante");

  // Paiement en ligne des acomptes (faux ScanLinkPay : SLP-000482 = « Hôtel Grand Lac SARL »)
  await O.aller(page, "Paramètres");
  await section("Paiement en ligne des acomptes").scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -100));
  await page.waitForTimeout(500);
  await O.photo(page, "patron-26-paiement-en-ligne");
  await page.getByPlaceholder("SLP-…").fill("SLP-000482");
  await page.getByRole("button", { name: "Vérifier et enregistrer" }).click();
  await page.waitForTimeout(2000);
  await page.getByLabel(/Pourcentage demandé/).fill("20");
  await page.getByPlaceholder(/Annulation gratuite/).fill("Annulation gratuite jusqu'à 48 h avant l'arrivée. Après, l'acompte est conservé.");
  await page.waitForTimeout(500);
  await section("Paiement en ligne des acomptes").scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -100));
  await page.waitForTimeout(400);
  await O.photo(page, "patron-27-paiement-compte");
  await O.mes(page, "patron-27-paiement-compte", "numero", page.getByPlaceholder("SLP-…"));
  await O.mes(page, "patron-27-paiement-compte", "verifier", page.getByRole("button", { name: "Vérifier et enregistrer" }));
  await O.mes(page, "patron-27-paiement-compte", "trouve", page.getByTestId("scanlinkpay-compte-trouve"));
  await page.getByLabel(/Pourcentage demandé/).scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -200));
  await page.waitForTimeout(400);
  await O.photo(page, "patron-28-paiement-acompte");
  await O.mes(page, "patron-28-paiement-acompte", "pourcentage", page.getByLabel(/Pourcentage demandé/));
  await O.mes(page, "patron-28-paiement-acompte", "exemple", page.getByTestId("acompte-exemple"));
  await page.getByRole("button", { name: "Enregistrer les réglages" }).scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "Enregistrer les réglages" }).click();
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.scrollBy(0, -150));
  await page.waitForTimeout(400);
  await O.photo(page, "patron-29-paiement-enregistre");
  await O.mes(page, "patron-29-paiement-enregistre", "bouton", page.getByRole("button", { name: "Enregistrer les réglages" }));
  await O.mes(page, "patron-29-paiement-enregistre", "ok", page.getByTestId("paiement-en-ligne-enregistre"));
  ok("paiement en ligne");
}

async function divers(nav) {
  const ctx = await O.contexte(nav);
  const page = await O.ouvrirSession(ctx, "patron");
  await O.aller(page, "Chambres");
  await page.getByRole("button", { name: "Nouvelle chambre" }).click();
  await page.waitForTimeout(700);
  await page.getByLabel("Numéro", { exact: true }).fill("203");
  await page.getByLabel("Type", { exact: true }).fill("Suite");
  await page.getByLabel("Prix par nuit").fill("120");
  await page.waitForTimeout(300);
  await O.photo(page, "patron-52c-chambre-formulaire", { fullPage: true });
  const cf = "patron-52c-chambre-formulaire";
  await O.mes(page, cf, "numero", page.getByLabel("Numéro", { exact: true }), { complet: true });
  await O.mes(page, cf, "type", page.getByLabel("Type", { exact: true }), { complet: true });
  await O.mes(page, cf, "prix", page.getByLabel("Prix par nuit"), { complet: true });
  await O.mes(page, cf, "devise", page.getByRole("group", { name: "Devise" }), { complet: true });
  await O.mes(page, cf, "enregistrer", page.getByRole("button", { name: "Enregistrer" }), { complet: true });
  ok("chambre");
  await O.aller(page, "Site de l'hôtel");
  await O.photo(page, "patron-30-site");
  await O.mes(page, "patron-30-site", "enregistrer", page.getByRole("button", { name: "Enregistrer", exact: true }));
  await O.mes(page, "patron-30-site", "nom", page.locator("#site-nom"));
  await O.mes(page, "patron-30-site", "slogan", page.locator("#site-slogan"));
  const dec = async (nom, loc, d = 120) => { await loc.first().scrollIntoViewIfNeeded(); await page.evaluate((x) => window.scrollBy(0, -x), d); await page.waitForTimeout(500); await O.photo(page, nom); };
  await dec("patron-31-site-photos", page.getByRole("heading", { name: "Photos" }));
  await dec("patron-32-site-services", page.getByRole("heading", { name: "Services proposés" }));
  await O.mes(page, "patron-32-site-services", "puces", page.getByRole("group", { name: "Ajouter un service" }));
  await dec("patron-33-site-contact", page.getByRole("heading", { name: "Contact et horaires" }));
  await O.mes(page, "patron-33-site-contact", "horaires", page.locator(".ligne-horaires"));
  ok("site");
  await ctx.close();
}

(async () => {
  const nav = await O.navigateur();
  try {
    if (veut("inscription")) { console.log("inscription"); await inscription(nav); }
    if (veut("accueil")) { console.log("accueil"); await accueil(nav); }
    if (veut("divers")) { console.log("divers"); await divers(nav); }
    if (veut("reglages")) { console.log("reglages"); await reglages(nav); }
  } finally {
    await nav.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
