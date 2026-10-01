import { Devise } from "@hotel-chicago/types";
import type { CompteCafeteriaMiroir, SousCompteMiroir } from "./stockage/cafeteriaMirroir";

export interface Totaux {
  usd: number;
  cdf: number;
}

export function totalSousCompte(sousCompte: SousCompteMiroir): Totaux {
  let usd = 0;
  let cdf = 0;
  for (const ligne of sousCompte.lignes) {
    const montant = Number(ligne.prixUnitaire) * Number(ligne.quantite);
    if (ligne.devise === Devise.USD) usd += montant;
    else cdf += montant;
  }
  return { usd, cdf };
}

export function totalCompte(compte: CompteCafeteriaMiroir): Totaux {
  return compte.sousComptes.reduce(
    (acc, sc) => {
      const t = totalSousCompte(sc);
      return { usd: acc.usd + t.usd, cdf: acc.cdf + t.cdf };
    },
    { usd: 0, cdf: 0 }
  );
}

export function nombreArticles(sousCompte: SousCompteMiroir): number {
  return sousCompte.lignes.reduce((n, l) => n + Number(l.quantite), 0);
}
