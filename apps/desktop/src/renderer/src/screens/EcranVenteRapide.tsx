import * as React from "react";
import { useEffect, useRef, useState } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import { StatutCompte } from "@hotel-chicago/types";
import type { CompteCafeteria, MenuDuJour, Produit } from "@hotel-chicago/types";
import { EcranAjoutConsommation } from "./EcranAjoutConsommation";

export interface EcranVenteRapideProps {
  client: ClientApi;
  /** Retour sans rien valider : aucun compte n'a été créé. */
  onRetour: () => void;
  /** Panier validé : le compte « Comptoir » vient d'être créé avec ses lignes → afficher son détail (encaissement). */
  onCompteCree: (compteId: string) => void;
}

/**
 * Vente au comptoir (19/10/2026) — équivalent bureau de apps/mobile/src/ecrans/EcranVenteRapide.tsx : l'ajout s'ouvre tout de suite
 * (douchette, webcam) SANS compte ; le compte « Comptoir HH:MM » n'est créé qu'à la validation du panier. Revenir en arrière ne laisse
 * plus de compte vide dans « Comptes ouverts ».
 */
export function EcranVenteRapide({ client, onRetour, onCompteCree }: EcranVenteRapideProps) {
  const [produits, setProduits] = useState<Produit[]>([]);
  const [populaires, setPopulaires] = useState<Map<string, number>>(new Map());
  const [menuDuJour, setMenuDuJour] = useState<MenuDuJour | null>(null);
  const cree = useRef<string | null>(null);
  const [nom] = useState(() => `Comptoir ${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lubumbashi" })}`);

  useEffect(() => {
    client.listerProduits().then(setProduits).catch(() => setProduits([]));
    client.menuDuJour().then(setMenuDuJour).catch(() => setMenuDuJour(null));
    client
      .produitsPopulaires()
      .then((liste) => setPopulaires(new Map(liste.map((p) => [p.produitId, p.quantite]))))
      .catch(() => undefined);
  }, [client]);

  // Compte « à créer » : seulement pour l'affichage tant que le panier n'est pas validé.
  const compteProvisoire = { id: "", tableOuNom: nom, statut: StatutCompte.OUVERT, ouvertPar: "", ouvertLe: new Date().toISOString(), fermeLe: null, syncVersion: 0, sousComptes: [], ventes: [] } as CompteCafeteria;
  const personneProvisoire = { id: "", compteId: "", nom: "Client", payeLe: null, lignes: [] } as unknown as CompteCafeteria["sousComptes"][number];

  return (
    <EcranAjoutConsommation
      client={client}
      compte={compteProvisoire}
      personne={personneProvisoire}
      produits={produits}
      populaires={populaires}
      menuDuJour={menuDuJour}
      scannerAuDemarrage
      preparerCompte={async () => {
        const compte = await client.ouvrirCompteCafeteria({ tableOuNom: nom, nomPremierSousCompte: "Client" });
        cree.current = compte.id;
        return { compteId: compte.id, sousCompteId: compte.sousComptes[0].id };
      }}
      onRetour={onRetour}
      onAjoute={() => (cree.current ? onCompteCree(cree.current) : onRetour())}
    />
  );
}
