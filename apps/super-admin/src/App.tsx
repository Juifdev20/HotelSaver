import * as React from "react";
import { useEffect, useState } from "react";
import { ClientSuperAdmin, ErreurApi, connecterAvecMotDePasse, rafraichirSession } from "@hotel-chicago/api-client";
import type { HotelAvecValidite, StatutLicence } from "@hotel-chicago/types";
import type { DonneesAjoutDomaine, DonneesCreationHotel, DonneesEnregistrementPaiement } from "@hotel-chicago/api-client";
import { configuration } from "./config";
import { ecrireJetonRafraichissement, lireJetonRafraichissement, oublierJetonRafraichissement } from "./stockage";
import { EcranConnexion } from "./EcranConnexion";
import { EcranHotels } from "./EcranHotels";

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

  const [hotels, setHotels] = useState<HotelAvecValidite[]>([]);
  const [chargementHotels, setChargementHotels] = useState(false);
  const [erreurHotels, setErreurHotels] = useState<string | null>(null);
  const [creationEnCours, setCreationEnCours] = useState(false);
  const [erreurCreation, setErreurCreation] = useState<string | null>(null);
  const [paiementEnCours, setPaiementEnCours] = useState(false);
  const [erreurPaiement, setErreurPaiement] = useState<string | null>(null);
  const [domaineEnCours, setDomaineEnCours] = useState(false);
  const [erreurDomaine, setErreurDomaine] = useState<string | null>(null);

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

  async function seConnecter(email: string, motDePasse: string) {
    setErreurConnexion(null);
    setConnexionEnCours(true);
    try {
      const session = await connecterAvecMotDePasse(
        { url: configuration.supabaseUrl, anonKey: configuration.supabaseAnonKey },
        email,
        motDePasse
      );
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

  async function changerStatut(id: string, statutLicence: StatutLicence) {
    if (!client) return;
    try {
      await client.changerStatutHotel(id, statutLicence);
      await chargerHotels(client);
    } catch (erreur) {
      setErreurHotels(erreur instanceof ErreurApi ? erreur.message : "Erreur lors du changement de statut.");
    }
  }

  /** Retourne `true` en cas de succès — EcranHotels ferme le formulaire
   * uniquement dans ce cas (voir FormulairePaiement, Phase 12). */
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

  async function retirerDomaine(hotelId: string): Promise<void> {
    if (!client) return;
    setErreurDomaine(null);
    setDomaineEnCours(true);
    try {
      await client.retirerDomaine(hotelId);
      await chargerHotels(client);
    } catch (erreur) {
      setErreurDomaine(erreur instanceof Error ? erreur.message : "Erreur lors du retrait du domaine.");
    } finally {
      setDomaineEnCours(false);
    }
  }

  if (ecran === "chargement") return null;

  if (ecran === "connexion") {
    return <EcranConnexion erreur={erreurConnexion} enCours={connexionEnCours} onConnexion={seConnecter} />;
  }

  return (
    <EcranHotels
      hotels={hotels}
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
      onDeconnexion={seDeconnecter}
    />
  );
}
