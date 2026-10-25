import * as React from "react";
import { useEffect, useState } from "react";
import type { ClientApi, DonneesModificationUtilisateur, Utilisateur } from "@hotel-chicago/api-client";
import { Role, formaterTelephoneRdc } from "@hotel-chicago/types";
import { Button, ChampTelephone, StatusBadge, saisieDepuisTelephone, telephoneDepuisSaisie } from "@hotel-chicago/ui";
import { Users } from "lucide-react";
import { useConfirmation } from "../components/DialogueConfirmation";
import { PanneauFormulaire } from "../components/PanneauFormulaire";

export interface EcranUtilisateursProps {
  client: ClientApi;
}

const ROLES: Role[] = [Role.RECEPTIONNISTE, Role.CAFETARIA, Role.PATRON];

const LIBELLE_ROLE: Record<Role, string> = {
  [Role.PATRON]: "Patron",
  [Role.RECEPTIONNISTE]: "Réceptionniste",
  [Role.CAFETARIA]: "Cafétaria",
};

interface FormulaireCreation {
  nom: string;
  /** Saisie « 970 000 000 » : identifiant de connexion (obligatoire, 15/10/2026). */
  telephone: string;
  email: string;
  motDePasse: string;
  role: Role;
}

interface FormulaireEdition {
  nom: string;
  telephone: string;
  email: string;
  motDePasse: string;
}

const FORMULAIRE_VIDE: FormulaireCreation = { nom: "", telephone: "", email: "", motDePasse: "", role: Role.CAFETARIA };

/**
 * Création et gestion des comptes du personnel (Phase 15) — PATRON
 * uniquement (route protégée dans EcranParametres). Le mot de passe est
 * choisi ici par le patron et communiqué directement à l'employé (pas de
 * génération automatique — voir apps/mobile/src/ecrans/EcranUtilisateurs.tsx,
 * même logique, même API). Depuis le 15/10/2026, chaque compte se connecte
 * avec son numéro de téléphone (obligatoire) ; l'e-mail est optionnel.
 */
