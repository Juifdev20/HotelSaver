import * as React from "react";
import { useState } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import { Role, type ProfilConnecte } from "@hotel-chicago/types";
import { Button } from "@hotel-chicago/ui";
import { Ticket } from "lucide-react";
import type { IdPage } from "../navigation";
import { useVente } from "../vente/ContexteVente";
import { PanneauFormulaire } from "../components/PanneauFormulaire";
import { EcranComptesOuverts } from "./EcranComptesOuverts";
import { EcranCuisine } from "./EcranCuisine";
import { EcranRetraitCommande } from "./EcranRetraitCommande";

/**
 * « En cours » (11/11/2026, ancien « Comptes ouverts ») : toutes les tables ouvertes. La cafétaria reprend une table dans « Vente » (son onglet, avec les produits) ;
 * une commande du site et le patron gardent le détail du compte.
 *
 * 12/11/2026 : « Cuisine » devient l'onglet « En cuisine » (seulement si le suivi cuisine est activé) et « Retrait commande » un bouton
 * « Retirer une commande web » : tout ce qui se passe en ce moment est au même endroit.
 */
export function EnCours({
  client,
  utilisateur,
  interfaceImprimante,
  onOuvrirDetail,
  onNaviguer,
  ongletInitial = "tables",
}: {
  client: ClientApi;
  utilisateur: ProfilConnecte;
  interfaceImprimante: string | null;
  onOuvrirDetail: (compteId: string) => void;
  onNaviguer: (page: IdPage) => void;
  ongletInitial?: "tables" | "cuisine";
}) {
  const { choisirOnglet } = useVente();
  const cuisine = utilisateur.cuisineActivee === true;
  const [onglet, setOnglet] = useState<"tables" | "cuisine">(cuisine ? ongletInitial : "tables");
  const [retraitOuvert, setRetraitOuvert] = useState(false);

  return (
    <div className="page">
      <header className="page__entete">
        <div>
          <h1 className="hc-text-display-md page__titre">En cours</h1>
          <p className="hc-text-body page__sous-titre">Les tables ouvertes{cuisine ? ", et ce qui se prépare en cuisine" : ""}.</p>
        </div>
        <Button type="button" variant="secondary" onClick={() => setRetraitOuvert(true)}>
          <Ticket size={16} aria-hidden="true" /> Retirer une commande web
        </Button>
      </header>

      {cuisine && (
        <div className="puces" role="group" aria-label="Vue">
          <button type="button" className="puce" aria-pressed={onglet === "tables"} onClick={() => setOnglet("tables")}>
            Tables
          </button>
          <button type="button" className="puce" aria-pressed={onglet === "cuisine"} onClick={() => setOnglet("cuisine")}>
            En cuisine
          </button>
        </div>
      )}

      {retraitOuvert && (
        <PanneauFormulaire
          titre="Retirer une commande web"
          sousTitre="Le client donne la référence de sa commande passée sur le site de l'hôtel."
          onFermer={() => setRetraitOuvert(false)}
          erreur={null}
          actions={
            <Button type="button" variant="secondary" onClick={() => setRetraitOuvert(false)}>
              Fermer
            </Button>
          }
        >
          <EcranRetraitCommande
            client={client}
            integre
            onOuvrirCompte={(id) => {
              setRetraitOuvert(false);
              onOuvrirDetail(id);
            }}
          />
        </PanneauFormulaire>
      )}

      {onglet === "cuisine" && cuisine ? (
        <EcranCuisine client={client} integre onOuvrirCompte={onOuvrirDetail} />
      ) : (
        <EcranComptesOuverts
          client={client}
          utilisateur={utilisateur}
          interfaceImprimante={interfaceImprimante}
          integre
          onOuvrirCompte={(id, compte) => {
            if (utilisateur.role === Role.CAFETARIA && compte && compte.origine !== "SITE_PUBLIC") {
              choisirOnglet(id);
              onNaviguer("caisse");
              return;
            }
            onOuvrirDetail(id);
          }}
        />
      )}
    </div>
  );
}
