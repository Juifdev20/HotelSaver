import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import type { ClientApi, TauxChange } from "@hotel-chicago/api-client";
import { Devise, Role, UtilisateurAuthentifie } from "@hotel-chicago/types";
import { Button, formatMontant } from "@hotel-chicago/ui";
import { Bell, ChefHat, Coins, Globe, Moon, Printer, ShieldCheck, Sun, Users } from "lucide-react";
import type { IdPage } from "../navigation";
import { IndicateurConnexion } from "../layout/IndicateurConnexion";
import { lireTauxChange } from "@hotel-chicago/miroir-local";

export interface EcranParametresProps {
  /** Présent seulement une fois connecté. */
  client?: ClientApi;
  /** Présent seulement une fois connecté — conditionne le bloc Administration (PATRON uniquement). */
  utilisateur?: UtilisateurAuthentifie;
  /** Présent seulement une fois connecté — conditionne le bloc Impression (rien à imprimer avant l'écran de connexion). */
  onNaviguer?: (page: IdPage) => void;
  /** Mode sombre : plus de bouton dédié dans la barre du haut en fenêtre étroite
   * (maquette mobile du 25/09/2026), donc toujours accessible ici. */
  themeSombre: boolean;
  onBasculerTheme: () => void;
  /** Appelé après modification d'un réglage de l'hôtel : l'app relit le profil pour mettre ses écrans à jour. */
  onProfilModifie?: () => void;
}

/** Taux de change USD/CDF (PATRON, section 9.4) : taux en vigueur, saisie
 * du nouveau taux du jour, historique (50 dernières lignes). */
