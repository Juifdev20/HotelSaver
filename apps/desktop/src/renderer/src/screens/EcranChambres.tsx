import * as React from "react";
import { useEffect, useState } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import { Chambre, StatutChambre, UtilisateurAuthentifie } from "@hotel-chicago/types";
import { Button, RoomCard, StatusTone } from "@hotel-chicago/ui";

/** Mapping statut → présentation : reste ici, pas dans packages/ui (voir
 * DECISIONS.md — le design system reste agnostique du domaine métier). */
const TONE_PAR_STATUT: Record<StatutChambre, StatusTone> = {
  [StatutChambre.LIBRE]: "success",
  [StatutChambre.RESERVEE]: "warning",
  [StatutChambre.OCCUPEE]: "danger",
  [StatutChambre.NETTOYAGE]: "neutral",
};

const LABEL_PAR_STATUT: Record<StatutChambre, string> = {
  [StatutChambre.LIBRE]: "Libre",
  [StatutChambre.RESERVEE]: "Réservée",
  [StatutChambre.OCCUPEE]: "Occupée",
  [StatutChambre.NETTOYAGE]: "Nettoyage",
};

export interface EcranChambresProps {
  client: ClientApi;
  utilisateur: UtilisateurAuthentifie;
  themeSombre: boolean;
  onBasculerTheme: () => void;
  onOuvrirParametres: () => void;
  onDeconnexion: () => void;
}

export function EcranChambres({
  client,
  utilisateur,
  themeSombre,
  onBasculerTheme,
  onOuvrirParametres,
  onDeconnexion,
}: EcranChambresProps) {
  const [chambres, setChambres] = useState<Chambre[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    client
      .listerChambres()
      .then((donnees) => {
        if (!annule) setChambres(donnees);
      })
      .catch((erreurRecue: Error) => {
        if (!annule) setErreur(erreurRecue.message);
      });
    return () => {
      annule = true;
    };
  }, [client]);

  return (
    <div className="hc-ecran-chambres">
      <header>
        <div>
          <h1 className="hc-text-display-md">Chambres</h1>
          <p className="hc-text-body">
            Connecté en tant que {utilisateur.nom} ({utilisateur.role})
          </p>
        </div>
        <div style={{ display: "flex", gap: "var(--hc-space-2)" }}>
          <Button variant="secondary" size="sm" onClick={onBasculerTheme}>
            {themeSombre ? "Mode clair" : "Mode sombre"}
          </Button>
          <Button variant="secondary" size="sm" onClick={onOuvrirParametres}>
            Paramètres
          </Button>
          <Button variant="secondary" size="sm" onClick={onDeconnexion}>
            Déconnexion
          </Button>
        </div>
      </header>

      {erreur && (
        <p role="alert" className="hc-text-body" style={{ color: "var(--hc-danger)" }}>
          {erreur}
        </p>
      )}
      {chambres === null && !erreur && <p className="hc-text-body">Chargement des chambres…</p>}
      {chambres?.length === 0 && <p className="hc-text-body">Aucune chambre enregistrée.</p>}

      <div className="hc-grille-chambres" data-testid="grille-chambres">
        {chambres?.map((chambre) => (
          <RoomCard
            key={chambre.id}
            numero={chambre.numero}
            type={chambre.type}
            prix={chambre.prixParNuit}
            devise={chambre.devise}
            statutTone={TONE_PAR_STATUT[chambre.statut]}
            statutLabel={LABEL_PAR_STATUT[chambre.statut]}
          />
        ))}
      </div>
    </div>
  );
}
