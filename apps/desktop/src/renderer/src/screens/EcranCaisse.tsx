import * as React from "react";
import { useState } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import { Button } from "@hotel-chicago/ui";
import { ScanBarcode } from "lucide-react";

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

  /** `venteRapide` (scan au comptoir, 08/10/2026) : compte « Comptoir HH:MM »
   * ouvert sans rien saisir, puis ajout direct par douchette ou webcam. */
  async function ouvrir(venteRapide = false) {
    const heure = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    const nom = venteRapide ? `Comptoir ${heure}` : tableOuNom.trim();
    if (!nom) {
      setErreur("Le nom de la table ou du client est obligatoire.");
      return;
    }
    setEnCours(true);
    setErreur(null);
    try {
      const compte = await client.ouvrirCompteCafeteria({
        tableOuNom: nom,
        nomPremierSousCompte: venteRapide ? "Client" : nomPremierSousCompte.trim() || undefined,
      });
      setTableOuNom("");
      setNomPremierSousCompte("");
      onCompteOuvert(compte.id, { venteRapide });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="page">
      <header className="page__entete">
        <div>
          <h1 className="hc-text-display-md page__titre">Caisse</h1>
          <p className="hc-text-body page__sous-titre">Ouvrir un nouveau compte cafétaria.</p>
        </div>
      </header>

      <div className="carte-formulaire formulaire">
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

        <Button type="button" onClick={() => ouvrir(false)} disabled={enCours} style={{ marginTop: "var(--hc-space-3)" }}>
          {enCours ? "…" : "Ouvrir le compte"}
        </Button>
      </div>

      <div className="carte-formulaire formulaire">
        <p className="hc-text-body-strong">Vente au comptoir</p>
        <p className="hc-text-body texte-discret">
          Scannez directement les articles (douchette ou webcam) : un compte « Comptoir » est ouvert pour vous.
        </p>
        <Button type="button" onClick={() => ouvrir(true)} disabled={enCours}>
          <ScanBarcode size={16} aria-hidden="true" /> Vente rapide (scanner)
        </Button>
      </div>
    </div>
  );
}
