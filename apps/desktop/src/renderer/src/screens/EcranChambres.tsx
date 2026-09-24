import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import { Chambre, StatutChambre } from "@hotel-chicago/types";
import { Button, RoomCard, StatusBadge, StatusTone, formatMontant } from "@hotel-chicago/ui";
import { BedDouble, MoreVertical, Plus, Search } from "lucide-react";
import type { IdPage } from "../navigation";
import { useFermetureExterne } from "../layout/Coquille";

/** Mapping statut → présentation : reste ici, pas dans packages/ui (voir
 * DECISIONS.md — le design system reste agnostique du domaine métier). */
const TONE_PAR_STATUT: Record<StatutChambre, StatusTone> = {
  [StatutChambre.LIBRE]: "success",
  [StatutChambre.RESERVEE]: "warning",
  [StatutChambre.OCCUPEE]: "danger",
  [StatutChambre.NETTOYAGE]: "purple",
};

const LABEL_PAR_STATUT: Record<StatutChambre, string> = {
  [StatutChambre.LIBRE]: "Libre",
  [StatutChambre.RESERVEE]: "Réservée",
  [StatutChambre.OCCUPEE]: "Occupée",
  [StatutChambre.NETTOYAGE]: "Nettoyage",
};

const FILTRES: { id: StatutChambre | null; libelle: string }[] = [
  { id: null, libelle: "Toutes" },
  { id: StatutChambre.LIBRE, libelle: "Libres" },
  { id: StatutChambre.OCCUPEE, libelle: "Occupées" },
  { id: StatutChambre.RESERVEE, libelle: "Réservées" },
  { id: StatutChambre.NETTOYAGE, libelle: "Nettoyage" },
];

/** Rendu tableau (desktop) vs cartes (mobile) — jamais les deux en même temps
 * dans le DOM (section 37 : transformer, pas réduire un tableau). */
function useEtroit(seuil: number): boolean {
  const [etroit, setEtroit] = useState(() => window.innerWidth < seuil);
  useEffect(() => {
    const surRedimensionnement = () => setEtroit(window.innerWidth < seuil);
    window.addEventListener("resize", surRedimensionnement);
    return () => window.removeEventListener("resize", surRedimensionnement);
  }, [seuil]);
  return etroit;
}

export interface EcranChambresProps {
  client: ClientApi;
  /** Terme tapé dans la recherche globale de la barre du haut. */
  rechercheInitiale?: string;
  onNaviguer: (page: IdPage) => void;
}

function MenuActionsChambre({
  chambre,
  onChangerStatut,
}: {
  chambre: Chambre;
  onChangerStatut: (statut: StatutChambre) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const ref = useFermetureExterne(ouvert, () => setOuvert(false));

  return (
    <div className="menu-actions" ref={ref}>
      <button
        type="button"
        className="menu-actions__declencheur"
        onClick={() => setOuvert((v) => !v)}
        aria-label={`Actions pour la chambre ${chambre.numero}`}
        aria-expanded={ouvert}
      >
        <MoreVertical size={18} aria-hidden="true" />
      </button>
      {ouvert && (
        <div className="menu-actions__panneau" role="menu">
          <p className="hc-text-label menu-actions__titre">Changer le statut</p>
          {Object.values(StatutChambre)
            .filter((statut) => statut !== chambre.statut)
            .map((statut) => (
              <button
                key={statut}
                type="button"
                role="menuitem"
                className="coquille__item-menu"
                onClick={() => {
                  setOuvert(false);
                  onChangerStatut(statut);
                }}
              >
                {LABEL_PAR_STATUT[statut]}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

export function EcranChambres({ client, rechercheInitiale, onNaviguer }: EcranChambresProps) {
  const [chambres, setChambres] = useState<Chambre[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [filtreStatut, setFiltreStatut] = useState<StatutChambre | null>(null);
  const [recherche, setRecherche] = useState(rechercheInitiale ?? "");
  const etroit = useEtroit(860);

  useEffect(() => {
    if (rechercheInitiale) setRecherche(rechercheInitiale);
  }, [rechercheInitiale]);

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

  async function changerStatut(chambre: Chambre, statut: StatutChambre) {
    const precedent = chambres;
    setChambres((liste) => liste?.map((c) => (c.id === chambre.id ? { ...c, statut } : c)) ?? liste);
    try {
      await client.modifierStatutChambre(chambre.id, statut);
    } catch (erreurRecue) {
      setChambres(precedent);
      setErreur(erreurRecue instanceof Error ? erreurRecue.message : "Impossible de modifier le statut.");
    }
  }

  const chambresAffichees = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    return (chambres ?? []).filter(
      (c) =>
        (!filtreStatut || c.statut === filtreStatut) &&
        (!terme || c.numero.toLowerCase().includes(terme) || c.type.toLowerCase().includes(terme))
    );
  }, [chambres, filtreStatut, recherche]);

  return (
    <div className="page">
      <header className="page__entete">
        <div>
          <h1 className="hc-text-display-md page__titre">Chambres</h1>
          <p className="hc-text-body page__sous-titre">Gérez vos chambres et leurs disponibilités.</p>
        </div>
        <Button type="button" onClick={() => onNaviguer("reservations")}>
          <Plus size={18} aria-hidden="true" />
          Nouvelle réservation
        </Button>
      </header>

      {erreur && (
        <p role="alert" className="hc-text-body texte-erreur">
          {erreur}
        </p>
      )}

      <div className="barre-filtres">
        <label className="champ-recherche">
          <Search size={18} aria-hidden="true" />
          <span className="visuellement-cache">Rechercher une chambre</span>
          <input
            type="search"
            placeholder="Rechercher une chambre…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />
        </label>
        <div className="puces" role="group" aria-label="Filtrer par statut">
          {FILTRES.map((filtre) => (
            <button
              key={filtre.libelle}
              type="button"
              className="puce"
              aria-pressed={filtreStatut === filtre.id}
              onClick={() => setFiltreStatut(filtre.id)}
            >
              {filtre.libelle}
            </button>
          ))}
        </div>
      </div>

      {chambres === null && !erreur && <p className="hc-text-body texte-discret">Chargement des chambres…</p>}

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
          <button
            type="button"
            className="puce"
            onClick={() => {
              setFiltreStatut(null);
              setRecherche("");
            }}
          >
            Effacer les filtres
          </button>
        </div>
      )}

      {chambresAffichees.length > 0 && !etroit && (
        <div className="carte-tableau" data-testid="grille-chambres">
          <table className="tableau">
            <thead>
              <tr>
                <th>N°</th>
                <th>Type</th>
                <th>Statut</th>
                <th>Prix / nuit</th>
                <th>Client</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {chambresAffichees.map((chambre) => (
                <tr key={chambre.id}>
                  <td className="hc-text-body-strong">{chambre.numero}</td>
                  <td className="texte-discret">{chambre.type}</td>
                  <td>
                    <StatusBadge tone={TONE_PAR_STATUT[chambre.statut]} label={LABEL_PAR_STATUT[chambre.statut]} />
                  </td>
                  <td className="hc-text-price">{formatMontant(chambre.prixParNuit, chambre.devise)}</td>
                  {/* La réception n'existe pas encore (écran « Bientôt ») : impossible de
                      savoir quel client occupe la chambre sans inventer une donnée. */}
                  <td className="texte-discret">—</td>
                  <td>
                    <MenuActionsChambre chambre={chambre} onChangerStatut={(statut) => changerStatut(chambre, statut)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {chambresAffichees.length > 0 && etroit && (
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
      )}
    </div>
  );
}
