import { PrismaClient } from "@hotel-chicago/database";
import { BornesMois } from "./bornes";
import {
  AgregatParMode,
  AgregatReception,
  AnnulationVente,
  FactureDetail,
  OccupationChambre,
  ParDevise,
} from "./types";

const ZERO: ParDevise = { usd: 0, cdf: 0 };
const JOUR_MS = 24 * 3600_000;

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

/** Nuitées d'un séjour recouvrant [debut, fin[ — dates prévues de la
 * réservation : aucun horodatage réel de check-in/check-out n'existe dans
 * le modèle (limite signalée en pied de rapport). */
function nuiteesDansMois(arrivee: Date, depart: Date, bornes: BornesMois): number {
  const d = Math.max(arrivee.getTime(), bornes.debut.getTime());
  const f = Math.min(depart.getTime(), bornes.fin.getTime());
  return Math.max(0, Math.round((f - d) / JOUR_MS));
}

/**
 * Agrégats mensuels de la réception pour UN hôtel sur [debut, fin[.
 * Fonction unique : rapport PDF et tableau de bord du mois lisent les mêmes
 * chiffres.
 *
 * Double comptage évité : `Facture.montantTotal{USD,CDF}` inclut les ventes
 * cafétaria facturées sur le séjour (`VenteCafeteria.reservationLieeId`) —
 * le rapport montre cette part dans `dontCafeteriaLiee`, séparément, et la
 * « recette chambres » n'est que `montantChambre`.
 */
