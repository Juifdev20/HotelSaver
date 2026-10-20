/**
 * Captures de la partie CAFÉTARIA du guide : l'application MOBILE (apps/mobile compilée pour le web, voir outils/mobile-web), compte « gl-caf »
 * (Sylvie Katungu, Hôtel Grand Lac).
 *
 * Mise en route (hôte NEUF : chaque démarrage remet la base à zéro) :
 *   docs/guide/outils/hote.sh demarrer 40200 hotel_t3
 *   node docs/guide/outils/mobile-web/serveur.mjs 40204 /tmp/guide-hotes/arret-mobile-40200 &   # sert le paquet mobile déjà compilé
 *   GUIDE_PORT_BASE=40200 GUIDE_DB=hotel_t3 node docs/guide/captures-scripts/cafetaria.cjs [section ...]
 * Le paquet mobile compilé vise l'hôte 40400 (API 40401, auth 40402) : on redirige ces adresses vers CET hôte (voir `contexteCafetaria`).
 *
 * Les images vont dans docs/guide/captures/brut/cafetaria-*.png ; les positions exactes des éléments à entourer (fractions de la capture)
 * vont dans captures-scripts/cafetaria-reperes.json, lu par contenu/cafetaria.mjs. Les sections s'exécutent dans l'ordre (la base évolue :
 * comptes encaissés, stock, etc.) ; relancer UNE section seule fonctionne sauf mention contraire.
 *
 * Tout ce qui dépend de l'interface (libellés, sélecteurs) est regroupé dans SEL.
 */
