import * as React from "react";
import { useEffect, useState } from "react";
import type { ClientApi, DonneesModificationUtilisateur, Utilisateur } from "@hotel-chicago/api-client";
import { Role } from "@hotel-chicago/types";
import { Button, StatusBadge } from "@hotel-chicago/ui";
import { Users } from "lucide-react";

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
  email: string;
  motDePasse: string;
  role: Role;
}

interface FormulaireEdition {
  nom: string;
  email: string;
  motDePasse: string;
}

const FORMULAIRE_VIDE: FormulaireCreation = { nom: "", email: "", motDePasse: "", role: Role.CAFETARIA };

/**
 * Création et gestion des comptes du personnel (Phase 15) — PATRON
 * uniquement (route protégée dans EcranParametres). Le mot de passe est
 * choisi ici par le patron et communiqué directement à l'employé (pas de
 * génération automatique — voir apps/mobile/src/ecrans/EcranUtilisateurs.tsx,
 * même logique, même API).
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
  const [formEdition, setFormEdition] = useState<FormulaireEdition>({ nom: "", email: "", motDePasse: "" });
  const [erreurEdition, setErreurEdition] = useState<string | null>(null);

  /** Rôles déjà dotés d'un compte — un seul compte par rôle par hôtel
   * (règle API, UtilisateursService.create). */
  const rolesPris = new Set((utilisateurs ?? []).map((u) => u.role));

  function charger() {
    client.listerUtilisateurs().then(setUtilisateurs).catch((e: Error) => setErreur(e.message));
  }

  useEffect(charger, [client]);

  function ouvrirEdition(utilisateur: Utilisateur) {
    setEdition(utilisateur);
    setFormEdition({ nom: utilisateur.nom, email: utilisateur.email ?? "", motDePasse: "" });
    setErreurEdition(null);
  }

  async function enregistrerEdition() {
    if (!edition) return;
    const nom = formEdition.nom.trim();
    const email = formEdition.email.trim();
    const motDePasse = formEdition.motDePasse;
    if (!nom || !email) {
      setErreurEdition("Le nom et l'email sont obligatoires.");
      return;
    }
    if (motDePasse && motDePasse.length < 8) {
      setErreurEdition("Le mot de passe doit contenir au moins 8 caractères (ou laisser vide pour ne pas le changer).");
      return;
    }
    const donnees: DonneesModificationUtilisateur = {};
    if (nom !== edition.nom) donnees.nom = nom;
    if (email !== (edition.email ?? "")) donnees.email = email;
    if (motDePasse) donnees.motDePasse = motDePasse;
    if (!donnees.nom && !donnees.email && !donnees.motDePasse) {
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
    if (!formulaire.nom.trim() || !formulaire.email.trim() || formulaire.motDePasse.length < 8) {
      setErreurFormulaire("Nom, email et mot de passe (8 caractères minimum) sont obligatoires.");
      return;
    }
    setEnEnvoi(true);
    setErreurFormulaire(null);
    try {
      await client.creerUtilisateur({
        nom: formulaire.nom.trim(),
        email: formulaire.email.trim(),
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
        <div className="carte-formulaire formulaire">
          <label className="hc-text-label" htmlFor="champ-nom-utilisateur">
            Nom
          </label>
          <input
            id="champ-nom-utilisateur"
            value={formulaire.nom}
            onChange={(e) => setFormulaire((f) => ({ ...f, nom: e.target.value }))}
            placeholder="Ex. Jeanne Kabila"
          />

          <label className="hc-text-label" htmlFor="champ-email-utilisateur">
            Email
          </label>
          <input
            id="champ-email-utilisateur"
            type="email"
            value={formulaire.email}
            onChange={(e) => setFormulaire((f) => ({ ...f, email: e.target.value }))}
            placeholder="jeanne@exemple.com"
          />

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

          {erreurFormulaire && (
            <p role="alert" className="hc-text-body texte-erreur">
              {erreurFormulaire}
            </p>
          )}

          <Button type="button" onClick={creer} disabled={enEnvoi} style={{ marginTop: "var(--hc-space-3)" }}>
            {enEnvoi ? "…" : "Créer le compte"}
          </Button>
        </div>
      )}

      {edition && (
        <div className="carte-formulaire formulaire">
          <p className="hc-text-label texte-discret">
            Modifier — {LIBELLE_ROLE[edition.role]}
          </p>
          <p className="hc-text-caption texte-discret">
            Changez le nom, l'email ou le mot de passe pour transmettre le compte à un nouvel employé.
          </p>
          <label className="hc-text-label" htmlFor="edit-nom-utilisateur">
            Nom
          </label>
          <input
            id="edit-nom-utilisateur"
            value={formEdition.nom}
            onChange={(e) => setFormEdition((f) => ({ ...f, nom: e.target.value }))}
          />

          <label className="hc-text-label" htmlFor="edit-email-utilisateur">
            Email
          </label>
          <input
            id="edit-email-utilisateur"
            type="email"
            value={formEdition.email}
            onChange={(e) => setFormEdition((f) => ({ ...f, email: e.target.value }))}
          />

          <label className="hc-text-label" htmlFor="edit-mdp-utilisateur">
            Nouveau mot de passe
          </label>
          <input
            id="edit-mdp-utilisateur"
            type="password"
            value={formEdition.motDePasse}
            onChange={(e) => setFormEdition((f) => ({ ...f, motDePasse: e.target.value }))}
            placeholder="Laisser vide pour ne pas le changer"
          />

          {erreurEdition && (
            <p role="alert" className="hc-text-body texte-erreur">
              {erreurEdition}
            </p>
          )}

          <div style={{ display: "flex", gap: "var(--hc-space-2)", marginTop: "var(--hc-space-3)" }}>
            <Button type="button" onClick={enregistrerEdition} disabled={enEnvoi}>
              {enEnvoi ? "…" : "Enregistrer"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setEdition(null)}>
              Fermer
            </Button>
          </div>
        </div>
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
                  <td className="texte-discret">{u.email ?? "—"}</td>
                  <td className="texte-discret">{LIBELLE_ROLE[u.role]}</td>
                  <td>
                    <StatusBadge tone={u.actif ? "success" : "danger"} label={u.actif ? "Actif" : "Désactivé"} />
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <Button type="button" variant="secondary" size="sm" onClick={() => ouvrirEdition(u)}>
                      Modifier
                    </Button>{" "}
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
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
    </div>
  );
}
