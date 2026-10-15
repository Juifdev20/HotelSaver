import * as React from "react";
import { useState } from "react";
import { Button, StatusBadge, useTitrePage } from "@hotel-chicago/ui";
import { montantAbonnement, prixAbonnement } from "@hotel-chicago/regles";
import type { DonneesFormule, FormuleAdminVue, ParametresPlateformeVue } from "@hotel-chicago/types";
import { DialogueConfirmation } from "./DialogueConfirmation";
import { EnteteApp, type Onglet } from "./EnteteApp";
import { FormulaireFormule } from "./FormulaireFormule";
import { ReglagesPlateforme } from "./ReglagesPlateforme";
import { AIDE_FORMULES, LIBELLE_COURT_FONCTION, LIBELLE_FONCTION } from "./fonctions";

export interface EcranAbonnementsProps {
  formules: FormuleAdminVue[];
  parametres: ParametresPlateformeVue | null;
  chargement: boolean;
  erreur: string | null;
  onActualiser: () => void;
  /** Les actions rejettent avec le message du serveur (409, règles…), affiché tel quel. */
  onCreerFormule: (dto: DonneesFormule & { code: string }) => Promise<void>;
  onModifierFormule: (code: string, partiel: Partial<Omit<DonneesFormule, "code">>) => Promise<void>;
  onSupprimerFormule: (code: string) => Promise<void>;
  onEnregistrerParametres: (partiel: Partial<ParametresPlateformeVue>) => Promise<void>;
  onChangerOnglet: (onglet: Onglet) => void;
  onDeconnexion: () => void;
}

type ActionEnAttente = { type: "supprimer" | "desactiver"; formule: FormuleAdminVue };