const { spawnSync } = require("node:child_process");
const { existsSync, readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const m = require("../outils/mobile-web/mobile.cjs");

const BASE = Number(process.env.GUIDE_PORT_BASE ?? 40200);
const DB = process.env.GUIDE_DB ?? "hotel_t3";
const PSQL = ["-U", "postgres", "-h", "/tmp", "-p", "54330", "-d", DB, "-q", "-v", "ON_ERROR_STOP=1"];
const FICHIER_REPERES = join(__dirname, "cafetaria-reperes.json");

/* ------------------------------------------------------------------ décor (base de démonstration) */
const ID_WEB = "e6a5e231-0000-4000-8000-000000000001"; // référence du ticket = E6A5E231
const DECOR_SQL = `
-- Les plats ont un stock fictif : la liste « Stock bas » de l'accueil ne doit montrer que de vrais articles de comptoir.
UPDATE "Produit" SET "stockActuel"=50 WHERE "typeProduit"='PLAT';
UPDATE "Produit" SET "codeBarres"='6009880123456' WHERE nom='Primus 72 cl';
UPDATE "Produit" SET "codeBarres"='5449000000996' WHERE nom='Coca-Cola 33 cl';
UPDATE "Produit" SET "codeBarres"='6009880654321' WHERE nom='Eau minérale';
UPDATE "Produit" SET "codeBarres"='5449000011527' WHERE nom='Fanta 33 cl';
-- Une commande passée sur le site web de l'hôtel (référence E6A5E231), plats prêts
WITH h AS (SELECT id FROM "Hotel" LIMIT 1), u AS (SELECT id FROM "Utilisateur" WHERE role='CAFETARIA' LIMIT 1)
INSERT INTO "CompteCafeteria"(id,"hotelId","tableOuNom",statut,origine,"contactClient","noteClient","ouvertPar","updatedAt")
SELECT '${ID_WEB}', h.id, 'Mme Kabeya (site web)', 'OUVERT','SITE_PUBLIC','+243 812 345 678','Sans piment, svp.', u.id, now() FROM h,u;
INSERT INTO "SousCompte"(id,"hotelId","compteId",nom,"updatedAt")
SELECT 'e6a5e231-0000-4000-8000-0000000000a1', "hotelId", id, 'Mme Kabeya', now() FROM "CompteCafeteria" WHERE id='${ID_WEB}';
INSERT INTO "LigneCommande"(id,"hotelId","sousCompteId","produitId",quantite,"prixUnitaire",devise,statut,"updatedAt")
SELECT 'e6a5e231-0000-4000-8000-0000000000b1', s."hotelId", s.id, p.id, 2, 12, 'USD', 'PRET', now() FROM "SousCompte" s, "Produit" p WHERE s.id='e6a5e231-0000-4000-8000-0000000000a1' AND p.nom='Capitaine grillé';
INSERT INTO "LigneCommande"(id,"hotelId","sousCompteId","produitId",quantite,"prixUnitaire",devise,statut,"updatedAt")
SELECT 'e6a5e231-0000-4000-8000-0000000000b2', s."hotelId", s.id, p.id, 2, 1.5, 'USD', 'PRET', now() FROM "SousCompte" s, "Produit" p WHERE s.id='e6a5e231-0000-4000-8000-0000000000a1' AND p.nom='Coca-Cola 33 cl';
-- Le serveur de démonstration n'a pas de stockage de fichiers : on ne peut pas GÉNÉRER de PDF. Rapport et inventaire de septembre sont donc posés en base.
INSERT INTO "RapportMensuel"(id,"hotelId",departement,periode,version,numero,provisoire,statut,fichier,"genereParId","genereParNom","genereLe",chiffres,concordant,empreinte)
SELECT gen_random_uuid(), h.id, 'CAFETERIA', '2026-08', 1, 'RAP-CAF-202608-001', false, 'ACTIF', 'demo/RAP-CAF-202608-001.pdf', u.id, 'Sylvie Katungu', '2026-09-01 08:12:00', '{}', true, 'a1b2c3d4e5f6a7b8'
FROM (SELECT id FROM "Hotel" LIMIT 1) h, (SELECT id FROM "Utilisateur" WHERE role='CAFETARIA' LIMIT 1) u;
WITH h AS (SELECT id FROM "Hotel" LIMIT 1), inv AS (
  INSERT INTO "InventairePhysique"(id,"hotelId","dateDebut","dateFin",titre,"createdBy","createdAt","pdfUrl")
  SELECT gen_random_uuid(), h.id, '2026-09-01', '2026-09-30', 'Inventaire de fin septembre 2026', 'Sylvie Katungu', '2026-10-01 09:40:00', 'demo/inv.pdf' FROM h RETURNING id)
INSERT INTO "InventairePhysiqueItem"(id,"inventaireId","produitId","stockTheorique","stockPhysique",ecart,note)
SELECT gen_random_uuid(), inv.id, p.id, 36, 35, -1, 'Une bouteille cassée au service' FROM inv, "Produit" p WHERE p.nom='Coca-Cola 33 cl';
`;
// Le rapport du MOIS ÉCOULÉ (septembre 2026) est posé plus tard, pour pouvoir photographier d'abord « Aucun rapport pour ce mois ».
const RAPPORT_SQL = `
INSERT INTO "RapportMensuel"(id,"hotelId",departement,periode,version,numero,provisoire,statut,fichier,"genereParId","genereParNom","genereLe",chiffres,concordant,empreinte)
SELECT gen_random_uuid(), h.id, 'CAFETERIA', '2026-09', 1, 'RAP-CAF-202609-001', false, 'ACTIF', 'demo/RAP-CAF-202609-001.pdf', u.id, 'Sylvie Katungu', '2026-10-01 08:12:00', '{}', true, 'a1b2c3d4e5f6a7b8'
FROM (SELECT id FROM "Hotel" LIMIT 1) h, (SELECT id FROM "Utilisateur" WHERE role='CAFETARIA' LIMIT 1) u;
`;
function sql(texte) {
  const r = spawnSync("psql", [...PSQL, "-c", texte], { encoding: "utf8" });
  if (r.status !== 0) throw new Error("psql : " + r.stderr);
}

/* ------------------------------------------------------------------ interface : sélecteurs et gestes */
const SEL = {
  menuCompte: (p) => p.getByRole("button", { name: "Menu du compte" }),
  cloche: (p) => p.getByRole("button", { name: /^Notifications/ }),
  tableOuNom: (p) => p.getByRole("textbox", { name: "Table ou nom du client" }),
  premierePersonne: (p) => p.getByRole("textbox", { name: /Nom de la première personne/ }),
  ouvrirCompte: (p) => p.getByRole("button", { name: "Ouvrir le compte" }),
  venteRapide: (p) => p.getByRole("button", { name: /^Vente rapide/ }),
  carteVenteComptoir: (p) => p.getByText("Vente au comptoir", { exact: true }),
  cartePersonne: (p, nom) => p.getByRole("button", { name: `Ajouter des consommations pour ${nom}` }),
  ajouterPersonne: (p) => p.getByRole("button", { name: "Ajouter une personne au compte" }),
  nomNouvellePersonne: (p) => p.getByRole("textbox", { name: "Nom de la personne" }),
  annulerCompte: (p) => p.getByRole("button", { name: /^Annuler le compte .*créé par erreur/ }),
  recherche: (p) => p.getByRole("textbox", { name: "Rechercher un produit" }),
  boutonCamera: (p) => p.getByRole("button", { name: "Scanner avec la caméra" }),
  produit: (p, nom) => p.getByRole("button", { name: `Ajouter ${nom}` }).first(),
  plus: (p, nom) => p.getByRole("button", { name: `Ajouter un ${nom}` }).first(),
  validerPanier: (p, nom) => p.getByRole("button", { name: new RegExp(`^Ajouter à ${nom}`) }),
  encaisser: (p, nom) => p.getByRole("button", { name: `Encaisser ${nom}` }),
  toutEncaisser: (p) => p.getByRole("button", { name: /^Tout encaisser/ }),
  mode: (p, libelle) => p.getByRole("radio", { name: libelle }),
  deviseRemise: (p, d) => p.getByRole("radiogroup", { name: "Devise remise par le client" }).getByRole("radio", { name: d }),
  deviseRendu: (p, d) => p.getByRole("radiogroup", { name: "Devise de la monnaie rendue" }).getByRole("radio", { name: d }),
  montantRemis: (p) => p.getByRole("textbox", { name: /Montant remis par le client/ }),
  confirmerEncaissement: (p) => p.getByRole("button", { name: "Confirmer l'encaissement" }),
  imprimerRecu: (p) => p.getByRole("button", { name: "Imprimer le reçu" }),
  terminer: (p) => p.getByRole("button", { name: /^(Terminer|Retour au compte)$/ }),
  reference: (p) => p.getByRole("textbox", { name: /Référence du ticket/ }),
  ouvrirCommande: (p) => p.getByRole("button", { name: "Ouvrir la commande" }),
  nouveauMouvement: (p) => p.getByRole("button", { name: "Nouveau mouvement" }),
  nouvelleDepense: (p) => p.getByRole("button", { name: "Nouvelle dépense" }),
};

/** Contexte téléphone dont les appels vers l'hôte compilé (40401, 40402, 40403) vont à NOTRE hôte (BASE+1, +2, +3). */
async function contexteCafetaria(nav, options = {}) {
  const ctx = await m.contexte(nav, { imprimantes: [{ name: "Imprimante BT-58", address: "AA:BB:CC:DD:EE:FF" }], ...options });
  await ctx.route(/^http:\/\/127\.0\.0\.1:(40401|40402|40403)\//, (route) => {
    const adresse = route.request().url().replace(/127\.0\.0\.1:404(\d\d)/, (_, n) => `127.0.0.1:${BASE + Number(n)}`);
    return route.continue({ url: adresse });
  });
  return ctx;
}

