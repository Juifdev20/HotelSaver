/**
 * Captures de la partie RÉCEPTION du guide : l'application MOBILE (apps/mobile compilée pour le web, voir outils/mobile-web), compte « gl-recep »
 * (Aline Masika, Hôtel Grand Lac), connexion par numéro comme un vrai utilisateur.
 *
 * Mise en route (hôte NEUF : chaque démarrage remet la base à zéro) :
 *   GUIDE_TELEPHONES=1 docs/guide/outils/mobile-web/demarrer.sh 40400 hotel_t5
 *   GUIDE_PORT_BASE=40400 GUIDE_DB=hotel_t5 node docs/guide/captures-scripts/reception-mobile.cjs
 *
 * Les images vont dans docs/guide/captures/brut/reception-*.png ; les positions des éléments à entourer (fractions de la capture) dans
 * captures/brut/reception-reperes.json, lu par contenu/reception.mjs. Les sections s'enchaînent dans l'ordre (la base évolue).
 */
const { spawnSync } = require("node:child_process");
const { existsSync, readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

process.env.GUIDE_SORTIE = process.env.GUIDE_SORTIE ?? join(__dirname, "../captures/brut");
process.env.GUIDE_TELEPHONES = process.env.GUIDE_TELEPHONES ?? "1";
const m = require("../outils/mobile-web/mobile.cjs");

const DB = process.env.GUIDE_DB ?? "hotel_t5";
const PSQL = ["-U", "postgres", "-h", "/tmp", "-p", "54330", "-d", DB, "-q", "-v", "ON_ERROR_STOP=1"];
const FICHIER_REPERES = join(m.SORTIE, "reception-reperes.json");

function sql(texte) {
  const r = spawnSync("psql", [...PSQL, "-At", "-c", texte], { encoding: "utf8" });
  if (r.status !== 0) throw new Error("psql : " + r.stderr);
  return r.stdout.trim();
}

/* ------------------------------------------------------------------ décor */
const DECOR_SQL = `
-- Grâce Kabasele (106) part ce soir : la vue « Aujourd'hui » montre une arrivée ET un départ.
UPDATE "Reservation" SET "dateDepart" = date_trunc('day', now()) + interval '20 hours'
 WHERE "clientId" = (SELECT id FROM "Client" WHERE nom='Grâce Kabasele');
-- Esther Mbuyi (202) a payé son acompte de 60 $ en ligne (mobile money).
INSERT INTO "PaiementReservation"(id,"hotelId","reservationId",montant,devise,pourcentage,moyen,operateur,"telephoneMasque",statut,"modeleCommission","cleIdempotence","referenceFournisseur","confirmeLe","createdAt","updatedAt")
SELECT gen_random_uuid()::text, r."hotelId", r.id, 60, 'USD', 20, 'MOBILE_MONEY', 'VODACOM', '+243 85• ••• •04', 'REUSSI', 'CUSTOMER_PAID', 'cle-esther', 'FP-3C9A1E07', now() - interval '1 day', now() - interval '1 day', now()
FROM "Reservation" r JOIN "Client" c ON c.id = r."clientId" WHERE c.nom = 'Esther Mbuyi';
UPDATE "Client" SET "typePiece"='CNI', "numeroPiece"='NK-2210457', notes='Préfère une chambre à l''étage.' WHERE nom='Grâce Kabasele';
`;

/* ------------------------------------------------------------------ mesures et photos */
const REPERES = existsSync(FICHIER_REPERES) ? JSON.parse(readFileSync(FICHIER_REPERES, "utf8")) : {};

/**
 * Boîte d'un élément en fractions de l'écran. `carte: true` remonte jusqu'à la carte qui le contient (bord ou fond arrondi),
 * pour entourer un bloc entier à partir de son titre.
 */
async function boite(page, loc, { carte = false } = {}) {
  const l = loc.first();
  if (!(await l.count())) return null;
  const b = await l.evaluate((e, carte) => {
    let x = e;
    if (carte) {
      for (let n = e.parentElement; n && n !== document.body; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (parseFloat(s.borderTopWidth) > 0 && parseFloat(s.borderTopLeftRadius) >= 6) { x = n; break; }
      }
    }
    const r = x.getBoundingClientRect();
    return { x: r.x, y: r.y, l: r.width, h: r.height };
  }, carte);
  const v = page.viewportSize();
  const a = (n) => Math.round(n * 1000) / 1000;
  return { x: a(b.x / v.width), y: a(b.y / v.height), l: a(b.l / v.width), h: a(b.h / v.height) };
}

/** Réunion de plusieurs boîtes (par ex. tous les onglets d'une barre). */
function union(bs) {
  const ok = bs.filter(Boolean);
  if (!ok.length) return null;
  const x0 = Math.min(...ok.map((b) => b.x)), y0 = Math.min(...ok.map((b) => b.y));
  const x1 = Math.max(...ok.map((b) => b.x + b.l)), y1 = Math.max(...ok.map((b) => b.y + b.h));
  const a = (n) => Math.round(n * 1000) / 1000;
  return { x: a(x0), y: a(y0), l: a(x1 - x0), h: a(y1 - y0) };
}

/**
 * Photographie `reception-<nom>` après avoir mesuré les éléments : `mesures` = { cle: locator | [locator, options] | fonction async → boîte }.
 */
async function cap(page, nom, mesures = {}) {
  await m.attendreChargement(page, { delai: 6000 });
  const r = {};
  for (const [cle, quoi] of Object.entries(mesures)) {
    let b = null;
    try {
      if (typeof quoi === "function") b = await quoi();
      else if (Array.isArray(quoi)) b = await boite(page, quoi[0], quoi[1]);
      else b = await boite(page, quoi);
    } catch (e) {
      b = null;
    }
    if (b && b.y >= 0 && b.y + b.h <= 1.001) r[cle] = b;
    else console.log(`  !! repère absent ou hors écran : ${nom}/${cle}`);
  }
  REPERES[nom] = r;
  writeFileSync(FICHIER_REPERES, JSON.stringify(REPERES, null, 1));
  await m.photo(page, `reception-${nom}`);
  console.log("  capture", nom);
}

/** Amène un élément au milieu de l'écran (le contenu défile dans son propre conteneur). */
async function centrer(loc, bloc = "center") {
  await loc.first().evaluate((e, bloc) => e.scrollIntoView({ block: bloc }), bloc);
  await loc.page().waitForTimeout(500);
}


const bouton = (p, nom) => p.getByRole("button", { name: nom }).first();
const exact = (p, nom) => p.getByRole("button", { name: nom, exact: true }).first();
const texte = (p, t) => p.getByText(t, { exact: true }).first();
const onglets = (p) => async () => union(await Promise.all(["Accueil", "Chambres", "Réserv.", "Dépenses", "Plus"].map((n) => boite(p, p.getByRole("tab", { name: n, exact: true })))));
const vues = (p) => async () => union(await Promise.all(["Aujourd'hui", "À venir", "En cours", "Historique", "Planning"].map((n) => boite(p, p.getByRole("tab", { name: n, exact: true })))));

/** Élément visible seulement sur la liste de chaque onglet. */
const REPERE_ONGLET = {
  "Réserv.": (p) => p.getByRole("tab", { name: "Aujourd'hui", exact: true }).first(),
  Chambres: (p) => p.getByRole("button", { name: /^Chambre 101,/ }).first(),
  Dépenses: (p) => p.getByRole("button", { name: "Nouvelle dépense" }).first(),
};

/** Revient à la liste « Plus » quelle que soit la profondeur, puis ouvre l'entrée. Les onglets du bas sont ouverts directement. */
async function aller(page, libelle) {
  await m.fermerTiroir(page);
  const onglet = page.getByRole("tab", { name: libelle, exact: true });
  if (await onglet.count()) {
    await onglet.first().click();
    await m.attendreChargement(page);
    // L'onglet garde l'écran ouvert dedans (fiche d'une réservation…) : on remonte jusqu'à sa liste.
    const repere = REPERE_ONGLET[libelle]?.(page);
    for (let i = 0; i < 4 && repere && !(await repere.isVisible().catch(() => false)); i++) await m.retour(page);
    return;
  }
  await page.getByRole("tab", { name: "Plus", exact: true }).click();
  await page.waitForTimeout(500);
  // Le nom d'une entrée peut porter un compteur (« Synchronisation, 2 à vérifier ») : début du nom seulement.
  const entree = page.getByRole("button", { name: new RegExp(`^${libelle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(,|$)`) }).first();
  for (let i = 0; i < 4 && !(await entree.isVisible().catch(() => false)); i++) await m.retour(page);
  await entree.click({ timeout: 6000 }).catch(async (e) => {
    await page.screenshot({ path: join(m.SORTIE, "../echec-aller.png") });
    console.log((await m.inventaire(page)).join("\n"));
    throw e;
  });
  await m.attendreChargement(page);
}

/** Revient en haut de la liste de l'écran (vues Réserv. etc.). */
async function haut(page) {
  await page.evaluate(() => document.querySelectorAll("div").forEach((d) => { if (d.scrollTop) d.scrollTop = 0; }));
  await page.waitForTimeout(300);
}

/* ------------------------------------------------------------------ parcours */
(async () => {
  // DEPUIS=conflit : ne refait que la dernière section (le décor est déjà posé).
  const tout = !process.env.DEPUIS;
  if (tout) sql(DECOR_SQL);
  const nav = await m.navigateur();

  /* ---- 1. Connexion (sans être connecté) */
  if (tout) {
    const ctx = await m.contexte(nav, { heure: "9:41" });
    const page = await m.ouvrir(ctx);
    await cap(page, "connexion-vide", { oublie: exact(page, "Mot de passe oublié ?") });
    await page.getByPlaceholder("Numéro de téléphone").fill("970000002");
    await page.getByRole("textbox", { name: "Mot de passe *" }).fill("motdepasse");
    await cap(page, "connexion-remplie", {
      numero: [page.getByPlaceholder("Numéro de téléphone"), { carte: true }],
      motdepasse: [page.getByRole("textbox", { name: "Mot de passe *" }), { carte: true }],
      bouton: exact(page, "Se connecter"),
    });
    await page.getByPlaceholder("Numéro de téléphone").fill("");
    await exact(page, "Mot de passe oublié ?").click();
    await page.waitForTimeout(1200);
    const champ = page.getByPlaceholder("Numéro de téléphone");
    if (await champ.count()) await champ.first().fill("970000002");
    await cap(page, "oubli", { continuer: bouton(page, /^Continuer|^Envoyer/) });
    await ctx.close();
  }

  const ctx = await m.contexte(nav, { heure: "9:41", imprimantes: [{ name: "Imprimante BT-58", address: "AA:BB:CC:DD:EE:FF" }] });
  const page = await m.connecter(ctx, "recep");

  if (tout) {
  /* ---- 2. Accueil, Plus, notifications */
  await cap(page, "accueil", {
    avatar: bouton(page, "Menu du compte"),
    cloche: bouton(page, /^Notifications/),
    hero: [texte(page, "Hôtel Grand Lac").locator("xpath=.."), {}],
    encaissements: async () => union([await boite(page, page.getByText(/^en dollars$/i).first(), { carte: true }), await boite(page, page.getByText(/^en francs$/i).first(), { carte: true })]),
    occupation: [texte(page, "Taux d'occupation"), { carte: true }],
    barre: onglets(page),
  });
  await aller(page, "Plus");
  await cap(page, "plus");
  await bouton(page, /^Notifications/).click();
  await page.waitForTimeout(1200);
  await cap(page, "notifications");
  await m.fermerTiroir(page);

  /* ---- 3. Chambres */
  await aller(page, "Chambres");
  const ch103 = bouton(page, /^Chambre 103,/);
  await cap(page, "chambres", {
    retour: bouton(page, /^Retour/),
    carte: ch103,
    etat: ch103.getByText("Nettoyage", { exact: true }),
    liste: async () => union([await boite(page, bouton(page, /^Chambre 101,/)), await boite(page, bouton(page, /^Chambre 104,/))]),
  });
  await ch103.click();
  await page.waitForTimeout(900);
  await cap(page, "chambre-etat");
  await bouton(page, "Passer la chambre en Libre").click();
  await page.waitForTimeout(1500);
  await cap(page, "chambre-modifiee", { etat: bouton(page, /^Chambre 103,/).getByText("Libre", { exact: true }) });

  /* ---- 4. Réservations : liste (vue À venir : pastilles), planning */
  await aller(page, "Réserv.");
  await page.getByRole("tab", { name: "À venir", exact: true }).click();
  await m.attendreChargement(page);
  const esther = bouton(page, /^Esther Mbuyi/);
  await cap(page, "reservations", {
    vues: vues(page),
    carte: esther,
    badge: esther.getByText(/Payé en ligne/).first(),
    nouvelle: exact(page, "Nouvelle réservation"),
  });
  await cap(page, "paye-en-ligne-liste", { badge: esther.getByText(/Payé en ligne/).first() });
  await esther.click();
  await m.attendreChargement(page);
  const blocEnLigne = page.getByText(/Acompte payé en ligne/).first();
  if (await blocEnLigne.count()) await centrer(blocEnLigne);
  await cap(page, "paye-en-ligne-detail", { bloc: [blocEnLigne, { carte: true }] });
  await m.retour(page);

  await page.getByRole("tab", { name: "Planning", exact: true }).click();
  await m.attendreChargement(page);
  await cap(page, "planning", { barre: bouton(page, /Patrick Ilunga/) });

  /* ---- 5. Nouvelle réservation */
  await page.getByRole("tab", { name: "Aujourd'hui", exact: true }).click();
  await m.attendreChargement(page);
  await exact(page, "Nouvelle réservation").click();
  await m.attendreChargement(page);
  await exact(page, "Une nuit de plus").click();
  const dateArr = page.getByRole("textbox", { name: /Date d'arrivée/ });
  await cap(page, "nouvelle-sejour", { sejour: async () => union([await boite(page, dateArr, { carte: true }), await boite(page, exact(page, "Une nuit de plus"), { carte: true })]) });
  const ch201 = page.getByRole("radio", { name: /^Chambre 201,/ });
  await ch201.click();
  await centrer(ch201);
  await cap(page, "nouvelle-chambre", { chambre: ch201 });
  const nom = page.getByRole("textbox", { name: "Nom du client, obligatoire" });
  await centrer(nom, "start");
  await nom.fill("Josué Kasereka");
  await page.getByRole("textbox", { name: "Téléphone du client" }).fill("812345678");
  await cap(page, "nouvelle-client", { nom });
  const typePiece = page.getByRole("textbox", { name: "Type de pièce d'identité" });
  const numPiece = page.getByRole("textbox", { name: "Numéro de la pièce d'identité" });
  await typePiece.fill("Passeport");
  await numPiece.fill("OP0457812");
  await centrer(numPiece);
  await cap(page, "nouvelle-piece", { piece: async () => union([await boite(page, typePiece), await boite(page, numPiece)]) });
  await page.getByRole("radio", { name: "Client existant" }).click();
  await page.waitForTimeout(700);
  await centrer(page.getByRole("radio", { name: "Client existant" }), "start");
  await page.evaluate(() => document.querySelectorAll("div").forEach((d) => { if (d.scrollTop) d.scrollTop -= 120; }));
  await page.waitForTimeout(400);
  await cap(page, "nouvelle-existant", { mode: async () => union([await boite(page, page.getByRole("radio", { name: "Nouveau client" })), await boite(page, page.getByRole("radio", { name: "Client existant" }))]) });
  await page.getByRole("radio", { name: "Nouveau client" }).click();
  await page.waitForTimeout(500);
  const acompte = page.getByRole("textbox", { name: "Acompte versé" });
  await acompte.fill("50");
  await centrer(acompte);
  await cap(page, "nouvelle-acompte", { acompte: [acompte, { carte: true }] });
  const demandes = page.getByRole("textbox", { name: /Demandes spéciales/ });
  await demandes.fill("Lit bébé, étage élevé");
  const caseCheckin = page.getByRole("checkbox", { name: /Le client est déjà là/ });
  await centrer(caseCheckin);
  await cap(page, "nouvelle-fin", { case: caseCheckin });
  await exact(page, "Créer la réservation").click();
  await page.waitForTimeout(2500);
  await m.attendreChargement(page);
  await cap(page, "reservation-creee", { statut: texte(page, "Confirmée") });

  /* ---- 6. Arrivées et départs, check-in */
  await aller(page, "Arrivées et départs");
  await haut(page);
  await cap(page, "arrivees", {
    titre: page.getByText(/séjours?|réservations?/i).first(),
    vues: vues(page),
    arrivee: bouton(page, /^Patrick Ilunga/),
    depart: bouton(page, /^Grâce Kabasele/),
  });
  await bouton(page, /^Patrick Ilunga/).click();
  await m.attendreChargement(page);
  await centrer(exact(page, "Check-in"));
  await cap(page, "reservation-detail", {
    checkin: exact(page, "Check-in"),
    suivi: exact(page, "Partager le lien de suivi"),
    annuler: exact(page, "Annuler la réservation"),
  });
  // « suivi » et « annuler » peuvent être hors de l'écran : seconde mesure centrée sur chacun, gardée si la première manque.
  for (const [cle, loc] of [["suivi", exact(page, "Partager le lien de suivi")], ["annuler", exact(page, "Annuler la réservation")], ["checkin", exact(page, "Check-in")]]) {
    if (!REPERES["reservation-detail"][cle]) console.log(`  (${cle} hors écran)`);
    void loc;
  }
  await exact(page, "Modifier dates / acompte").click();
  await page.waitForTimeout(1000);
  await cap(page, "modifier");
  await m.fermerTiroir(page);
  if (await bouton(page, /^Annuler$/).isVisible().catch(() => false)) await bouton(page, /^Annuler$/).click();
  await page.waitForTimeout(500);
  await exact(page, "Contacter le client par WhatsApp").click();
  await page.waitForTimeout(1000);
  await cap(page, "whatsapp");
  await m.fermerTiroir(page);
  if (await bouton(page, /^Annuler$/).isVisible().catch(() => false)) await bouton(page, /^Annuler$/).click();
  await page.waitForTimeout(500);
  await exact(page, "Check-in").click();
  await page.waitForTimeout(800);
  const confirmer = page.getByRole("button", { name: /^(Check-in|Confirmer|OK)$/ }).last();
  if (await page.getByRole("dialog").count()) await confirmer.click();
  await page.waitForTimeout(2000);
  await m.attendreChargement(page);
  await haut(page);
  await cap(page, "checkin-fait", {
    statut: [texte(page, "En cours"), { carte: true }],
    facturer: bouton(page, /^Facturer et check-out/),
  });

  /* ---- 7. Facturer le départ de Jean-Pierre Mukendi (101 : 3 nuits × 45 $ = 135 $) */
  await aller(page, "Réserv.");
  await page.getByRole("tab", { name: "En cours", exact: true }).click();
  await m.attendreChargement(page);
  await bouton(page, /^Jean-Pierre Mukendi/).click();
  await m.attendreChargement(page);
  await bouton(page, /^Facturer et check-out/).click();
  await m.attendreChargement(page);
  await cap(page, "facturer-detail", { total: [page.getByText(/Total à payer/).first(), { carte: true }] });
  const especes = page.getByRole("radio", { name: /Espèces/ }).first();
  await centrer(especes);
  await cap(page, "facturer-mode", {
    mode: async () => union([await boite(page, especes), await boite(page, page.getByRole("radio", { name: /Mobile money/i }).first())]),
    valider: bouton(page, /^Facturer et check-out/),
  });
  const cdf = page.getByRole("radiogroup", { name: /Devise remise/ }).getByRole("radio", { name: /CDF/ });
  if (await cdf.count()) await cdf.click();
  else await page.getByRole("radio", { name: /^CDF/ }).first().click();
  await page.waitForTimeout(500);
  const remis = page.getByRole("textbox", { name: /Montant remis/ });
  await remis.fill("400000");
  const renduCdf = page.getByRole("radiogroup", { name: /monnaie rendue|Rendre la monnaie/ }).getByRole("radio", { name: /CDF/ });
  if (await renduCdf.count()) await renduCdf.click();
  await page.waitForTimeout(600);
  await centrer(remis);
  await cap(page, "facturer-croise", {
    devise: async () => boite(page, page.getByRole("radiogroup", { name: /Devise remise/ })),
    montant: remis,
    monnaie: [page.getByText(/Monnaie à rendre/).first(), {}],
  });
  await bouton(page, /^Facturer et check-out/).click();
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: /^Facturer et check-out/ }).last().click();
  await page.waitForTimeout(2500);
  await m.attendreChargement(page);
  await cap(page, "facture-creee", { numero: page.getByText(/^(TEMP|REC)-/).first(), imprimer: exact(page, "Imprimer le reçu") });

  /* ---- 8. Annuler une réservation (Daniel Tshimanga, à venir) */
  await aller(page, "Réserv.");
  await page.getByRole("tab", { name: "À venir", exact: true }).click();
  await m.attendreChargement(page);
  await bouton(page, /^Daniel Tshimanga/).click();
  await m.attendreChargement(page);
  await exact(page, "Annuler la réservation").click();
  await page.waitForTimeout(900);
  const motif = page.getByRole("textbox", { name: /Motif/i });
  const nonPresente = bouton(page, /Client non présenté/);
  if (await nonPresente.count()) await nonPresente.click();
  else await motif.fill("Client non présenté");
  await page.waitForTimeout(400);
  await cap(page, "annuler", { motif: [motif, {}], confirmer: bouton(page, /^Confirmer l'annulation/) });
  await bouton(page, /^Confirmer l'annulation/).click();
  await page.waitForTimeout(1500);

  /* ---- 9. Clients */
  await aller(page, "Clients");
  const recherche = page.getByRole("textbox", { name: /Rechercher un client/ });
  await cap(page, "clients", { recherche });
  await bouton(page, /^Grâce Kabasele/).click();
  await m.attendreChargement(page);
  // Le titre porte un compteur (« Séjours (1) ») ; on entoure le titre et la liste des séjours.
  const sejours = page.getByText(/^Séjours/i).first();
  const premierSejour = page.getByText(/^Ch\. \d+/).first();
  if (await sejours.count()) await centrer(sejours);
  await cap(page, "client-fiche", { sejours: async () => union([await boite(page, sejours), await boite(page, premierSejour, { carte: true })]) });
  await exact(page, "Compléter la fiche").click();
  await page.waitForTimeout(900);
  const enregistrer = bouton(page, /^Enregistrer/);
  if (await enregistrer.count()) await centrer(enregistrer);
  await cap(page, "client-modifier", { enregistrer });
  await m.fermerTiroir(page);

  /* ---- 10. Journal, dépenses, reçus, rapports */
  await aller(page, "Journal de la journée");
  await cap(page, "journal", {
    encaissements: [texte(page, "Encaissements du jour"), { carte: true }],
    arrivees: [page.getByText(/^Arrivées ·/).first(), { carte: true }],
    departs: [page.getByText(/^Départs ·/).first(), { carte: true }],
    parc: [page.getByText(/^Parc de chambres/).first(), { carte: true }],
  });

  await aller(page, "Dépenses");
  await cap(page, "depenses", { pdf: bouton(page, "Télécharger le PDF des dépenses") });
  await bouton(page, "Nouvelle dépense").click();
  await page.waitForTimeout(900);
  const motifDep = page.getByRole("textbox", { name: /Motif/i }).first();
  await motifDep.fill("Transport du linge à la blanchisserie");
  const montantDep = page.getByRole("textbox", { name: /Montant/i }).first();
  if (await montantDep.count()) await montantDep.fill("8");
  await cap(page, "depense-nouvelle", { motif: [motifDep, {}] });
  const enreg = bouton(page, /^Enregistrer/);
  if (await enreg.count()) await enreg.click();
  await page.waitForTimeout(1500);
  await m.fermerTiroir(page);
  await bouton(page, /^Produits d'entretien/).click();
  await page.waitForTimeout(900);
  const annulerDep = bouton(page, /Annuler cette dépense/);
  if (await annulerDep.count()) await centrer(annulerDep);
  await cap(page, "depense-corriger", { annuler: annulerDep });
  await m.fermerTiroir(page);
  if (await bouton(page, /^Fermer|^Annuler$/).isVisible().catch(() => false)) await bouton(page, /^Fermer|^Annuler$/).click();

  await aller(page, "Journal des reçus");
  await cap(page, "recus", { carte: bouton(page, /^Reçu /) });
  await bouton(page, /^Reçu /).click();
  await m.attendreChargement(page);
  const reimprimer = bouton(page, /Réimprimer le reçu/);
  if (await reimprimer.count()) await centrer(reimprimer);
  await cap(page, "recu-detail", { reimprimer });

  await aller(page, "Rapports mensuels");
  await cap(page, "rapports", { generer: exact(page, "Générer le rapport") });

  await aller(page, "Synchronisation");
  await cap(page, "synchro", { synchroniser: exact(page, "Synchroniser maintenant") });

  /* ---- 11. Hors ligne : bandeau, reçu provisoire, retour du réseau */
  await ctx.setOffline(true);
  await page.waitForTimeout(1500);
  await aller(page, "Chambres");
  await bouton(page, /^Chambre 102,/).click();
  await page.waitForTimeout(700);
  await bouton(page, "Passer la chambre en Nettoyage").click();
  await page.waitForTimeout(800);
  await aller(page, "Réserv.");
  await page.getByRole("tab", { name: "Aujourd'hui", exact: true }).click();
  await m.attendreChargement(page);
  await bouton(page, /^Grâce Kabasele/).click();
  await m.attendreChargement(page);
  await bouton(page, /^Facturer et check-out/).click();
  await m.attendreChargement(page);
  await bouton(page, /^Facturer et check-out/).click();
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: /^Facturer et check-out/ }).last().click();
  await page.waitForTimeout(2500);
  const bandeau = page.getByText(/^Hors ligne/).first();
  await cap(page, "recu-provisoire", { numero: page.getByText(/^TEMP-/).first() });
  await cap(page, "hl-bandeau", { bandeau });
  await ctx.setOffline(false);
  await page.waitForTimeout(700);
  await cap(page, "hl-retour", { bandeau: page.getByText(/actions? à envoyer|Envoi|Synchronisation/).first() });
  await page.waitForTimeout(6000);

  }

  /* ---- 12. Conflit et action échouée */
  await ctx.setOffline(true);
  await page.waitForTimeout(1200);
  // (a) fiche client modifiée sur le téléphone pendant que le serveur la change aussi -> conflit
  await aller(page, "Clients");
  await bouton(page, /^Patrick Ilunga/).click();
  await m.attendreChargement(page);
  await exact(page, "Compléter la fiche").click();
  await page.waitForTimeout(800);
  const notes = page.getByRole("textbox", { name: /Notes/ }).first();
  await notes.fill("Client fidèle, arrive tard le soir.");
  await bouton(page, /^Enregistrer/).click();
  await page.waitForTimeout(1000);
  sql(`UPDATE "Client" SET notes='Vient pour affaires', "syncVersion"="syncVersion"+1, "updatedAt"=now() WHERE nom='Patrick Ilunga'`);
  // (b) réservation de la chambre 201 sur des dates qu'un autre a prises entre-temps -> action refusée
  await aller(page, "Réserv.");
  await exact(page, "Nouvelle réservation").click();
  await m.attendreChargement(page);
  let libre = null;
  for (const n of ["105", "102", "103", "201", "202"]) {
    const r = page.getByRole("radio", { name: new RegExp(`^Chambre ${n},`) }).first();
    if ((await r.getAttribute("aria-disabled")) !== "true") { libre = n; await r.click(); break; }
  }
  await page.getByRole("textbox", { name: "Nom du client, obligatoire" }).fill("Benjamin Paluku");
  await exact(page, "Créer la réservation").click();
  await page.waitForTimeout(1500);
  sql(`INSERT INTO "Reservation"(id,"hotelId","chambreId","clientId","dateArrivee","dateDepart",acompte,statut,origine,"createdBy","jetonSuivi","updatedAt")
       SELECT gen_random_uuid()::text, h.id, (SELECT id FROM "Chambre" WHERE numero='${libre}'), (SELECT id FROM "Client" WHERE nom='Chantal Mwamba'),
              date_trunc('day', now()) + interval '12 hours', date_trunc('day', now()) + interval '2 days 10 hours', 0, 'CONFIRMEE', 'RECEPTION',
              (SELECT id FROM "Utilisateur" WHERE "supabaseAuthId"='gl-patron'), 'jeton-conflit-' || gen_random_uuid(), now() FROM (SELECT id FROM "Hotel" LIMIT 1) h`);
  await ctx.setOffline(false);
  await page.waitForTimeout(8000);
  await aller(page, "Synchronisation");
  await exact(page, "Synchroniser maintenant").click().catch(() => {});
  await page.waitForTimeout(4000);
  // L'action refusée peut attendre un second passage avant d'apparaître dans « Actions échouées ».
  for (let i = 0; i < 3 && !(await bouton(page, /^Retirer l.action/).count()); i++) {
    await exact(page, "Synchroniser maintenant").click().catch(() => {});
    await page.waitForTimeout(5000);
  }
  // Taille d'un vrai téléphone : on fait défiler jusqu'à l'élément au lieu d'allonger l'écran.
  await centrer(bouton(page, "Garder la version du serveur"));
  await cap(page, "synchro-conflit", { garder: bouton(page, "Garder la version du serveur") });
  // L'action refusée n'apparaît qu'une fois le conflit réglé : on garde la version du serveur, puis on resynchronise.
  await bouton(page, "Garder la version du serveur").click().catch(() => {});
  await page.waitForTimeout(1500);
  for (let i = 0; i < 4 && !(await bouton(page, /^Retirer l.action/).count()); i++) {
    await exact(page, "Synchroniser maintenant").click().catch(() => {});
    await page.waitForTimeout(5000);
  }
  await bouton(page, /^Retirer l.action/).waitFor({ timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(800);
  await centrer(bouton(page, /^Retirer l.action/));
  await cap(page, "synchro-echec", { retirer: bouton(page, /^Retirer l.action/) });

  await nav.close();
  console.log("terminé");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
