import { useEffect, useState } from "react";
import { obtenirFormulesPubliques } from "@hotel-chicago/api-client";
import type { FormuleProposee, FormulesPubliques } from "@hotel-chicago/types";
import {
  CONTACT_SUPPORT_PAR_DEFAUT,
  DUREES_MOIS,
  FORMULES,
  PARAMETRES_PAR_DEFAUT,
  lignesFormule,
  prixAbonnement,
} from "@hotel-chicago/regles";
import { configuration } from "../config";

/**
 * Formules de secours : celles de départ, intégrées à l'application. Elles ne servent que si le serveur est injoignable — la vraie
 * liste (prix, noms, avantages) est celle que le super-admin définit et que le serveur publie sur GET /public/formules.
 */
function formulesDeSecours(): FormulesPubliques {
  const { tauxCdf, moisOffertsAnnuel, joursEssai, joursGrace } = PARAMETRES_PAR_DEFAUT;
  const formules: FormuleProposee[] = FORMULES.map((f) => ({
    code: f.code,
    nom: f.nom,
    description: f.description,
    recommandee: Boolean(f.recommandee),
    maxChambres: f.maxChambres,
    inclus: lignesFormule(f),
    fonctions: [...f.fonctions],
    prixMensuelUsd: f.prixMensuelUsd,
    durees: DUREES_MOIS.map((mois) => ({
      mois,
      moisOfferts: mois === 12 ? moisOffertsAnnuel : 0,
      prixUsd: prixAbonnement({ formule: f.code, mois, devise: "USD", moisOffertsAnnuel }),
      prixCdf: prixAbonnement({ formule: f.code, mois, devise: "CDF", tauxCdf, moisOffertsAnnuel }),
    })),
  }));
  return {
    formules,
    parametres: { tauxCdf, moisOffertsAnnuel, joursEssai, joursGrace },
    contact: { ...CONTACT_SUPPORT_PAR_DEFAUT },
  };
}

export interface EtatFormules {
  /** Toujours renseigné : les valeurs du serveur, ou celles de secours. */
  donnees: FormulesPubliques;
  chargement: boolean;
  /** true = le serveur n'a pas répondu, on montre les formules de secours. */
  secours: boolean;
}

// Une seule requête pour toute la page (tarifs + pied de page) ; un échec n'est pas mémorisé : un rechargement de page réessaie.
let promesse: Promise<FormulesPubliques> | null = null;
function charger(): Promise<FormulesPubliques> {
  promesse ??= obtenirFormulesPubliques({ url: configuration.apiUrl }).catch((e) => {
    promesse = null;
    throw e;
  });
  return promesse;
}

const SECOURS = formulesDeSecours();

export function useFormulesPubliques(): EtatFormules {
  const [etat, setEtat] = useState<EtatFormules>({ donnees: SECOURS, chargement: true, secours: false });

  useEffect(() => {
    let annule = false;
    charger()
      .then((donnees) => !annule && setEtat({ donnees, chargement: false, secours: false }))
      .catch(() => !annule && setEtat({ donnees: SECOURS, chargement: false, secours: true }));
    return () => {
      annule = true;
    };
  }, []);

  return etat;
}
