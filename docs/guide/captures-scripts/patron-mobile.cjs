/**
 * Captures de la partie PATRON du guide : l'application MOBILE (apps/mobile compilée pour le web, voir outils/mobile-web), compte « gl-patron »
 * (Joël Kambale, Hôtel Grand Lac), connexion par numéro.
 *
 * Mise en route (hôte NEUF, avec le faux ScanLinkPay) :
 *   GUIDE_TELEPHONES=1 docs/guide/captures-scripts/patron-hote.sh demarrer
 *   node docs/guide/outils/mobile-web/serveur.mjs 40004 /tmp/guide-hotes/arret-mobile-40000 &     # paquet mobile déjà compilé (demarrer.sh)
 *   GUIDE_PORT_BASE=40000 node docs/guide/captures-scripts/patron-mobile.cjs [partie …]
 * Parties, dans l'ordre : inscription accueil reglages site equipe reception cafeteria rapports abonnement horsligne.
 * Images : docs/guide/captures/brut/patron-*.png ; repères : captures-scripts/patron-reperes.json (lu par contenu/patron.mjs).
 * Les captures du site web (patron-90…95) restent faites par patron-web.cjs.
 */
const { join } = require("node:path");
const http = require("node:http");
process.env.GUIDE_SORTIE = process.env.GUIDE_SORTIE ?? join(__dirname, "../captures/brut");
process.env.GUIDE_TELEPHONES = process.env.GUIDE_TELEPHONES ?? "1";
const { m, unionDe, centrer, decaler, haut, aller, appareil, contexteVers } = require("./mobile-outils.cjs");
const O = require("./patron-outils.cjs"); // sql() et etatReception() sur la base hotel_t

const BASE = Number(process.env.GUIDE_PORT_BASE ?? 40000);
const cap = appareil(join(__dirname, "patron-reperes.json"));
const appelFaux = (chemin) => new Promise((res) => http.get(`http://127.0.0.1:40010${chemin}`, (r) => { r.resume(); r.on("end", res); }).on("error", res));

const bouton = (p, nom) => p.getByRole("button", { name: nom }).first();
const exact = (p, nom) => p.getByRole("button", { name: nom, exact: true }).first();
const texte = (p, t) => p.getByText(t, { exact: true }).first();
const champ = (p, nom) => p.getByRole("textbox", { name: nom }).first();
const REPERE = {
  "Réserv.": (p) => p.getByRole("tab", { name: "Aujourd'hui", exact: true }).first(),
  Chambres: (p) => p.getByRole("button", { name: /^Chambre 101,/ }).first(),
};
const allerA = (page, libelle) => aller(page, libelle, REPERE[libelle]);

async function session(nav, opts = {}) {
  const ctx = await contexteVers(nav, BASE, { heure: "9:41", imprimantes: [{ name: "Imprimante BT-58", address: "AA:BB:CC:DD:EE:FF" }], ...opts });
  const page = await m.connecter(ctx, "patron");
  return { ctx, page };
}

const PARTIES = {};

