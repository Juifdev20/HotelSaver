import { PrismaClient } from "@hotel-chicago/database";
import { BornesMois } from "./bornes";
import {
  AgregatCafeteria,
  AgregatParCategorie,
  AgregatParMode,
  AgregatParServeur,
  AnnulationVente,
  LigneInventaire,
  LigneJour,
  LignePerte,
  ParDevise,
  ProduitTop,
} from "./types";

const ZERO: ParDevise = { usd: 0, cdf: 0 };

function parDevise(usd: number, cdf: number): ParDevise {
  return { usd: Math.round(usd * 100) / 100, cdf: Math.round(cdf * 100) / 100 };
}

function jourLubumbashi(d: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Africa/Lubumbashi",
  }).format(d);
}

function cleJour(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Africa/Lubumbashi",
  }).format(d);
}

/** Signe d'un mouvement de stock : + pour ENTREE, − pour SORTIE_VENTE/PERTE,
 * signé (peut être négatif) pour AJUSTEMENT. */
export function signeMouvement(type: string): number {
  if (type === "ENTREE") return 1;
  if (type === "AJUSTEMENT") return 1; // la quantité porte déjà son signe
  return -1; // SORTIE_VENTE, PERTE
}

/**
 * Agrégats mensuels de la cafétaria pour UN hôtel sur [debut, fin[.
 * Fonction unique : le rapport PDF ET le tableau de bord du mois lisent ces
 * mêmes chiffres (concordance par construction — section « contrôle »).
 *
 * Point de vigilance : les ventes FACTURE_CHAMBRE comptent dans le total
 * cafétaria (c'est de la recette du département) MAIS sont aussi incluses
 * dans `Facture.montantTotal` — le rapport les isole dans `factureChambre`
 * pour que le lecteur ne double-compte jamais.
 */
