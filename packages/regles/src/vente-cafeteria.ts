/**
 * Nouvelle vente de la cafétéria (11/11/2026) : règles PURES partagées entre le téléphone et le bureau — filtrer les produits (Boissons /
 * Restaurant / catégories / recherche), tenir la sélection, calculer les totaux par devise, et lire une table (part restée ouverte, déjà payé).
 * Aucune dépendance à React ni à l'écran : mêmes résultats partout, testables sans interface.
 */
import type { CompteCafeteria, Produit, SousCompte } from "@hotel-chicago/types";

export const TOUTES_CATEGORIES = "Tous";

/** Boissons = articles de comptoir (stockés) ; Restaurant = plats préparés. Même distinction que `Produit.typeProduit`, rien à ressaisir. */
export type SegmentVente = "TOUT" | "BOISSONS" | "RESTAURANT";
export const LIBELLE_SEGMENT: Record<SegmentVente, string> = { TOUT: "Tout", BOISSONS: "Boissons", RESTAURANT: "Restaurant" };

export function segmentDuProduit(produit: Pick<Produit, "typeProduit">): Exclude<SegmentVente, "TOUT"> {
  return produit.typeProduit === "PLAT" ? "RESTAURANT" : "BOISSONS";
}

/** Quantité encore vendable : stock pour un article, portions pour un plat (null = illimité : un plat sans portions déclarées n'est jamais « épuisé »). */
export function limiteDisponible(produit: Pick<Produit, "typeProduit" | "portionsDisponibles" | "stockActuel">): number | null {
  if (produit.typeProduit === "PLAT") return produit.portionsDisponibles ?? null;
  return Number(produit.stockActuel);
}

export function estEpuise(produit: Pick<Produit, "typeProduit" | "portionsDisponibles" | "stockActuel">): boolean {
  const limite = limiteDisponible(produit);
  return limite !== null && limite <= 0;
}

