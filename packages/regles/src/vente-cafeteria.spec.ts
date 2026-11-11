import type { Produit } from "@hotel-chicago/types";
import { familleIconeProduit, categoriesDuSegment, changerQuantite, dejaPaye, estEpuise, filtrerProduits, libelleTotaux, nettoyerSelection, nomTableSuivante, partOuverte, peutTerminerTable, resteAPayer, segmentDuProduit, totauxSelection, articlesSelection, TOUTES_CATEGORIES } from "./vente-cafeteria";

const p = (id: string, nom: string, categorie: string, extra: Partial<Produit> = {}): Produit =>
  ({ id, nom, categorie, prix: "3", devise: "USD", typeProduit: "ARTICLE", stockActuel: "10", actif: true, portionsDisponibles: null, ...extra }) as Produit;
const CATALOGUE = [
  p("1", "Primus", "Bières"), p("2", "Mützig", "Bières"), p("3", "Coca-Cola", "Sodas", { prix: "1.5" }), p("4", "Eau Vitale", "Eaux", { prix: "1500", devise: "CDF" as any }),
  p("5", "Poulet braisé", "Grillades", { typeProduit: "PLAT" as any, prix: "12" }), p("6", "Sprite", "Sodas", { stockActuel: "0" }), p("7", "Ancien", "Sodas", { actif: false }),
];

describe("Boissons / Restaurant, catégories, recherche", () => {
  it("Boissons = articles de comptoir, Restaurant = plats ; les produits inactifs n'apparaissent jamais", () => {
    expect(segmentDuProduit(CATALOGUE[0])).toBe("BOISSONS");
    expect(segmentDuProduit(CATALOGUE[4])).toBe("RESTAURANT");
    const tous = filtrerProduits(CATALOGUE, { segment: "TOUT", categorie: TOUTES_CATEGORIES, recherche: "" });
    expect(tous.map((x) => x.id)).not.toContain("7");
    expect(filtrerProduits(CATALOGUE, { segment: "RESTAURANT", categorie: TOUTES_CATEGORIES, recherche: "" }).map((x) => x.nom)).toEqual(["Poulet braisé"]);
    expect(filtrerProduits(CATALOGUE, { segment: "BOISSONS", categorie: TOUTES_CATEGORIES, recherche: "" }).map((x) => x.nom)).not.toContain("Poulet braisé");
  });

  it("les étiquettes viennent des catégories déjà saisies, selon le segment", () => {
    expect(categoriesDuSegment(CATALOGUE, "BOISSONS")).toEqual(["Bières", "Eaux", "Sodas"]);
    expect(categoriesDuSegment(CATALOGUE, "RESTAURANT")).toEqual(["Grillades"]);
  });

  it("recherche insensible aux accents et à la casse ; les plus demandés d'abord", () => {
    expect(filtrerProduits(CATALOGUE, { segment: "TOUT", categorie: TOUTES_CATEGORIES, recherche: "MUTZIG" }).map((x) => x.id)).toEqual(["2"]);
    const populaires = new Map([["2", 9]]);
    expect(filtrerProduits(CATALOGUE, { segment: "BOISSONS", categorie: "Bières", recherche: "", populaires })[0].id).toBe("2");
  });

  it("épuisé : stock à 0 pour un article, portions à 0 pour un plat ; un plat sans portions n'est jamais épuisé", () => {
    expect(estEpuise(CATALOGUE[5])).toBe(true);
    expect(estEpuise(p("8", "Riz", "Plats", { typeProduit: "PLAT" as any, portionsDisponibles: 0 }))).toBe(true);
    expect(estEpuise(CATALOGUE[4])).toBe(false);
  });
});

