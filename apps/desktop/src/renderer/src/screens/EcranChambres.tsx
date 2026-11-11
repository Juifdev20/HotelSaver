import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { MAX_PHOTOS_CHAMBRE } from "@hotel-chicago/types";
import { SelecteurPhotos, nettoyerImages } from "../components/SelecteurPhotos";
import { PanneauFormulaire } from "../components/PanneauFormulaire";
import type { ClientApi } from "@hotel-chicago/api-client";
import { Chambre, Devise, Reservation, Role, StatutChambre, UtilisateurAuthentifie, peutOperer } from "@hotel-chicago/types";
import { Button, StatusBadge, StatusTone, formatMontant } from "@hotel-chicago/ui";
import { actionPourChambre, comparerNumeros, compterParStatut, sejoursParChambre, typesDeChambres, type ProposeAction } from "@hotel-chicago/regles";
import { BedDouble, LayoutGrid, List, LogIn, MoreVertical, Plus, Search } from "lucide-react";
import { CarteChambre } from "../chambres/CarteChambre";
import "../chambres/chambres.css";
import type { IdPage } from "../navigation";
import { useFermetureExterne } from "../layout/Coquille";
import { useConfirmation } from "../components/DialogueConfirmation";
import { lireMontant, lireQuantite } from "@hotel-chicago/miroir-local";

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

const POINT_PAR_STATUT: Record<StatutChambre, string> = {
  [StatutChambre.LIBRE]: "var(--hc-success)",
  [StatutChambre.RESERVEE]: "var(--hc-warning)",
  [StatutChambre.OCCUPEE]: "var(--hc-danger)",
  [StatutChambre.NETTOYAGE]: "var(--hc-purple)",
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
  /** « Enregistrer une arrivée » : ouvre l'enregistrement, avec cette chambre déjà choisie (vide = aucune). */
  onArrivee?: (chambreId: string) => void;
  /** « Facturer et départ » du séjour en cours. */
  onFacturer?: (reservationId: string, options?: { checkOut: boolean }) => void;
  /** « Voir le séjour » : la fiche du séjour. */
  onVoirSejour?: (reservationId: string) => void;
}

