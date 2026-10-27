import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import type { ClientApi, TauxChange } from "@hotel-chicago/api-client";
import { Devise, Role, UtilisateurAuthentifie } from "@hotel-chicago/types";
import type { ProfilConnecte } from "@hotel-chicago/types";
import { Button, formatMontant } from "@hotel-chicago/ui";
import { Bell, ChefHat, Coins, CreditCard, Globe, Moon, Printer, Rows3, ShieldCheck, Sun, Users, Volume2 } from "lucide-react";
import { appliquerDensite, densiteEnregistree, type Densite } from "../densite";
import { actualiserEtatAbonnement, resumerAbonnement } from "@hotel-chicago/regles";
import type { IdPage } from "../navigation";
import { IndicateurConnexion } from "../layout/IndicateurConnexion";
import { lireTauxChange } from "@hotel-chicago/miroir-local";
import { BlocSecurite, type PreferencesSecurite } from "./BlocSecurite";
import { BlocPaiementEnLigne } from "./BlocPaiementEnLigne";
import { ecouterExemple, ecrirePreferencesSons, preferencesSons } from "../sons";

export interface EcranParametresProps {
  /** Présent seulement une fois connecté. */
  client?: ClientApi;
  /** Présent seulement une fois connecté — conditionne le bloc Administration (PATRON uniquement). */
  utilisateur?: UtilisateurAuthentifie & Pick<ProfilConnecte, "abonnement">;
  /** Présent seulement une fois connecté — conditionne le bloc Impression (rien à imprimer avant l'écran de connexion). */
  onNaviguer?: (page: IdPage) => void;
  /** Mode sombre : plus de bouton dédié dans la barre du haut en fenêtre étroite
   * (maquette mobile du 25/09/2026), donc toujours accessible ici. */
  themeSombre: boolean;
  onBasculerTheme: () => void;
  /** Appelé après modification d'un réglage de l'hôtel : l'app relit le profil pour mettre ses écrans à jour. */
  onProfilModifie?: () => void;
  /** Réglages de sécurité de CE poste (verrous optionnels) et leur modification. */
  preferencesSecurite?: PreferencesSecurite;
  onChangerPreferencesSecurite?: (p: Partial<PreferencesSecurite>) => Promise<void>;
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
  preferencesSecurite,
  onChangerPreferencesSecurite,
}: EcranParametresProps) {
  const [densite, setDensite] = useState<Densite>(densiteEnregistree);
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
  const [sons, setSons] = useState(preferencesSons);
  const [stockCoupe, setStockCoupe] = useState(false);

  useEffect(() => {
    if (!client) return;
    client.listerCoupuresAlertesStock().then((c) => setStockCoupe(c.toutes), () => undefined);
  }, [client]);

  /** Alertes de stock : couper / réactiver TOUTES celles de cet utilisateur (un produit seul se coupe depuis sa notification). */
  async function basculerAlertesStock() {
    if (!client) return;
    try {
      const c = stockCoupe ? await client.reactiverAlerteStock() : await client.couperAlerteStock();
      setStockCoupe(c.toutes);
    } catch {
      // Le réglage reste où il était : le prochain essai réessaie.
    }
  }
  useEffect(() => {
    void window.hotelChicago.lireLancerAuDemarrage().then(setLancerAuDemarrage, () => undefined);
  }, []);

  return (
    <div className="page page--colonnes">
      <header className="page__entete">
        <div>
          <h1 className="hc-text-display-md page__titre">Paramètres</h1>
          <p className="hc-text-body page__sous-titre">Configuration de ce poste.</p>
        </div>
      </header>

      {client && (
        <div className="carte-formulaire">
          <IndicateurConnexion client={client} />
        </div>
      )}

      {/* ── CE POSTE ─────────────────────────────────────────── */}
      <div className="parametres-section">
        <h2 className="parametres-section__titre">Ce poste</h2>

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
          <div className="parametres-ligne">
            <span className="parametres-ligne__icone">
              <Rows3 size={18} aria-hidden="true" />
            </span>
            <span className="hc-text-body">{densite === "compacte" ? "Affichage compact" : "Affichage confortable"}</span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                const suivante = densite === "compacte" ? "confortable" : "compacte";
                appliquerDensite(suivante);
                setDensite(suivante);
              }}
            >
              {densite === "compacte" ? "Agrandir" : "Compacter"}
            </Button>
          </div>
          <p className="hc-text-caption texte-discret">Le mode compact affiche plus de lignes dans les tableaux, utile sur un petit écran.</p>
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

        <div className="carte-formulaire">
          <p className="hc-text-label texte-discret">Sons et voix</p>
          <div className="parametres-ligne">
            <span className="parametres-ligne__icone">
              <Volume2 size={18} aria-hidden="true" />
            </span>
            <span className="hc-text-body">{sons.bip ? "Bip de scan activé" : "Bip de scan coupé"}</span>
            <Button type="button" variant="secondary" size="sm" onClick={() => setSons(ecrirePreferencesSons({ bip: !sons.bip }))}>
              {sons.bip ? "Couper" : "Activer"}
            </Button>
          </div>
          <div className="parametres-ligne">
            <span className="parametres-ligne__icone">
              <Volume2 size={18} aria-hidden="true" />
            </span>
            <span className="hc-text-body">{sons.voix ? "Voix activée" : "Voix coupée"}</span>
            <Button type="button" variant="secondary" size="sm" onClick={() => setSons(ecrirePreferencesSons({ voix: !sons.voix }))}>
              {sons.voix ? "Couper" : "Activer"}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={ecouterExemple}>
              Écouter
            </Button>
          </div>
          {(utilisateur?.role === Role.CAFETARIA || utilisateur?.role === Role.PATRON) && (
            <div className="parametres-ligne">
              <span className="parametres-ligne__icone">
                <Bell size={18} aria-hidden="true" />
              </span>
              <span className="hc-text-body">{stockCoupe ? "Alertes de stock coupées" : "Alertes de stock activées"}</span>
              <Button type="button" variant="secondary" size="sm" disabled={!client} onClick={() => void basculerAlertesStock()}>
                {stockCoupe ? "Activer" : "Couper"}
              </Button>
            </div>
          )}
          <p className="hc-text-caption texte-discret">
            Un bip à chaque article scanné et « Please try again » quand un scan échoue. Une alerte de stock bas est annoncée à la voix, puis rappelée toutes
            les 24 h tant que le stock n'est pas rechargé, jusqu'à ce que vous la coupiez.
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
      </div>

      {/* ── SÉCURITÉ ─────────────────────────────────────────── */}
      {client && preferencesSecurite && onChangerPreferencesSecurite && (
        <div className="parametres-section">
          <h2 className="parametres-section__titre">Sécurité</h2>
          <BlocSecurite client={client} preferences={preferencesSecurite} onChangerPreferences={onChangerPreferencesSecurite} />
        </div>
      )}

      {/* ── HÔTEL (PATRON) ───────────────────────────────────── */}
      {utilisateur?.role === Role.PATRON && (
        <div className="parametres-section">
          <h2 className="parametres-section__titre">Hôtel</h2>

          {/* Utilisateurs et toggles */}
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
              Réserver, faire les check-in/out, facturer et tenir la caisse sont réservés au personnel. Activez seulement si vous travaillez seul.
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
            {erreurReglage && (
              <p role="alert" className="hc-text-body texte-erreur">
                {erreurReglage}
              </p>
            )}
          </div>

          {/* Taux de change dans sa propre carte */}
          <div className="carte-formulaire">
            <p className="hc-text-label texte-discret">Taux de change</p>
            {client ? (
              <GestionTauxChange client={client} />
            ) : (
              <div className="parametres-ligne">
                <span className="parametres-ligne__icone">
                  <Coins size={18} aria-hidden="true" />
                </span>
                <span className="hc-text-body texte-discret">Disponible une fois connecté</span>
              </div>
            )}
          </div>

          {/* Paiement en ligne ScanLinkPay */}
          {client && <BlocPaiementEnLigne client={client} onNaviguer={onNaviguer} />}
        </div>
      )}

      {/* ── ABONNEMENT ───────────────────────────────────────── */}
      {onNaviguer && utilisateur && (
        <div className="parametres-section">
          <h2 className="parametres-section__titre">Abonnement</h2>
          <div className="carte-formulaire" data-testid="parametres-abonnement">
            <div className="parametres-ligne">
              <span className="parametres-ligne__icone">
                <CreditCard size={18} aria-hidden="true" />
              </span>
              <span className="hc-text-body">
                {utilisateur.abonnement ? resumerAbonnement(actualiserEtatAbonnement(utilisateur.abonnement)).titre : "État de l'abonnement"}
              </span>
              <Button type="button" variant="secondary" size="sm" onClick={() => onNaviguer("abonnement")}>
                {utilisateur.role === Role.PATRON ? "Gérer" : "Voir"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