export function EcranUtilisateurs({ client }: EcranUtilisateursProps) {
  const [utilisateurs, setUtilisateurs] = useState<Utilisateur[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const [formulaire, setFormulaire] = useState<FormulaireCreation>(FORMULAIRE_VIDE);
  const [enEnvoi, setEnEnvoi] = useState(false);
  const [erreurFormulaire, setErreurFormulaire] = useState<string | null>(null);
  const [idEnCours, setIdEnCours] = useState<string | null>(null);
  // Compte en cours d'édition (Phase 16 : rotation des identifiants quand
  // un employé part — le compte de rôle est unique, on le modifie).
  const [edition, setEdition] = useState<Utilisateur | null>(null);
  const [formEdition, setFormEdition] = useState<FormulaireEdition>({ nom: "", telephone: "", email: "", motDePasse: "" });
  const [erreurEdition, setErreurEdition] = useState<string | null>(null);
  const { demander, dialogue } = useConfirmation();

  /** Rôles déjà dotés d'un compte — un seul compte par rôle par hôtel
   * (règle API, UtilisateursService.create). */
  const rolesPris = new Set((utilisateurs ?? []).map((u) => u.role));

  function charger() {
    client.listerUtilisateurs().then(setUtilisateurs).catch((e: Error) => setErreur(e.message));
  }

  useEffect(charger, [client]);

  function ouvrirEdition(utilisateur: Utilisateur) {
    setEdition(utilisateur);
    setFormEdition({
      nom: utilisateur.nom,
      telephone: saisieDepuisTelephone(utilisateur.telephone),
      email: utilisateur.email ?? "",
      motDePasse: "",
    });
    setErreurEdition(null);
  }

  async function enregistrerEdition() {
    if (!edition) return;
    const nom = formEdition.nom.trim();
    const email = formEdition.email.trim();
    const motDePasse = formEdition.motDePasse;
    const telephone = telephoneDepuisSaisie(formEdition.telephone);
    if (!nom || !telephone) {
      setErreurEdition("Le nom et un numéro de téléphone valide sont obligatoires.");
      return;
    }
    if (motDePasse && motDePasse.length < 8) {
      setErreurEdition("Le mot de passe doit contenir au moins 8 caractères (ou laisser vide pour ne pas le changer).");
      return;
    }
    const donnees: DonneesModificationUtilisateur = {};
    if (nom !== edition.nom) donnees.nom = nom;
    if (telephone !== edition.telephone) donnees.telephone = telephone;
    if (email !== (edition.email ?? "")) donnees.email = email;
    if (motDePasse) donnees.motDePasse = motDePasse;
    if (donnees.nom === undefined && donnees.telephone === undefined && donnees.email === undefined && !donnees.motDePasse) {
      setEdition(null);
      return;
    }
    setEnEnvoi(true);
    setErreurEdition(null);
    try {
      await client.modifierUtilisateur(edition.id, donnees);
      setEdition(null);
      charger();
    } catch (e) {
      setErreurEdition(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnEnvoi(false);
    }
  }

  async function creer() {
    const telephone = telephoneDepuisSaisie(formulaire.telephone);
    if (!formulaire.nom.trim() || !telephone || formulaire.motDePasse.length < 8) {
      setErreurFormulaire("Nom, numéro de téléphone valide et mot de passe (8 caractères minimum) sont obligatoires.");
      return;
    }
    setEnEnvoi(true);
    setErreurFormulaire(null);
    try {
      await client.creerUtilisateur({
        nom: formulaire.nom.trim(),
        telephone,
        email: formulaire.email.trim() || undefined,
        motDePasse: formulaire.motDePasse,
        role: formulaire.role,
      });
      setFormulaire(FORMULAIRE_VIDE);
      setFormulaireOuvert(false);
      charger();
    } catch (e) {
      setErreurFormulaire(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnEnvoi(false);
    }
  }

  async function basculerActif(utilisateur: Utilisateur) {
    // Désactiver coupe l'accès d'un employé : confirmation nommée. (Réactiver est sans risque.)
    if (utilisateur.actif) {
      const confirme = await demander({
        titre: `Désactiver le compte de ${utilisateur.nom} (${LIBELLE_ROLE[utilisateur.role]}) ?`,
        message: "Cette personne ne pourra plus se connecter. Vous pourrez réactiver le compte à tout moment.",
        libelleConfirmer: "Désactiver le compte",
        destructif: true,
      });
      if (!confirme) return;
    }
    setIdEnCours(utilisateur.id);
    setErreur(null);
    try {
      await client.changerStatutUtilisateur(utilisateur.id, !utilisateur.actif);
      charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setIdEnCours(null);
    }
  }

  return (
    <div className="page">
      <header className="page__entete">
        <div>
          <h1 className="hc-text-display-md page__titre">Utilisateurs</h1>
          <p className="hc-text-body page__sous-titre">Comptes du personnel de cet hôtel.</p>
        </div>
        <Button type="button" onClick={() => setFormulaireOuvert((v) => !v)}>
          {formulaireOuvert ? "Annuler" : "Nouveau compte"}
        </Button>
      </header>

      {erreur && (
        <p role="alert" className="hc-text-body texte-erreur">
          {erreur}
        </p>
      )}

      {formulaireOuvert && (
        <PanneauFormulaire
          titre="Nouveau compte"
          sousTitre="Le mot de passe est choisi ici et communiqué à l'employé."
          onFermer={() => !enEnvoi && setFormulaireOuvert(false)}
          erreur={erreurFormulaire}
          actions={
            <>
              <Button type="button" variant="secondary" onClick={() => setFormulaireOuvert(false)} disabled={enEnvoi}>
                Annuler
              </Button>
              <Button type="button" onClick={creer} disabled={enEnvoi}>
                {enEnvoi ? "…" : "Créer le compte"}
              </Button>
            </>
          }
        >
          <div className="champs-grille">
            <div className="champ">
              <label className="hc-text-label" htmlFor="champ-nom-utilisateur">
                Nom
              </label>
              <input
                id="champ-nom-utilisateur"
                value={formulaire.nom}
                onChange={(e) => setFormulaire((f) => ({ ...f, nom: e.target.value }))}
                placeholder="Ex. Jeanne Kabila"
              />
            </div>
            <div className="champ">
              <label className="hc-text-label" htmlFor="champ-telephone-utilisateur">
                Téléphone (pour se connecter)
              </label>
              <ChampTelephone
                id="champ-telephone-utilisateur"
                value={formulaire.telephone}
                onChange={(v) => setFormulaire((f) => ({ ...f, telephone: v }))}
              />
            </div>
            <div className="champ">
              <label className="hc-text-label" htmlFor="champ-email-utilisateur">
                Email (optionnel)
              </label>
              <input
                id="champ-email-utilisateur"
                type="email"
                value={formulaire.email}
                onChange={(e) => setFormulaire((f) => ({ ...f, email: e.target.value }))}
                placeholder="jeanne@exemple.com"
              />
            </div>
            <div className="champ">
              <label className="hc-text-label" htmlFor="champ-mot-de-passe-utilisateur">
                Mot de passe
              </label>
              <input
                id="champ-mot-de-passe-utilisateur"
                type="password"
                value={formulaire.motDePasse}
                onChange={(e) => setFormulaire((f) => ({ ...f, motDePasse: e.target.value }))}
                placeholder="8 caractères minimum"
              />
            </div>
          </div>

          <p className="hc-text-label texte-discret" style={{ marginTop: "var(--hc-space-2)" }}>
            Rôle
          </p>
          <div className="puces" role="group" aria-label="Rôle">
            {ROLES.map((r) => {
              const pris = rolesPris.has(r);
              return (
                <button
                  key={r}
                  type="button"
                  className="puce"
                  aria-pressed={formulaire.role === r}
                  disabled={pris}
                  onClick={() => setFormulaire((f) => ({ ...f, role: r }))}
                >
                  {LIBELLE_ROLE[r]}
                  {pris ? " · déjà créé" : ""}
                </button>
              );
            })}
          </div>
          {ROLES.every((r) => rolesPris.has(r)) && (
            <p className="hc-text-caption texte-discret">
              Un seul compte par rôle est autorisé. Modifiez un compte existant pour le transmettre à un nouvel
              employé.
            </p>
          )}
        </PanneauFormulaire>
      )}

      {edition && (
        <PanneauFormulaire
          titre={`Modifier — ${LIBELLE_ROLE[edition.role]}`}
          sousTitre="Changez le nom, le numéro ou le mot de passe pour transmettre le compte à un nouvel employé."
          onFermer={() => !enEnvoi && setEdition(null)}
          erreur={erreurEdition}
          actions={
            <>
              <Button type="button" variant="secondary" onClick={() => setEdition(null)}>
                Fermer
              </Button>
              <Button type="button" onClick={enregistrerEdition} disabled={enEnvoi}>
                {enEnvoi ? "…" : "Enregistrer"}
              </Button>
            </>
          }
        >
          <div className="champs-grille">
            <div className="champ">
              <label className="hc-text-label" htmlFor="edit-nom-utilisateur">
                Nom
              </label>
              <input
                id="edit-nom-utilisateur"
                value={formEdition.nom}
                onChange={(e) => setFormEdition((f) => ({ ...f, nom: e.target.value }))}
              />
            </div>
            <div className="champ">
              <label className="hc-text-label" htmlFor="edit-telephone-utilisateur">
                Téléphone (pour se connecter)
              </label>
              <ChampTelephone
                id="edit-telephone-utilisateur"
                value={formEdition.telephone}
                onChange={(v) => setFormEdition((f) => ({ ...f, telephone: v }))}
              />
            </div>
            <div className="champ">
              <label className="hc-text-label" htmlFor="edit-email-utilisateur">
                Email (optionnel)
              </label>
              <input
                id="edit-email-utilisateur"
                type="email"
                value={formEdition.email}
                onChange={(e) => setFormEdition((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="champ">
              <label className="hc-text-label" htmlFor="edit-mdp-utilisateur">
                Nouveau mot de passe
              </label>
              <input
                id="edit-mdp-utilisateur"
                type="password"
                value={formEdition.motDePasse}
                onChange={(e) => setFormEdition((f) => ({ ...f, motDePasse: e.target.value }))}
                placeholder="Laisser vide pour ne pas changer"
              />
            </div>
          </div>
        </PanneauFormulaire>
      )}

      {utilisateurs === null && !erreur && <p className="hc-text-body texte-discret">Chargement…</p>}

      {utilisateurs?.length === 0 && (
        <div className="etat-vide">
          <Users size={32} strokeWidth={1.5} aria-hidden="true" />
          <p className="hc-text-subheading">Aucun compte enregistré</p>
        </div>
      )}

      {utilisateurs && utilisateurs.length > 0 && (
        <div className="carte-tableau" data-testid="tableau-utilisateurs">
          <table className="tableau">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Téléphone</th>
                <th>Email</th>
                <th>Rôle</th>
                <th>Statut</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {utilisateurs.map((u) => (
                <tr key={u.id}>
                  <td className="hc-text-body-strong">{u.nom}</td>
                  <td className="texte-discret">{u.telephone ? formaterTelephoneRdc(u.telephone) : "À compléter"}</td>
                  <td className="texte-discret">{u.email ?? "—"}</td>
                  <td className="texte-discret">{LIBELLE_ROLE[u.role]}</td>
                  <td>
                    <StatusBadge tone={u.actif ? "success" : "danger"} label={u.actif ? "Actif" : "Désactivé"} />
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <Button type="button" variant="secondary" size="sm" aria-label={`Modifier le compte de ${u.nom}`} onClick={() => ouvrirEdition(u)}>
                      Modifier
                    </Button>{" "}
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      aria-label={`${u.actif ? "Désactiver" : "Activer"} le compte de ${u.nom}`}
                      onClick={() => basculerActif(u)}
                      disabled={idEnCours === u.id}
                    >
                      {idEnCours === u.id ? "…" : u.actif ? "Désactiver" : "Activer"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {dialogue}
    </div>
  );
}
