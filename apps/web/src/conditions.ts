import { useEffect, useState } from "react";
import { lireConditionsUtilisation } from "@hotel-chicago/api-client";
import type { ConditionsUtilisationPubliques } from "@hotel-chicago/types";
import { configuration } from "./config";

/** Conditions d'utilisation en vigueur (19/10/2026) : la version lue est celle envoyée à l'inscription. */
export function useConditions() {
  const [conditions, setConditions] = useState<ConditionsUtilisationPubliques | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  useEffect(() => {
    lireConditionsUtilisation({ url: configuration.apiUrl })
      .then(setConditions)
      .catch(() => setErreur("Les conditions d'utilisation n'ont pas pu être chargées. Vérifiez votre connexion et rechargez la page."));
  }, []);
  return { conditions, erreur };
}