describe("sélection (panier d'un onglet)", () => {
  it("ajoute, retire, jamais de quantité 0, jamais au-delà du stock", () => {
    const peu = p("9", "Rare", "Bières", { stockActuel: "2" });
    let s = changerQuantite({}, peu, 1);
    s = changerQuantite(s, peu, 1);
    expect(s).toEqual({ "9": 2 });
    expect(changerQuantite(s, peu, 1)).toBe(s); // plus de stock : inchangé
    s = changerQuantite(s, peu, -1);
    s = changerQuantite(s, peu, -1);
    expect(s).toEqual({});
    expect(changerQuantite(s, peu, -1)).toBe(s);
  });

  it("totaux par devise, jamais convertis ; libellé « 7,50 $ + 1 500 FC »", () => {
    const parId = new Map(CATALOGUE.map((x) => [x.id, x]));
    const sel = { "1": 2, "3": 1, "4": 1 };
    const t = totauxSelection(sel, parId);
    expect(t).toEqual({ usd: 7.5, cdf: 1500 });
    expect(articlesSelection(sel)).toBe(4);
    const fmt = (m: number, d: "USD" | "CDF") => (d === "USD" ? `${String(m).replace(".", ",")} $` : `${m} FC`);
    expect(libelleTotaux(t, fmt)).toBe("7,5 $ + 1500 FC");
    expect(libelleTotaux({ usd: 0, cdf: 0 }, fmt)).toBe("0 $");
  });

  it("nettoie la sélection des produits qui n'existent plus", () => {
    const parId = new Map([["1", {}]]);
    expect(nettoyerSelection({ "1": 2, "99": 1 }, parId)).toEqual({ "1": 2 });
    const intacte = { "1": 2 };
    expect(nettoyerSelection(intacte, parId)).toBe(intacte);
  });
});

describe("lire une table", () => {
  const ligne = (q: number, prix: string, devise = "USD") => ({ quantite: String(q), prixUnitaire: prix, devise });
  const table = (statut = "OUVERT") => ({
    statut,
    sousComptes: [
      { id: "a", nom: "Première commande", payeLe: "2026-11-11T10:00:00Z", lignes: [ligne(2, "3"), ligne(1, "1.5"), ligne(1, "1500", "CDF")] },
      { id: "b", nom: "Suite", payeLe: null, lignes: [ligne(1, "2.5")] },
    ],
  });

  it("déjà payé / reste à payer / part où ajouter la suite", () => {
    expect(dejaPaye(table())).toEqual({ usd: 7.5, cdf: 1500, articles: 4 });
    expect(resteAPayer(table())).toEqual({ usd: 2.5, cdf: 0, articles: 1 });
    expect(partOuverte(table())!.id).toBe("b");
  });

  it("toutes les parts payées : plus de part ouverte, et on peut terminer la table", () => {
    const t = table();
    t.sousComptes[1].lignes = [];
    expect(peutTerminerTable(t)).toBe(true);
    t.sousComptes[1].payeLe = "2026-11-11T11:00:00Z" as any;
    expect(partOuverte(t)).toBeUndefined();
  });

  it("on ne termine pas une table sans rien de payé, avec du reste à payer, ou déjà fermée", () => {
    expect(peutTerminerTable(table())).toBe(false);
    expect(peutTerminerTable({ statut: "OUVERT", sousComptes: [{ id: "x", nom: "P", payeLe: null, lignes: [] }] })).toBe(false);
    const fermee = table("FERME");
    fermee.sousComptes[1].lignes = [];
    expect(peutTerminerTable(fermee)).toBe(false);
  });

  it("nom de table suivant : après la plus grande « Table N » ouverte, sans toucher aux autres noms", () => {
    expect(nomTableSuivante([])).toBe("Table 1");
    expect(nomTableSuivante([{ tableOuNom: "Table 4" }, { tableOuNom: "table 7" }, { tableOuNom: "Terrasse — Jean" }, { tableOuNom: "Comptoir 10:00" }])).toBe("Table 8");
  });
});

describe("icône d'un produit", () => {
  it("devine la famille du type et du nom", () => {
    expect(familleIconeProduit(p("a", "Primus 72 cl", "Boissons"))).toBe("biere");
    expect(familleIconeProduit(p("b", "Eau Vitale", "Boissons"))).toBe("eau");
    expect(familleIconeProduit(p("c", "Café noir", "Boissons chaudes"))).toBe("chaud");
    expect(familleIconeProduit(p("d", "Fanta", "Sodas"))).toBe("soda");
    expect(familleIconeProduit(p("e", "Brochettes", "Grillades", { typeProduit: "PLAT" as any }))).toBe("plat");
  });
});