export async function agregatCafeteria(
  prisma: PrismaClient,
  hotelId: string,
  bornes: BornesMois
): Promise<AgregatCafeteria> {
  const periode = { gte: bornes.debut, lt: bornes.fin };

  const ventes = await prisma.venteCafeteria.findMany({
    where: { hotelId, createdAt: periode, annuleLe: null },
    select: {
      montantTotalUSD: true,
      montantTotalCDF: true,
      modePaiement: true,
      compteId: true,
      sousCompteId: true,
      createdBy: true,
      createdAt: true,
      reservationLieeId: true,
      numeroRecu: true,
    },
  });

  const sommeVentes = ventes.reduce(
    (acc, v) => ({ usd: acc.usd + Number(v.montantTotalUSD), cdf: acc.cdf + Number(v.montantTotalCDF) }),
    { usd: 0, cdf: 0 }
  );
  const recetteNette = parDevise(sommeVentes.usd, sommeVentes.cdf);
  const nombreVentes = ventes.length;
  const nombreComptes = new Set(ventes.map((v) => v.compteId)).size;
  const panierMoyen = parDevise(
    nombreVentes ? sommeVentes.usd / nombreVentes : 0,
    nombreVentes ? sommeVentes.cdf / nombreVentes : 0
  );

  // Répartition par mode de paiement.
  const modes = new Map<string, AgregatParMode>();
  for (const v of ventes) {
    const entree = modes.get(v.modePaiement) ?? { mode: v.modePaiement, nombre: 0, parDevise: { ...ZERO } };
    entree.nombre += 1;
    entree.parDevise.usd += Number(v.montantTotalUSD);
    entree.parDevise.cdf += Number(v.montantTotalCDF);
    modes.set(v.modePaiement, entree);
  }
  const parMode = [...modes.values()].map((m) => ({
    ...m,
    parDevise: parDevise(m.parDevise.usd, m.parDevise.cdf),
  }));

  const facturees = ventes.filter((v) => v.modePaiement === "FACTURE_CHAMBRE");
  const factureChambre = {
    nombre: facturees.length,
    parDevise: parDevise(
      facturees.reduce((s, v) => s + Number(v.montantTotalUSD), 0),
      facturees.reduce((s, v) => s + Number(v.montantTotalCDF), 0)
    ),
  };

  // Ventes par jour (clé de jour à Lubumbashi).
  const jours = new Map<string, LigneJour>();
  for (const v of ventes) {
    const cle = cleJour(v.createdAt);
    const ligne = jours.get(cle) ?? { jour: jourLubumbashi(v.createdAt), parDevise: { usd: 0, cdf: 0 }, nombre: 0 };
    ligne.parDevise.usd += Number(v.montantTotalUSD);
    ligne.parDevise.cdf += Number(v.montantTotalCDF);
    ligne.nombre += 1;
    jours.set(cle, ligne);
  }
  const parJour = [...jours.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, l]) => ({ ...l, parDevise: parDevise(l.parDevise.usd, l.parDevise.cdf) }));

  // Top produits / catégories : lignes de commande des sous-comptes couverts
  // par une vente non annulée du mois (encaissement groupé → tout le compte ;
  // encaissement par personne → ce sous-compte seulement).
  const sousComptesVendus = new Set<string>();
  const comptesVendus = new Set<string>();
  for (const v of ventes) {
    if (v.sousCompteId) sousComptesVendus.add(v.sousCompteId);
    else comptesVendus.add(v.compteId);
  }
  const lignes = await prisma.ligneCommande.findMany({
    where: {
      hotelId,
      sousCompte: { OR: [{ id: { in: [...sousComptesVendus] } }, { compteId: { in: [...comptesVendus] } }] },
    },
    select: {
      quantite: true,
      prixUnitaire: true,
      devise: true,
      produit: { select: { nom: true, categorie: true } },
    },
  });

  const produits = new Map<string, ProduitTop>();
  const categories = new Map<string, AgregatParCategorie>();
  for (const l of lignes) {
    const q = Number(l.quantite);
    const montant = q * Number(l.prixUnitaire);
    const nom = l.produit.nom;
    const p = produits.get(nom) ?? { nom, categorie: l.produit.categorie, quantite: 0, parDevise: { ...ZERO } };
    p.quantite += q;
    p.parDevise[l.devise === "USD" ? "usd" : "cdf"] += montant;
    produits.set(nom, p);
    const c = categories.get(l.produit.categorie) ?? { categorie: l.produit.categorie, quantite: 0, parDevise: { ...ZERO } };
    c.quantite += q;
    c.parDevise[l.devise === "USD" ? "usd" : "cdf"] += montant;
    categories.set(l.produit.categorie, c);
  }
  // Tri par quantité vendue : neutre entre USD et CDF — jamais de taux
  // arbitraire pour comparer deux devises (même discipline que section 9.4).
  const topProduits = [...produits.values()]
    .map((p) => ({ ...p, parDevise: parDevise(p.parDevise.usd, p.parDevise.cdf) }))
    .sort((a, b) => b.quantite - a.quantite)
    .slice(0, 10);
  const parCategorie = [...categories.values()]
    .map((c) => ({ ...c, parDevise: parDevise(c.parDevise.usd, c.parDevise.cdf) }))
    .sort((a, b) => b.quantite - a.quantite);

  // Ventes par serveur (createdBy → nom du compte).
  const idsServeurs = [...new Set(ventes.map((v) => v.createdBy))];
  const utilisateurs = await prisma.utilisateur.findMany({
    where: { id: { in: idsServeurs } },
    select: { id: true, nom: true },
  });
  const nomsServeurs = new Map(utilisateurs.map((u) => [u.id, u.nom]));
  const serveurs = new Map<string, AgregatParServeur>();
  for (const v of ventes) {
    const nom = nomsServeurs.get(v.createdBy) ?? "Compte supprimé";
    const s = serveurs.get(nom) ?? { nom, nombreVentes: 0, parDevise: { ...ZERO } };
    s.nombreVentes += 1;
    s.parDevise.usd += Number(v.montantTotalUSD);
    s.parDevise.cdf += Number(v.montantTotalCDF);
    serveurs.set(nom, s);
  }
  const parServeur = [...serveurs.values()]
    .map((s) => ({ ...s, parDevise: parDevise(s.parDevise.usd, s.parDevise.cdf) }))
    .sort((a, b) => b.nombreVentes - a.nombreVentes);

  // Inventaire : stock d'ouverture reconstitué à rebours (stockActuel −
  // mouvements postérieurs au début du mois), stock de clôture pareil à la fin.
  const produitsHotel = await prisma.produit.findMany({
    where: { hotelId },
    select: { id: true, nom: true, categorie: true, prix: true, devise: true, stockActuel: true, seuilAlerte: true, actif: true },
  });
  const mouvements = await prisma.mouvementStock.findMany({
    where: { hotelId, createdAt: { gte: bornes.debut } },
    select: { produitId: true, quantite: true, type: true, motif: true, createdAt: true },
  });

  const inventaire: LigneInventaire[] = [];
  const pertesAjustements: LignePerte[] = [];
  for (const p of produitsHotel) {
    const mouvs = mouvements.filter((m) => m.produitId === p.id);
    let dansMois = 0;
    let apresMois = 0;
    let entrees = 0;
    let sortiesVentes = 0;
    let pertes = 0;
    let ajustements = 0;
    for (const m of mouvs) {
      const q = Number(m.quantite);
      const signe = signeMouvement(m.type);
      if (m.createdAt >= bornes.fin) {
        apresMois += signe * q;
        continue;
      }
      dansMois += signe * q;
      if (m.type === "ENTREE") entrees += q;
      else if (m.type === "SORTIE_VENTE") sortiesVentes += q;
      else if (m.type === "PERTE") pertes += q;
      else ajustements += q;
      if (m.type === "PERTE" || m.type === "AJUSTEMENT") {
        pertesAjustements.push({
          produit: p.nom,
          type: m.type,
          quantite: q,
          motif: m.motif,
          date: jourLubumbashi(m.createdAt),
        });
      }
    }
    const stockCloture = Number(p.stockActuel) - apresMois;
    const stockOuverture = stockCloture - dansMois;
    if (entrees === 0 && sortiesVentes === 0 && pertes === 0 && ajustements === 0 && stockOuverture === 0 && stockCloture === 0) {
      continue; // produit jamais utilisé : pas de ligne dans le rapport
    }
    inventaire.push({
      produit: p.nom,
      categorie: p.categorie,
      stockOuverture,
      entrees,
      sortiesVentes,
      pertes,
      ajustements,
      stockCloture,
      valeurCloture: parDevise(
        p.devise === "USD" ? stockCloture * Number(p.prix) : 0,
        p.devise === "CDF" ? stockCloture * Number(p.prix) : 0
      ),
    });
  }
  const valeurStockCloture = parDevise(
    inventaire.reduce((s, l) => s + l.valeurCloture.usd, 0),
    inventaire.reduce((s, l) => s + l.valeurCloture.cdf, 0)
  );

  const produitsSousSeuil = produitsHotel
    .filter((p) => p.actif && Number(p.stockActuel) <= Number(p.seuilAlerte))
    .map((p) => ({ produit: p.nom, stock: Number(p.stockActuel), seuil: Number(p.seuilAlerte) }));

  // Ventes annulées dans le mois (annuleLe, pas createdAt : c'est la date de l'acte).
  const ventesAnnulees = await prisma.venteCafeteria.findMany({
    where: { hotelId, annuleLe: periode },
    select: { numeroRecu: true, montantTotalUSD: true, montantTotalCDF: true, motifAnnulation: true, annuleLe: true },
  });
  const annulations: AnnulationVente[] = ventesAnnulees.map((v) => ({
    numeroRecu: v.numeroRecu,
    montant: parDevise(Number(v.montantTotalUSD), Number(v.montantTotalCDF)),
    motif: v.motifAnnulation,
    date: v.annuleLe ? jourLubumbashi(v.annuleLe) : "—",
  }));

  return {
    recetteNette,
    nombreVentes,
    nombreComptes,
    panierMoyen,
    parMode,
    factureChambre,
    parJour,
    topProduits,
    parCategorie,
    parServeur,
    inventaire,
    valeurStockCloture,
    produitsSousSeuil,
    pertesAjustements: pertesAjustements.sort((a, b) => a.date.localeCompare(b.date)),
    annulations,
  };
}
