/**
 * Exemple complet : prend les captures d'essai de l'interface mobile pour les trois rôles (écrans de connexion, accueil, onglets du bas,
 * « Plus » et ses écrans, quelques détails). Sert de modèle aux scripts de captures du guide.
 *   GUIDE_PORT_BASE=40400 GUIDE_SORTIE=docs/guide/captures/mobile-essai node docs/guide/outils/mobile-web/exemple-captures.cjs [patron|recep|caf|connexion]
 * Chaque capture est protégée : un écran qui échoue est signalé, les suivants sont quand même pris.
 */
const m = require("./mobile.cjs");

async function essayer(nom, fn) {
  try {
    await fn();
    console.log("ok      ", nom);
  } catch (e) {
    console.log("ECHEC   ", nom, "-", String(e.message).split("\n")[0]);
  }
}
const nettoyer = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();

/** Écrans avant connexion (aucun compte n'est encore mémorisé sur l'appareil). */
async function connexion(nav) {
  const ctx = await m.contexte(nav, { heure: "9:41" });
  const page = await m.ouvrir(ctx);
  await essayer("connexion", () => m.photo(page, "connexion"));
  await essayer("connexion-erreur", async () => {
    await page.getByText("Ancien compte ? Se connecter avec un e-mail").click();
    await page.getByRole("textbox", { name: "Adresse e-mail *" }).fill("gl-patron@exemple.test");
    await page.getByRole("textbox", { name: "Mot de passe *" }).fill("mauvais-mot-de-passe");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await page.getByRole("alert").waitFor({ timeout: 10000 });
    await m.photo(page, "connexion-erreur");
  });
  await essayer("mot-de-passe-oublie", async () => {
    await page.getByRole("button", { name: "Mot de passe oublié ?" }).click();
    await page.waitForTimeout(500);
    await m.photo(page, "mot-de-passe-oublie");
    await page.getByRole("button", { name: "Retour à la connexion" }).click();
  });
  await essayer("inscription", async () => {
    await page.getByRole("button", { name: "Créer votre hôtel" }).first().click();
    await page.waitForTimeout(700);
    await m.photo(page, "inscription");
    await m.photo(page, "inscription-complete", { fullPage: false });
  });
  await ctx.close();
}

/** Parcours d'un rôle : accueil, onglets du bas, « Plus » et tous ses écrans. */
async function parcours(nav, role, prefixe) {
  const ctx = await m.contexte(nav, { heure: "9:41", imprimantes: [{ name: "Imprimante BT-58", address: "AA:BB:CC:DD:EE:FF" }] });
  const page = await m.connecter(ctx, role);
  const photo = (nom, opts) => m.photo(page, `${prefixe}-${nom}`, opts);

  await essayer(`${prefixe}-accueil`, async () => { await photo("accueil"); await m.defiler(page, 700); await photo("accueil-bas"); await m.defiler(page, -Infinity); });
  await essayer(`${prefixe}-menu-compte`, async () => {
    await page.getByRole("button", { name: "Menu du compte" }).click();
    await page.waitForTimeout(900);
    await photo("menu-compte");
    await m.fermerTiroir(page);
  });
  await essayer(`${prefixe}-notifications`, async () => {
    await page.getByRole("button", { name: /^Notifications/ }).click();
    await page.waitForTimeout(900);
    await photo("notifications");
    await m.fermerTiroir(page);
  });

  const onglets = (await page.getByRole("tab").allInnerTexts()).map((t) => t.trim()).filter((t) => t !== "Accueil" && t !== "Plus");
  for (const t of onglets) await essayer(`${prefixe}-onglet-${t}`, async () => { await m.aller(page, t); await photo(`onglet-${nettoyer(t)}`); });

  await m.aller(page, "Plus");
  const entrees = (await m.inventaire(page, { horsEcran: true }))
    .filter((l) => l.startsWith("button[button]"))
    .map((l) => /« (.*) »/.exec(l)[1])
    .filter((n) => !/^(Notifications|Menu du compte)$/.test(n));
  await photo("plus");
  await m.defiler(page, Infinity);
  await photo("plus-bas");
  for (const e of entrees) {
    await essayer(`${prefixe}-plus-${e}`, async () => {
      await m.aller(page, e);
      await photo(`plus-${nettoyer(e)}`);
    });
  }
  return { ctx, page };
}

(async () => {
  const quoi = process.argv[2];
  const nav = await m.navigateur();
  if (!quoi || quoi === "connexion") await connexion(nav);

  if (!quoi || quoi === "patron") {
    const { ctx, page } = await parcours(nav, "patron", "patron");
    // Détails (patron) : une chambre, une réservation, la saisie d'une réservation, « Changer de profil » -> sélection de profil.
    await essayer("patron-chambre-detail", async () => {
      await m.aller(page, "Chambres");
      await page.getByRole("button", { name: /^Chambre 104/ }).click();
      await page.waitForTimeout(800);
      await m.photo(page, "patron-chambre-detail");
      await m.fermerTiroir(page);
    });
    await essayer("patron-reservation-detail", async () => {
      await m.aller(page, "Réserv.");
      await page.getByText("Patrick Ilunga").first().click();
      await page.waitForTimeout(1200);
      await m.photo(page, "patron-reservation-detail");
      await m.defiler(page, 700);
      await m.photo(page, "patron-reservation-detail-bas");
    });
    await essayer("patron-selection-profil", async () => {
      await page.getByRole("button", { name: "Menu du compte" }).click();
      await page.waitForTimeout(700);
      await page.getByText("Changer de profil").click();
      await page.getByText("Joël Kambale").first().waitFor({ timeout: 8000 });
      await page.waitForTimeout(600);
      await m.photo(page, "patron-selection-profil");
    });
    await ctx.close();
  }

  if (!quoi || quoi === "recep") {
    const { ctx, page } = await parcours(nav, "recep", "recep");
    await essayer("recep-nouvelle-reservation", async () => {
      await m.aller(page, "Réserv.");
      await page.getByRole("button", { name: "Nouvelle réservation" }).click();
      await page.waitForTimeout(1000);
      await m.photo(page, "recep-nouvelle-reservation");
      await m.defiler(page, 600);
      await m.photo(page, "recep-nouvelle-reservation-bas");
    });
    await ctx.close();
  }

  if (!quoi || quoi === "caf") {
    const { ctx, page } = await parcours(nav, "caf", "caf");
    await essayer("caf-compte-detail", async () => {
      await m.aller(page, "Comptes");
      await page.getByText("Table 4").first().click();
      await page.waitForTimeout(1200);
      await m.photo(page, "caf-compte-detail");
      await page.getByRole("button", { name: /^Ajouter des consommations/ }).click();
      await page.waitForTimeout(1200);
      await m.photo(page, "caf-ajout-consommations");
    });
    await essayer("caf-scanner", async () => {
      // Pas de caméra dans un navigateur : l'écran du lecteur de codes-barres s'ouvre mais sans image (voir README, limites).
      await page.getByRole("button", { name: "Scanner avec la caméra" }).click();
      await page.waitForTimeout(1000);
      await m.photo(page, "caf-scanner-sans-camera");
    });
    await ctx.close();
  }
  await nav.close();
})();
