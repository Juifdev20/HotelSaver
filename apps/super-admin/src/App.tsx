import * as React from "react";
import { useEffect, useState } from "react";
import { ClientSuperAdmin, ErreurApi, connecterViaApi, rafraichirSession } from "@hotel-chicago/api-client";
import type { DonneesFormule, FormuleAdminVue, HotelAvecValidite, ParametresPlateformeVue, StatutLicence } from "@hotel-chicago/types";
import type { DonneesAjoutDomaine, DonneesCreationHotel, DonneesEnregistrementPaiement, PaiementAbonnementSupport } from "@hotel-chicago/api-client";
import { configuration } from "./config";
import { ecrireJetonRafraichissement, lireJetonRafraichissement, oublierJetonRafraichissement } from "./stockage";
import { EcranConnexion } from "./EcranConnexion";
import { EcranHotels } from "./EcranHotels";
import { EcranPaiements } from "./EcranPaiements";
import { EcranAbonnements } from "./EcranAbonnements";
import type { Onglet } from "./EnteteApp";
import type { HotelListe } from "./etatHotel";

type Ecran = "chargement" | "connexion" | "application";

/** Même principe d'aiguillage par état que apps/mobile/App.tsx — pas de
 * routeur pour une app à un seul écran authentifié. Pas de notion de
 * "profils" multiples ici : un seul compte Super-Admin par session
 * navigateur (voir DECISIONS.md, Phase 7). */
