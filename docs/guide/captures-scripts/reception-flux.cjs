/**
 * Captures du guide « réceptionniste », partie 2 : parcours qui MODIFIENT l'hôtel de démonstration (créer, check-in, facturer, annuler…).
 * Repartir d'un hôte neuf : hote.sh demarrer 40100 <base>_t ; GUIDE_PORT_BASE=40100 node reception.cjs ; GUIDE_PORT_BASE=40100 node reception-flux.cjs
 * Chaque écran est une entrée de ETAPES (nom de l'image + repères à mesurer) : pour changer d'interface, ne retoucher que les sélecteurs de SEL.
 */
const { copyFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");
const { execSync } = require("node:child_process");
const { L, cap, ouvrir, attendre, noter } = require("./reception-aide.cjs");

const BASE = process.env.GUIDE_BASE_DONNEES ?? "hotel_recep_t";
const sql = (requete) => execSync(`psql -U postgres -h /tmp -p 54330 -d ${BASE} -tA -c ${JSON.stringify(requete)}`).toString().trim();

/** Sélecteurs regroupés (à re-cibler pour l'interface mobile). */
const SEL = {
  bouton: (page, nom) => page.getByRole("button", { name: nom, exact: true }),
  ligneReservation: (page, client) => page.getByRole("button", { name: new RegExp(`Ouvrir la réservation de ${client}`) }),
  ongletReserv: "Réserv.",
};
const copier = (de, vers) => {
  const src = join(L.SORTIE, `reception-${de}.png`);
  if (existsSync(src)) copyFileSync(src, join(L.SORTIE, `reception-${vers}.png`));
};

(async () => {
  const { nav, ctx, page } = await ouvrir();
  const b = (nom) => SEL.bouton(page, nom);

  /* ---------- Réservation payée en ligne (état préparé en base) : acompte de 60 $ d'Esther Mbuyi, chambre 202 ---------- */
  const resEsther = sql(`select r.id from "Reservation" r join "Client" c on c.id=r."clientId" where c.nom='Esther Mbuyi' limit 1`);
  const hotelId = sql(`select "hotelId" from "Reservation" where id='${resEsther}'`);
  sql(`insert into "PaiementReservation" (id,"hotelId","reservationId",montant,devise,pourcentage,moyen,operateur,"telephoneMasque",statut,"modeleCommission","commissionCentimes","totalCentimes","referenceDemande","referenceFournisseur","cleIdempotence","confirmeLe","createdAt","updatedAt") values (gen_random_uuid(),'${hotelId}','${resEsther}',60,'USD',50,'MOBILE_MONEY','VODACOM','+243 82• ••• •02','REUSSI','CLIENT',200,6200,'REF-8841','PSP-8841','cle-guide-1',now(),now(),now())`);

  /* ---------- 1. Nouvelle réservation ---------- */
  await L.aller(page, SEL.ongletReserv);
  await attendre(page, "Tshimanga");
  await cap(page, "paye-en-ligne-liste");
  await noter(page, "paye-en-ligne-liste", "badge", page.getByText(/Payé en ligne/).first());
  await b("Nouvelle réservation").click();
  await page.waitForSelector("#arrivee");
  await page.locator("#arrivee").fill("2026-10-21");
  await page.locator("#nuits").fill("2");
  await noter(page, "nouvelle-sejour", "sejour", page.locator("#nuits"));
  await cap(page, "nouvelle-sejour");
  await page.getByLabel("Chambre", { exact: true }).selectOption({ label: "201 · Suite · 120.00 $" }).catch(async () => {
    const options = await page.getByLabel("Chambre", { exact: true }).locator("option").allTextContents();
    console.log(options);
    await page.getByLabel("Chambre", { exact: true }).selectOption({ index: 7 });
  });
  await noter(page, "nouvelle-chambre", "chambre", page.getByLabel("Chambre", { exact: true }));
  await cap(page, "nouvelle-chambre");
  await page.locator("#nom").fill("Mireille Kasongo");
  await page.locator("#tel").fill("+243 820 000 111");
  await noter(page, "nouvelle-client", "nom", page.locator("#nom"));
  await cap(page, "nouvelle-client", { long: true });
  await page.locator("#type-piece").fill("CNI");
  await page.locator("#numero-piece").fill("1-7203-N45821");
  await noter(page, "nouvelle-piece", "piece", page.locator("#numero-piece"), { complet: true });
  await cap(page, "nouvelle-piece", { long: true });
  await b("Client existant").click();
  await page.locator("#recherche-client").fill("Kabasele");
  await noter(page, "nouvelle-existant", "mode", b("Client existant"), { complet: true });
  await cap(page, "nouvelle-existant", { long: true });
  await b("Nouveau client").click();
  await page.locator("#note").fill("Lit bébé");
  await page.locator("#acompte").fill("60");
  await noter(page, "nouvelle-acompte", "acompte", page.locator("#acompte"), { complet: true });
  await cap(page, "nouvelle-acompte", { long: true });
  await noter(page, "nouvelle-fin", "case", page.locator('input[type="checkbox"]'), { complet: true });
  await cap(page, "nouvelle-fin", { long: true });
  await b("Créer la réservation").click();
  await attendre(page, "Mireille Kasongo");
  await page.waitForTimeout(1200);
  await noter(page, "reservation-creee", "statut", page.getByText("Confirmée").first(), { complet: true });
  await cap(page, "reservation-creee", { long: true });
  copier("reservation-creee", "reservation-detail");

  /* ---------- 2. Check-in de Patrick Ilunga (chambre 104), modification, message ---------- */
  await b("Retour").click();
  await L.aller(page, SEL.ongletReserv);
  await attendre(page, "Tshimanga");
  await SEL.ligneReservation(page, "Patrick").click();
  await attendre(page, "Check-in");
  await noter(page, "reservation-detail", "checkin", b("Check-in"), { complet: true });
  await noter(page, "reservation-detail", "annuler", b("Annuler"), { complet: true });
  await noter(page, "reservation-detail", "suivi", page.getByText("Suivi en ligne"), { complet: true });
  await cap(page, "reservation-detail", { long: true });
  await b("Modifier dates / acompte").click();
  await page.waitForTimeout(600);
  await cap(page, "modifier", { long: true });
  await page.getByRole("button", { name: "Annuler", exact: true }).last().click().catch(() => {});
  await b("Contacter le client par WhatsApp").click();
  await page.waitForTimeout(600);
  await cap(page, "whatsapp", { long: true });
  await b("Check-in").click();
  await attendre(page, "En cours");
  await page.waitForTimeout(1200);
  await noter(page, "checkin-fait", "statut", page.getByText("En cours").first(), { complet: true });
  await noter(page, "checkin-fait", "facturer", b("Facturer et check-out"), { complet: true });
  await cap(page, "checkin-fait", { long: true });

  /* ---------- 3. Annulation de la réservation payée en ligne (Esther Mbuyi) ---------- */
  await b("Retour").click();
  await L.aller(page, SEL.ongletReserv);
  await attendre(page, "Tshimanga");
  await SEL.ligneReservation(page, "Esther").click();
  await attendre(page, "Annuler");
  await page.waitForTimeout(1500);
  await cap(page, "paye-en-ligne-detail", { long: true });
  await noter(page, "paye-en-ligne-detail", "bloc", page.getByText(/payé en ligne/i).first(), { complet: true }).catch(() => {});
  await b("Annuler").click();
  await page.waitForTimeout(600);
  await b("Client non présenté").click().catch(() => console.log("pas de motif rapide"));
  await noter(page, "annuler", "motif", page.locator("textarea, input[type=text]").last(), { complet: true }).catch(() => {});
  await cap(page, "annuler", { long: true });
  await b("Confirmer l'annulation").click();
  await page.waitForTimeout(1500);

  /* ---------- 4. Départ de Jean-Pierre Mukendi (101) : facturation en francs, paiement croisé ---------- */
  await b("Retour").click().catch(() => {});
  await L.aller(page, SEL.ongletReserv);
  await attendre(page, "Tshimanga");
  await SEL.ligneReservation(page, "Jean-Pierre").click();
  await attendre(page, "Facturer et check-out");
  await b("Facturer et check-out").click();
  await attendre(page, "Espèces");
  await noter(page, "facturer-detail", "total", page.getByText(/Total à payer/i).first(), { complet: true });
  await cap(page, "facturer-detail", { long: true });
  await noter(page, "facturer-mode", "mode", b("Espèces"), { complet: true });
  await noter(page, "facturer-mode", "valider", b("Facturer et check-out"), { complet: true });
  await cap(page, "facturer-mode", { long: true });
  await page.getByRole("group", { name: "Devise remise" }).getByRole("button", { name: "CDF" }).click();
  await page.getByLabel(/Montant remis/i).fill("400000");
  await page.getByRole("group", { name: "Devise du rendu" }).getByRole("button", { name: "CDF" }).click();
  await noter(page, "facturer-croise", "devise", page.getByRole("group", { name: "Devise remise" }), { complet: true });
  await noter(page, "facturer-croise", "montant", page.getByLabel(/Montant remis/i), { complet: true });
  await noter(page, "facturer-croise", "monnaie", page.getByText(/Monnaie à rendre/i).first(), { complet: true }).catch(() => {});
  await cap(page, "facturer-croise", { long: true });
  await b("Facturer et check-out").click();
  await page.waitForTimeout(800);
  console.log("-- confirmation\n" + (await L.inventaire(page)).join("\n"));
  await cap(page, "facturer-confirme", { long: true });
  await page.getByRole("button", { name: /^Facturer \d/ }).click();
  await attendre(page, "Facture créée").catch(() => {});
  await page.waitForTimeout(2500);
  await noter(page, "facture-creee", "numero", page.getByText(/REC-/).first());
  await noter(page, "facture-creee", "imprimer", b("Imprimer le reçu"));
  console.log("-- facture\n" + (await L.inventaire(page)).join("\n"));
  await cap(page, "facture-creee");
  await page.getByRole("button", { name: /Retour/ }).first().click().catch(() => {});

  /* ---------- 5. Dépenses ---------- */
  await L.aller(page, "Dépenses");
  await attendre(page, "Produits d'entretien");
  await b("Nouvelle dépense").click();
  await page.waitForTimeout(600);
  console.log("-- dépense\n" + (await L.inventaire(page)).join("\n"));
  await page.locator("#champ-date-depense").fill("2026-10-20");
  await page.getByPlaceholder("Ex. carburant du groupe électrogène").fill("Achat de charbon pour la buanderie");
  await page.getByLabel("MONTANT", { exact: false }).first().fill("15");
  await noter(page, "depense-nouvelle", "motif", page.getByPlaceholder("Ex. carburant du groupe électrogène"), { complet: true });
  await cap(page, "depense-nouvelle", { long: true });
  await b("Enregistrer").click();
  await page.waitForTimeout(1500);
  await cap(page, "depenses", { long: false });
  await page.getByRole("button", { name: "Corriger" }).first().click();
  await page.waitForTimeout(700);
  console.log("-- corriger\n" + (await L.inventaire(page)).join("\n"));
  await noter(page, "depense-corriger", "annuler", page.getByRole("button", { name: /Annuler la dépense|Annuler cette dépense/ }), { complet: true });
  await cap(page, "depense-corriger", { long: true });
  await page.getByRole("button", { name: "Fermer" }).click().catch(() => {});

  /* ---------- 6. Accueil et notifications (après les encaissements) ---------- */
  await b("Retour").click().catch(() => {});
  await L.aller(page, "Accueil");
  await page.waitForTimeout(2500);
  await noter(page, "accueil", "avatar", page.getByText("AM", { exact: true }).first());
  await noter(page, "accueil", "cloche", page.getByRole("button", { name: /^Notifications/ }));
  await noter(page, "accueil", "hero", page.getByText("Hôtel Grand Lac").first());
  await noter(page, "accueil", "encaissements", page.getByText("EN DOLLARS", { exact: false }).first());
  await noter(page, "accueil", "occupation", page.getByText("Taux d'occupation").first());
  await noter(page, "accueil", "barre", page.getByRole("navigation", { name: "Navigation rapide" }));
  await cap(page, "accueil");
  await page.getByRole("button", { name: /^Notifications/ }).click();
  await page.waitForTimeout(900);
  await cap(page, "notifications");
  await page.keyboard.press("Escape");
  await page.mouse.click(200, 700);

  /* ---------- 7. Hors ligne : facture (reçu provisoire), réservation en conflit, bandeau, retour du réseau ---------- */
  await L.aller(page, SEL.ongletReserv);
  await attendre(page, "Tshimanga");
  // une réservation posée « par un autre poste » sur la chambre 201, pendant que ce téléphone est hors ligne
  await ctx.setOffline(true);
  await page.waitForTimeout(8000);
  sql(`insert into "Reservation" (id,"hotelId","chambreId","clientId","dateArrivee","dateDepart",statut,origine,"createdBy","jetonSuivi","updatedAt") select gen_random_uuid(), r."hotelId", ch.id, r."clientId", '2026-10-25 12:00+00', '2026-10-27 09:00+00', 'CONFIRMEE', 'RECEPTION', r."createdBy", 'jeton-guide-conflit', now() from "Reservation" r, "Chambre" ch where ch.numero='201' limit 1`);
  await b("Nouvelle réservation").click();
  await page.waitForSelector("#arrivee");
  await page.locator("#arrivee").fill("2026-10-25");
  await page.locator("#nuits").fill("2");
  await page.getByLabel("Chambre", { exact: true }).selectOption({ label: "201 · Suite · 120.00 $" });
  await page.locator("#nom").fill("Samuel Banza");
  await b("Créer la réservation").click();
  await page.waitForTimeout(2000);
  await b("Retour").click().catch(() => {});
  await L.aller(page, SEL.ongletReserv);
  await attendre(page, "Tshimanga");
  await SEL.ligneReservation(page, "Patrick").click();
  await attendre(page, "Facturer et check-out");
  await b("Facturer et check-out").click();
  await attendre(page, "Espèces");
  await b("Mobile money").click();
  await b("Facturer et check-out").click();
  await page.getByRole("button", { name: /^Facturer \d/ }).click();
  await page.waitForTimeout(2500);
  await noter(page, "recu-provisoire", "numero", page.getByText(/TEMP-/).first());
  await cap(page, "recu-provisoire");
  await page.getByRole("button", { name: /Retour/ }).first().click().catch(() => {});
  await L.aller(page, "Accueil");
  await page.waitForTimeout(1500);
  await noter(page, "hl-bandeau", "bandeau", page.getByText(/Hors ligne/).first());
  await cap(page, "hl-bandeau");
  console.log("-- hors ligne\n" + (await L.inventaire(page)).slice(0, 6).join("\n"));
  await page.getByText(/^Hors ligne/).first().click().catch(() => console.log("pas de clic pastille"));
  await page.waitForTimeout(1000);
  console.log("-- après pastille\n" + (await L.inventaire(page)).join("\n"));
  await cap(page, "synchro", { long: true });
  await ctx.setOffline(false);
  await page.waitForTimeout(1500);
  await cap(page, "hl-retour");
  await page.waitForTimeout(25000);
  console.log("-- retour réseau\n" + (await L.inventaire(page)).join("\n"));
  await cap(page, "synchro-conflit", { long: true });
  await nav.close();
})().catch((e) => { console.error(e); process.exit(1); });