/* ------------------------------------------------------------------ inscription */
PARTIES.inscription = async (nav) => {
  const texteConditions = require("node:fs").readFileSync(join(__dirname, "../../../apps/desktop/resources/conditions.txt"), "utf8").replace(/'/g, "''");
  O.sql(`insert into "ConditionsUtilisation"(id, version, texte, "publieLe") select gen_random_uuid()::text, 1, '${texteConditions}', now() where not exists (select 1 from "ConditionsUtilisation" where version = 1)`);
  const ctx = await contexteVers(nav, BASE, { heure: "9:41" });
  const page = await m.ouvrir(ctx);
  await cap(page, "patron-01-connexion", { connecter: exact(page, "Se connecter"), creer: exact(page, "Créer votre hôtel") });
  await exact(page, "Créer votre hôtel").click();
  await page.waitForTimeout(1200);
  await champ(page, "Nom de l'hôtel *").fill("Hôtel Le Grand Bleu");
  await champ(page, /^Sous-domaine/).fill("grand-bleu");
  await champ(page, "Adresse (optionnelle)").fill("Avenue de la Paix, Goma");
  await page.waitForTimeout(600);
  const continuer = page.getByText("Continuer", { exact: true }).first();
  await cap(page, "patron-02-inscription-1", {
    nom: [champ(page, "Nom de l'hôtel *"), {}],
    sousdomaine: [champ(page, /^Sous-domaine/), {}],
    continuer,
  });
  await continuer.click();
  await page.waitForTimeout(1200);
  console.log((await m.inventaire(page, { horsEcran: true })).join("\n"));
  await champ(page, /^Votre nom/).fill("Jean Mukendi");
  await page.getByPlaceholder("Numéro de téléphone").first().fill("970123456");
  const mdp = page.getByRole("textbox", { name: /^Mot de passe/ }).first();
  const conf = page.getByRole("textbox", { name: /^Confirmer/ }).first();
  await mdp.fill("motdepasse-test");
  await conf.fill("motdepasse-test");
  await haut(page);
  const essai = page.getByRole("radio", { name: /Essai gratuit/ }).first();
  const conditions = page.getByRole("checkbox").first();
  await cap(page, "patron-03-inscription-2", {
    nom: champ(page, /^Votre nom/),
    telephone: page.getByPlaceholder("Numéro de téléphone").first(),
    mdp,
    confirmation: conf,
    demarrage: unionDe(page, [essai, page.getByRole("radio", { name: /Payer/ }).first()]),
    conditions: [conditions, {}],
    creer: bouton(page, /^Créer mon compte/),
  });
  const lire = bouton(page, /conditions d'utilisation|^Lire/);
  await centrer(lire);
  await lire.click();
  await page.waitForTimeout(1200);
  await cap(page, "patron-04-conditions", { accepte: bouton(page, /^J'accepte/) });
  await ctx.close();
};

/* ------------------------------------------------------------------ accueil, notifications, synchronisation */
PARTIES.accueil = async (nav) => {
  const hotel = O.sql(`select id from "Hotel" limit 1`);
  const notif = (type, titre, corps, lien, minutes) =>
    O.sql(`insert into "Notification"(id,"hotelId",type,titre,corps,roles,lien,"createdAt") values (gen_random_uuid()::text,'${hotel}','${type}','${titre.replace(/'/g, "''")}','${corps.replace(/'/g, "''")}','{PATRON}','${lien}', now() - interval '${minutes} minutes')`);
  O.sql(`delete from "Notification"`);
  notif("STOCK_BAS", "Stock bas", "Fanta 33 cl : plus que 4 en stock", '{"ecran":"stock"}', 25);
  notif("ARRIVEES_DU_JOUR", "Aujourd'hui à l'hôtel", "1 arrivée aujourd'hui", '{"ecran":"arrivees-departs"}', 190);
  notif("RECAP_QUOTIDIEN", "Récap du jour", "Recette : 153.00 $ · 0 FC", '{"ecran":"tableau-de-bord"}', 600);
  const { ctx, page } = await session(nav);
  await cap(page, "patron-10-accueil", {
    cloche: bouton(page, /^Notifications/),
    bonjour: [page.getByText(/^Bonjour,/).first(), { carte: true }],
    hero: [texte(page, "Bienvenue").locator("xpath=.."), {}],
    dollars: [page.getByText(/^en dollars$/i).first(), { carte: true }],
    barre: unionDe(page, ["Accueil", "Plus"].map((n) => page.getByRole("tab", { name: n, exact: true }))),
  });
  const occupation = texte(page, "Taux d'occupation");
  await centrer(occupation, "start");
  await decaler(page, -20);
  await cap(page, "patron-11-accueil-milieu", {
    occupation: [occupation, { carte: true }],
    stock: [texte(page, "Stock bas"), { carte: true }],
  });
  await haut(page);
  await bouton(page, /^Notifications/).click();
  await page.waitForTimeout(1200);
  await cap(page, "patron-13-notifications", { panneau: [page.getByText("Stock bas").last(), { carte: true }] });
  await m.fermerTiroir(page);
  await allerA(page, "Synchronisation");
  await cap(page, "patron-14-synchronisation");
  await ctx.close();
};

/* ------------------------------------------------------------------ paramètres, taux, paiement en ligne */
PARTIES.reglages = async (nav) => {
  const { ctx, page } = await session(nav);
  await allerA(page, "Paramètres");
  await centrer(texte(page, "Sécurité"), "start");
  await decaler(page, -20);
  await cap(page, "patron-21-securite");

  await allerA(page, "Taux de change");
  await cap(page, "patron-22-administration");
  const taux = champ(page, /^Nouveau taux/);
  await taux.fill("2850");
  await exact(page, "Enregistrer").click();
  await page.waitForTimeout(900);
  const confirmer = bouton(page, /^Enregistrer le taux/);
  if (await confirmer.count()) await confirmer.click();
  await page.waitForTimeout(1800);
  await cap(page, "patron-24-taux-enregistre", { champ: [taux, { carte: true }] });

  await allerA(page, "Paramètres");
  await centrer(bouton(page, "Régler le paiement en ligne des acomptes"));
  await cap(page, "patron-26-paiement-en-ligne");
  await bouton(page, "Régler le paiement en ligne des acomptes").click();
  await m.attendreChargement(page);
  const numero = champ(page, /^Numéro ScanLinkPay/);
  await numero.fill("SLP-000482");
  await exact(page, "Vérifier et enregistrer").click();
  await page.waitForTimeout(2500);
  const trouve = page.getByText(/Hôtel Grand Lac SARL/).first();
  await cap(page, "patron-27-paiement-compte", {
    numero: [numero, {}],
    verifier: exact(page, "Vérifier et enregistrer"),
    trouve: [trouve, {}],
  });
  const pourcentage = champ(page, /^Pourcentage d'acompte/);
  await pourcentage.fill("20");
  await champ(page, /^Conditions d'annulation/).fill("Annulation gratuite jusqu'à 48 h avant l'arrivée. Après, l'acompte est conservé.");
  await centrer(pourcentage);
  await cap(page, "patron-28-paiement-acompte", {
    pourcentage: [pourcentage, {}],
    exemple: [page.getByText(/Exemple|Par exemple/).first(), {}],
  });
  const enregistrer = exact(page, "Enregistrer");
  await enregistrer.click();
  await page.waitForTimeout(2000);
  await centrer(enregistrer);
  await cap(page, "patron-29-paiement-enregistre", {
    bouton: enregistrer,
    ok: [page.getByText(/enregistr/i).filter({ hasNotText: "Vérifier" }).first(), {}],
  });
  await ctx.close();
};

/* ------------------------------------------------------------------ site de l'hôtel */
PARTIES.site = async (nav) => {
  const { ctx, page } = await session(nav);
  await allerA(page, "Site de l'hôtel");
  await champ(page, "Slogan").fill("Votre escale au bord du lac Kivu");
  await cap(page, "patron-30-site", { nom: [champ(page, "Nom de l'hôtel"), {}], slogan: [champ(page, "Slogan"), {}] });
  await champ(page, "Adresse").fill("Avenue de la Paix 12, Goma");
  await champ(page, "Arrivée dès").fill("14:00");
  await champ(page, "Départ avant").fill("11:00");
  await centrer(champ(page, "Arrivée dès"));
  await cap(page, "patron-33-site-contact", { horaires: unionDe(page, [champ(page, "Arrivée dès"), champ(page, "Départ avant")]) });
  await ctx.close();
};

/* ------------------------------------------------------------------ équipe */
PARTIES.equipe = async (nav) => {
  // Un seul compte par rôle : pour montrer un rôle libre, le compte cafétaria est momentanément rangé sous « Patron ».
  O.sql(`update "Utilisateur" set role='PATRON' where "supabaseAuthId"='gl-caf'`);
  const { ctx, page } = await session(nav);
  try {
    await allerA(page, "Utilisateurs");
    await cap(page, "patron-35-utilisateurs", { nouveau: exact(page, "Nouveau compte") });
    await exact(page, "Nouveau compte").click();
    await page.waitForTimeout(1000);
    await champ(page, "Nom du membre du personnel").fill("Marie Lukusa");
    await page.getByPlaceholder("Numéro de téléphone").last().fill("970555111");
    await champ(page, "Mot de passe du compte, 8 caractères minimum").fill("motdepasse-test");
    const caf = page.getByRole("radio", { name: /^Rôle Cafétaria/ }).first();
    if ((await caf.getAttribute("aria-disabled")) !== "true") await caf.click();
    await centrer(caf);
    await cap(page, "patron-36b-nouveau-compte-role", {
      roles: unionDe(page, [page.getByRole("radio", { name: /^Rôle Réceptionniste/ }), page.getByRole("radio", { name: /^Rôle Patron/ })]),
      creer: exact(page, "Créer le compte"),
    });
  } finally {
    O.sql(`update "Utilisateur" set role='CAFETARIA' where "supabaseAuthId"='gl-caf'`);
  }
  await ctx.close();
  const s2 = await session(nav);
  const page2 = s2.page;
  await allerA(page2, "Utilisateurs");
  await suiteEquipe(page2);
  await s2.ctx.close();
};

async function suiteEquipe(page) {
  await exact(page, "Modifier Aline Masika").click();
  await page.waitForTimeout(1000);
  await cap(page, "patron-37-modifier");
  const nouveau = page.getByRole("textbox", { name: /mot de passe/i }).first();
  await nouveau.fill("nouveau-mdp-2026");
  await centrer(nouveau);
  await cap(page, "patron-37b-modifier-mdp", { mdp: [nouveau, {}], enregistrer: bouton(page, /^Enregistrer/) });
  await m.fermerTiroir(page);
  const abandonner = exact(page, "Abandonner"); // « Abandonner la saisie ? »
  if (await abandonner.isVisible().catch(() => false)) await abandonner.click();
  await page.waitForTimeout(600);
  await allerA(page, "Utilisateurs");
  await page.getByRole("switch", { name: "Compte de Aline Masika actif" }).click();
  await page.waitForTimeout(1000);
  await cap(page, "patron-38-desactiver");
  const garder = page.getByRole("button", { name: /^(Annuler|Garder)/ }).last();
  if (await garder.isVisible().catch(() => false)) await garder.click();
}

/* ------------------------------------------------------------------ réception */
PARTIES.reception = async (nav) => {
  O.etatReception();
  const { ctx, page } = await session(nav);
  await allerA(page, "Chambres");
  await cap(page, "patron-51-chambres", { nouvelle: exact(page, "Nouvelle chambre"), premiere: bouton(page, /^Chambre 101,/) });
  await exact(page, "Nouvelle chambre").click();
  await page.waitForTimeout(1000);
  console.log((await m.inventaire(page)).join("\n"));
  const num = page.getByRole("textbox", { name: /^Numéro/ }).first();
  const type = page.getByRole("textbox", { name: /^Type/ }).first();
  const prix = page.getByRole("textbox", { name: /^Prix/ }).first();
  await num.fill("203");
  await type.fill("Suite");
  await prix.fill("120");
  await cap(page, "patron-52c-chambre-formulaire", {
    numero: [num, {}], type: [type, {}], prix: [prix, {}],
    devise: unionDe(page, [page.getByRole("radio", { name: /USD|Dollar/ }).first(), page.getByRole("radio", { name: /CDF|Franc/ }).first()]),
    enregistrer: bouton(page, /^Enregistrer/),
  });
  await ctx.close();
  await receptionSuite(nav);
};

async function receptionSuite(nav) {
  const { ctx, page } = await session(nav);
  await allerA(page, "Réserv.");
  await page.getByRole("tab", { name: "À venir", exact: true }).click();
  await m.attendreChargement(page);
  await cap(page, "patron-52-reservations", { segments: unionDe(page, ["Aujourd'hui", "Planning"].map((n) => page.getByRole("tab", { name: n, exact: true }))) });
  await centrer(bouton(page, /^Esther Mbuyi/));
  await cap(page, "patron-52b-reservations-liste");
  await bouton(page, /^Esther Mbuyi/).click();
  await m.attendreChargement(page);
  const bloc = page.getByText(/Acompte payé en ligne/).first();
  await centrer(bloc);
  await cap(page, "patron-54-detail", { payeEnLigne: [bloc, { carte: true }] });
  await m.retour(page);
  await page.getByRole("tab", { name: "Planning", exact: true }).click();
  await m.attendreChargement(page);
  await cap(page, "patron-53-planning");

  await allerA(page, "Arrivées et départs");
  await cap(page, "patron-55-arrivees");
  await allerA(page, "Clients");
  await cap(page, "patron-56-clients");
  await allerA(page, "Journal de la journée");
  await cap(page, "patron-57-journal", { encaissements: [texte(page, "Encaissements du jour"), { carte: true }] });

  await allerA(page, "Remboursements");
  // L'onglet porte un compteur (« À faire (1) ») : début du nom seulement.
  await cap(page, "patron-58-remboursements", {
    onglets: page.getByRole("tab", { name: /^À faire/ }).first(),
    carte: [page.getByText("Daniel Tshimanga").first(), { carte: true }],
  });
  const rembourse = bouton(page, /^J'ai remboursé/);
  await centrer(rembourse, "end");
  await cap(page, "patron-58b-remboursement-carte", {
    destination: [page.getByText(/\+243|SLP-/).first(), { carte: false }],
    rembourse,
    conserver: bouton(page, /^Conserver l'acompte/),
  });
  await rembourse.click();
  await page.waitForTimeout(1000);
  const ref = page.getByRole("textbox", { name: /Référence/ }).first();
  if (await ref.count()) await ref.fill("MP261020.1432.B77120");
  console.log((await m.inventaire(page)).join("\n"));
  const modes = page.getByText(/Comment avez-vous remboursé/).first();
  await centrer(modes, "start");
  // Pas de case à cocher sur le téléphone : on valide avec « Enregistrer le remboursement ».
  await cap(page, "patron-59-remboursement-confirmer", {
    modes: unionDe(page, [modes, page.getByRole("button", { name: /^Autre moyen/ }).first()]),
    enregistrer: bouton(page, /^Enregistrer le remboursement/),
  });
  await m.fermerTiroir(page);
  await ctx.close();
};

/* ------------------------------------------------------------------ cafétaria */
PARTIES.cafeteria = async (nav) => {
  const { ctx, page } = await session(nav);
  await allerA(page, "Menu");
  await cap(page, "patron-65-menu", { nouveau: exact(page, "Nouveau produit") });
  await bouton(page, /^Poulet braisé/).click();
  await page.waitForTimeout(1200);
  await cap(page, "patron-66-produit");
  await m.fermerTiroir(page);
  const ann = bouton(page, /^Annuler$/);
  if (await ann.isVisible().catch(() => false)) await ann.click();
  await allerA(page, "Stock");
  await cap(page, "patron-67-stock");
  await exact(page, "Nouveau mouvement").click();
  await page.waitForTimeout(1000);
  await cap(page, "patron-68-mouvement");
  await m.fermerTiroir(page);
  await allerA(page, "Inventaire");
  await cap(page, "patron-69-inventaire", { lancer: exact(page, "Lancer l'évaluation") });
  await exact(page, "Lancer l'évaluation").click();
  await page.waitForTimeout(2500);
  await cap(page, "patron-70-inventaire-saisie");
  await ctx.close();
};

/* ------------------------------------------------------------------ rapports, dépenses, reçus */
PARTIES.rapports = async (nav) => {
  // Le serveur de démonstration ne fabrique pas de PDF : les deux rapports de septembre sont posés en base.
  O.sql(`delete from "RapportMensuel" where periode='2026-09'`);
  for (const [dep, num, qui, role] of [["RECEPTION", "RAP-REC-202609-001", "Aline Masika", "RECEPTIONNISTE"], ["CAFETERIA", "RAP-CAF-202609-001", "Sylvie Katungu", "CAFETARIA"]]) {
    O.sql(`insert into "RapportMensuel"(id,"hotelId",departement,periode,version,numero,provisoire,statut,fichier,"genereParId","genereParNom","genereLe",chiffres,concordant,empreinte)
      select gen_random_uuid(), h.id, '${dep}', '2026-09', 1, '${num}', false, 'ACTIF', 'demo/${num}.pdf', u.id, '${qui}', '2026-10-01 08:12:00', '{}', true, 'a1b2c3d4e5f6a7b8'
      from (select id from "Hotel" limit 1) h, (select id from "Utilisateur" where role='${role}' limit 1) u`);
  }
  const { ctx, page } = await session(nav);
  await allerA(page, "Rapports mensuels");
  await cap(page, "patron-75-rapports", {
    mois: bouton(page, /^Mois :/),
    reception: [page.getByText(/RAP-REC-/).first(), { carte: true }],
    cafeteria: [page.getByText(/RAP-CAF-/).first(), { carte: true }],
  });
  await allerA(page, "Dépenses");
  await bouton(page, "Période : Ce mois").click();
  await page.waitForTimeout(800);
  await cap(page, "patron-76-depenses", {
    pdf: bouton(page, "Télécharger le PDF des dépenses"),
    filtres: unionDe(page, [bouton(page, "Département : Tous"), bouton(page, "Département : Cafétaria")]),
  });
  await allerA(page, "Journal des reçus");
  await cap(page, "patron-77-recus");
  await ctx.close();
};

/* ------------------------------------------------------------------ abonnement (faux ScanLinkPay) */
PARTIES.abonnement = async (nav) => {
  const { ctx, page } = await session(nav);
  await allerA(page, "Abonnement");
  const etat = page.getByText(/^Votre abonnement$/i).first();
  await cap(page, "patron-40-abonnement-essai", { carte: [etat, { carte: true }] });
  const formules = ["Essentiel", "Pro", "Premium"].map((f) => page.getByRole("radio", { name: new RegExp(`^Formule ${f},`) }).first());
  await centrer(texte(page, "Choisissez votre formule"), "start");
  await cap(page, "patron-41-formules", { formules: unionDe(page, [formules[0], formules[1]]) });
  await formules[1].click();
  const duree3 = page.getByRole("radio", { name: /^3 mois/ }).first();
  await centrer(duree3, "start");
  await decaler(page, -60);
  await cap(page, "patron-42-duree", { durees: unionDe(page, [page.getByRole("radio", { name: /^1 mois/ }), page.getByRole("radio", { name: /^12 mois/ })]) });
  await duree3.click();
  const reseau = page.getByRole("radio", { name: /M-Pesa/ }).first();
  await reseau.click();
  const tel = page.getByRole("textbox", { name: /^Numéro Mobile Money/ }).first();
  await tel.fill("0828497218");
  await centrer(reseau, "start");
  await decaler(page, -60);
  await cap(page, "patron-43-mobile-money", {
    reseaux: unionDe(page, [reseau, page.getByRole("radio", { name: /Africell/ }).first()]),
    numero: [tel, {}],
  });
  const payer = bouton(page, /^Payer \d/);
  await centrer(payer, "end");
  await cap(page, "patron-44-commande", {
    commande: [page.getByText("Total à payer", { exact: true }).first(), { carte: true }],
    payer,
  });
  await payer.click();
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: "Payer", exact: true }).last().click(); // fenêtre « Payer 180,54 $ ? »
  await page.waitForTimeout(4000);
  console.log((await m.inventaire(page)).join("\n"));
  await haut(page);
  await cap(page, "patron-45-attente", { attente: [page.getByText(/code secret|Confirmez|attente/i).first(), { carte: true }] });
  await appelFaux("/__succes");
  await page.getByText("Merci !").first().waitFor({ timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(1000);
  await cap(page, "patron-46-succes", { succes: [page.getByText("Merci !").first(), { carte: true }] });
  const cont = bouton(page, /^Continuer/);
  if (await cont.count()) await cont.click();
  await page.waitForTimeout(1500);
  await ctx.close();

  // Échu (délai de grâce), puis accès coupé : une nouvelle session voit l'état du serveur.
  O.sql(`update "PaiementLicence" set "periodeCouverteJusquau" = now() - interval '1 day'`);
  {
    const s = await session(nav);
    await s.page.waitForTimeout(500);
    await cap(s.page, "patron-49-echu");
    await s.ctx.close();
  }
  O.sql(`update "PaiementLicence" set "periodeCouverteJusquau" = now() - interval '6 days'`);
  {
    const ctx2 = await contexteVers(nav, BASE, { heure: "9:41" });
    const p2 = await m.ouvrir(ctx2);
    await p2.getByPlaceholder("Numéro de téléphone").fill(m.TELEPHONES.patron);
    await p2.getByRole("textbox", { name: "Mot de passe *" }).fill("motdepasse-test");
    await p2.getByRole("button", { name: "Se connecter", exact: true }).click();
    await p2.waitForTimeout(5000);
    await cap(p2, "patron-50-bloque");
    await ctx2.close();
  }
  O.sql(`update "PaiementLicence" set "periodeCouverteJusquau" = now() + interval '75 days'`);
};

/* ------------------------------------------------------------------ hors ligne */
PARTIES.horsligne = async (nav) => {
  const { ctx, page } = await session(nav);
  await ctx.setOffline(true);
  await page.getByText(/^Hors ligne/).first().waitFor({ timeout: 40000 }).catch(() => {});
  await page.waitForTimeout(800);
  await cap(page, "patron-80-hors-ligne", { synchro: [page.getByText(/^Hors ligne/).first(), {}] });
  await ctx.setOffline(false);
  await ctx.close();
};

(async () => {
  const demandees = process.argv.slice(2);
  const ordre = ["inscription", "accueil", "reglages", "site", "equipe", "reception", "cafeteria", "rapports", "abonnement", "horsligne"];
  const nav = await m.navigateur();
  for (const nom of ordre) {
    if (demandees.length && !demandees.includes(nom)) continue;
    try {
      await PARTIES[nom](nav);
      console.log("ok      ", nom);
    } catch (e) {
      for (const c of nav.contexts()) for (const pg of c.pages()) await pg.screenshot({ path: `/tmp/patron-echec-${nom}.png` }).catch(() => {});
      console.log("ÉCHEC   ", nom, "-", String(e.message).split("\n").slice(0, 3).join(" | "));
    }
  }
  await nav.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