const CLE_VUE = "hotelsaver:chambres:vue";
type VueChambres = "cartes" | "liste";
function vueMemorisee(): VueChambres {
  try {
    return localStorage.getItem(CLE_VUE) === "liste" ? "liste" : "cartes";
  } catch {
    return "cartes";
  }
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
  const refDeclencheur = useRef<HTMLButtonElement>(null);
  const refPanneau = useRef<HTMLDivElement>(null);

  // Focus sur le premier choix à l'ouverture (clavier et lecteur d'écran).
  useEffect(() => {
    if (ouvert) refPanneau.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [ouvert]);

  const surToucheMenu = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape" || e.key === "Tab") {
      // Échap et Tab referment le menu ; le focus revient au bouton qui l'a ouvert.
      if (e.key === "Escape") e.stopPropagation();
      setOuvert(false);
      refDeclencheur.current?.focus();
      if (e.key === "Escape") return;
      e.preventDefault();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    const items = Array.from(refPanneau.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (items.length === 0) return;
    e.preventDefault();
    const index = items.indexOf(document.activeElement as HTMLElement);
    const suivant =
      e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : e.key === "ArrowDown" ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
    items[suivant]!.focus();
  };

  return (
    <div className="menu-actions" ref={ref}>
      <button
        type="button"
        className="menu-actions__declencheur"
        ref={refDeclencheur}
        onClick={() => setOuvert((v) => !v)}
        aria-label={`Plus d'actions pour la chambre ${chambre.numero}`}
        title="Plus d'actions"
        aria-haspopup="menu"
        aria-expanded={ouvert}
      >
        <MoreVertical size={18} aria-hidden="true" />
      </button>
      {ouvert && (
        <div
          className="menu-actions__panneau"
          role="menu"
          aria-label={`Actions pour la chambre ${chambre.numero}`}
          ref={refPanneau}
          onKeyDown={surToucheMenu}
        >
          {peutChangerStatut && (
            <>
              <p className="hc-text-label menu-actions__titre" role="presentation">Changer le statut</p>
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

export function EcranChambres({ client, utilisateur, rechercheInitiale, onNaviguer, onArrivee, onFacturer, onVoirSejour }: EcranChambresProps) {
  const [chambres, setChambres] = useState<Chambre[] | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [vue, setVue] = useState<VueChambres>(vueMemorisee);
  const [filtreType, setFiltreType] = useState<string | null>(null);
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
  const { demander, dialogue } = useConfirmation();

  useEffect(() => {
    if (rechercheInitiale) setRecherche(rechercheInitiale);
  }, [rechercheInitiale]);

  useEffect(() => {
    let annule = false;
    Promise.all([client.listerChambres(), client.listerReservations()])
      .then(([donnees, sejours]) => {
        if (annule) return;
        setChambres(donnees);
        setReservations(sejours);
      })
      .catch((erreurRecue: Error) => {
        if (!annule) setErreur(erreurRecue.message);
      });
    return () => {
      annule = true;
    };
  }, [client]);

  // Qui occupe chaque chambre, qui va l'occuper : lu dans la base locale (marche sans Internet).
  const sejours = useMemo(() => sejoursParChambre(reservations), [reservations]);
  const clientParChambre = useMemo(() => {
    const m = new Map<string, string>();
    for (const [chambreId, s] of sejours) if (s.enCours) m.set(chambreId, s.enCours.client.nom);
    return m;
  }, [sejours]);
  const comptes = useMemo(() => compterParStatut(chambres ?? []), [chambres]);
  const types = useMemo(() => typesDeChambres(chambres ?? []), [chambres]);

  function changerVue(v: VueChambres) {
    setVue(v);
    try {
      localStorage.setItem(CLE_VUE, v);
    } catch {
      // Préférence non mémorisée : sans conséquence.
    }
  }

  /** L'action proposée sur une carte : chaque état a la sienne (voir actionPourChambre). */
  function agir(chambre: Chambre, action: ProposeAction) {
    const s = sejours.get(chambre.id);
    if (action.id === "arrivee") onArrivee?.(chambre.id);
    else if (action.id === "depart" && s?.enCours) onFacturer?.(s.enCours.id, { checkOut: true });
    else if (action.id === "voir" && s?.prochaine) onVoirSejour?.(s.prochaine.id);
    else if (action.id === "propre") void changerStatut(chambre, StatutChambre.LIBRE);
  }

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
    Promise.all([client.listerChambres(), client.listerReservations()])
      .then(([donnees, sejoursLus]) => {
        setChambres(donnees);
        setReservations(sejoursLus);
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
    if (!numero.trim() || !type.trim()) {
      setErreur("Le numéro et le type sont obligatoires.");
      return;
    }
    const prixLu = lireMontant(prix, devise, { max: 100_000_000 });
    if (!prixLu.ok) {
      setErreur(`Prix par nuit : ${prixLu.message}`);
      return;
    }
    const prixNombre = prixLu.valeur;
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
    const confirme = await demander({
      titre: `Supprimer la chambre ${chambre.numero} (${chambre.type}) ?`,
      message: "La chambre disparaît de la liste et ne pourra plus être réservée. Les séjours et factures déjà enregistrés ne changent pas.",
      libelleConfirmer: `Supprimer la chambre ${chambre.numero}`,
      destructif: true,
    });
    if (!confirme) return;
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
    return (chambres ?? [])
      .filter(
        (c) =>
          (!filtreStatut || c.statut === filtreStatut) &&
          (!filtreType || c.type.trim() === filtreType) &&
          (!terme || c.numero.toLowerCase().includes(terme) || c.type.toLowerCase().includes(terme) || (clientParChambre.get(c.id) ?? "").toLowerCase().includes(terme))
      )
      .sort((a, b) => comparerNumeros(a.numero, b.numero));
  }, [chambres, filtreStatut, filtreType, recherche, clientParChambre]);

  return (
    <div className="page">
      <header className="page__entete">
        <div>
          <h1 className="hc-text-display-md page__titre">Chambres</h1>
          <p className="hc-text-body page__sous-titre">
            {chambres ? `${chambres.length} chambre${chambres.length > 1 ? "s" : ""} · ${comptes.LIBRE} libre${comptes.LIBRE > 1 ? "s" : ""}` : "Gérez vos chambres et leurs disponibilités."}
          </p>
        </div>
        <div style={{ display: "flex", gap: "var(--hc-space-2)" }}>
          {estPatron && (
            <Button type="button" variant="secondary" onClick={ouvrirCreation}>
              <Plus size={18} aria-hidden="true" />
              Ajouter une chambre
            </Button>
          )}
          {operer && (
            <Button type="button" onClick={() => (onArrivee ? onArrivee("") : onNaviguer("reservations"))}>
              <LogIn size={18} aria-hidden="true" />
              Enregistrer une arrivée
            </Button>
          )}
        </div>
      </header>

      {erreur && !chambreEdit && (
        <p role="alert" className="hc-text-body texte-erreur">
          {erreur}
        </p>
      )}

      {estPatron && !operer && (
        <p className="chambres-bandeau hc-text-body" role="note">
          Vous consultez la réception. Pour enregistrer des arrivées et des départs, activez « le patron peut aussi opérer » dans les Paramètres.
        </p>
      )}

      <div className="chambres-barre" role="group" aria-label="Filtrer par statut">
        {FILTRES.map((filtre) => {
          const nombre = filtre.id === null ? comptes.TOUTES : (comptes[filtre.id] ?? 0);
          return (
            <button key={filtre.libelle} type="button" className="chambre-filtre" aria-pressed={filtreStatut === filtre.id} onClick={() => setFiltreStatut(filtre.id)}>
              {filtre.id !== null && <span className="chambre-filtre__point" style={{ background: POINT_PAR_STATUT[filtre.id] }} aria-hidden="true" />}
              {filtre.libelle}
              <span className="chambre-filtre__nombre">{nombre}</span>
            </button>
          );
        })}
        <span className="chambres-barre__espace" />
        <label className="champ-recherche">
          <Search size={18} aria-hidden="true" />
          <span className="visuellement-cache">Rechercher une chambre</span>
          <input type="search" placeholder="Numéro, type, client…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        </label>
        {!etroit && (
          <div className="chambres-vue" role="group" aria-label="Affichage">
            <button type="button" aria-pressed={vue === "cartes"} onClick={() => changerVue("cartes")}>
              <LayoutGrid size={16} aria-hidden="true" /> Cartes
            </button>
            <button type="button" aria-pressed={vue === "liste"} onClick={() => changerVue("liste")}>
              <List size={16} aria-hidden="true" /> Liste
            </button>
          </div>
        )}
      </div>
      {types.length > 1 && (
        <div className="chambres-barre" role="group" aria-label="Filtrer par type">
          <button type="button" className="chambre-type" aria-pressed={filtreType === null} onClick={() => setFiltreType(null)}>
            Tous les types
          </button>
          {types.map((t) => (
            <button key={t.type} type="button" className="chambre-type" aria-pressed={filtreType === t.type} onClick={() => setFiltreType(t.type)}>
              {t.type} · {t.nombre}
            </button>
          ))}
        </div>
      )}

      {chambreEdit && (
        <PanneauFormulaire
          titre={chambreEdit === "creation" ? "Nouvelle chambre" : `Chambre ${chambreEdit.numero}`}
          sousTitre={chambreEdit === "creation" ? "Elle apparaîtra aussitôt dans la liste et sur le site de l'hôtel." : undefined}
          onFermer={fermerFormulaire}
          erreur={erreur}
          actions={
            <>
              <Button type="button" variant="secondary" onClick={fermerFormulaire}>
                Annuler
              </Button>
              <Button type="button" onClick={enregistrerChambre} disabled={enCours}>
                {enCours ? "…" : "Enregistrer"}
              </Button>
            </>
          }
        >
          <div className="champs-grille">
            <div className="champ">
              <label className="hc-text-label" htmlFor="chambre-numero">
                Numéro
              </label>
              <input id="chambre-numero" type="text" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ex. 104" />
            </div>
            <div className="champ">
              <label className="hc-text-label" htmlFor="chambre-type">
                Type
              </label>
              <input id="chambre-type" type="text" value={type} onChange={(e) => setType(e.target.value)} placeholder="Ex. Standard, Suite…" />
              {types.length > 0 && (
                <div className="puces" role="group" aria-label="Types déjà utilisés">
                  {types.map((t) => (
                    <button key={t.type} type="button" className="puce" aria-pressed={type.trim() === t.type} onClick={() => setType(t.type)}>
                      {t.type}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="champ">
              <label className="hc-text-label" htmlFor="chambre-prix">
                Prix par nuit
              </label>
              <input id="chambre-prix" type="text" inputMode="decimal" value={prix} onChange={(e) => setPrix(e.target.value)} placeholder="Ex. 45" />
            </div>
            <div className="champ">
              <p className="hc-text-label">Devise</p>
              <div className="puces" role="group" aria-label="Devise">
                {[Devise.USD, Devise.CDF].map((d) => (
                  <button key={d} type="button" className="puce" aria-pressed={devise === d} onClick={() => setDevise(d)}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <SelecteurPhotos
            client={client}
            usage="chambre"
            photos={photos}
            max={MAX_PHOTOS_CHAMBRE}
            onChange={setPhotos}
            onEnvoyee={(url) => setPhotosEnvoyees((liste) => [...liste, url])}
            libelle="Photos de la chambre (visibles sur le site de l'hôtel)"
          />
        </PanneauFormulaire>
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

      {chambresAffichees.length > 0 && !etroit && vue === "liste" && (
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

      {chambresAffichees.length > 0 && (etroit || vue === "cartes") && (
        <div className="chambres-grille" data-testid="grille-chambres">
          {chambresAffichees.map((chambre) => (
            <CarteChambre
              key={chambre.id}
              chambre={chambre}
              tone={TONE_PAR_STATUT[chambre.statut]}
              libelleStatut={LABEL_PAR_STATUT[chambre.statut]}
              sejours={sejours.get(chambre.id)}
              action={actionPourChambre(chambre, sejours.get(chambre.id), operer)}
              onAction={(action) => agir(chambre, action)}
              menu={
                (operer || estPatron) && (
                  <MenuActionsChambre
                    chambre={chambre}
                    estPatron={estPatron}
                    peutChangerStatut={operer}
                    onChangerStatut={(statut) => changerStatut(chambre, statut)}
                    onModifier={() => ouvrirEdition(chambre)}
                    onSupprimer={() => void supprimerChambre(chambre)}
                  />
                )
              }
            />
          ))}
        </div>
      )}
      {dialogue}
    </div>
  );
}
