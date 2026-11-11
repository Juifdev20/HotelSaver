import { DUREES_MOIS, ajouterMois, etatAbonnement, finValidite, formuleParCode, moisFactures, nouvelleFinValidite, prixAbonnement } from "./abonnement";
import { masquerNumero, numeroInternational, numeroNational, operateurDuNumero, problemeNumero } from "./mobile-money";

const J = 86_400_000;
const d = (iso: string) => new Date(iso);

describe("prixAbonnement", () => {
  it("1 mois = prix mensuel ; 12 mois = 10 mois payés", () => {
    expect(prixAbonnement({ formule: "PRO", mois: 1, devise: "USD" })).toBe(59);
    expect(prixAbonnement({ formule: "PRO", mois: 3, devise: "USD" })).toBe(177);
    expect(prixAbonnement({ formule: "PRO", mois: 12, devise: "USD" })).toBe(590);
    expect(moisFactures(12)).toBe(10);
    expect(moisFactures(6)).toBe(6);
  });
  it("francs : converti puis arrondi AU-DESSUS à 500 FC", () => {
    expect(prixAbonnement({ formule: "ESSENTIEL", mois: 1, devise: "CDF", tauxCdf: 2800 })).toBe(81_500); // 29 × 2800 = 81 200
    expect(prixAbonnement({ formule: "PRO", mois: 1, devise: "CDF", tauxCdf: 2800 })).toBe(165_500); // 165 200
    expect(prixAbonnement({ formule: "PRO", mois: 1, devise: "CDF", tauxCdf: 2000 })).toBe(118_000); // exact
    expect(prixAbonnement({ formule: "PRO", mois: 1, devise: "CDF" })).toBe(165_500); // taux par défaut
  });
  it("formule ou durée inconnue → 0 (jamais un prix par défaut)", () => {
    expect(prixAbonnement({ formule: "GRATUIT", mois: 1, devise: "USD" })).toBe(0);
    expect(prixAbonnement({ formule: "PRO", mois: 2, devise: "USD" })).toBe(0);
    expect(prixAbonnement({ formule: "PRO", mois: -1, devise: "USD" })).toBe(0);
  });
  it("toutes les durées proposées ont un prix positif", () => {
    for (const m of DUREES_MOIS) expect(prixAbonnement({ formule: "ESSENTIEL", mois: m, devise: "USD" })).toBeGreaterThan(0);
  });
  it("formuleParCode", () => {
    expect(formuleParCode("PREMIUM")?.maxChambres).toBeNull();
    expect(formuleParCode("x")).toBeUndefined();
  });
});

