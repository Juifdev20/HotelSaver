import { PrismaClient } from "@hotel-chicago/database";
import { BornesMois } from "./bornes";
import { ParDevise } from "./types";

export interface DepenseDetail {
  date: string; // JJ/MM/AAAA
  motif: string;
  montant: number;
  devise: "USD" | "CDF";
  auteur: string;
}

export interface AgregatDepenses {
  lignes: DepenseDetail[];
  nombre: number;
  total: ParDevise;
}

/** Bornes du mois en jours calendaires (colonne `Depense.date` = @db.Date,
 * minuit UTC) : [1er du mois, 1er du mois suivant[. Les bornes horaires de
 * Lubumbashi (22:00 UTC la veille) ne conviennent pas à une colonne date. */
function bornesJours(bornes: BornesMois): { gte: Date; lt: Date } {
  const [annee, mois] = bornes.periode.split("-").map(Number);
  return { gte: new Date(Date.UTC(annee, mois - 1, 1)), lt: new Date(Date.UTC(annee, mois, 1)) };
}

/** Dépenses non annulées d'un département sur le mois — section « Dépenses »
 * et « Solde net » du rapport mensuel (demande du 07/10/2026). */
export async function agregatDepenses(
  prisma: PrismaClient,
  hotelId: string,
  departement: "RECEPTION" | "CAFETERIA",
  bornes: BornesMois
): Promise<AgregatDepenses> {
  const lignes = await prisma.depense.findMany({
    where: { hotelId, departement, annulee: false, date: bornesJours(bornes) },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
  const total = { usd: 0, cdf: 0 };
  const detail = lignes.map((l) => {
    const montant = Number(l.montant);
    total[l.devise === "USD" ? "usd" : "cdf"] += montant;
    const iso = l.date.toISOString().slice(0, 10);
    return {
      date: `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`,
      motif: l.motif,
      montant,
      devise: l.devise as "USD" | "CDF",
      auteur: l.creeParNom,
    };
  });
  return {
    lignes: detail,
    nombre: detail.length,
    total: { usd: Math.round(total.usd * 100) / 100, cdf: Math.round(total.cdf * 100) / 100 },
  };
}

/** Recettes − dépenses, devise par devise (jamais de conversion). */
export function soldeNet(recettes: ParDevise, depenses: ParDevise): ParDevise {
  return {
    usd: Math.round((recettes.usd - depenses.usd) * 100) / 100,
    cdf: Math.round((recettes.cdf - depenses.cdf) * 100) / 100,
  };
}
