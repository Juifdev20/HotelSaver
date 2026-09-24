import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import { Chambre, StatutChambre } from "@hotel-chicago/types";
import { DashboardStat, RoomCard, StatusTone } from "@hotel-chicago/ui";
import { BedDouble, Search } from "lucide-react";

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

const LIBELLE_COMPTEUR: Record<StatutChambre, string> = {
  [StatutChambre.LIBRE]: "Libres",
  [StatutChambre.OCCUPEE]: "Occupées",
  [StatutChambre.RESERVEE]: "Réservées",
  [StatutChambre.NETTOYAGE]: "Nettoyage",
};

const ORDRE_STATUTS = [StatutChambre.LIBRE, StatutChambre.OCCUPEE, StatutChambre.RESERVEE, StatutChambre.NETTOYAGE];

export interface EcranChambresProps {
  client: ClientApi;
}

export function EcranChambres({ client }: EcranChambresProps) {
  const [chambres, setChambres] = useState<Chambre[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [filtreStatut, setFiltreStatut] = useState<StatutChambre | null>(null);
  const [filtreType, setFiltreType] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");

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

  const types = useMemo(() => [...new Set((chambres ?? []).map((c) => c.type))].sort(), [chambres]);

  const compteParStatut = (statut: StatutChambre) => (chambres ?? []).filter((c) => c.statut === statut).length;

  const chambresAffichees = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    return (chambres ?? []).filter(
      (c) =>
        (!filtreStatut || c.statut === filtreStatut) &&
        (!filtreType || c.type === filtreType) &&
        (!terme || c.numero.toLowerCase().includes(terme) || c.type.toLowerCase().includes(terme))
    );
  }, [chambres, filtreStatut, filtreType, recherche]);

  const filtreActif = filtreStatut !== null || filtreType !== null || recherche.trim() !== "";

  return (
    <div className="page">
      <header className="page__entete">
        <div>
          <h1 className="hc-text-display-md page__titre">Chambres</h1>
          <p className="hc-text-body page__sous-titre">
            {chambres ? `${chambres.length} chambre${chambres.length > 1 ? "s" : ""} au total` : "Chargement…"}
          </p>
        </div>
      </header>

      {erreur && (
        <p role="alert" className="hc-text-body texte-erreur">
          {erreur}
        </p>
      )}

      <div className="grille-stats" aria-label="Filtrer par statut">
        {ORDRE_STATUTS.map((statut) => (
          <DashboardStat
            key={statut}
            libelle={LIBELLE_COMPTEUR[statut]}
            tone={TONE_PAR_STATUT[statut]}
            valeur={chambres ? compteParStatut(statut) : "…"}
            selectionne={filtreStatut === statut}
            onClick={() => setFiltreStatut((actuel) => (actuel === statut ? null : statut))}
          />
        ))}
      </div>

      <div className="barre-filtres">
        <label className="champ-recherche">
          <Search size={18} aria-hidden="true" />
          <span className="visuellement-cache">Rechercher une chambre</span>
          <input
            type="search"
            placeholder="Numéro ou type de chambre"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />
        </label>
        {types.length > 1 && (
          <div className="puces" role="group" aria-label="Filtrer par type">
            <button type="button" className="puce" aria-pressed={filtreType === null} onClick={() => setFiltreType(null)}>
              Tous les types
            </button>
            {types.map((type) => (
              <button
                key={type}
                type="button"
                className="puce"
                aria-pressed={filtreType === type}
                onClick={() => setFiltreType((actuel) => (actuel === type ? null : type))}
              >
                {type}
              </button>
            ))}
          </div>
        )}
      </div>

      {chambres?.length === 0 && (
        <div className="etat-vide">
          <BedDouble size={32} strokeWidth={1.5} aria-hidden="true" />
          <p className="hc-text-subheading">Aucune chambre enregistrée</p>
          <p className="hc-text-body texte-discret">Les chambres ajoutées par le patron apparaîtront ici.</p>
        </div>
      )}

      {chambres && chambres.length > 0 && chambresAffichees.length === 0 && (
        <div className="etat-vide">
          <p className="hc-text-subheading">Aucune chambre ne correspond</p>
          {filtreActif && (
            <button
              type="button"
              className="puce"
              onClick={() => {
                setFiltreStatut(null);
                setFiltreType(null);
                setRecherche("");
              }}
            >
              Effacer les filtres
            </button>
          )}
        </div>
      )}

      <div className="hc-grille-chambres" data-testid="grille-chambres">
        {chambresAffichees.map((chambre) => (
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