/* ------------------------------------------------------------------ prises de vue + mesures */
const REPERES = existsSync(FICHIER_REPERES) ? JSON.parse(readFileSync(FICHIER_REPERES, "utf8")) : {};
/** Photographie `nom` et mesure les éléments demandés juste avant : positions exactes en fractions de la capture. */
async function snap(page, nom, mesures = {}, opts = {}) {
  const complet = opts.fullPage === true;
  await m.attendreChargement(page, { delai: 6000 });
  const resultat = {};
  for (const [cle, loc] of Object.entries(mesures)) {
    const r = await m.mesurer(page, loc, { complet }).catch(() => null);
    if (r) resultat[cle] = r;
    else console.log(`  (mesure absente : ${nom} / ${cle})`);
  }
  REPERES[`cafetaria-${nom}`] = resultat;
  writeFileSync(FICHIER_REPERES, JSON.stringify(REPERES, null, 1));
  await m.photo(page, `cafetaria-${nom}`, opts);
}

async function taille(page, hauteur) {
  await page.setViewportSize({ width: 390, height: hauteur });
  await page.waitForTimeout(700);
}

/* ------------------------------------------------------------------ sections */
const SECTIONS = {};

SECTIONS.accueil = async ({ page }) => {
  await taille(page, 960);
  await snap(page, "04-accueil", { menuCompte: SEL.menuCompte(page), cloche: SEL.cloche(page) });
  await taille(page, 844);
  await SEL.menuCompte(page).click();
  await page.waitForTimeout(900);
  await snap(page, "06-menu-compte");
  await m.fermerTiroir(page);
  await taille(page, 1250);
  await m.aller(page, "Plus");
  await snap(page, "05-plus");
  await taille(page, 844);
};