/** « Fanta » = « fanta » = « Fänta » : recherche insensible à la casse et aux accents. */
export function normaliser(texte: string): string {
  return texte.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Catégories présentes dans le segment choisi (les étiquettes viennent des catégories déjà saisies par le patron), triées. */
export function categoriesDuSegment(produits: Produit[], segment: SegmentVente): string[] {
  const noms = new Set<string>();
  for (const p of produits) {
    if (segment !== "TOUT" && segmentDuProduit(p) !== segment) continue;
    const c = p.categorie.trim();
    if (c) noms.add(c);
  }
  return [...noms].sort((a, b) => a.localeCompare(b, "fr"));
}

export interface FiltreVente {
  segment: SegmentVente;
  /** `TOUTES_CATEGORIES` ou le nom d'une catégorie. */
  categorie: string;
  recherche: string;
  /** Quantités vendues aujourd'hui par produit : les plus demandés passent en tête. */
  populaires?: ReadonlyMap<string, number>;
}

/** Produits actifs correspondant au filtre : les plus demandés d'abord, puis l'ordre alphabétique. */
export function filtrerProduits(produits: Produit[], filtre: FiltreVente): Produit[] {
  const terme = normaliser(filtre.recherche);
  const pop = filtre.populaires ?? new Map<string, number>();
  return produits
    .filter((p) => p.actif !== false)
    .filter((p) => filtre.segment === "TOUT" || segmentDuProduit(p) === filtre.segment)
    .filter((p) => filtre.categorie === TOUTES_CATEGORIES || p.categorie.trim() === filtre.categorie)
    .filter((p) => !terme || normaliser(p.nom).includes(terme))
    .sort((a, b) => (pop.get(b.id) ?? 0) - (pop.get(a.id) ?? 0) || a.nom.localeCompare(b.nom, "fr"));
}

// ---------------------------------------------------------------------------------------------------- sélection (le panier d'un onglet)

/** Produit → quantité choisie. Jamais de quantité 0 : un produit retiré disparaît. */
export type Selection = Record<string, number>;

export interface Totaux {
  usd: number;
  cdf: number;
}

/** Ajoute (+1) ou retire (-1) un produit. Jamais au-delà du stock/des portions connus (le serveur recontrôle à la synchronisation). */
export function changerQuantite(selection: Selection, produit: Pick<Produit, "id" | "typeProduit" | "portionsDisponibles" | "stockActuel">, delta: number): Selection {
  const actuelle = selection[produit.id] ?? 0;
  const limite = limiteDisponible(produit);
  let quantite = Math.max(0, actuelle + delta);
  if (delta > 0 && limite !== null && quantite > limite) quantite = Math.max(actuelle, 0);
  if (quantite === actuelle) return selection;
  const suivante = { ...selection };
  if (quantite === 0) delete suivante[produit.id];
  else suivante[produit.id] = quantite;
  return suivante;
}

export function articlesSelection(selection: Selection): number {
  return Object.values(selection).reduce((n, q) => n + q, 0);
}

/** Totaux par devise, jamais convertis l'un dans l'autre (chaque produit garde sa devise). */
export function totauxSelection(selection: Selection, produitsParId: ReadonlyMap<string, Pick<Produit, "prix" | "devise">>): Totaux {
  let usd = 0;
  let cdf = 0;
  for (const [id, quantite] of Object.entries(selection)) {
    const p = produitsParId.get(id);
    if (!p) continue;
    const montant = Number(p.prix) * quantite;
    if (p.devise === "USD") usd += montant;
    else cdf += montant;
  }
  return { usd, cdf };
}

/** « 7,50 $ + 1 500 FC » (ou « 0 $ » si vide) : le formateur de montant est celui de l'application. */
export function libelleTotaux(totaux: Totaux, formater: (montant: number, devise: "USD" | "CDF") => string): string {
  const parties = [totaux.usd > 0 ? formater(totaux.usd, "USD") : null, totaux.cdf > 0 ? formater(totaux.cdf, "CDF") : null].filter(Boolean);
  return parties.length ? parties.join(" + ") : formater(0, "USD");
}

/** Retire de la sélection les produits que le catalogue ne connaît plus (supprimés ou désactivés depuis). */
export function nettoyerSelection(selection: Selection, produitsParId: ReadonlyMap<string, unknown>): Selection {
  const entrees = Object.entries(selection).filter(([id, q]) => q > 0 && produitsParId.has(id));
  return entrees.length === Object.keys(selection).length ? selection : Object.fromEntries(entrees);
}

// ---------------------------------------------------------------------------------------------------- lire une table

type PartLue = Pick<SousCompte, "id" | "nom" | "payeLe"> & { lignes: { quantite: string; prixUnitaire: string; devise: string }[] };

function totalLignes(parts: PartLue[]): Totaux & { articles: number } {
  let usd = 0;
  let cdf = 0;
  let articles = 0;
  for (const part of parts) {
    for (const l of part.lignes) {
      const q = Number(l.quantite);
      articles += q;
      const montant = Number(l.prixUnitaire) * q;
      if (l.devise === "USD") usd += montant;
      else cdf += montant;
    }
  }
  return { usd, cdf, articles };
}

/**
 * La part sur laquelle on AJOUTE les nouvelles consommations d'une table : la dernière part non payée. Une table dont toutes les parts sont
 * payées n'en a plus (il faut en créer une, voir `nomPartSuite`).
 */
export function partOuverte(compte: { sousComptes: PartLue[] }): PartLue | undefined {
  const ouvertes = compte.sousComptes.filter((p) => !p.payeLe);
  return ouvertes[ouvertes.length - 1];
}

/** Ce qui est déjà payé sur la table (parts réglées) : articles et montants par devise. */
export function dejaPaye(compte: { sousComptes: PartLue[] }): Totaux & { articles: number } {
  return totalLignes(compte.sousComptes.filter((p) => !!p.payeLe));
}

/** Ce qu'il reste à régler sur la table (parts non payées). */
export function resteAPayer(compte: { sousComptes: PartLue[] }): Totaux & { articles: number } {
  return totalLignes(compte.sousComptes.filter((p) => !p.payeLe));
}

/** « Table 5 » : le plus petit numéro libre après la plus grande « Table N » ouverte (jamais deux tables du même nom ouvertes par accident). */
export function nomTableSuivante(comptesOuverts: { tableOuNom: string }[]): string {
  let max = 0;
  for (const c of comptesOuverts) {
    const m = /^table\s+(\d+)$/i.exec(c.tableOuNom.trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `Table ${max + 1}`;
}

/** Faut-il proposer « Terminer la table » ? Une part payée au moins, plus rien à régler. */
export function peutTerminerTable(compte: { statut: string; sousComptes: PartLue[] }): boolean {
  if (compte.statut !== "OUVERT") return false;
  return compte.sousComptes.some((p) => !!p.payeLe) && resteAPayer(compte).articles === 0;
}

export type { CompteCafeteria };

/** Famille d'icône d'un produit (en attendant les photos) : devinée du type et du nom, les deux applications choisissent leur dessin. */
export type FamilleIcone = "biere" | "soda" | "eau" | "chaud" | "plat";

export function familleIconeProduit(produit: Pick<Produit, "typeProduit" | "nom" | "categorie">): FamilleIcone {
  if (produit.typeProduit === "PLAT") return "plat";
  const t = normaliser(`${produit.categorie} ${produit.nom}`);
  if (/\b(biere|bieres|primus|mutzig|simba|castel|heineken|turbo|guinness|vin|whisky|liqueur|alcool)\b/.test(t)) return "biere";
  if (/\b(eau|vitale|water|minerale)\b/.test(t)) return "eau";
  if (/\b(cafe|the|chaud|chocolat|lait|cappuccino|infusion)\b/.test(t)) return "chaud";
  return "soda";
}
