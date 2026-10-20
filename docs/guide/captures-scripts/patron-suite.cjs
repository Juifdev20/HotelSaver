/**
 * Captures du guide « patron » — partie 2 : équipe, abonnement, réception, cafétaria, rapports, hors ligne.
 *   patron-hote.sh demarrer && GUIDE_PORT_BASE=40000 node docs/guide/captures-scripts/patron-suite.cjs [equipe|abonnement|reception|cafeteria|rapports|horsligne]
 * Chaque écran est une entrée de la liste de sa partie : pour viser un autre rendu (appli mobile), il suffit de re-cibler les sélecteurs.
 */
const O = require("./patron-outils.cjs");
const http = require("node:http");

const demandees = process.argv.slice(2);
const veut = (nom) => demandees.length === 0 || demandees.includes(nom);
const ok = (nom) => console.log("  ✓", nom);
const rate = (nom, e) => console.log("  ✗", nom, String(e.message).split("\n")[0].slice(0, 140));
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const appelFaux = (chemin) => new Promise((res) => http.get(`http://127.0.0.1:40010${chemin}`, (r) => { r.resume(); r.on("end", res); }).on("error", res));

/** Exécute une capture ; une erreur est signalée sans arrêter les suivantes. */
async function essai(nom, fn) {
  try { await fn(); ok(nom); } catch (e) { rate(nom, e); }
}

async function defiler(page, locator, decalage = 110) {
  await locator.first().scrollIntoViewIfNeeded();
  await page.evaluate((d) => window.scrollBy(0, -d), decalage);
  await page.waitForTimeout(500);
}

async function equipe(nav) {
  const ctx = await O.contexte(nav);
  const page = await O.ouvrirSession(ctx, "patron");
  page.on("dialog", (d) => d.accept());
  await O.aller(page, "Paramètres");
  await page.locator(".carte-formulaire", { hasText: "Administration" }).getByRole("button", { name: "Gérer" }).first().click();
  await page.waitForTimeout(1800);
  await essai("utilisateurs", async () => {
    await O.photo(page, "patron-35-utilisateurs");
    await O.mes(page, "patron-35-utilisateurs", "nouveau", page.getByRole("button", { name: "Nouveau compte" }));
  });
  // Un seul compte par rôle : pour montrer le formulaire avec un rôle libre, le compte cafétaria est momentanément rangé sous « Patron ».
  await essai("nouveau compte", async () => {
    O.sql(`update "Utilisateur" set role='PATRON' where "supabaseAuthId"='gl-caf'`);
    await O.recharger(page);
    await O.aller(page, "Paramètres");
    await page.locator(".carte-formulaire", { hasText: "Administration" }).getByRole("button", { name: "Gérer" }).first().click();
    await page.waitForTimeout(1800);
    await page.getByRole("button", { name: "Nouveau compte" }).click();
    await page.getByLabel("Nom", { exact: true }).fill("Marie Lukusa");
    await page.getByPlaceholder("970 000 000").fill("970555111");
    await page.getByLabel("Email (optionnel)").fill("marie@exemple.com");
    await page.getByLabel("Mot de passe", { exact: true }).fill("motdepasse-test");
    await page.waitForTimeout(400);
    await O.photo(page, "patron-36-nouveau-compte");
    const c = "patron-36-nouveau-compte";
    await O.mes(page, c, "nom", page.getByLabel("Nom", { exact: true }));
    await O.mes(page, c, "telephone", page.getByPlaceholder("970 000 000"));
    await O.mes(page, c, "email", page.getByLabel("Email (optionnel)"));
    await O.mes(page, c, "mdp", page.getByLabel("Mot de passe", { exact: true }));
    await page.getByRole("group", { name: "Rôle" }).scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 150));
    await page.waitForTimeout(400);
    await O.photo(page, "patron-36b-nouveau-compte-role");
    await O.mes(page, "patron-36b-nouveau-compte-role", "roles", page.getByRole("group", { name: "Rôle" }));
    await O.mes(page, "patron-36b-nouveau-compte-role", "creer", page.getByRole("button", { name: "Créer le compte" }));
    O.sql(`update "Utilisateur" set role='CAFETARIA' where "supabaseAuthId"='gl-caf'`);
  });
  await essai("modifier", async () => {
    await O.recharger(page);
    await O.aller(page, "Paramètres");
    await page.locator(".carte-formulaire", { hasText: "Administration" }).getByRole("button", { name: "Gérer" }).first().click();
    await page.waitForTimeout(1800);
    await page.getByRole("button", { name: "Modifier le compte de Aline Masika" }).click();
    await page.waitForTimeout(600);
    await O.photo(page, "patron-37-modifier");
    await page.getByLabel("Nouveau mot de passe").scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 100));
    await page.waitForTimeout(300);
    await O.photo(page, "patron-37b-modifier-mdp");
    await O.mes(page, "patron-37b-modifier-mdp", "mdp", page.getByLabel("Nouveau mot de passe"));
    await O.mes(page, "patron-37b-modifier-mdp", "enregistrer", page.getByRole("button", { name: "Enregistrer" }));
  });
  await essai("désactiver", async () => {
    await O.recharger(page);
    await O.aller(page, "Paramètres");
    await page.locator(".carte-formulaire", { hasText: "Administration" }).getByRole("button", { name: "Gérer" }).first().click();
    await page.waitForTimeout(1800);
    page.removeAllListeners("dialog");
    await page.getByRole("button", { name: "Désactiver le compte de Aline Masika" }).click();
    await page.waitForTimeout(700);
    await O.photo(page, "patron-38-desactiver");
    await page.getByRole("button", { name: /Annuler|Garder/ }).first().click().catch(() => {});
  });
  await ctx.close();
}