SECTIONS.imprimante = async ({ page }) => {
  await m.aller(page, "Imprimante");
  await snap(page, "07-imprimante");
};

SECTIONS.caisse = async ({ page }) => {
  await m.aller(page, "Caisse");
  await snap(page, "10-caisse-vide", { table: SEL.tableOuNom(page), personne: SEL.premierePersonne(page), ouvrir: SEL.ouvrirCompte(page), rapide: SEL.venteRapide(page) });
  await SEL.tableOuNom(page).fill("Table 6");
  await SEL.premierePersonne(page).fill("Papa Joseph");
  await snap(page, "11-caisse-remplie", { table: SEL.tableOuNom(page), personne: SEL.premierePersonne(page), ouvrir: SEL.ouvrirCompte(page) });
  await SEL.ouvrirCompte(page).click();
  await page.waitForTimeout(2500);
  await snap(page, "12-compte-ouvert", { personne: SEL.cartePersonne(page, "Papa Joseph"), ajouterPersonne: SEL.ajouterPersonne(page), annuler: SEL.annulerCompte(page) });

  await SEL.cartePersonne(page, "Papa Joseph").click();
  await page.waitForTimeout(2500);
  await snap(page, "13-ajout-liste", { recherche: SEL.recherche(page), camera: SEL.boutonCamera(page), categories: page.getByRole("button", { name: "Catégorie Tous" }) });
  await SEL.produit(page, "Poulet braisé").click();
  await SEL.produit(page, "Primus 72 cl").click();
  await SEL.plus(page, "Primus 72 cl").click();
  await page.waitForTimeout(500);
  await snap(page, "14-ajout-panier", { valider: SEL.validerPanier(page, "Papa Joseph"), plus: SEL.plus(page, "Primus 72 cl") });
  await SEL.validerPanier(page, "Papa Joseph").click();
  await page.waitForTimeout(2500);
  await snap(page, "16-compte-lignes", { personne: page.getByText("Papa Joseph", { exact: true }).first(), encaisser: SEL.encaisser(page, "Papa Joseph") });

  // Deuxième personne
  await SEL.ajouterPersonne(page).click();
  await page.waitForTimeout(800);
  await SEL.nomNouvellePersonne(page).fill("Mama Grâce");
  await snap(page, "17-ajouter-personne", { nom: SEL.nomNouvellePersonne(page), ajouter: page.getByRole("button", { name: "Ajouter", exact: true }).last() });
  await page.getByRole("button", { name: "Ajouter", exact: true }).last().click();
  await page.waitForTimeout(1500);
  await SEL.cartePersonne(page, "Mama Grâce").click();
  await page.waitForTimeout(2000);
  await SEL.produit(page, "Riz et haricots").click();
  await SEL.produit(page, "Coca-Cola 33 cl").click();
  await SEL.validerPanier(page, "Mama Grâce").click();
  await page.waitForTimeout(2500);
  await snap(page, "18-deux-personnes", {
    encaisserJoseph: SEL.encaisser(page, "Papa Joseph"),
    encaisserGrace: SEL.encaisser(page, "Mama Grâce"),
    ajouterPersonne: SEL.ajouterPersonne(page),
    toutEncaisser: SEL.toutEncaisser(page),
    statut: page.getByText("En attente", { exact: true }).first(),
  });

  // Papa Joseph : espèces, dollars
  await SEL.encaisser(page, "Papa Joseph").click();
  await page.waitForTimeout(900);
  await snap(page, "19a-encaisser-feuille", { mode: SEL.mode(page, "Espèces"), total: page.getByText("À encaisser", { exact: true }) });
  await SEL.mode(page, "Espèces").click();
  await SEL.montantRemis(page).fill("20");
  await page.waitForTimeout(500);
  await snap(page, "19-encaisser-usd", { mode: SEL.mode(page, "Espèces"), montant: SEL.montantRemis(page), monnaie: page.getByText(/^Monnaie à rendre/), confirmer: SEL.confirmerEncaissement(page) });
  await SEL.confirmerEncaissement(page).click();
  await page.waitForTimeout(2500);
  await snap(page, "20-recu-usd", { imprimer: SEL.imprimerRecu(page), terminer: SEL.terminer(page), numero: page.getByText(/TEMP-/).first() });
  await SEL.terminer(page).click();
  await page.waitForTimeout(1500);
  await snap(page, "21-personne-payee", { paye: page.getByText("Payé", { exact: true }).first(), reste: page.getByText("Reste à payer", { exact: true }) });

  // Mama Grâce : le client remet des francs
  await SEL.encaisser(page, "Mama Grâce").click();
  await page.waitForTimeout(900);
  await SEL.mode(page, "Espèces").click();
  await SEL.deviseRemise(page, /CDF/).click();
  await SEL.montantRemis(page).fill("20000");
  await page.waitForTimeout(600);
  await snap(page, "22-encaisser-fc", { devise: page.getByRole("radiogroup", { name: "Devise remise par le client" }), du: page.getByText(/^Dû :/), montant: SEL.montantRemis(page), monnaie: page.getByText(/^Monnaie à rendre/) });
  await SEL.confirmerEncaissement(page).click();
  await page.waitForTimeout(2500);
  await snap(page, "23-recu-fc", { imprimer: SEL.imprimerRecu(page), terminer: SEL.terminer(page) });
  await SEL.terminer(page).click();
  await page.waitForTimeout(1500);

  // Compte créé par erreur (avec un article, pour montrer le retour en stock)
  await m.aller(page, "Caisse");
  await SEL.tableOuNom(page).fill("Table 9");
  await SEL.ouvrirCompte(page).click();
  await page.waitForTimeout(2000);
  await SEL.cartePersonne(page, "Personne 1").click();
  await page.waitForTimeout(2000);
  await SEL.produit(page, "Eau minérale").click();
  await SEL.validerPanier(page, "Personne 1").click();
  await page.waitForTimeout(2500);
  await snap(page, "24-compte-erreur", { annuler: SEL.annulerCompte(page) });
  await SEL.annulerCompte(page).click();
  await page.waitForTimeout(700);
  await snap(page, "25-annulation-dialogue");
  await page.getByRole("button", { name: "Garder" }).click();
  await page.waitForTimeout(500);
  await SEL.annulerCompte(page).click();
  await page.getByRole("button", { name: "Annuler le compte" }).last().click();
  await page.waitForTimeout(2000);
};