export async function agregatReception(
  prisma: PrismaClient,
  hotelId: string,
  bornes: BornesMois
): Promise<AgregatReception> {
  const periode = { gte: bornes.debut, lt: bornes.fin };

  const [factures, chambres, annulees, facturesAnnulees, enCours, reservationsActives] = await Promise.all([
    prisma.facture.findMany({
      where: { hotelId, createdAt: periode, annuleLe: null },
      include: { reservation: { include: { chambre: true, client: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.chambre.findMany({ where: { hotelId }, select: { id: true, numero: true, type: true, devise: true, prixParNuit: true } }),
    prisma.reservation.findMany({
      where: { hotelId, annuleLe: periode },
      include: { chambre: true, client: true },
    }),
    prisma.facture.findMany({
      where: { hotelId, annuleLe: periode },
      include: { reservation: { include: { client: true } } },
    }),
    prisma.reservation.findMany({
      where: { hotelId, statut: "EN_COURS" },
      include: { chambre: true, client: true },
    }),
    // Séjours recouvrant le mois : `Reservation` n'a pas de `createdAt`
    // (schéma section 7) — « réservations du mois » = séjours prévus sur la
    // période, limite signalée en pied de rapport.
    prisma.reservation.findMany({
    where: {
      hotelId,
      statut: { in: ["CONFIRMEE", "EN_ATTENTE", "EN_COURS", "TERMINEE"] },
      dateArrivee: { lt: bornes.fin },
      dateDepart: { gt: bornes.debut },
    },
    include: { chambre: true },
    }),
  ]);

  const recetteChambres = { usd: 0, cdf: 0 };
  let dontCafeteriaLiee = { usd: 0, cdf: 0 };
  const monnaieRendue = { usd: 0, cdf: 0 };
  const modes = new Map<string, AgregatParMode>();
  const detail: FactureDetail[] = [];

  for (const f of factures) {
    const chambreUSD = f.deviseChambre === "USD" ? Number(f.montantChambre) : 0;
    const chambreCDF = f.deviseChambre === "CDF" ? Number(f.montantChambre) : 0;
    recetteChambres.usd += chambreUSD;
    recetteChambres.cdf += chambreCDF;
    const totalUSD = Number(f.montantTotalUSD);
    const totalCDF = Number(f.montantTotalCDF);
    dontCafeteriaLiee.usd += totalUSD - chambreUSD;
    dontCafeteriaLiee.cdf += totalCDF - chambreCDF;
    if (f.deviseMonnaieRendue && f.montantMonnaieRendue) {
      monnaieRendue[f.deviseMonnaieRendue === "USD" ? "usd" : "cdf"] += Number(f.montantMonnaieRendue);
    }
    const entree = modes.get(f.modePaiement) ?? { mode: f.modePaiement, nombre: 0, parDevise: { ...ZERO } };
    entree.nombre += 1;
    entree.parDevise.usd += totalUSD;
    entree.parDevise.cdf += totalCDF;
    modes.set(f.modePaiement, entree);

    const r = f.reservation;
    const sejour = `${jourLubumbashi(r.dateArrivee)} → ${jourLubumbashi(r.dateDepart)}`;
    detail.push({
      numeroRecu: f.numeroRecu,
      client: r.client.nom,
      chambre: `Ch. ${r.chambre.numero}`,
      sejour,
      montantChambre: Number(f.montantChambre),
      deviseChambre: f.deviseChambre,
      parDevise: parDevise(totalUSD, totalCDF),
      modePaiement: f.modePaiement,
      monnaieRendue:
        f.deviseMonnaieRendue && f.montantMonnaieRendue
          ? parDevise(
              f.deviseMonnaieRendue === "USD" ? Number(f.montantMonnaieRendue) : 0,
              f.deviseMonnaieRendue === "CDF" ? Number(f.montantMonnaieRendue) : 0
            )
          : null,
      date: jourLubumbashi(f.createdAt),
    });
  }

  // Occupation : nuitées prévues des séjours non annulés recouvrant le mois.
  const parChambre = new Map<string, OccupationChambre>();
  const parType = new Map<string, { type: string; nuitees: number; revenu: ParDevise }>();
  let nuiteesTotales = 0;
  const revenuOccupe = { usd: 0, cdf: 0 };
  const chambreParId = new Map(chambres.map((c) => [c.id, c]));

  for (const r of reservationsActives) {
    const n = nuiteesDansMois(r.dateArrivee, r.dateDepart, bornes);
    if (n === 0) continue;
    const c = r.chambre;
    const revenu = n * Number(c.prixParNuit);
    nuiteesTotales += n;
    revenuOccupe[c.devise === "USD" ? "usd" : "cdf"] += revenu;

    const ligne = parChambre.get(c.id) ?? { chambre: `Ch. ${c.numero}`, type: c.type, nuitees: 0, revenu: { ...ZERO } };
    ligne.nuitees += n;
    ligne.revenu[c.devise === "USD" ? "usd" : "cdf"] += revenu;
    parChambre.set(c.id, ligne);

    const t = parType.get(c.type) ?? { type: c.type, nuitees: 0, revenu: { ...ZERO } };
    t.nuitees += n;
    t.revenu[c.devise === "USD" ? "usd" : "cdf"] += revenu;
    parType.set(c.type, t);
  }

  const joursDuMois = Math.round((bornes.fin.getTime() - bornes.debut.getTime()) / JOUR_MS);
  const capacite = chambres.length * joursDuMois;
  const tauxOccupationPourcent = capacite === 0 ? 0 : Math.round((nuiteesTotales / capacite) * 1000) / 10;

  // Revenu moyen par nuitée : sur les nuitées facturées du mois (montant
  // chambre / nuits du séjour), pas la grille tarifaire.
  let nuiteesFacturees = 0;
  for (const f of factures) {
    nuiteesFacturees += Math.max(
      1,
      Math.round((f.reservation.dateDepart.getTime() - f.reservation.dateArrivee.getTime()) / JOUR_MS)
    );
  }
  const prixMoyenNuitee = parDevise(
    nuiteesFacturees ? recetteChambres.usd / nuiteesFacturees : 0,
    nuiteesFacturees ? recetteChambres.cdf / nuiteesFacturees : 0
  );
  const revenuParChambreDisponible = parDevise(
    capacite ? recetteChambres.usd / (chambres.length * joursDuMois) : 0,
    capacite ? recetteChambres.cdf / (chambres.length * joursDuMois) : 0
  );
  const dureeMoyenneSejourNuits = factures.length ? Math.round((nuiteesFacturees / factures.length) * 10) / 10 : 0;

  // Demandes du site public et origine des réservations du mois (séjours
  // recouvrant le mois, création non horodatée dans le modèle).
  const demandes = await prisma.reservation.groupBy({
    by: ["statut"],
    where: {
      hotelId,
      origine: "SITE_PUBLIC",
      dateArrivee: { lt: bornes.fin },
      dateDepart: { gt: bornes.debut },
    },
    _count: true,
  });
  const compte = (statut: string[]) =>
    demandes.filter((d) => statut.includes(d.statut)).reduce((s, d) => s + d._count, 0);
  const demandesSite = {
    recues: demandes.reduce((s, d) => s + d._count, 0),
    confirmees: compte(["CONFIRMEE", "EN_COURS", "TERMINEE"]),
    annulees: compte(["ANNULEE"]),
  };
  const origineReservations = {
    reception: reservationsActives.filter((r) => r.origine !== "SITE_PUBLIC").length,
    sitePublic: reservationsActives.filter((r) => r.origine === "SITE_PUBLIC").length,
  };

  const annulationsReservations = annulees.map((r) => ({
    client: r.client.nom,
    chambre: `Ch. ${r.chambre.numero}`,
    motif: r.motifAnnulation,
    date: r.annuleLe ? jourLubumbashi(r.annuleLe) : "—",
  }));
  const annulationsRecus: AnnulationVente[] = facturesAnnulees.map((f) => ({
    numeroRecu: f.numeroRecu,
    montant: parDevise(Number(f.montantTotalUSD), Number(f.montantTotalCDF)),
    motif: f.motifAnnulation,
    date: f.annuleLe ? jourLubumbashi(f.annuleLe) : "—",
  }));

  // Séjours encore en cours à fin de mois : statut actuel EN_COURS dont le
  // séjour débordait déjà la fin du mois, avec leurs acomptes.
  const acomptesEnCours = { usd: 0, cdf: 0 };
  const sejoursEnCoursFinMois = enCours
    .filter((r) => r.dateArrivee < bornes.fin)
    .map((r) => {
      const d = chambreParId.get(r.chambreId)?.devise ?? "USD";
      acomptesEnCours[d === "USD" ? "usd" : "cdf"] += Number(r.acompte);
      return {
        client: r.client.nom,
        chambre: `Ch. ${r.chambre.numero}`,
        depuis: jourLubumbashi(r.dateArrivee),
        acompte: parDevise(d === "USD" ? Number(r.acompte) : 0, d === "CDF" ? Number(r.acompte) : 0),
      };
    });

  return {
    recetteChambres: parDevise(recetteChambres.usd, recetteChambres.cdf),
    dontCafeteriaLiee: parDevise(dontCafeteriaLiee.usd, dontCafeteriaLiee.cdf),
    nombreFactures: factures.length,
    nuitees: nuiteesTotales,
    tauxOccupationPourcent,
    dureeMoyenneSejourNuits,
    prixMoyenNuitee,
    revenuParChambreDisponible,
    factures: detail,
    parMode: [...modes.values()].map((m) => ({ ...m, parDevise: parDevise(m.parDevise.usd, m.parDevise.cdf) })),
    monnaieRendueTotale: parDevise(monnaieRendue.usd, monnaieRendue.cdf),
    occupationParChambre: [...parChambre.values()]
      .map((o) => ({ ...o, revenu: parDevise(o.revenu.usd, o.revenu.cdf) }))
      .sort((a, b) => a.chambre.localeCompare(b.chambre)),
    occupationParType: [...parType.values()].map((t) => ({ ...t, revenu: parDevise(t.revenu.usd, t.revenu.cdf) })),
    demandesSite,
    origineReservations,
    annulationsReservations: annulationsReservations.sort((a, b) => a.date.localeCompare(b.date)),
    annulationsRecus,
    sejoursEnCoursFinMois,
    acomptesEnCours: parDevise(acomptesEnCours.usd, acomptesEnCours.cdf),
  };
}