async function abonnement(nav) {
  const ctx = await O.contexte(nav);
  const page = await O.ouvrirSession(ctx, "patron");
  await O.aller(page, "Paramètres");
  await essai("abonnement dans paramètres", async () => {
    await page.getByTestId("parametres-abonnement").scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -140));
    await page.waitForTimeout(400);
    await O.photo(page, "patron-39-parametres-abonnement");
    await O.mes(page, "patron-39-parametres-abonnement", "gerer", page.getByTestId("parametres-abonnement").getByRole("button", { name: "Gérer" }));
  });
  await page.getByTestId("parametres-abonnement").getByRole("button", { name: "Gérer" }).click();
  await page.waitForTimeout(2500);
  await essai("abonnement essai", async () => {
    await O.haut(page);
    await O.photo(page, "patron-40-abonnement-essai");
    await O.mes(page, "patron-40-abonnement-essai", "carte", page.getByTestId("abonnement-etat"));
  });
  await essai("formules", async () => {
    await defiler(page, page.getByText("Choisissez une formule"), 90);
    await O.photo(page, "patron-41-formules");
    await O.mes(page, "patron-41-formules", "formules", page.locator(".ap-formules"));
  });
  await essai("durée et monnaie", async () => {
    await page.locator("label.ap-formule", { hasText: "Pro" }).first().click();
    await defiler(page, page.getByText("Choisissez la durée"), 90);
    await O.photo(page, "patron-42-duree");
    await O.mes(page, "patron-42-duree", "durees", page.locator(".ap-durees"));
  });
  await essai("réseau et commande", async () => {
    await page.locator("label.ap-tuile", { hasText: "3 mois" }).first().click();
    await page.getByPlaceholder("Ex. 0828 497 218").fill("0828497218");
    await defiler(page, page.getByText("Payer avec Mobile Money").first(), 90);
    await page.waitForTimeout(800);
    await O.photo(page, "patron-43-mobile-money");
    await O.mes(page, "patron-43-mobile-money", "reseaux", page.locator(".ap-reseaux"));
    await O.mes(page, "patron-43-mobile-money", "numero", page.locator(".ap-champ__boite"));
    await defiler(page, page.getByTestId("abonnement-recap"), 90);
    await page.waitForTimeout(1500);
    await O.photo(page, "patron-44-commande");
    await O.mes(page, "patron-44-commande", "commande", page.getByTestId("abonnement-recap"));
    await O.mes(page, "patron-44-commande", "payer", page.locator(".ap-commande__bouton"));
  });
  await essai("attente", async () => {
    await page.locator(".ap-commande__bouton").click();
    await page.waitForTimeout(3500);
    await O.haut(page);
    await O.photo(page, "patron-45-attente");
    await O.mes(page, "patron-45-attente", "attente", page.getByTestId("abonnement-attente"));
  });
  await essai("succès", async () => {
    await appelFaux("/__succes");
    await page.getByTestId("abonnement-succes").waitFor({ timeout: 90000 });
    await page.waitForTimeout(800);
    await O.haut(page);
    await O.photo(page, "patron-46-succes");
    await O.mes(page, "patron-46-succes", "succes", page.getByTestId("abonnement-succes"));
    await page.getByRole("button", { name: "Continuer" }).click();
    await page.waitForTimeout(2500);
    await O.haut(page);
    await O.photo(page, "patron-47-abonnement-actif");
    await O.mes(page, "patron-47-abonnement-actif", "carte", page.getByTestId("abonnement-etat"));
    await defiler(page, page.getByTestId("abonnement-historique"), 90);
    await O.photo(page, "patron-48-historique");
    await O.mes(page, "patron-48-historique", "historique", page.getByTestId("abonnement-historique"));
  });
  // Échu (délai de grâce) : bandeau rouge ; puis accès coupé : écran « abonnement expiré ».
  await essai("échu", async () => {
    O.sql(`update "PaiementLicence" set "periodeCouverteJusquau" = now() - interval '1 day'`);
    await O.recharger(page);
    await O.haut(page);
    await O.photo(page, "patron-49-echu");
    await O.mes(page, "patron-49-echu", "bandeau", page.locator('[data-testid="bandeau-abonnement"], .bandeau-abonnement').first());
  });
  await essai("bloqué", async () => {
    O.sql(`update "PaiementLicence" set "periodeCouverteJusquau" = now() - interval '6 days'`);
    await O.recharger(page);
    await O.photo(page, "patron-50-bloque", { fullPage: true });
    await O.mes(page, "patron-50-bloque", "titre", page.getByRole("heading", { name: /expiré/ }), { complet: true });
  });
  await essai("réouverture", async () => {
    O.sql(`update "PaiementLicence" set "periodeCouverteJusquau" = now() + interval '75 days'`);
  });
  await ctx.close();
}

