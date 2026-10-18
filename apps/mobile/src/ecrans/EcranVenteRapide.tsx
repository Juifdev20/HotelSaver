import * as React from "react";
import { useEffect, useRef, useState } from "react";
import type { CompteCafeteria, MenuDuJour, Produit, SousCompte } from "@hotel-chicago/types";
import { StatutCompte } from "@hotel-chicago/types";
import { useSession } from "../contexteSession";
import { heureCourte } from "../dates";
import { EcranAjoutConsommation } from "./EcranAjoutConsommation";

export interface EcranVenteRapideProps {
  /** Retour sans rien valider : aucun compte n'a été créé. */
  onRetour: () => void;
  /** Panier validé : le compte « Comptoir » vient d'être créé avec ses lignes → afficher son détail (encaissement). */
  onCompteCree: (compteId: string) => void;
}

/**
 * Vente au comptoir (19/10/2026) : l'ajout de consommations s'ouvre tout de suite, caméra prête, SANS compte. Le compte
 * « Comptoir HH:MM » (et sa personne « Client ») n'est créé qu'à la validation du panier : revenir en arrière ne laisse donc
 * plus de compte vide dans « Comptes ouverts ». Catalogue lu dans la base locale, comme le détail d'un compte — marche hors ligne.
 */
export function EcranVenteRapide({ onRetour, onCompteCree }: EcranVenteRapideProps) {
  const { client } = useSession();
  const [produits, setProduits] = useState<Produit[]>([]);
  const [populaires, setPopulaires] = useState<Map<string, number>>(new Map());
  const [menuDuJour, setMenuDuJour] = useState<MenuDuJour | null>(null);
  const cree = useRef<string | null>(null);
  // Nom fixé à l'ouverture de l'écran (heure de Lubumbashi), affiché en sous-titre puis donné au compte.
  const [nom] = useState(() => `Comptoir ${heureCourte(new Date())}`);

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
  const personneProvisoire = { id: "", compteId: "", nom: "Client", payeLe: null, lignes: [] } as unknown as SousCompte;

  return (
    <EcranAjoutConsommation
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