function GestionTauxChange({ client }: { client: ClientApi }) {
  const [historique, setHistorique] = useState<TauxChange[] | null>(null);
  const [saisie, setSaisie] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const recharger = useCallback(() => {
    client
      .listerTauxChange()
      .then(setHistorique)
      .catch((e: Error) => setErreur(e.message));
  }, [client]);

  useEffect(recharger, [recharger]);

  const actuel = historique?.[0] ?? null;

  async function enregistrer() {
    const lu = lireTauxChange(saisie);
    if (!lu.ok) {
      setErreur(lu.message);
      return;
    }
    const valeur = lu.valeur;
    const ancien = actuel ? `Taux actuel : 1 $ = ${formatMontant(actuel.cdfParUsd, Devise.CDF)}.\n` : "";
    if (!window.confirm(`${ancien}Nouveau taux : 1 $ = ${formatMontant(valeur, Devise.CDF)}.\nIl servira aux prochains paiements croisés. Confirmer ?`)) return;
    setEnCours(true);
    setErreur(null);
    setConfirmation(null);
    try {
      await client.creerTauxChange(valeur);
      setSaisie("");
      setConfirmation(`Taux enregistré : 1 $ = ${formatMontant(valeur, Devise.CDF)}`);
      recharger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <>
      <div className="parametres-ligne">
        <span className="parametres-ligne__icone">
          <Coins size={18} aria-hidden="true" />
        </span>
        <span className="hc-text-body">
          Taux de change : {actuel ? `1 $ = ${formatMontant(actuel.cdfParUsd, Devise.CDF)}` : historique ? "aucun taux défini" : "…"}
        </span>
      </div>
      <div className="parametres-ligne" style={{ alignItems: "center" }}>
        <input
          type="text"
          inputMode="decimal"
          placeholder="Nouveau taux, ex. 2800"
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          aria-label="Nouveau taux USD/CDF"
          style={{ maxWidth: 220 }}
        />
        <Button type="button" variant="secondary" size="sm" onClick={enregistrer} disabled={enCours}>
          {enCours ? "…" : "Enregistrer"}
        </Button>
      </div>
      {erreur && (
        <p role="alert" className="hc-text-body texte-erreur">
          {erreur}
        </p>
      )}
      {confirmation && (
        <p className="hc-text-body texte-succes" role="status">
          {confirmation}
        </p>
      )}
      {historique && historique.length > 1 && (
        <p className="hc-text-caption texte-discret">
          Historique :{" "}
          {historique
            .slice(1, 6)
            .map((t) => `${new Date(t.createdAt).toLocaleDateString("fr-FR")} → ${formatMontant(t.cdfParUsd, Devise.CDF)}`)
            .join(" · ")}
        </p>
      )}
    </>
  );
}

/**
 * Paramètres de ce poste (apparence, impression, administration). L'adresse de
 * l'API n'est plus réglable ici : elle est fixée à la compilation (voir
 * DECISIONS.md, 01/10/2026) — un utilisateur n'a pas à manipuler une URL technique.
 */
export function EcranParametres({
  client,
  utilisateur,
  onNaviguer,
  themeSombre,
  onBasculerTheme,
  onProfilModifie,
}: EcranParametresProps) {
  const [enregistrementReglage, setEnregistrementReglage] = useState(false);
  const [erreurReglage, setErreurReglage] = useState<string | null>(null);
  const patronOpere = utilisateur?.patronPeutOperer === true;
  const cuisineActivee = utilisateur?.cuisineActivee === true;
  const commandeWebActivee = utilisateur?.commandeWebActivee === true;

  async function basculerReglage(donnees: { patronPeutOperer?: boolean; cuisineActivee?: boolean; commandeWebActivee?: boolean }) {
    if (!client) return;
    setEnregistrementReglage(true);
    setErreurReglage(null);
    try {
      await client.modifierReglagesHotel(donnees);
      onProfilModifie?.();
    } catch (e) {
      setErreurReglage(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnregistrementReglage(false);
    }
  }

  const basculerPatronOpere = () => basculerReglage({ patronPeutOperer: !patronOpere });
  const basculerCuisine = () => basculerReglage({ cuisineActivee: !cuisineActivee });
  const basculerCommandeWeb = () => basculerReglage({ commandeWebActivee: !commandeWebActivee });

  const [lancerAuDemarrage, setLancerAuDemarrage] = useState(false);
  useEffect(() => {
    void window.hotelChicago.lireLancerAuDemarrage().then(setLancerAuDemarrage, () => undefined);
  }, []);

  return (
    <div className="page">
      <header className="page__entete">
        <div>
          <h1 className="hc-text-display-md page__titre">Paramètres</h1>
          <p className="hc-text-body page__sous-titre">Configuration de ce poste.</p>
        </div>
      </header>

      {client && (
        <div className="carte-formulaire">
          <p className="hc-text-label texte-discret">État du serveur</p>
          <IndicateurConnexion client={client} />
        </div>
      )}

      <div className="carte-formulaire">
        <p className="hc-text-label texte-discret">Apparence</p>
        <div className="parametres-ligne">
          <span className="parametres-ligne__icone">
            {themeSombre ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
          </span>
          <span className="hc-text-body">{themeSombre ? "Mode sombre" : "Mode clair"}</span>
          <Button type="button" variant="secondary" size="sm" onClick={onBasculerTheme}>
            Basculer
          </Button>
        </div>
      </div>

      <div className="carte-formulaire">
        <p className="hc-text-label texte-discret">Notifications</p>
        <div className="parametres-ligne">
          <span className="parametres-ligne__icone">
            <Bell size={18} aria-hidden="true" />
          </span>
          <span className="hc-text-body">
            {lancerAuDemarrage ? "Démarre avec Windows" : "Ne démarre pas avec Windows"}
          </span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void window.hotelChicago.ecrireLancerAuDemarrage(!lancerAuDemarrage).then(setLancerAuDemarrage)}
          >
            {lancerAuDemarrage ? "Désactiver" : "Activer"}
          </Button>
        </div>
        <p className="hc-text-caption texte-discret">
          Fermer la fenêtre garde HotelSaver actif près de l'horloge pour recevoir les alertes. Activez le démarrage
          avec Windows pour ne jamais les manquer.
        </p>
      </div>

      {onNaviguer && (
        <div className="carte-formulaire">
          <p className="hc-text-label texte-discret">Impression</p>
          <div className="parametres-ligne">
            <span className="parametres-ligne__icone">
              <Printer size={18} aria-hidden="true" />
            </span>
            <span className="hc-text-body">Imprimante (reçu chambre)</span>
            <Button type="button" variant="secondary" size="sm" onClick={() => onNaviguer("imprimante")}>
              Configurer
            </Button>
          </div>
        </div>
      )}

      {/* Utilisateurs et Taux de change vivent ici plutôt que dans la barre
          latérale, pour la garder courte (demande du client du 25/09/2026) —
          PATRON uniquement, comme dans la matrice 9.3. */}
      {utilisateur?.role === Role.PATRON && (
        <div className="carte-formulaire">
          <p className="hc-text-label texte-discret">Administration</p>
          <div className="parametres-ligne">
            <span className="parametres-ligne__icone">
              <Users size={18} aria-hidden="true" />
            </span>
            <span className="hc-text-body">Utilisateurs</span>
            {onNaviguer && (
              <Button type="button" variant="secondary" size="sm" onClick={() => onNaviguer("utilisateurs")}>
                Gérer
              </Button>
            )}
          </div>
          <div className="parametres-ligne">
            <span className="parametres-ligne__icone">
              <ShieldCheck size={18} aria-hidden="true" />
            </span>
            <span className="hc-text-body">{patronOpere ? "Le patron peut aussi opérer" : "Le patron n'opère pas"}</span>
            {client && (
              <Button type="button" variant="secondary" size="sm" onClick={() => void basculerPatronOpere()} disabled={enregistrementReglage}>
                {enregistrementReglage ? "…" : patronOpere ? "Désactiver" : "Activer"}
              </Button>
            )}
          </div>
          <p className="hc-text-caption texte-discret">
            Réserver, faire les check-in/out, facturer et tenir la caisse sont réservés au personnel (réception, cafétaria) pour éviter toute
            confusion. Activez ce réglage seulement si vous travaillez seul : le patron garde dans tous les cas l'administration, les rapports
            et les annulations avec motif.
          </p>
          <div className="parametres-ligne">
            <span className="parametres-ligne__icone">
              <ChefHat size={18} aria-hidden="true" />
            </span>
            <span className="hc-text-body">{cuisineActivee ? "Suivi cuisine activé" : "Suivi cuisine désactivé"}</span>
            {client && (
              <Button type="button" variant="secondary" size="sm" onClick={() => void basculerCuisine()} disabled={enregistrementReglage}>
                {enregistrementReglage ? "…" : cuisineActivee ? "Désactiver" : "Activer"}
              </Button>
            )}
          </div>
          <p className="hc-text-caption texte-discret">
            Activez si des plats sont préparés par une équipe séparée : les commandes partent sur l'écran Cuisine jusqu'à leur service. Laissez
            désactivé pour une vente au comptoir (articles servis immédiatement — l'écran Cuisine et les statuts sont masqués).
          </p>
          <div className="parametres-ligne">
            <span className="parametres-ligne__icone">
              <Globe size={18} aria-hidden="true" />
            </span>
            <span className="hc-text-body">
              {commandeWebActivee ? "Commande en ligne activée" : "Commande en ligne désactivée"}
            </span>
            {client && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void basculerCommandeWeb()}
                disabled={enregistrementReglage}
              >
                {enregistrementReglage ? "…" : commandeWebActivee ? "Désactiver" : "Activer"}
              </Button>
            )}
          </div>
          <p className="hc-text-caption texte-discret">
            Affiche la page « Cuisine » sur le site web de l'hôtel : les clients y commandent et paient au comptoir. Publiez les produits dans
            Menu (« Visible et commandable sur le site ») — la cafétaria est notifiée de chaque commande et les retrouve dans Comptes ouverts.
          </p>
          {erreurReglage && (
            <p role="alert" className="hc-text-body texte-erreur">
              {erreurReglage}
            </p>
          )}
          {client ? (
            <GestionTauxChange client={client} />
          ) : (
            <div className="parametres-ligne">
              <span className="parametres-ligne__icone">
                <Coins size={18} aria-hidden="true" />
              </span>
              <span className="hc-text-body">Taux de change</span>
              <span className="hc-text-caption texte-discret">disponible une fois connecté</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
