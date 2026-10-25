import * as React from "react";
import { useState } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import { Button } from "@hotel-chicago/ui";
import { ScanBarcode } from "lucide-react";
import { EcranVenteRapide } from "./EcranVenteRapide";

export interface EcranCaisseProps {
  client: ClientApi;
  /** `venteRapide` : ouvrir directement l'ajout de consommations, scanner prêt. */
  onCompteOuvert: (compteId: string, options?: { venteRapide: boolean }) => void;
}

/**
 * Point d'entrée d'une nouvelle vente (Phase 15 — équivalent desktop de
 * apps/mobile/src/ecrans/EcranCaisse.tsx). Contrairement au mobile, aucun
 * miroir hors ligne ici : desktop appelle l'API directement, comme tous ses
 * autres écrans (EcranChambres, EcranFacturation) — poste fixe, réseau
 * supposé disponible.
 */
export function EcranCaisse({ client, onCompteOuvert }: EcranCaisseProps) {
  const [tableOuNom, setTableOuNom] = useState("");
  const [nomPremierSousCompte, setNomPremierSousCompte] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [venteRapide, setVenteRapide] = useState(false);

  async function ouvrir() {
    const nom = tableOuNom.trim();
    if (!nom) {
      setErreur("Le nom de la table ou du client est obligatoire.");
      return;
    }
    setEnCours(true);
    setErreur(null);
    try {
      const compte = await client.ouvrirCompteCafeteria({
        tableOuNom: nom,
        nomPremierSousCompte: nomPremierSousCompte.trim() || undefined,
      });
      setTableOuNom("");
      setNomPremierSousCompte("");
      onCompteOuvert(compte.id);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnCours(false);
    }
  }

  // Vente au comptoir (19/10/2026) : scanner tout de suite, compte « Comptoir » créé seulement au panier validé.
  if (venteRapide) {
    return (
      <EcranVenteRapide
        client={client}
        onRetour={() => setVenteRapide(false)}
        onCompteCree={(id) => {
          setVenteRapide(false);
          onCompteOuvert(id);
        }}
      />
    );
  }

  return (
    <div className="page">
      <header className="page__entete">
        <div>
          <h1 className="hc-text-display-md page__titre">Caisse</h1>
          <p className="hc-text-body page__sous-titre">Ouvrir un nouveau compte cafétaria.</p>
        </div>
      </header>

      <div className="page__colonnes">
      <div className="carte-formulaire formulaire">
        <p className="hc-text-body-strong">Compte à la table</p>
        <p className="hc-text-body texte-discret">Un compte par table ou par client : on y ajoute les consommations, puis on encaisse chacun.</p>
        <label className="hc-text-label" htmlFor="champ-table">
          Table ou nom du client
        </label>
        <input
          id="champ-table"
          value={tableOuNom}
          onChange={(e) => setTableOuNom(e.target.value)}
          placeholder="Ex. Table 4"
        />

        <label className="hc-text-label" htmlFor="champ-premiere-personne">
          Nom de la première personne (optionnel)
        </label>
        <input
          id="champ-premiere-personne"
          value={nomPremierSousCompte}
          onChange={(e) => setNomPremierSousCompte(e.target.value)}
          placeholder="Personne 1"
        />

        {erreur && (
          <p role="alert" className="hc-text-body texte-erreur">
            {erreur}
          </p>
        )}

        <Button type="button" onClick={() => ouvrir()} disabled={enCours} style={{ marginTop: "var(--hc-space-3)" }}>
          {enCours ? "…" : "Ouvrir le compte"}
        </Button>
      </div>

      <div className="carte-formulaire formulaire">
        <p className="hc-text-body-strong">Vente au comptoir</p>
        <p className="hc-text-body texte-discret">
          Scannez directement les articles (douchette ou webcam). Le compte « Comptoir » n'est créé qu'à la validation du panier.
        </p>
        <Button type="button" onClick={() => setVenteRapide(true)} disabled={enCours}>
          <ScanBarcode size={16} aria-hidden="true" /> Vente rapide (scanner)
        </Button>
      </div>
      </div>
    </div>
  );
}
