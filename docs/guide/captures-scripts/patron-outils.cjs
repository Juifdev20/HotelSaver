/**
 * Outils communs des scripts de captures du guide « patron » : connexion par numéro de téléphone (comme l'application), base de
 * démonstration (psql), photo d'un élément, etc. L'hôte se lance avec `patron-hote.sh demarrer` (API 40001, application 40003,
 * faux ScanLinkPay 40010, site web 40020) ; les scripts se lancent avec GUIDE_PORT_BASE=40000.
 */
const { execFileSync } = require("node:child_process");
const L = require("../outils/lib.cjs");

const TELEPHONES = { patron: "970000001", recep: "970000002", caf: "970000003" };

/** Exécute du SQL sur la base de démonstration (hotel_t). */
function sql(requete) {
  return execFileSync("psql", ["-U", "postgres", "-h", "/tmp", "-p", "54330", "-d", "hotel_t", "-At", "-c", requete], { encoding: "utf8" }).trim();
}

/** Page vierge (écran de connexion) dans un contexte téléphone. */
async function pageConnexion(ctx) {
  const page = await ctx.newPage();
  await page.goto(L.HOTE.site);
  await page.waitForTimeout(1800);
  return page;
}

/** Connexion par numéro de téléphone. */
async function seConnecter(page, role = "patron") {
  await page.getByPlaceholder("970 000 000").fill(TELEPHONES[role]);
  await page.getByPlaceholder("Votre mot de passe").fill("motdepasse-test");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForTimeout(3800);
}

async function ouvrirSession(ctx, role = "patron") {
  const page = await pageConnexion(ctx);
  await seConnecter(page, role);
  return page;
}

/** Recharge la page ; le patron doit retaper son mot de passe (verrou au lancement). */
async function recharger(page, role = "patron") {
  await page.reload();
  await page.waitForTimeout(2500);
  if (await page.getByPlaceholder("Votre mot de passe").isVisible().catch(() => false)) {
    if (await page.getByPlaceholder("970 000 000").isVisible().catch(() => false)) await page.getByPlaceholder("970 000 000").fill(TELEPHONES[role]);
    await page.getByPlaceholder("Votre mot de passe").fill("motdepasse-test");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  }
  await page.waitForTimeout(3800);
}

/** Ouvre une rubrique par la barre du bas ou le tiroir (le nom peut porter une pastille : « Remboursements, 1 à faire »), puis attend le chargement. */
async function aller(page, libelle, attente = 1800) {
  const bas = page.getByRole("navigation", { name: "Navigation rapide" });
  if (!(await bas.isVisible().catch(() => false))) await L.fermerTiroir(page);
  const direct = bas.getByRole("button", { name: libelle, exact: true });
  if (await direct.count()) await direct.first().click();
  else {
    await bas.getByRole("button", { name: /Plus/ }).click();
    const nom = new RegExp(`^${libelle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(,|$)`);
    await page.getByRole("dialog", { name: "Menu" }).getByRole("button", { name: nom }).first().click({ timeout: 6000 });
  }
  await page.waitForTimeout(attente);
}

/** Remonte tout en haut de la page (l'application défile dans la fenêtre). */
async function haut(page) {
  await page.evaluate(() => { window.scrollTo(0, 0); document.querySelectorAll("main, .coquille__contenu").forEach((e) => (e.scrollTop = 0)); });
  await page.waitForTimeout(300);
}

/** Fait défiler pour amener un élément (texte) vers le haut de l'écran, puis photographie la fenêtre. */
async function defiler(page, locator, decalage = 90) {
  await locator.first().scrollIntoViewIfNeeded();
  await page.evaluate((d) => window.scrollBy(0, -d), decalage);
  await page.waitForTimeout(500);
}

/**
 * État « réception » de l'hôtel de démonstration : un acompte payé en ligne (Esther Mbuyi), un client qui a annulé après avoir payé
 * (remboursement à décider), un remboursement fait, un acompte conservé, et une demande du site pour une chambre déjà réservée.
 */