SECTIONS.rapide = async ({ page }) => {
  await m.aller(page, "Caisse");
  await snap(page, "30-vente-comptoir", { rapide: SEL.venteRapide(page), carte: SEL.carteVenteComptoir(page) });
  await SEL.venteRapide(page).click();
  await page.waitForTimeout(1800);
  // le paquet de démonstration n'a pas de caméra : on retire sa légende pour montrer le cadre de scan seul
  await page.evaluate(() => { for (const e of document.querySelectorAll("div")) if (e.children.length === 0 && /Caméra non disponible/.test(e.textContent)) e.textContent = ""; });
  await snap(page, "31-scan-camera", { terminer: page.getByRole("button", { name: "Terminer" }) });
  await page.getByRole("button", { name: "Terminer" }).click();
  await page.waitForTimeout(700);
  // la douchette est un champ caché toujours sélectionné : on simule la lecture d'un code (chiffres + Entrée)
  const lire = async (code) => { await page.keyboard.type(code, { delay: 20 }); await page.keyboard.press("Enter"); await page.waitForTimeout(700); };
  await lire("6009880123456");
  await lire("5449000000996");
  await lire("6009880123456");
  await snap(page, "32-scan-ajoute", { info: page.getByText(/ajouté \(/).first(), valider: SEL.validerPanier(page, "Client") });
  await lire("1234567890123");
  await snap(page, "33-scan-inconnu", { info: page.getByText(/inconnu/).first(), associer: page.getByRole("button", { name: /Associer le code/ }) });
  await SEL.validerPanier(page, "Client").click();
  await page.waitForTimeout(2500);
  await snap(page, "34-comptoir-compte", { encaisser: SEL.encaisser(page, "Client") });
};

SECTIONS.comptes = async ({ page }) => {
  await m.aller(page, "Comptes");
  await page.waitForTimeout(1500);
  await snap(page, "35-comptes-ouverts", { carte: page.getByRole("button", { name: /^Table 4/ }) });
};

SECTIONS.retrait = async ({ page }) => {
  await m.aller(page, "Retrait commande");
  await snap(page, "40-retrait-vide", { champ: SEL.reference(page), bouton: SEL.ouvrirCommande(page) });
  await SEL.reference(page).fill("E6A5E231");
  await snap(page, "41-retrait-saisi", { champ: SEL.reference(page), bouton: SEL.ouvrirCommande(page) });
  await SEL.ouvrirCommande(page).click();
  await page.waitForTimeout(2500);
  await snap(page, "42-retrait-compte", { bandeau: page.getByText("Commande passée depuis le site web") });
  await m.defiler(page, 400);
  await snap(page, "45-compte-pret", { servi: page.getByRole("button", { name: /^Marquer .* comme servi/ }).first(), encaisser: SEL.encaisser(page, "Mme Kabeya") });
};

SECTIONS.cuisine = async ({ page }) => {
  await m.aller(page, "Cuisine");
  await snap(page, "43-cuisine", { carte: page.getByRole("button", { name: /^Ouvrir le compte Table 4/ }), prendre: page.getByRole("button", { name: /^Prendre en charge/ }).first() });
  await page.getByRole("button", { name: /^Prendre en charge/ }).first().click();
  await page.waitForTimeout(1500);
  await snap(page, "44-cuisine-en-preparation", { pret: page.getByRole("button", { name: /^Marquer prêt/ }).first() });
};

SECTIONS.menu = async ({ page }) => {
  await taille(page, 1150);
  await m.aller(page, "Menu");
  await snap(page, "50-menu", { carte: page.getByText("Primus 72 cl", { exact: true }).first(), etiquette: page.getByRole("button", { name: /^Imprimer l'étiquette de Primus/ }) });
  await taille(page, 844);
};

SECTIONS.stock = async ({ page }) => {
  await m.aller(page, "Stock");
  await snap(page, "55-stock", { onglets: page.getByRole("tab", { name: "Mouvements" }), fab: SEL.nouveauMouvement(page) });
  await page.getByRole("tab", { name: "Valeur stock" }).click();
  await page.waitForTimeout(900);
  await snap(page, "55b-stock-valeur", { etiquettes: page.getByRole("button", { name: /^Étiquettes de prix de/ }).first() });
  await page.getByRole("tab", { name: "Mouvements" }).click();
  await SEL.nouveauMouvement(page).click();
  await page.waitForTimeout(900);
  await snap(page, "56a-stock-feuille", { produit: page.getByRole("button", { name: /Choisir un produit/ }) });
  await page.getByRole("button", { name: /Choisir un produit/ }).click();
  await page.waitForTimeout(900);
  await snap(page, "56b-stock-choix-produit");
  await page.getByText("Fanta 33 cl").first().click();
  await page.waitForTimeout(600);
  await page.getByRole("textbox", { name: "Quantité" }).fill("24");
  await page.getByRole("textbox", { name: /Motif du mouvement/ }).fill("Livraison du fournisseur");
  await snap(page, "56-stock-entree", { produit: page.getByRole("button", { name: /^Produit : Fanta/ }), quantite: page.getByRole("textbox", { name: "Quantité" }), enregistrer: page.getByRole("button", { name: "Enregistrer", exact: true }) });
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await page.waitForTimeout(2500);
  await snap(page, "57-stock-apres", { terminer: page.getByRole("button", { name: "Terminer" }) });
  await page.getByRole("button", { name: "Terminer" }).click().catch(() => undefined);
  await page.waitForTimeout(600);
};

SECTIONS.inventaire = async ({ page, ctx }) => {
  await m.aller(page, "Inventaire");
  await page.getByRole("textbox", { name: /Date de début de la période, format/ }).fill("01/10/2026");
  await page.getByRole("textbox", { name: /Date de fin de la période, format/ }).fill("20/10/2026");
  await page.getByRole("textbox", { name: /Titre de l'inventaire/ }).fill("Inventaire de fin octobre 2026");
  await snap(page, "60-inventaire-periode", { debut: page.getByRole("textbox", { name: /Date de début de la période, format/ }), fin: page.getByRole("textbox", { name: /Date de fin de la période, format/ }), lancer: page.getByRole("button", { name: "Lancer l'évaluation" }) });
  await page.getByRole("button", { name: "Lancer l'évaluation" }).click();
  await page.waitForTimeout(2500);
  const champs = page.getByRole("textbox", { name: /^Stock physique compté de/ });
  const n = await champs.count();
  for (let i = 0; i < n; i += 1) {
    const nom = await champs.nth(i).getAttribute("aria-label");
    const theo = Number(/stock théorique ([\d.,]+)/.exec(nom)[1].replace(",", "."));
    const ecart = /Coca/.test(nom) ? -1 : /Fanta/.test(nom) ? -2 : 0;
    await champs.nth(i).fill(String(theo + ecart));
  }
  await page.getByRole("textbox", { name: /^Note obligatoire pour l'écart de Coca/ }).fill("Une bouteille cassée au service");
  await page.getByRole("textbox", { name: /^Note obligatoire pour l'écart de Fanta/ }).fill("Deux Fanta offertes à un client");
  await snap(page, "61-inventaire-saisie", { barre: page.getByText(/produits saisis/), champ: champs.first(), valider: page.getByRole("button", { name: "Valider l'inventaire" }) });
  // Le serveur de démonstration ne peut pas fabriquer le PDF : on laisse l'application recevoir une réponse « inventaire enregistré »
  // calculée à partir de la vraie saisie, pour montrer l'écran de résultat.
  const lignes = [];
  for (let i = 0; i < n; i += 1) {
    const nom = await champs.nth(i).getAttribute("aria-label");
    lignes.push({ theo: Number(/stock théorique ([\d.,]+)/.exec(nom)[1].replace(",", ".")), physique: Number(await champs.nth(i).inputValue()) });
  }
  await ctx.route(/:40401\/stock\/inventaires$/, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const corps = route.request().postDataJSON();
    await route.fulfill({
      status: 201, contentType: "application/json",
      body: JSON.stringify({
        id: "demo", dateDebut: corps.dateDebut, dateFin: corps.dateFin, titre: corps.titre, createdBy: "Sylvie Katungu", createdAt: new Date().toISOString(), pdfUrl: "demo/inv.pdf",
        items: corps.items.map((it, i) => ({ id: "i" + i, produitId: it.produitId, stockTheorique: String(lignes[i].theo), stockPhysique: String(lignes[i].physique), ecart: String(lignes[i].physique - lignes[i].theo), note: it.note ?? null })),
      }),
    });
  });
  await page.getByRole("button", { name: "Valider l'inventaire" }).click();
  await page.waitForTimeout(900);
  await snap(page, "62-inventaire-confirmation");
  await page.getByRole("button", { name: "Enregistrer l'inventaire" }).click();
  await page.waitForTimeout(2000);
  await snap(page, "62r-inventaire-resultat", { pdf: page.getByRole("button", { name: /Télécharger le PDF/ }), nouveau: page.getByRole("button", { name: "Nouvel inventaire" }) });
  await page.getByRole("tab", { name: "Historique" }).click();
  await page.waitForTimeout(2000);
  await snap(page, "63-inventaire-historique", { pdf: page.getByRole("button", { name: /^Ouvrir le PDF/ }).first() });
};

SECTIONS.depenses = async ({ page }) => {
  await m.aller(page, "Dépenses");
  await snap(page, "70-depenses", { periodes: page.getByRole("button", { name: "Période : Ce mois" }), pdf: page.getByRole("button", { name: /Télécharger le PDF des dépenses/ }), fab: SEL.nouvelleDepense(page) });
  await SEL.nouvelleDepense(page).click();
  await page.waitForTimeout(900);
  await page.getByRole("textbox", { name: "Motif de la dépense" }).fill("Achat de charbon de bois");
  await page.getByRole("textbox", { name: "Montant de la dépense" }).fill("15");
  await snap(page, "71-depense-formulaire", { motif: page.getByRole("textbox", { name: "Motif de la dépense" }), montant: page.getByRole("textbox", { name: "Montant de la dépense" }), enregistrer: page.getByRole("button", { name: "Enregistrer", exact: true }) });
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await page.waitForTimeout(2000);
  await snap(page, "72-depenses-apres", { nouvelle: page.getByRole("button", { name: /^Achat de charbon de bois/ }).first() });
  await page.getByRole("button", { name: /^Achat de charbon de bois/ }).first().click();
  await page.waitForTimeout(900);
  await snap(page, "72b-depense-corriger", { annuler: page.getByRole("button", { name: "Annuler cette dépense" }) });
  await m.fermerTiroir(page);
};

SECTIONS.journal = async ({ page }) => {
  await m.aller(page, "Journal des reçus");
  await snap(page, "73-journal-recus", { carte: page.getByRole("button", { name: /^Reçu CAF-/ }).first() });
  await page.getByRole("button", { name: /^Reçu CAF-/ }).first().click();
  await page.waitForTimeout(1200);
  await snap(page, "74-recu-detail", { reimprimer: page.getByRole("button", { name: "Réimprimer le reçu" }) });
  await m.fermerTiroir(page);
};

SECTIONS.rapports = async ({ page }) => {
  await m.aller(page, "Rapports mensuels");
  await snap(page, "75-rapports-vide", { mois: page.getByRole("button", { name: /^Mois :/ }), generer: page.getByRole("button", { name: "Générer le rapport" }) });
  sql(RAPPORT_SQL);
  await m.aller(page, "Accueil");
  await m.aller(page, "Rapports mensuels");
  await page.waitForTimeout(1500);
  await snap(page, "76-rapports-genere", { pdf: page.getByRole("button", { name: "Ouvrir le PDF" }), regenerer: page.getByRole("button", { name: "Régénérer" }), concordant: page.getByText("Concordant") });
};

SECTIONS.horsligne = async ({ ctx, page }) => {
  await m.aller(page, "Accueil");
  await ctx.setOffline(true);
  await page.getByText(/^Hors ligne/).first().waitFor({ timeout: 40000 }).catch(() => undefined);
  await page.waitForTimeout(800);
  await snap(page, "80-hors-ligne-accueil", { bandeau: page.getByText(/^Hors ligne/).first(), cloche: SEL.cloche(page) });
  await m.aller(page, "Caisse");
  await SEL.tableOuNom(page).fill("Table 3");
  await SEL.premierePersonne(page).fill("Client");
  await SEL.ouvrirCompte(page).click();
  await page.waitForTimeout(2000);
  await SEL.cartePersonne(page, "Client").click();
  await page.waitForTimeout(2000);
  await SEL.produit(page, "Eau minérale").click();
  await SEL.produit(page, "Coca-Cola 33 cl").click();
  await SEL.validerPanier(page, "Client").click();
  await page.waitForTimeout(2000);
  await SEL.encaisser(page, "Client").click();
  await page.waitForTimeout(900);
  await SEL.mode(page, "Espèces").click();
  await SEL.montantRemis(page).fill("5");
  await SEL.confirmerEncaissement(page).click();
  await page.waitForTimeout(2500);
  await snap(page, "81-hors-ligne-recu", { total: page.getByText(/provisoire/).first(), numero: page.getByText(/TEMP-/).first() });
  await SEL.terminer(page).click();
  await page.waitForTimeout(1500);
  await m.aller(page, "Accueil");
  await snap(page, "82-hors-ligne-en-attente", { bandeau: page.getByText(/^Hors ligne/).first() });
  await m.aller(page, "Synchronisation");
  await snap(page, "84-synchronisation", { etat: page.getByText(/^Hors ligne/).first(), bouton: page.getByRole("button", { name: "Synchroniser maintenant" }) });
  await ctx.setOffline(false);
  await page.waitForTimeout(12000);
  await snap(page, "83-retour-reseau", { etat: page.getByText("À jour").first() });
};

/* ------------------------------------------------------------------ exécution */
(async () => {
  const demandees = process.argv.slice(2);
  const noms = demandees.length ? demandees : Object.keys(SECTIONS);
  if (!demandees.length) sql(DECOR_SQL);
  const nav = await m.navigateur();
  const ctx = await contexteCafetaria(nav);
  const page = await m.connecter(ctx, "caf");
  page.setDefaultTimeout(15000);
  for (const nom of noms) {
    try {
      await Promise.race([SECTIONS[nom]({ ctx, page }), new Promise((_, no) => setTimeout(() => no(new Error("délai dépassé (150 s)")), 150000))]);
      console.log("ok      ", nom);
    } catch (e) {
      console.log("ÉCHEC   ", nom, "-", String(e.message).split("\n")[0]);
      await page.screenshot({ path: `/tmp/cafetaria-echec-${nom}.png`, timeout: 5000 }).catch(() => undefined);
      await ctx.setOffline(false).catch(() => undefined);
      await page.setViewportSize({ width: 390, height: 844 }).catch(() => undefined);
      await page.reload().catch(() => undefined);
      await page.waitForTimeout(3000);
      if (await page.getByText("Ravi de vous revoir !").isVisible().catch(() => false)) await m.entrer(page, "caf").catch(() => undefined);
    }
  }
  await nav.close();
})();
