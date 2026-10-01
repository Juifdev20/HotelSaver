import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { MAX_PHOTOS_CHAMBRE } from "@hotel-chicago/types";
import { SelecteurPhotos, nettoyerImages } from "../components/SelecteurPhotos";
import type { ClientApi } from "@hotel-chicago/api-client";
import { Chambre, Devise, Reservation, Role, StatutChambre, UtilisateurAuthentifie, peutOperer } from "@hotel-chicago/types";
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
  /** Rôle courant — la gestion des chambres (créer/modifier/supprimer) est PATRON. */
  utilisateur: UtilisateurAuthentifie;
  /** Terme tapé dans la recherche globale de la barre du haut. */
  rechercheInitiale?: string;
  onNaviguer: (page: IdPage) => void;
}

function MenuActionsChambre({
  chambre,
  estPatron,
  peutChangerStatut,
  onChangerStatut,
  onModifier,
  onSupprimer,
}: {
  chambre: Chambre;
  estPatron: boolean;
  /** Changer le statut est un geste de réception : retiré au patron dont l'hôtel n'a pas activé « le patron peut aussi opérer ». */
  peutChangerStatut: boolean;
  onChangerStatut: (statut: StatutChambre) => void;
  onModifier: () => void;
  onSupprimer: () => void;
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
          {peutChangerStatut && (
            <>
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
            </>
          )}
          {estPatron && (
            <>
              <button
                type="button"
                role="menuitem"
                className="coquille__item-menu"
                onClick={() => {
                  setOuvert(false);
                  onModifier();
                }}
              >
                Modifier la chambre
              </button>
              <button
                type="button"
                role="menuitem"
                className="coquille__item-menu coquille__item-menu--danger"
                onClick={() => {
                  setOuvert(false);
                  onSupprimer();
                }}
              >
                Supprimer
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function EcranChambres({ client, utilisateur, rechercheInitiale, onNaviguer }: EcranChambresProps) {
  const [chambres, setChambres] = useState<Chambre[] | null>(null);
  const [reservationsEnCours, setReservationsEnCours] = useState<Reservation[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [filtreStatut, setFiltreStatut] = useState<StatutChambre | null>(null);
  const [recherche, setRecherche] = useState(rechercheInitiale ?? "");
  const etroit = useEtroit(860);

  const estPatron = utilisateur.role === Role.PATRON;
  const operer = peutOperer(utilisateur);
  // Formulaire de gestion PATRON : null = fermé, "creation" ou la chambre éditée.
  const [chambreEdit, setChambreEdit] = useState<Chambre | "creation" | null>(null);
  const [numero, setNumero] = useState("");
  const [type, setType] = useState("");
  const [prix, setPrix] = useState("");
  const [devise, setDevise] = useState<Devise>(Devise.USD);
  const [photos, setPhotos] = useState<string[]>([]);
  const [photosAvant, setPhotosAvant] = useState<string[]>([]);
  const [photosEnvoyees, setPhotosEnvoyees] = useState<string[]>([]);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    if (rechercheInitiale) setRecherche(rechercheInitiale);
  }, [rechercheInitiale]);

  useEffect(() => {
    let annule = false;
    Promise.all([client.listerChambres(), client.listerReservations({ statut: "EN_COURS" })])
      .then(([donnees, enCoursListe]) => {
        if (annule) return;
        setChambres(donnees);
        setReservationsEnCours(enCoursListe);
      })
      .catch((erreurRecue: Error) => {
        if (!annule) setErreur(erreurRecue.message);
      });
    return () => {
      annule = true;
    };
  }, [client]);

  const clientParChambre = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of reservationsEnCours) m.set(r.chambreId, r.client.nom);
    return m;
  }, [reservationsEnCours]);

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

  function recharger() {
    Promise.all([client.listerChambres(), client.listerReservations({ statut: "EN_COURS" })])
      .then(([donnees, enCoursListe]) => {
        setChambres(donnees);
        setReservationsEnCours(enCoursListe);
      })
      .catch((e: Error) => setErreur(e.message));
  }

  function ouvrirCreation() {
    setChambreEdit("creation");
    setNumero("");
    setType("");
    setPrix("");
    setDevise(Devise.USD);
    setPhotos([]);
    setPhotosAvant([]);
    setPhotosEnvoyees([]);
    setErreur(null);
  }

  /** Fermer sans enregistrer : les images envoyées pendant l'édition n'auront
   * servi à rien, on les retire du stockage. */
  function fermerFormulaire() {
    void nettoyerImages(client, [], photosEnvoyees, photosAvant);
    setChambreEdit(null);
  }

  function ouvrirEdition(chambre: Chambre) {
    setChambreEdit(chambre);
    setNumero(chambre.numero);
    setType(chambre.type);
    setPrix(chambre.prixParNuit);
    setDevise(chambre.devise);
    setPhotos(chambre.photos ?? []);
    setPhotosAvant(chambre.photos ?? []);
    setPhotosEnvoyees([]);
    setErreur(null);
  }

  async function enregistrerChambre() {
    const prixNombre = Number(prix.replace(/\s/g, "").replace(",", "."));
    if (!numero.trim() || !type.trim()) {
      setErreur("Le numéro et le type sont obligatoires.");
      return;
    }
    if (Number.isNaN(prixNombre) || prixNombre <= 0) {
      setErreur("Le prix par nuit doit être un nombre positif.");
      return;
    }
    setEnCours(true);
    setErreur(null);
    try {
      const donnees = { numero: numero.trim(), type: type.trim(), prixParNuit: prixNombre, devise, photos };
      if (chambreEdit === "creation") await client.creerChambre(donnees);
      else if (chambreEdit) await client.modifierChambre(chambreEdit.id, donnees);
      // Enregistré : on ne garde dans le stockage que les photos conservées.
      void nettoyerImages(client, photosAvant, photosEnvoyees, photos);
      setChambreEdit(null);
      recharger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnCours(false);
    }
  }

  async function supprimerChambre(chambre: Chambre) {
    if (!window.confirm(`Supprimer la chambre ${chambre.numero} ?`)) return;
    setEnCours(true);
    setErreur(null);
    try {
      await client.supprimerChambre(chambre.id);
      recharger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnCours(false);
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
        <div style={{ display: "flex", gap: "var(--hc-space-2)" }}>
          {estPatron && (
            <Button type="button" variant="secondary" onClick={ouvrirCreation}>
              <Plus size={18} aria-hidden="true" />
              Nouvelle chambre
            </Button>
          )}
          {operer && (
            <Button type="button" onClick={() => onNaviguer("reservations")}>
              Nouvelle réservation
            </Button>
          )}
        </div>
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

      {chambreEdit && (
        <div className="carte-formulaire formulaire">
          <p className="hc-text-label texte-discret">
            {chambreEdit === "creation" ? "Nouvelle chambre" : `Chambre ${chambreEdit.numero}`}
          </p>
          <label className="hc-text-label" htmlFor="chambre-numero">
            Numéro
          </label>
          <input id="chambre-numero" type="text" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ex. 104" />
          <label className="hc-text-label" htmlFor="chambre-type">
            Type
          </label>
          <input id="chambre-type" type="text" value={type} onChange={(e) => setType(e.target.value)} placeholder="Ex. Standard, Suite…" />
          <label className="hc-text-label" htmlFor="chambre-prix">
            Prix par nuit
          </label>
          <input id="chambre-prix" type="text" inputMode="decimal" value={prix} onChange={(e) => setPrix(e.target.value)} placeholder="Ex. 45" />
          <SelecteurPhotos
            client={client}
            usage="chambre"
            photos={photos}
            max={MAX_PHOTOS_CHAMBRE}
            onChange={setPhotos}
            onEnvoyee={(url) => setPhotosEnvoyees((liste) => [...liste, url])}
            libelle="Photos de la chambre (visibles sur le site de l'hôtel)"
          />
          <p className="hc-text-label texte-discret">Devise</p>
          <div className="puces" role="group" aria-label="Devise">
            {[Devise.USD, Devise.CDF].map((d) => (
              <button key={d} type="button" className="puce" aria-pressed={devise === d} onClick={() => setDevise(d)}>
                {d}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: "var(--hc-space-2)", marginTop: "var(--hc-space-3)" }}>
            <Button type="button" onClick={enregistrerChambre} disabled={enCours}>
              {enCours ? "…" : "Enregistrer"}
            </Button>
            <Button type="button" variant="secondary" onClick={fermerFormulaire}>
              Annuler
            </Button>
          </div>
        </div>
      )}

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
                  <td className="texte-discret">{clientParChambre.get(chambre.id) ?? "—"}</td>
                  <td>
                    <MenuActionsChambre
                      chambre={chambre}
                      estPatron={estPatron}
                      peutChangerStatut={operer}
                      onChangerStatut={(statut) => changerStatut(chambre, statut)}
                      onModifier={() => ouvrirEdition(chambre)}
                      onSupprimer={() => void supprimerChambre(chambre)}
                    />
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