function etatReception() {
  // Idempotent : on repart d'une base propre avant de recréer l'état.
  sql(`delete from "Remboursement"`);
  sql(`delete from "PaiementReservation"`);
  sql(`delete from "Reservation" where origine='SITE_PUBLIC' and statut in ('EN_ATTENTE','ANNULEE') and "clientId" in (select id from "Client" where nom in ('Rachel Kitenge','Grâce Kabasele','Chantal Mwamba'))`);
  sql(`update "Reservation" set statut='CONFIRMEE', "annuleLe"=null, "motifAnnulation"=null, acompte=0 where "clientId" in (select id from "Client" where nom='Daniel Tshimanga')`);
  const h = sql(`select id from "Hotel" limit 1`);
  const patron = sql(`select id from "Utilisateur" where "supabaseAuthId"='gl-patron'`);
  const recep = sql(`select id from "Utilisateur" where "supabaseAuthId"='gl-recep'`);
  const ch = (n) => sql(`select id from "Chambre" where numero='${n}'`);
  const cl = (nom) => sql(`select id from "Client" where nom='${nom}'`);
  const res = (nom, n) => sql(`select r.id from "Reservation" r join "Client" c on c.id=r."clientId" join "Chambre" x on x.id=r."chambreId" where c.nom='${nom}' and x.numero='${n}' order by r."dateArrivee" desc limit 1`);
  const paiement = (reservation, montant, operateur, tel, minutes) => {
    const id = sql(`select gen_random_uuid()::text`);
    sql(`insert into "PaiementReservation"(id,"hotelId","reservationId",montant,devise,pourcentage,moyen,operateur,"telephoneMasque",statut,"modeleCommission","cleIdempotence","referenceFournisseur","confirmeLe","createdAt","updatedAt") values ('${id}','${h}','${reservation}',${montant},'USD',20,'MOBILE_MONEY','${operateur}','${tel}','REUSSI','CUSTOMER_PAID','cle-${id}','FP-${id.slice(0, 8).toUpperCase()}', now() - interval '${minutes} minutes', now() - interval '${minutes} minutes', now())`);
    return id;
  };
  // Esther Mbuyi (202) : acompte de 72 $ payé en ligne, réservation confirmée.
  const esther = res("Esther Mbuyi", "202");
  sql(`update "Reservation" set acompte=72 where id='${esther}'`);
  paiement(esther, 72, "VODACOM", "+243 85• ••• •04", 1500);
  // Daniel Tshimanga (105) : a annulé après avoir payé 28 $ en ligne → remboursement à décider.
  const daniel = res("Daniel Tshimanga", "105");
  sql(`update "Reservation" set acompte=28, statut='ANNULEE', "annuleLe"=now() - interval '3 hours', "motifAnnulation"='Annulation par le client' where id='${daniel}'`);
  const pd = paiement(daniel, 28, "AIRTEL", "+243 97• ••• •05", 4000);
  sql(`insert into "Remboursement"(id,"hotelId","reservationId","paiementReservationId",devise,"montantPaye","montantARembourser",motif,statut,"destinataireTelephone","clientNom","createdAt","updatedAt") values (gen_random_uuid()::text,'${h}','${daniel}','${pd}','USD',28,28,'ANNULATION_CLIENT','A_FAIRE','+243970000105','Daniel Tshimanga', now() - interval '3 hours', now())`);
  // Remboursement déjà fait (Grâce Kabasele, suite 201) et acompte conservé (Chantal Mwamba, chambre 105, non-présentation).
  const nouvelle = (client, chambre, a, d, statut, acompte, motif) => {
    const id = sql(`select gen_random_uuid()::text`);
    sql(`insert into "Reservation"(id,"hotelId","chambreId","clientId","dateArrivee","dateDepart",acompte,statut,origine,"createdBy","annuleLe","motifAnnulation","jetonSuivi","updatedAt") values ('${id}','${h}','${ch(chambre)}','${cl(client)}', now() + interval '${a} days', now() + interval '${d} days', ${acompte}, '${statut}', 'SITE_PUBLIC', '${recep}', ${statut === "ANNULEE" ? "now() - interval '2 days'" : "null"}, ${motif ? `'${motif}'` : "null"}, 'jeton-${id.slice(0, 8)}', now())`);
    return id;
  };
  const grace = nouvelle("Grâce Kabasele", "201", -9, -7, "ANNULEE", 48, "Annulation par le client");
  const pg = paiement(grace, 48, "ORANGE", "+243 82• ••• •02", 14000);
  sql(`insert into "Remboursement"(id,"hotelId","reservationId","paiementReservationId",devise,"montantPaye","montantARembourser",motif,statut,mode,reference,"destinataireTelephone","clientNom","traiteParId","traiteLe","createdAt","updatedAt") values (gen_random_uuid()::text,'${h}','${grace}','${pg}','USD',48,48,'ANNULATION_CLIENT','EFFECTUE','MOBILE_MONEY','MP261018.1142.A31205','+243820000102','Grâce Kabasele','${patron}', now() - interval '3 days', now() - interval '3 days', now())`);
  const chantal = nouvelle("Chantal Mwamba", "105", -12, -10, "ANNULEE", 14, "Client non présenté");
  const pc = paiement(chantal, 14, "VODACOM", "+243 81• ••• •06", 20000);
  sql(`insert into "Remboursement"(id,"hotelId","reservationId","paiementReservationId",devise,"montantPaye","montantARembourser",motif,statut,note,"destinataireTelephone","clientNom","traiteParId","traiteLe","createdAt","updatedAt") values (gen_random_uuid()::text,'${h}','${chantal}','${pc}','USD',14,0,'NON_PRESENTATION','CONSERVE','Non-présentation : acompte conservé selon nos conditions','+243810000106','Chantal Mwamba','${patron}', now() - interval '8 days', now() - interval '8 days', now())`);
  // Demande du site pour la chambre 202, déjà réservée par Esther Mbuyi aux mêmes dates : « Chambre déjà réservée ».
  sql(`insert into "Client"(id,"hotelId",nom,telephone,"updatedAt") select gen_random_uuid()::text,'${h}','Rachel Kitenge','+243990000107', now() where not exists (select 1 from "Client" where nom='Rachel Kitenge')`);
  const rr = sql(`select gen_random_uuid()::text`);
  sql(`insert into "Reservation"(id,"hotelId","chambreId","clientId","dateArrivee","dateDepart",acompte,statut,origine,"createdBy","jetonSuivi","updatedAt") values ('${rr}','${h}','${ch("202")}','${cl("Rachel Kitenge")}', (select "dateArrivee" from "Reservation" where id='${esther}') + interval '1 day', (select "dateDepart" from "Reservation" where id='${esther}'), 0, 'EN_ATTENTE', 'SITE_PUBLIC', '${recep}', 'jeton-${rr.slice(0, 8)}', now())`);
  sql(`update "Hotel" set "pourcentageAcompte"=20`);
}

const fs = require("node:fs");
const path = require("node:path");
const FICHIER_REPERES = path.join(__dirname, "patron-reperes.json");

/** Mesure un élément (fractions de la capture) et le range dans patron-reperes.json sous « capture/nom » : à recopier dans `reperes` du guide. */
async function mes(page, capture, nom, locator, options) {
  const r = await L.mesurer(page, locator, options);
  const tout = fs.existsSync(FICHIER_REPERES) ? JSON.parse(fs.readFileSync(FICHIER_REPERES, "utf8")) : {};
  tout[capture] = tout[capture] ?? {};
  tout[capture][nom] = r;
  fs.writeFileSync(FICHIER_REPERES, JSON.stringify(tout, null, 1));
  return r;
}

module.exports = { etatReception, mes, recharger, ...L, sql, TELEPHONES, pageConnexion, seConnecter, ouvrirSession, aller, haut, defiler };