export function EcranAbonnements({
  formules,
  parametres,
  chargement,
  erreur,
  onActualiser,
  onCreerFormule,
  onModifierFormule,
  onSupprimerFormule,
  onEnregistrerParametres,
  onChangerOnglet,
  onDeconnexion,
}: EcranAbonnementsProps) {
  // `false` = fenêtre fermée ; `null` = nouvelle formule ; sinon le code de la formule en cours de modification.
  const [edition, setEdition] = useState<false | null | string>(false);
  const [action, setAction] = useState<ActionEnAttente | null>(null);
  const [erreurAction, setErreurAction] = useState<string | null>(null);
  const [actionEnCours, setActionEnCours] = useState(false);
  const [retour, setRetour] = useState<{ type: "succes" | "erreur"; texte: string } | null>(null);

  useTitrePage("Abonnements", "HotelSaver Super-Admin");

  const triees = [...formules].sort((a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom, "fr"));
  const formuleEnEdition = typeof edition === "string" ? (formules.find((f) => f.code === edition) ?? null) : null;

  function cout(f: FormuleAdminVue, devise: "USD" | "CDF"): number {
    return prixAbonnement({ formule: f.code, mois: 1, devise, tauxCdf: parametres?.tauxCdf, formules: [f] });
  }

  async function reactiver(f: FormuleAdminVue) {
    setRetour(null);
    try {
      await onModifierFormule(f.code, { actif: true });
      setRetour({ type: "succes", texte: `« ${f.nom} » est de nouveau proposée à la vente.` });
    } catch (e) {
      setRetour({ type: "erreur", texte: e instanceof Error ? e.message : "La réactivation a échoué." });
    }
  }

  async function confirmerAction() {
    if (!action) return;
    const { type, formule } = action;
    setActionEnCours(true);
    setErreurAction(null);
    try {
      if (type === "supprimer") await onSupprimerFormule(formule.code);
      else await onModifierFormule(formule.code, { actif: false });
      setRetour({
        type: "succes",
        texte: type === "supprimer" ? `Formule « ${formule.nom} » supprimée.` : `« ${formule.nom} » n'est plus proposée à la vente.`,
      });
      setAction(null);
    } catch (e) {
      setErreurAction(e instanceof Error ? e.message : "L'action a échoué. Réessayez.");
    } finally {
      setActionEnCours(false);
    }
  }

  return (
    <div className="page">
      <EnteteApp titre="Abonnements" onglet="abonnements" onChangerOnglet={onChangerOnglet}>
        <Button variant="secondary" onClick={onActualiser} disabled={chargement}>
          {chargement ? "Actualisation…" : "Actualiser"}
        </Button>
        <Button variant="secondary" onClick={onDeconnexion}>
          Déconnexion
        </Button>
      </EnteteApp>

      <aside className="encart" aria-label="Aide">
        <p>{AIDE_FORMULES}</p>
      </aside>

      {chargement && (
        <p role="status" className="chargement">
          {formules.length === 0 ? "Chargement des formules…" : "Actualisation…"}
        </p>
      )}
      {erreur && (
        <p className="erreur" role="alert">
          {erreur}
        </p>
      )}

      <section aria-labelledby="titre-formules" className="section-ecran">
        <div className="section-ecran__entete">
          <h2 id="titre-formules" className="titre-section">
            Formules
          </h2>
          <Button onClick={() => setEdition(null)}>Nouvelle formule</Button>
        </div>
        <p className="aide-champ aide-champ--section">
          Changer un prix n'affecte jamais une période déjà payée. Changer les fonctions ou le plafond de chambres s'applique tout de suite aux hôtels abonnés.
          Une formule utilisée par des hôtels ne se supprime pas : désactivez-la, elle n'est plus vendue et ses abonnés la gardent.
        </p>

        {retour && (
          <p className={retour.type === "succes" ? "succes" : "erreur"} role={retour.type === "erreur" ? "alert" : "status"}>
            {retour.texte}
          </p>
        )}

        {triees.length > 0 ? (
          <div className="tableau-defilant">
            <table className="tableau">
              <caption className="visuellement-cache">Formules d'abonnement, dans l'ordre d'affichage</caption>
              <thead>
                <tr>
                  <th scope="col">Formule</th>
                  <th scope="col">Prix mensuel</th>
                  <th scope="col">Chambres</th>
                  <th scope="col">Fonctions incluses</th>
                  <th scope="col">Hôtels abonnés</th>
                  <th scope="col">
                    <span className="visuellement-cache">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {triees.map((f) => (
                  <tr key={f.code} className={f.actif ? undefined : "ligne-retiree"}>
                    <th scope="row" className="cellule-hotel">
                      {f.nom}
                      <span className="cellule-hotel__sous">
                        <code>{f.code}</code>
                      </span>
                      <span className="pastilles">
                        {f.recommandee && <StatusBadge tone="info" label="Recommandée" />}
                        {!f.actif && <StatusBadge tone="neutral" label="Retirée de la vente" />}
                      </span>
                    </th>
                    <td className="nombre">
                      {montantAbonnement(f.prixMensuelUsd, "USD")}
                      <span className="cellule-hotel__sous">{parametres ? `≈ ${montantAbonnement(cout(f, "CDF"), "CDF")}` : "FC : taux non chargé"}</span>
                    </td>
                    <td>{f.maxChambres === null ? "Illimité" : `${f.maxChambres} max.`}</td>
                    <td>
                      <ul className="pastilles pastilles--liste" aria-label={`Fonctions de la formule ${f.nom}`}>
                        {f.fonctions.map((fn) => (
                          <li key={fn} className="pastille" title={LIBELLE_FONCTION[fn]}>
                            {LIBELLE_COURT_FONCTION[fn] ?? fn}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="nombre">{f.hotelsAbonnes}</td>
                    <td>
                      <div className="actions-ligne">
                        <Button variant="secondary" size="sm" aria-label={`Modifier la formule ${f.nom}`} onClick={() => setEdition(f.code)}>
                          Modifier
                        </Button>
                        {f.actif ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            aria-label={`Désactiver la formule ${f.nom}`}
                            onClick={() => {
                              setErreurAction(null);
                              setAction({ type: "desactiver", formule: f });
                            }}
                          >
                            Désactiver
                          </Button>
                        ) : (
                          <Button variant="secondary" size="sm" aria-label={`Réactiver la formule ${f.nom}`} onClick={() => void reactiver(f)}>
                            Réactiver
                          </Button>
                        )}
                        <Button
                          variant="danger"
                          size="sm"
                          aria-label={`Supprimer la formule ${f.nom}`}
                          onClick={() => {
                            setErreurAction(null);
                            setAction({ type: "supprimer", formule: f });
                          }}
                        >
                          Supprimer
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          !chargement && !erreur && <p className="vide">Aucune formule pour l'instant. Créez-en une avec « Nouvelle formule ».</p>
        )}
      </section>

      <section aria-label="Réglages" className="section-ecran">
        {parametres ? (
          <ReglagesPlateforme parametres={parametres} onEnregistrer={onEnregistrerParametres} />
        ) : (
          !chargement && !erreur && <p className="vide">Réglages indisponibles pour le moment. Cliquez sur Actualiser.</p>
        )}
      </section>

      {edition !== false && (edition === null || formuleEnEdition) && (
        <FormulaireFormule
          formule={formuleEnEdition}
          formules={formules}
          parametres={parametres}
          onEnregistrer={async (dto) => {
            if (formuleEnEdition) {
              const { code: _code, ...partiel } = dto;
              await onModifierFormule(formuleEnEdition.code, partiel);
              setRetour({ type: "succes", texte: `Formule « ${dto.nom} » enregistrée.` });
            } else {
              await onCreerFormule(dto as DonneesFormule & { code: string });
              setRetour({ type: "succes", texte: `Formule « ${dto.nom} » créée.` });
            }
            setEdition(false);
          }}
          onFermer={() => setEdition(false)}
        />
      )}

      {action && (
        <DialogueConfirmation
          titre={action.type === "supprimer" ? `Supprimer la formule « ${action.formule.nom} » ?` : `Désactiver la formule « ${action.formule.nom} » ?`}
          message={
            <>
              {action.type === "supprimer" ? (
                <>
                  <p>La formule est effacée définitivement.</p>
                  {action.formule.hotelsAbonnes > 0 && (
                    <p className="avertissement">
                      {action.formule.hotelsAbonnes} hôtel(s) y sont abonnés : le serveur refusera la suppression. Désactivez-la plutôt.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p>
                    La formule n'est plus proposée à la vente.
                    {action.formule.hotelsAbonnes > 0 && ` Les ${action.formule.hotelsAbonnes} hôtel(s) qui l'ont déjà la gardent, avec ses fonctions et son plafond.`}
                  </p>
                  <p>Au moins une formule active doit rester.</p>
                </>
              )}
              {erreurAction && (
                <p className="erreur" role="alert">
                  {erreurAction}
                </p>
              )}
            </>
          }
          libelleConfirmer={action.type === "supprimer" ? "Supprimer la formule" : "Désactiver la formule"}
          destructif={action.type === "supprimer"}
          enCours={actionEnCours}
          onConfirmer={() => void confirmerAction()}
          onAnnuler={() => setAction(null)}
        />
      )}
    </div>
  );
}