async function reception(nav) {
  O.etatReception();
  const ctx = await O.contexte(nav);
  const page = await O.ouvrirSession(ctx, "patron");
  await essai("chambres", async () => {
    await O.aller(page, "Chambres");
    await O.photo(page, "patron-51-chambres");
    await O.mes(page, "patron-51-chambres", "filtres", page.getByRole("group", { name: "Filtrer par statut" }));
    await O.mes(page, "patron-51-chambres", "nouvelle", page.getByRole("button", { name: "Nouvelle chambre" }));
    await O.mes(page, "patron-51-chambres", "premiere", page.getByTestId("grille-chambres").locator("> *").first());
  });
  await essai("réservations", async () => {
    await O.aller(page, "Réservations");
    await O.photo(page, "patron-52-reservations");
    await O.mes(page, "patron-52-reservations", "segments", page.getByRole("button", { name: "Liste" }));
    await page.evaluate(() => window.scrollTo(0, 420));
    await page.waitForTimeout(500);
    await O.photo(page, "patron-52b-reservations-liste");
  });
  await essai("planning", async () => {
    await O.haut(page);
    await page.getByRole("button", { name: "Planning" }).click();
    await page.waitForTimeout(2000);
    await O.photo(page, "patron-53-planning");
    await page.getByRole("button", { name: "Liste" }).click();
  });
  await essai("détail réservation", async () => {
    await page.getByRole("button", { name: "Ouvrir la réservation de Esther Mbuyi, chambre 202" }).click();
    await page.waitForTimeout(2500);
    await O.photo(page, "patron-54-detail", { fullPage: true });
    await O.mes(page, "patron-54-detail", "payeEnLigne", page.getByTestId("bloc-paye-en-ligne"), { complet: true });
    await O.mes(page, "patron-54-detail", "annuler", page.getByRole("button", { name: "Annuler", exact: true }), { complet: true });
  });
  await essai("arrivées et départs", async () => {
    await O.aller(page, "Arrivées et départs");
    await O.photo(page, "patron-55-arrivees");
  });
  await essai("clients", async () => {
    await O.aller(page, "Clients");
    await O.photo(page, "patron-56-clients");
    await page.getByRole("button", { name: "Ouvrir la fiche de Jean-Pierre Mukendi" }).click();
    await page.waitForTimeout(1500);
    await O.photo(page, "patron-56b-client-fiche");
  });
  await essai("journal de la journée", async () => {
    await O.aller(page, "Journal de la journée");
    await O.photo(page, "patron-57-journal");
    await O.mes(page, "patron-57-journal", "encaissements", page.locator(".carte-simple, .carte-formulaire").first());
  });
  await essai("remboursements", async () => {
    await O.recharger(page);
    await O.aller(page, "Remboursements", 2500);
    await O.photo(page, "patron-58-remboursements");
    await O.mes(page, "patron-58-remboursements", "onglets", page.getByRole("tablist", { name: "Remboursements" }));
    await O.mes(page, "patron-58-remboursements", "carte", page.getByTestId("remboursement-carte"));
    await page.evaluate(() => window.scrollTo(0, 330));
    await page.waitForTimeout(400);
    await O.photo(page, "patron-58b-remboursement-carte");
    await O.mes(page, "patron-58b-remboursement-carte", "destination", page.getByTestId("remboursement-destination"));
    await O.mes(page, "patron-58b-remboursement-carte", "rembourse", page.getByRole("button", { name: "J'ai remboursé" }));
    await O.mes(page, "patron-58b-remboursement-carte", "conserver", page.getByRole("button", { name: "Conserver l'acompte" }));
    await page.getByRole("button", { name: "J'ai remboursé" }).click();
    await page.waitForTimeout(600);
    await page.getByLabel(/Référence de l'envoi/).fill("MP261020.1432.B77120");
    await page.evaluate(() => window.scrollBy(0, 330));
    await page.waitForTimeout(500);
    await O.photo(page, "patron-59-remboursement-confirmer");
    await O.mes(page, "patron-59-remboursement-confirmer", "modes", page.getByText("Comment avez-vous remboursé ?"));
    await O.mes(page, "patron-59-remboursement-confirmer", "case", page.getByText(/Je confirme avoir rendu/));
    await page.getByRole("button", { name: "Retour" }).click();
    await page.waitForTimeout(400);
    await O.haut(page);
    await page.getByRole("tab", { name: "Historique" }).click().catch(async () => page.getByRole("button", { name: "Historique" }).click());
    await page.waitForTimeout(1200);
    await O.photo(page, "patron-60-remboursements-historique");
  });
  await ctx.close();
}

async function cafeteria(nav) {
  const ctx = await O.contexte(nav);
  const page = await O.ouvrirSession(ctx, "patron");
  await essai("menu", async () => {
    await O.aller(page, "Menu");
    await O.photo(page, "patron-65-menu");
    await O.mes(page, "patron-65-menu", "nouveau", page.getByRole("button", { name: "Nouveau produit" }));
    await page.getByRole("button", { name: "Modifier Poulet braisé" }).click();
    await page.waitForTimeout(1500);
    await O.photo(page, "patron-66-produit", { fullPage: true });
  });
  await essai("stock", async () => {
    await O.aller(page, "Stock");
    await O.photo(page, "patron-67-stock");
    await O.mes(page, "patron-67-stock", "nouveau", page.getByRole("button", { name: "Nouveau mouvement" }));
    await page.getByRole("button", { name: "Nouveau mouvement" }).click();
    await page.waitForTimeout(800);
    await O.photo(page, "patron-68-mouvement", { fullPage: true });
  });
  await essai("inventaire", async () => {
    await O.aller(page, "Inventaire");
    await O.photo(page, "patron-69-inventaire");
    await O.mes(page, "patron-69-inventaire", "lancer", page.getByRole("button", { name: /Lancer l'évaluation/ }));
    await page.getByRole("button", { name: /Lancer l'évaluation/ }).click();
    await page.waitForTimeout(2000);
    await O.photo(page, "patron-70-inventaire-saisie", { fullPage: true });
  });
  await essai("comptes ouverts", async () => {
    await O.aller(page, "Comptes ouverts");
    await O.photo(page, "patron-71-comptes");
  });
  await essai("retrait commande", async () => {
    await O.aller(page, "Retrait commande");
    await O.photo(page, "patron-72-retrait");
  });
  await essai("cuisine", async () => {
    await O.aller(page, "Cuisine");
    await O.photo(page, "patron-73-cuisine");
  });
  await ctx.close();
}

async function rapports(nav) {
  // Le personnel génère les rapports du mois ; le patron les consulte.
  for (const role of ["recep", "caf"]) {
    await essai(`rapport ${role}`, async () => {
      const c = await O.contexte(nav);
      const p = await O.ouvrirSession(c, role);
      await O.aller(p, "Rapports mensuels");
      const mois = await p.getByLabel("Mois du rapport").locator("option").first().getAttribute("value");
      await p.getByLabel("Mois du rapport").selectOption(mois);
      await p.waitForTimeout(1000);
      await p.getByRole("button", { name: "Générer le rapport" }).click();
      await p.waitForTimeout(6000);
      await c.close();
    });
  }
  const ctx = await O.contexte(nav);
  const page = await O.ouvrirSession(ctx, "patron");
  await essai("rapports patron", async () => {
    await O.aller(page, "Rapports mensuels");
    const mois = await page.getByLabel("Mois du rapport").locator("option").first().getAttribute("value");
    await page.getByLabel("Mois du rapport").selectOption(mois);
    await page.waitForTimeout(1800);
    await O.photo(page, "patron-75-rapports");
    await O.mes(page, "patron-75-rapports", "mois", page.getByLabel("Mois du rapport"));
    await O.mes(page, "patron-75-rapports", "reception", page.getByTestId("rapport-RECEPTION"));
    await O.mes(page, "patron-75-rapports", "cafeteria", page.getByTestId("rapport-CAFETERIA"));
  });
  await essai("dépenses", async () => {
    await O.aller(page, "Dépenses");
    await O.photo(page, "patron-76-depenses");
    await O.mes(page, "patron-76-depenses", "pdf", page.getByRole("button", { name: "Télécharger le PDF" }));
    await O.mes(page, "patron-76-depenses", "filtres", page.getByRole("button", { name: "Tous" }));
  });
  await essai("journal des reçus", async () => {
    await O.aller(page, "Facturation");
    await page.evaluate(() => window.scrollTo(0, 330));
    await page.waitForTimeout(500);
    await O.photo(page, "patron-77-recus");
  });
  await ctx.close();
}

async function horsligne(nav) {
  const ctx = await O.contexte(nav);
  const page = await O.ouvrirSession(ctx, "patron");
  await essai("hors ligne", async () => {
    await ctx.setOffline(true);
    await page.waitForTimeout(7000);
    await O.haut(page);
    await O.photo(page, "patron-80-hors-ligne");
    await O.mes(page, "patron-80-hors-ligne", "synchro", page.getByTestId("indicateur-synchro"));
    await page.getByTestId("indicateur-synchro").click();
    await page.waitForTimeout(1500);
    await O.photo(page, "patron-81-synchro-hors-ligne");
    await ctx.setOffline(false);
  });
  await ctx.close();
}

(async () => {
  const nav = await O.navigateur();
  try {
    if (veut("equipe")) { console.log("equipe"); await equipe(nav); }
    if (veut("abonnement")) { console.log("abonnement"); await abonnement(nav); }
    if (veut("reception")) { console.log("reception"); await reception(nav); }
    if (veut("cafeteria")) { console.log("cafeteria"); await cafeteria(nav); }
    if (veut("rapports")) { console.log("rapports"); await rapports(nav); }
    if (veut("horsligne")) { console.log("horsligne"); await horsligne(nav); }
  } finally {
    await nav.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
