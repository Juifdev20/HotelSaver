import * as React from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import { Role, type ProfilConnecte } from "@hotel-chicago/types";
import type { IdPage } from "../navigation";
import { useVente } from "../vente/ContexteVente";
import { EcranComptesOuverts } from "./EcranComptesOuverts";

/**
 * « En cours » (11/11/2026, ancien « Comptes ouverts ») : toutes les tables ouvertes. La cafétaria reprend une table dans « Vente » (son onglet, avec les produits) ;
 * une commande du site et le patron gardent le détail du compte.
 */
export function EnCours({
  client,
  utilisateur,
  interfaceImprimante,
  onOuvrirDetail,
  onNaviguer,
}: {
  client: ClientApi;
  utilisateur: ProfilConnecte;
  interfaceImprimante: string | null;
  onOuvrirDetail: (compteId: string) => void;
  onNaviguer: (page: IdPage) => void;
}) {
  const { choisirOnglet } = useVente();
  return (
    <EcranComptesOuverts
      client={client}
      utilisateur={utilisateur}
      interfaceImprimante={interfaceImprimante}
      onOuvrirCompte={(id, compte) => {
        if (utilisateur.role === Role.CAFETARIA && compte && compte.origine !== "SITE_PUBLIC") {
          choisirOnglet(id);
          onNaviguer("caisse");
          return;
        }
        onOuvrirDetail(id);
      }}
    />
  );
}
