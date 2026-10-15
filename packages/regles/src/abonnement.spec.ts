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