describe("échéance", () => {
  it("ajouterMois : fin de mois ramenée au dernier jour", () => {
    expect(ajouterMois(d("2026-01-31T10:00:00Z"), 1).toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(ajouterMois(d("2028-01-31T10:00:00Z"), 1).toISOString()).toBe("2028-02-29T10:00:00.000Z");
    expect(ajouterMois(d("2026-11-15T10:00:00Z"), 3).toISOString()).toBe("2027-02-15T10:00:00.000Z");
    expect(ajouterMois(d("2026-03-10T10:00:00Z"), 12).toISOString()).toBe("2027-03-10T10:00:00.000Z");
  });
  it("payer d'avance ne fait perdre aucun jour ; payer en retard repart de maintenant", () => {
    const maintenant = d("2026-10-10T08:00:00Z");
    expect(nouvelleFinValidite(d("2026-10-20T08:00:00Z"), maintenant, 1).toISOString()).toBe("2026-11-20T08:00:00.000Z");
    expect(nouvelleFinValidite(d("2026-09-01T08:00:00Z"), maintenant, 1).toISOString()).toBe("2026-11-10T08:00:00.000Z");
  });
  it("finValidite : dernier paiement, sinon création + 14 jours", () => {
    expect(finValidite({ createdAt: d("2026-10-01T00:00:00Z") }, null).toISOString()).toBe("2026-10-15T00:00:00.000Z");
    expect(finValidite({ createdAt: d("2026-10-01T00:00:00Z") }, { periodeCouverteJusquau: d("2027-01-01T00:00:00Z") }).toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("etatAbonnement", () => {
  const hotel = { createdAt: d("2026-10-01T00:00:00Z"), statutLicence: "ESSAI" };
  it("essai en cours, puis alerte « bientôt » dans les 7 derniers jours", () => {
    const tot = etatAbonnement(hotel, null, d("2026-10-02T00:00:00Z"));
    expect(tot).toMatchObject({ statut: "ESSAI", bloque: false, renouvelable: true, alerte: null });
    expect(tot.joursRestants).toBe(13);
    expect(etatAbonnement(hotel, null, d("2026-10-10T00:00:00Z"))).toMatchObject({ statut: "ESSAI", alerte: "BIENTOT", joursRestants: 5 });
  });
  it("payé → ACTIF", () => {
    const e = etatAbonnement({ ...hotel, statutLicence: "ACTIF" }, { periodeCouverteJusquau: d("2027-01-01T00:00:00Z") }, d("2026-10-10T00:00:00Z"));
    expect(e).toMatchObject({ statut: "ACTIF", bloque: false, alerte: null });
  });
  it("échéance dépassée : 3 jours de grâce (rien ne se coupe), puis bloqué mais renouvelable", () => {
    const fin = d("2026-10-15T00:00:00Z");
    const enGrace = etatAbonnement(hotel, null, new Date(fin.getTime() + 2 * J));
    expect(enGrace).toMatchObject({ statut: "EN_GRACE", bloque: false, renouvelable: true, alerte: "GRACE" });
    const expire = etatAbonnement(hotel, null, new Date(fin.getTime() + 3 * J + 1));
    expect(expire).toMatchObject({ statut: "EXPIRE", bloque: true, renouvelable: true, alerte: "EXPIRE" });
    expect(expire.joursRestants).toBeLessThanOrEqual(-3);
  });
  it("suspendu AUTOMATIQUEMENT et expiré : bloqué mais renouvelable (c'est le cas normal)", () => {
    expect(etatAbonnement({ ...hotel, statutLicence: "SUSPENDU", suspensionManuelle: false }, null, d("2027-01-01T00:00:00Z"))).toMatchObject({ statut: "EXPIRE", bloque: true, renouvelable: true });
  });
  it("SUSPENDU avec une échéance encore à venir est traité comme une suspension manuelle", () => {
    expect(etatAbonnement({ ...hotel, statutLicence: "SUSPENDU" }, null, d("2026-10-02T00:00:00Z"))).toMatchObject({ statut: "SUSPENDU", bloque: true, renouvelable: false });
  });
  it("suspendu À LA MAIN : bloqué et NON renouvelable, même avec une échéance lointaine ; résilié idem", () => {
    const e = etatAbonnement({ ...hotel, statutLicence: "SUSPENDU", suspensionManuelle: true }, { periodeCouverteJusquau: d("2030-01-01T00:00:00Z") }, d("2026-10-10T00:00:00Z"));
    expect(e).toMatchObject({ statut: "SUSPENDU", bloque: true, renouvelable: false, alerte: "SUSPENDU" });
    expect(etatAbonnement({ ...hotel, statutLicence: "RESILIE" }, null, d("2026-10-02T00:00:00Z"))).toMatchObject({ statut: "RESILIE", bloque: true, renouvelable: false });
  });
});

describe("numéros Mobile Money", () => {
  it("normalise toutes les écritures usuelles", () => {
    for (const t of ["+243 828 497 218", "0828497218", "243828497218", "828497218", "00243828497218", "(0828) 497-218"]) expect(numeroNational(t)).toBe("828497218");
    expect(numeroInternational("0828497218")).toBe("+243828497218");
    for (const t of ["", "abc", "12345", "+33612345678", "0728497218", null, undefined, 828497218.5]) expect(numeroNational(t as unknown)).toBeNull();
  });
  it("reconnaît le réseau et refuse un numéro d'un autre réseau", () => {
    expect(operateurDuNumero("0828497218")).toBe("VODACOM");
    expect(operateurDuNumero("0978000000")).toBe("AIRTEL");
    expect(operateurDuNumero("0848000000")).toBe("ORANGE");
    expect(operateurDuNumero("0868000000")).toBeNull();
    expect(problemeNumero("VODACOM", "0828497218")).toBeNull();
    expect(problemeNumero("AIRTEL", "0828497218")).toMatch(/M-Pesa/);
    expect(problemeNumero("AIRTEL", "12")).toMatch(/invalide/);
    expect(problemeNumero("AIRTEL", "0868000000")).toBeNull(); // préfixe inconnu : le fournisseur décide
  });
  it("masque le numéro", () => {
    expect(masquerNumero("0828497218")).toBe("+243 82• ••• •18");
    expect(masquerNumero("n'importe quoi")).toBe("••••");
  });
});

import { actualiserEtatAbonnement, bandeauAbonnement, dateAbonnement, montantAbonnement, resumerAbonnement } from "./abonnement-texte";

describe("textes d'abonnement", () => {
  it("dates en français, au jour de Lubumbashi", () => {
    expect(dateAbonnement("2026-11-12T10:00:00Z")).toBe("12 novembre 2026");
    expect(dateAbonnement("2026-11-30T23:00:00Z")).toBe("1er décembre 2026"); // 01:00 à Lubumbashi
    expect(dateAbonnement("n'importe quoi")).toBe("—");
  });
  it("montants lisibles", () => {
    expect(montantAbonnement(59, "USD")).toBe("59 $");
    expect(montantAbonnement(165500, "CDF")).toBe("165 500 FC");
    expect(montantAbonnement(29.5, "USD")).toBe("29,50 $");
  });
  const etatDans = (jours: number, over: object = {}) => ({
    ...etatAbonnement({ createdAt: new Date(Date.now() - 100 * J), statutLicence: "ACTIF" }, { periodeCouverteJusquau: new Date(Date.now() + jours * J) }, new Date()),
    ...over,
  });
  it("résumé : actif, bientôt fini, échu, expiré", () => {
    expect(resumerAbonnement(etatDans(60), "PRO")).toMatchObject({ niveau: "ok", titre: "Abonnement actif" });
    expect(resumerAbonnement(etatDans(60), "PRO").detail).toContain("formule Pro");
    expect(resumerAbonnement(etatDans(3))).toMatchObject({ niveau: "attention" });
    expect(resumerAbonnement(etatDans(-1))).toMatchObject({ niveau: "danger", titre: "Abonnement échu" });
    expect(resumerAbonnement(etatDans(-10))).toMatchObject({ niveau: "danger", titre: "Abonnement expiré" });
    expect(resumerAbonnement({ ...etatDans(10), statut: "ESSAI" })).toMatchObject({ niveau: "ok" });
    expect(resumerAbonnement({ ...etatDans(2), statut: "ESSAI" }).titre).toMatch(/2 jours/);
  });
  it("le bandeau suit l'horloge même sans nouvelle réponse du serveur", () => {
    const etat = etatDans(10);
    expect(bandeauAbonnement(etat)).toBeNull();
    expect(bandeauAbonnement(etat, new Date(Date.now() + 5 * J))?.niveau).toBe("attention");
    expect(bandeauAbonnement(etat, new Date(Date.now() + 11 * J))?.niveau).toBe("danger");
    expect(bandeauAbonnement(etat, new Date(Date.now() + 20 * J))?.texte).toMatch(/expiré/);
    expect(bandeauAbonnement(null)).toBeNull();
    expect(actualiserEtatAbonnement(etat, new Date(Date.now() + 5 * J)).joursRestants).toBe(5);
  });
  it("suspendu / résilié : pas de bandeau (écran dédié), état inchangé", () => {
    const s = etatAbonnement({ createdAt: new Date(), statutLicence: "RESILIE" }, null, new Date());
    expect(bandeauAbonnement(s)).toBeNull();
    expect(actualiserEtatAbonnement(s)).toBe(s);
  });
});

import { FONCTIONS, fonctionsAutorisees, lignesFormule, type FormuleAbonnement } from "./abonnement";

describe("formules définies par le super-admin", () => {
  const perso: FormuleAbonnement[] = [
    { code: "MINI", nom: "Mini", prixMensuelUsd: 10, maxChambres: 5, description: "", fonctions: ["RECEPTION"], avantages: [] },
    { code: "GRAND", nom: "Grand", prixMensuelUsd: 150, maxChambres: null, description: "", fonctions: ["RECEPTION", "CAFETERIA"], avantages: ["Formation sur place"] },
  ];
  it("les prix viennent de la liste fournie (et l'ancienne liste ne sert plus)", () => {
    expect(prixAbonnement({ formule: "MINI", mois: 3, devise: "USD", formules: perso })).toBe(30);
    expect(prixAbonnement({ formule: "MINI", mois: 1, devise: "CDF", tauxCdf: 3000, formules: perso })).toBe(30_000);
    expect(prixAbonnement({ formule: "PRO", mois: 1, devise: "USD", formules: perso })).toBe(0);
    expect(formuleParCode("GRAND", perso)?.prixMensuelUsd).toBe(150);
  });
  it("les mois offerts de l'année sont réglables", () => {
    expect(prixAbonnement({ formule: "MINI", mois: 12, devise: "USD", formules: perso, moisOffertsAnnuel: 3 })).toBe(90);
    expect(prixAbonnement({ formule: "MINI", mois: 12, devise: "USD", formules: perso, moisOffertsAnnuel: 0 })).toBe(120);
    expect(prixAbonnement({ formule: "MINI", mois: 6, devise: "USD", formules: perso, moisOffertsAnnuel: 3 })).toBe(60); // jamais d'offre sur 6 mois
  });
  it("durée d'essai et de grâce réglables", () => {
    const hotel = { createdAt: new Date("2026-10-01T00:00:00Z"), statutLicence: "ESSAI" };
    expect(etatAbonnement(hotel, null, new Date("2026-10-20T00:00:00Z"), { joursEssai: 30 })).toMatchObject({ statut: "ESSAI", bloque: false });
    expect(etatAbonnement(hotel, null, new Date("2026-10-17T00:00:00Z"), { joursEssai: 14, joursGrace: 0 })).toMatchObject({ statut: "EXPIRE", bloque: true });
  });
  it("fonctions : formule payée, essai, ou historique sans formule", () => {
    const param = { fonctionsEssai: ["RECEPTION", "CAFETERIA"] as any };
    expect(fonctionsAutorisees({ formule: "MINI" }, true, perso, param)).toEqual(["RECEPTION"]);
    expect(fonctionsAutorisees({ formule: "GRAND" }, true, perso, param)).toEqual(["RECEPTION", "CAFETERIA"]);
    expect(fonctionsAutorisees({ formule: null }, false, perso, param)).toEqual(["RECEPTION", "CAFETERIA"]); // essai
    expect(fonctionsAutorisees({ formule: null }, true, perso, param)).toEqual([...FONCTIONS]); // créé à la main, jamais restreint par surprise
    expect(fonctionsAutorisees({ formule: "SUPPRIMEE" }, true, perso, param)).toEqual([...FONCTIONS]);
    expect(fonctionsAutorisees({ formule: "MINI" }, true, [{ ...perso[0], fonctions: ["RECEPTION", "N_IMPORTE_QUOI" as any] }], param)).toEqual(["RECEPTION"]);
  });
  it("lignes d'une formule", () => {
    expect(lignesFormule(perso[1])).toEqual(["Chambres illimitées", expect.stringContaining("Réception"), expect.stringContaining("Cafétaria"), "Formation sur place"]);
    expect(lignesFormule(perso[0])[0]).toBe("Jusqu'à 5 chambres");
  });
});

import { CONTACT_SUPPORT_PAR_DEFAUT, formaterTelephone, lienWhatsApp } from "./abonnement-texte";

describe("contact support", () => {
  it("numéro lisible et lien WhatsApp", () => {
    expect(formaterTelephone(CONTACT_SUPPORT_PAR_DEFAUT.telephone)).toBe("+243 828 497 218");
    expect(formaterTelephone("autre")).toBe("autre");
    expect(lienWhatsApp("+243828497218")).toBe("https://wa.me/243828497218");
    expect(lienWhatsApp("+243 828 497 218", "Bonjour & merci")).toBe("https://wa.me/243828497218?text=Bonjour%20%26%20merci");
  });
});

import { PROTECTION_ESSAI_PAR_DEFAUT, joursEssaiDe, messagePlafondEssai } from "./abonnement";

describe("protection contre les essais abusifs (18/10/2026)", () => {
  const cree = new Date("2026-10-01T10:00:00.000Z");
  const reglages = { joursEssai: 14, joursGrace: 3, ...PROTECTION_ESSAI_PAR_DEFAUT };

  it("jours d'essai : ceux de l'hôtel s'il en a (0 compris), sinon ceux de la plateforme", () => {
    expect(joursEssaiDe({ joursEssai: null }, 14)).toBe(14);
    expect(joursEssaiDe({}, 14)).toBe(14);
    expect(joursEssaiDe({ joursEssai: 0 }, 14)).toBe(0);
    expect(joursEssaiDe({ joursEssai: 7 }, 14)).toBe(7);
  });

  it("numéro qui a déjà eu un essai (0 jour) : bloqué dès la création, sans délai de grâce", () => {
    const etat = etatAbonnement({ createdAt: cree, statutLicence: "ESSAI", joursEssai: 0 }, null, new Date("2026-10-01T12:00:00.000Z"), reglages);
    expect(etat.statut).toBe("EXPIRE");
    expect(etat.bloque).toBe(true);
    expect(etat.renouvelable).toBe(true);
    expect(etat.graceJusquau).toBe(etat.valideJusquau);
  });

  it("essai jamais payé : date de suppression = fin de la grâce + joursAvantSuppression, plafonds fournis", () => {
    const etat = etatAbonnement({ createdAt: cree, statutLicence: "ESSAI" }, null, new Date("2026-10-05T10:00:00.000Z"), reglages);
    expect(etat.statut).toBe("ESSAI");
    // 1er oct. + 14 j d'essai + 3 j de grâce + 10 j = 28 oct.
    expect(etat.suppressionLe).toBe(new Date("2026-10-28T10:00:00.000Z").toISOString());
    expect(etat.plafondsEssai).toEqual({ chambres: 10, produits: 50, photosGalerie: 6 });
  });

  it("hôtel qui a payé ou ACTIF : ni suppression ni plafonds d'essai", () => {
    const paye = etatAbonnement({ createdAt: cree, statutLicence: "ACTIF" }, { periodeCouverteJusquau: new Date("2026-12-01T00:00:00.000Z") }, new Date("2026-10-05T10:00:00.000Z"), reglages);
    expect(paye.suppressionLe).toBeNull();
    expect(paye.plafondsEssai).toBeNull();
    const actifALaMain = etatAbonnement({ createdAt: cree, statutLicence: "ACTIF" }, null, new Date("2026-10-05T10:00:00.000Z"), reglages);
    expect(actifALaMain.suppressionLe).toBeNull();
    expect(actifALaMain.plafondsEssai).toBeNull();
  });

  it("sans les réglages de protection (anciens appels) : rien de nouveau n'est calculé", () => {
    const etat = etatAbonnement({ createdAt: cree, statutLicence: "ESSAI" }, null, new Date("2026-10-05T10:00:00.000Z"), { joursEssai: 14 });
    expect(etat.suppressionLe).toBeNull();
    expect(etat.plafondsEssai).toBeNull();
  });

  it("messages des plafonds", () => {
    expect(messagePlafondEssai.chambres(10)).toBe("L'essai gratuit est limité à 10 chambres. Choisissez une formule dans Paramètres → Abonnement pour en ajouter.");
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Licences (11/11/2026)
// ---------------------------------------------------------------------------------------------------------------------------------
import { debutNouvelleLicence, finLicence, finMaintenance, nouvelleFinMaintenance, prixMaintenance, type ContexteLicence } from "./abonnement";

describe("licence : accès décidé par les frais de maintenance", () => {
  const debut = new Date("2026-11-01T00:00:00Z");
  const hotel = { createdAt: new Date("2026-01-01T00:00:00Z"), statutLicence: "ACTIF" };
  const licence = (over: Partial<ContexteLicence> = {}): ContexteLicence => ({
    annees: 2,
    debutLe: debut,
    finLe: finLicence(debut, 2),
    derniereMaintenanceJusquau: null,
    fraisMaintenanceUsd: 5,
    joursGraceMaintenance: 2,
    joursPreavisMaintenance: 5,
    ...over,
  });
  const jour = (n: number) => new Date(debut.getTime() + n * J);

  it("la licence dure 1, 2 ou 3 ans du calendrier", () => {
    expect(finLicence(debut, 1).toISOString()).toBe("2027-11-01T00:00:00.000Z");
    expect(finLicence(debut, 3).toISOString()).toBe("2029-11-01T00:00:00.000Z");
    expect(finLicence(new Date("2028-02-29T00:00:00Z"), 1).toISOString()).toBe("2029-02-28T00:00:00.000Z");
  });

  it("le premier mois de maintenance est compris : première échéance 30 jours après l'activation", () => {
    expect(finMaintenance(licence()).toISOString()).toBe(new Date(debut.getTime() + 30 * J).toISOString());
    const e = etatAbonnement(hotel, null, jour(1), {}, licence());
    expect(e).toMatchObject({ statut: "ACTIF", bloque: false, alerte: null, joursRestants: 29, renouvelable: true });
    expect(e.licence).toMatchObject({ annees: 2, fraisMaintenanceUsd: 5, preavisJours: 5 });
  });

  it("rappel 5 jours avant l'échéance, puis délai de 2 jours, puis accès coupé", () => {
    expect(etatAbonnement(hotel, null, jour(24), {}, licence())).toMatchObject({ statut: "ACTIF", alerte: null });
    expect(etatAbonnement(hotel, null, jour(26), {}, licence())).toMatchObject({ statut: "ACTIF", alerte: "BIENTOT", bloque: false });
    expect(etatAbonnement(hotel, null, jour(31), {}, licence())).toMatchObject({ statut: "EN_GRACE", alerte: "GRACE", bloque: false });
    expect(etatAbonnement(hotel, null, jour(33), {}, licence())).toMatchObject({ statut: "EXPIRE", alerte: "EXPIRE", bloque: true, renouvelable: true });
  });

  it("payer la maintenance rouvre l'accès : l'échéance repart de maintenant si elle était dépassée, de l'échéance si elle est à venir", () => {
    const maintenant = jour(40);
    const fin = nouvelleFinMaintenance(finMaintenance(licence()), maintenant, 1);
    expect(fin.toISOString()).toBe(new Date(maintenant.getTime() + 30 * J).toISOString());
    expect(etatAbonnement(hotel, null, maintenant, {}, licence({ derniereMaintenanceJusquau: fin }))).toMatchObject({ statut: "ACTIF", bloque: false });
    // payer 3 mois d'avance en gardant les jours restants
    const avance = nouvelleFinMaintenance(jour(40), jour(30), 3);
    expect(avance.toISOString()).toBe(new Date(jour(40).getTime() + 90 * J).toISOString());
  });

  it("une suspension à la main et une résiliation priment ; hors des dates de la licence, c'est l'abonnement normal", () => {
    expect(etatAbonnement({ ...hotel, statutLicence: "SUSPENDU", suspensionManuelle: true }, null, jour(1), {}, licence())).toMatchObject({ statut: "SUSPENDU", bloque: true, renouvelable: false });
    expect(etatAbonnement({ ...hotel, statutLicence: "RESILIE" }, null, jour(1), {}, licence())).toMatchObject({ statut: "RESILIE", bloque: true });
    // licence terminée : le dernier paiement (celui que crée l'activation, jusqu'à la fin de la licence) donne 3 jours de grâce puis l'accès est coupé
    const fin = finLicence(debut, 2);
    const paiement = { periodeCouverteJusquau: fin };
    const apres = (n: number) => new Date(fin.getTime() + n * J);
    expect(etatAbonnement(hotel, paiement, apres(1), {}, licence())).toMatchObject({ statut: "EN_GRACE", bloque: false });
    expect(etatAbonnement(hotel, paiement, apres(1), {}, licence()).licence).toBeUndefined();
    expect(etatAbonnement(hotel, paiement, apres(5), {}, licence())).toMatchObject({ statut: "EXPIRE", bloque: true });
  });

  it("prix de la maintenance : dollars exacts, francs arrondis au-dessus à 500, durées 1/3/6/12 sans réduction", () => {
    expect(prixMaintenance({ fraisUsd: 5, mois: 1, devise: "USD" })).toBe(5);
    expect(prixMaintenance({ fraisUsd: 5, mois: 12, devise: "USD" })).toBe(60);
    expect(prixMaintenance({ fraisUsd: 5, mois: 1, devise: "CDF", tauxCdf: 2800 })).toBe(14000);
    expect(prixMaintenance({ fraisUsd: 4.5, mois: 3, devise: "CDF", tauxCdf: 2810 })).toBe(38000); // 13,5 $ → 37 935 FC → 38 000
    expect(prixMaintenance({ fraisUsd: 5, mois: 2, devise: "USD" })).toBe(0);
    expect(prixMaintenance({ fraisUsd: 0, mois: 1, devise: "USD" })).toBe(0);
  });

  it("une nouvelle licence commence maintenant, ou à la fin de la licence en cours", () => {
    const maintenant = jour(10);
    expect(debutNouvelleLicence(null, maintenant)).toBe(maintenant);
    expect(debutNouvelleLicence(jour(5), maintenant)).toBe(maintenant);
    expect(debutNouvelleLicence(jour(400), maintenant).toISOString()).toBe(jour(400).toISOString());
  });

  it("textes : licence active, rappel, délai, maintenance impayée ; bandeau propre à la maintenance", () => {
    const etat = (n: number) => etatAbonnement(hotel, null, new Date(Date.now()), {}, licence({ debutLe: new Date(Date.now() - (30 - n) * J), finLe: new Date(Date.now() + 700 * J) }));
    expect(resumerAbonnement(etat(20))).toMatchObject({ niveau: "ok", titre: "Licence active" });
    expect(resumerAbonnement(etat(3))).toMatchObject({ niveau: "attention" });
    expect(resumerAbonnement(etat(3)).titre).toContain("Maintenance à payer");
    expect(resumerAbonnement(etat(3)).detail).toContain("5 $");
    expect(bandeauAbonnement(etat(20))).toBeNull();
    expect(bandeauAbonnement(etat(3))?.texte).toContain("Frais de maintenance");
    const echue = etat(-1);
    expect(resumerAbonnement(echue)).toMatchObject({ niveau: "danger", titre: "Maintenance échue" });
    expect(bandeauAbonnement(echue)).toMatchObject({ niveau: "danger" });
    const impayee = etat(-10);
    expect(resumerAbonnement(impayee)).toMatchObject({ niveau: "danger", titre: "Maintenance impayée" });
    expect(bandeauAbonnement(impayee)?.texte).toContain("Frais de maintenance impayés");
  });
});