export default function App() {
  const [ecran, setEcran] = useState<Ecran>("chargement");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [erreurConnexion, setErreurConnexion] = useState<string | null>(null);
  const [connexionEnCours, setConnexionEnCours] = useState(false);

  const [hotels, setHotels] = useState<HotelListe[]>([]);
  const [chargementHotels, setChargementHotels] = useState(false);
  const [erreurHotels, setErreurHotels] = useState<string | null>(null);
  const [creationEnCours, setCreationEnCours] = useState(false);
  const [erreurCreation, setErreurCreation] = useState<string | null>(null);
  const [paiementEnCours, setPaiementEnCours] = useState(false);
  const [erreurPaiement, setErreurPaiement] = useState<string | null>(null);
  const [patronEnCours, setPatronEnCours] = useState(false);
  const [erreurPatron, setErreurPatron] = useState<string | null>(null);
  const [domaineEnCours, setDomaineEnCours] = useState(false);
  const [erreurDomaine, setErreurDomaine] = useState<string | null>(null);

  const [onglet, setOnglet] = useState<Onglet>("hotels");
  const [paiements, setPaiements] = useState<PaiementAbonnementSupport[]>([]);
  const [chargementPaiements, setChargementPaiements] = useState(false);
  const [erreurPaiements, setErreurPaiements] = useState<string | null>(null);

  const [formules, setFormules] = useState<FormuleAdminVue[]>([]);
  const [parametres, setParametres] = useState<ParametresPlateformeVue | null>(null);
  const [chargementAbonnements, setChargementAbonnements] = useState(false);
  const [erreurAbonnements, setErreurAbonnements] = useState<string | null>(null);

  const client = accessToken ? new ClientSuperAdmin(configuration.apiUrl, () => accessToken) : null;

  useEffect(() => {
    (async () => {
      const jeton = lireJetonRafraichissement();
      if (!jeton) {
        setEcran("connexion");
        return;
      }
      try {
        const session = await rafraichirSession(
          { url: configuration.supabaseUrl, anonKey: configuration.supabaseAnonKey },
          jeton
        );
        ecrireJetonRafraichissement(session.refreshToken);
        setAccessToken(session.accessToken);
        setEcran("application");
      } catch {
        oublierJetonRafraichissement();
        setEcran("connexion");
      }
    })();
  }, []);

  async function chargerHotels(clientCourant: ClientSuperAdmin) {
    setChargementHotels(true);
    setErreurHotels(null);
    try {
      setHotels(await clientCourant.listerHotels());
    } catch (erreur) {
      setErreurHotels(erreur instanceof Error ? erreur.message : "Erreur de chargement.");
    } finally {
      setChargementHotels(false);
    }
  }

  useEffect(() => {
    if (client) chargerHotels(client);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  async function chargerPaiements(clientCourant: ClientSuperAdmin) {
    setChargementPaiements(true);
    setErreurPaiements(null);
    try {
      setPaiements(await clientCourant.listerPaiementsAbonnement(100));
    } catch (erreur) {
      setErreurPaiements(erreur instanceof Error ? erreur.message : "Impossible de charger les paiements.");
    } finally {
      setChargementPaiements(false);
    }
  }

  // La liste des paiements se recharge à chaque ouverture de l'onglet (elle change sans cesse : paiements en cours, confirmations).
  useEffect(() => {
    if (client && onglet === "paiements") void chargerPaiements(client);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, onglet]);

  async function chargerAbonnements(clientCourant: ClientSuperAdmin) {
    setChargementAbonnements(true);
    setErreurAbonnements(null);
    try {
      const [listeFormules, reglages] = await Promise.all([clientCourant.listerFormules(), clientCourant.lireParametresAbonnement()]);
      setFormules(listeFormules);
      setParametres(reglages);
    } catch (erreur) {
      setErreurAbonnements(erreur instanceof Error ? erreur.message : "Impossible de charger les formules et les réglages.");
    } finally {
      setChargementAbonnements(false);
    }
  }

  // Les formules servent aussi à nommer celle de chaque hôtel et de chaque paiement : on les charge dès la connexion, puis à chaque ouverture de l'onglet.
  useEffect(() => {
    if (client) void chargerAbonnements(client);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, onglet === "abonnements"]);

  /** Les actions sur les formules et les réglages rejettent avec le message du serveur : l'écran l'affiche tel quel. */
  async function creerFormule(dto: DonneesFormule & { code: string }): Promise<void> {
    if (!client) throw new Error("Session expirée. Reconnectez-vous.");
    await client.creerFormule(dto);
    await chargerAbonnements(client);
  }

  async function modifierFormule(code: string, partiel: Partial<Omit<DonneesFormule, "code">>): Promise<void> {
    if (!client) throw new Error("Session expirée. Reconnectez-vous.");
    await client.modifierFormule(code, partiel);
    await chargerAbonnements(client);
  }

  async function supprimerFormule(code: string): Promise<void> {
    if (!client) throw new Error("Session expirée. Reconnectez-vous.");
    await client.supprimerFormule(code);
    await chargerAbonnements(client);
  }

  async function enregistrerParametres(partiel: Partial<ParametresPlateformeVue>): Promise<void> {
    if (!client) throw new Error("Session expirée. Reconnectez-vous.");
    setParametres(await client.modifierParametresAbonnement(partiel));
  }

  /** Attribue une formule à un hôtel sans paiement. `true` si c'est enregistré. */
  async function changerFormuleHotel(hotelId: string, formule: string | null): Promise<boolean> {
    if (!client) return false;
    setErreurHotels(null);
    try {
      await client.changerFormuleHotel(hotelId, formule);
      await Promise.all([chargerHotels(client), chargerAbonnements(client)]);
      return true;
    } catch (erreur) {
      setErreurHotels(erreur instanceof Error ? erreur.message : "Erreur lors du changement de formule.");
      return false;
    }
  }

  /** Revérifie auprès de ScanLinkPay. Un paiement crédité change la validité de l'hôtel : on recharge aussi la liste des hôtels. */
  async function reverifierPaiement(id: string): Promise<"credite" | "toujours"> {
    if (!client) throw new Error("Session expirée. Reconnectez-vous.");
    const resultat = await client.reverifierPaiementAbonnement(id);
    await Promise.all([chargerPaiements(client), chargerHotels(client)]);
    return resultat.statut === "REUSSI" ? "credite" : "toujours";
  }

  /** Connexion par numéro (ou e-mail d'un ancien compte) via le relais de
   * l'API (15/10/2026) : le serveur traduit le numéro en compte Supabase. */
  async function seConnecter(identifiant: string, motDePasse: string) {
    setErreurConnexion(null);
    setConnexionEnCours(true);
    try {
      const session = await connecterViaApi([configuration.apiUrl], identifiant, motDePasse);
      ecrireJetonRafraichissement(session.refreshToken);
      setAccessToken(session.accessToken);
      setEcran("application");
    } catch (erreur) {
      setErreurConnexion(erreur instanceof Error ? erreur.message : "Erreur de connexion.");
    } finally {
      setConnexionEnCours(false);
    }
  }

  function seDeconnecter() {
    oublierJetonRafraichissement();
    setAccessToken(null);
    setHotels([]);
    setPaiements([]);
    setFormules([]);
    setParametres(null);
    setOnglet("hotels");
    setEcran("connexion");
  }

  async function creerHotel(dto: DonneesCreationHotel) {
    if (!client) return;
    setErreurCreation(null);
    setCreationEnCours(true);
    try {
      await client.creerHotel(dto);
      await chargerHotels(client);
    } catch (erreur) {
      setErreurCreation(erreur instanceof Error ? erreur.message : "Erreur lors de la création.");
    } finally {
      setCreationEnCours(false);
    }
  }

  /** Retourne `true` si le statut a été enregistré (EcranHotels affiche alors la confirmation). */
  async function changerStatut(id: string, statutLicence: StatutLicence): Promise<boolean> {
    if (!client) return false;
    setErreurHotels(null);
    try {
      await client.changerStatutHotel(id, statutLicence);
      await chargerHotels(client);
      return true;
    } catch (erreur) {
      setErreurHotels(erreur instanceof ErreurApi ? erreur.message : "Erreur lors du changement de statut.");
      return false;
    }
  }

  /** Retourne `true` en cas de succès — EcranHotels ferme le formulaire
   * uniquement dans ce cas (voir FormulairePaiement, Phase 12). */
  async function modifierPatron(hotelId: string, dto: { telephone?: string; motDePasse?: string }): Promise<boolean> {
    if (!client) return false;
    setErreurPatron(null);
    setPatronEnCours(true);
    try {
      await client.modifierPatron(hotelId, dto);
      await chargerHotels(client);
      return true;
    } catch (erreur) {
      setErreurPatron(erreur instanceof Error ? erreur.message : "Modification impossible.");
      return false;
    } finally {
      setPatronEnCours(false);
    }
  }

  /** Hôtels supprimés automatiquement (essais abandonnés, 18/10/2026). */
  async function listerHotelsSupprimes() {
    if (!client) throw new Error("Session expirée : reconnectez-vous.");
    return client.listerHotelsSupprimes();
  }

  /** Paiements d'un hôtel (annulés compris) et annulation d'une saisie manuelle (17/10/2026). */
  async function listerPaiements(hotelId: string) {
    if (!client) throw new Error("Session expirée : reconnectez-vous.");
    return client.listerPaiements(hotelId);
  }

  async function annulerPaiement(hotelId: string, paiementId: string, motif: string) {
    if (!client) throw new Error("Session expirée : reconnectez-vous.");
    const liste = await client.annulerPaiement(hotelId, paiementId, motif);
    // Validité et statut ont pu changer : la liste des hôtels se met à jour derrière la fenêtre.
    void chargerHotels(client);
    return liste;
  }

  async function enregistrerPaiement(hotelId: string, dto: DonneesEnregistrementPaiement): Promise<boolean> {
    if (!client) return false;
    setErreurPaiement(null);
    setPaiementEnCours(true);
    try {
      await client.enregistrerPaiement(hotelId, dto);
      await chargerHotels(client);
      return true;
    } catch (erreur) {
      setErreurPaiement(erreur instanceof Error ? erreur.message : "Erreur lors de l'enregistrement du paiement.");
      return false;
    } finally {
      setPaiementEnCours(false);
    }
  }

  /** Retourne `true` en cas de succès — FormulaireDomaine reste ouvert dans
   * tous les cas (contrairement à FormulairePaiement) : après un ajout
   * réussi, il continue d'afficher le domaine + les actions Vérifier/Retirer. */
  async function ajouterDomaine(hotelId: string, dto: DonneesAjoutDomaine): Promise<boolean> {
    if (!client) return false;
    setErreurDomaine(null);
    setDomaineEnCours(true);
    try {
      await client.ajouterDomaine(hotelId, dto);
      await chargerHotels(client);
      return true;
    } catch (erreur) {
      setErreurDomaine(erreur instanceof Error ? erreur.message : "Erreur lors de l'ajout du domaine.");
      return false;
    } finally {
      setDomaineEnCours(false);
    }
  }

  async function verifierDomaine(hotelId: string): Promise<void> {
    if (!client) return;
    setErreurDomaine(null);
    setDomaineEnCours(true);
    try {
      await client.verifierDomaine(hotelId);
      await chargerHotels(client);
    } catch (erreur) {
      setErreurDomaine(erreur instanceof Error ? erreur.message : "Erreur lors de la vérification du domaine.");
    } finally {
      setDomaineEnCours(false);
    }
  }

  /** Retourne `true` si le domaine a été retiré (sinon la fenêtre reste ouverte avec le message d'erreur). */
  async function retirerDomaine(hotelId: string): Promise<boolean> {
    if (!client) return false;
    setErreurDomaine(null);
    setDomaineEnCours(true);
    try {
      await client.retirerDomaine(hotelId);
      await chargerHotels(client);
      return true;
    } catch (erreur) {
      setErreurDomaine(erreur instanceof Error ? erreur.message : "Erreur lors du retrait du domaine.");
      return false;
    } finally {
      setDomaineEnCours(false);
    }
  }

  if (ecran === "chargement") {
    return (
      <div className="page-centree">
        <p role="status" className="chargement">
          Chargement…
        </p>
      </div>
    );
  }

  if (ecran === "connexion") {
    return <EcranConnexion erreur={erreurConnexion} enCours={connexionEnCours} onConnexion={seConnecter} />;
  }

  if (onglet === "paiements") {
    return (
      <EcranPaiements
        paiements={paiements}
        formules={formules}
        chargement={chargementPaiements}
        erreur={erreurPaiements}
        onActualiser={() => client && void chargerPaiements(client)}
        onReverifier={reverifierPaiement}
        onChangerOnglet={setOnglet}
        onDeconnexion={seDeconnecter}
      />
    );
  }

  if (onglet === "abonnements") {
    return (
      <EcranAbonnements
        formules={formules}
        parametres={parametres}
        chargement={chargementAbonnements}
        erreur={erreurAbonnements}
        onActualiser={() => client && void chargerAbonnements(client)}
        onCreerFormule={creerFormule}
        onModifierFormule={modifierFormule}
        onSupprimerFormule={supprimerFormule}
        onEnregistrerParametres={enregistrerParametres}
        onChangerOnglet={setOnglet}
        onDeconnexion={seDeconnecter}
      />
    );
  }

  return (
    <EcranHotels
      onChangerOnglet={setOnglet}
      hotels={hotels}
      formules={formules}
      onChangerFormule={changerFormuleHotel}
      chargement={chargementHotels}
      erreur={erreurHotels}
      creationEnCours={creationEnCours}
      erreurCreation={erreurCreation}
      onCreerHotel={creerHotel}
      onChangerStatut={changerStatut}
      onEnregistrerPaiement={enregistrerPaiement}
      paiementEnCours={paiementEnCours}
      erreurPaiement={erreurPaiement}
      onAjouterDomaine={ajouterDomaine}
      onVerifierDomaine={verifierDomaine}
      onRetirerDomaine={retirerDomaine}
      domaineEnCours={domaineEnCours}
      erreurDomaine={erreurDomaine}
      onModifierPatron={modifierPatron}
      onListerPaiements={listerPaiements}
      onListerSupprimes={listerHotelsSupprimes}
      onAnnulerPaiement={annulerPaiement}
      patronEnCours={patronEnCours}
      erreurPatron={erreurPatron}
      onDeconnexion={seDeconnecter}
    />
  );
}
