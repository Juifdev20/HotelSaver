import { DUREES_MOIS, formuleParCode, lignesFormule, prixAbonnement, type FormuleAbonnement } from "@hotel-chicago/regles";
import type { FormuleProposee } from "@hotel-chicago/types";
import type { Catalogue } from "./catalogue";

/** Les formules PROPOSÉES à l'achat (celles que le super-admin a laissées actives), avec leurs prix dans les deux devises. Seule référence de prix affichés. */
export function formulesProposees(catalogue: Catalogue): FormuleProposee[] {
  const { tauxCdf, moisOffertsAnnuel } = catalogue.parametres;
  return catalogue.proposees
    .map((code) => formuleParCode(code, catalogue.formules))
    .filter((f): f is FormuleAbonnement => f !== undefined)
    .map((f) => ({
      code: f.code,
      nom: f.nom,
      description: f.description,
      recommandee: f.recommandee === true,
      maxChambres: f.maxChambres,
      inclus: lignesFormule(f),
      fonctions: f.fonctions,
      prixMensuelUsd: f.prixMensuelUsd,
      durees: DUREES_MOIS.map((mois) => ({
        mois,
        moisOfferts: mois === 12 ? Math.min(Math.max(0, moisOffertsAnnuel), 11) : 0,
        prixUsd: prixAbonnement({ formule: f.code, mois, devise: "USD", tauxCdf, formules: catalogue.formules, moisOffertsAnnuel }),
        prixCdf: prixAbonnement({ formule: f.code, mois, devise: "CDF", tauxCdf, formules: catalogue.formules, moisOffertsAnnuel }),
      })),
    }));
}
