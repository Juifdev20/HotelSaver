import * as React from "react";
import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { inscrireHotel, obtenirInfoPublique } from "@hotel-chicago/api-client";
import type { InfoHotelPublique, InscriptionHotelPayload } from "@hotel-chicago/types";
import { configuration } from "./config";
import { resoudreSousDomaine } from "./resoudreSousDomaine";
import { appliquerPalette } from "./appliquerPalette";
import { EcranInscription } from "./EcranInscription";
import { EcranSucces } from "./EcranSucces";
import { EcranConnexionWeb, EcranMotDePasseOublie, EcranReinitialisation } from "./auth/EcransMotDePasse";
import { EcranAccueil } from "./EcranAccueil";
import { BarreMarketing } from "./accueil/BarreMarketing";
import { SiteHotel } from "./hotel/SiteHotel";

function EcranInscriptionAvecEtat() {
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [emailInscrit, setEmailInscrit] = useState<string | null>(null);

  async function sInscrire(dto: InscriptionHotelPayload) {
    setErreur(null);
    setEnCours(true);
    try {
      await inscrireHotel({ url: configuration.apiUrl }, dto);
      setEmailInscrit(dto.email);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur lors de l'inscription.");
    } finally {
      setEnCours(false);
    }
  }

  if (emailInscrit) return <EcranSucces email={emailInscrit} />;
  return <EcranInscription erreur={erreur} enCours={enCours} onSoumettre={sInscrire} />;
}

/** Vitrine HotelSaver (plateforme) : accueil marketing + inscription d'un hôtel. */
function SiteMarketing() {
  const { pathname } = useLocation();
  const surVitrine = ["/", "/inscription", "/connexion", "/mot-de-passe-oublie", "/reinitialiser-mot-de-passe"].includes(pathname);
  return (
    <>
      {surVitrine && <BarreMarketing />}
      <Routes>
        <Route path="/" element={<EcranAccueil />} />
        <Route path="/inscription" element={<EcranInscriptionAvecEtat />} />
        <Route path="/connexion" element={<EcranConnexionWeb />} />
        <Route path="/mot-de-passe-oublie" element={<EcranMotDePasseOublie />} />
        <Route path="/reinitialiser-mot-de-passe" element={<EcranReinitialisation />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

type EtatSite = { type: "chargement" } | { type: "marketing" } | { type: "hotel"; info: InfoHotelPublique; sousDomaine: string };

function Chargement() {
  return (
    <div className="chargement-site" role="status" aria-label="Chargement">
      <span />
    </div>
  );
}

/** Un même site, deux visages : si l'adresse correspond à un hôtel (sous-domaine,
 * domaine personnalisé ou `?hotel=`), on affiche SON site, à sa charte ; sinon
 * (ou si l'API ne connaît pas cet hôte) la vitrine HotelSaver.
 *
 * react-router-dom est introduit ici volontairement (Phase 9, voir
 * DECISIONS.md) : plusieurs pages indépendantes et partageables par URL. */
export default function App() {
  const sousDomaine = resoudreSousDomaine();
  const [etat, setEtat] = useState<EtatSite>(sousDomaine ? { type: "chargement" } : { type: "marketing" });

  useEffect(() => {
    if (!sousDomaine) return;
    let annule = false;
    (async () => {
      try {
        const info = await obtenirInfoPublique({ url: configuration.apiUrl }, sousDomaine);
        if (annule) return;
        appliquerPalette(info.palette);
        setEtat({ type: "hotel", info, sousDomaine });
      } catch {
        // Hôte inconnu, suspendu ou API injoignable : on montre la vitrine
        // HotelSaver plutôt qu'une page blanche.
        if (!annule) setEtat({ type: "marketing" });
      }
    })();
    return () => {
      annule = true;
    };
  }, [sousDomaine]);

  return (
    <BrowserRouter>
      {etat.type === "chargement" && <Chargement />}
      {etat.type === "marketing" && <SiteMarketing />}
      {etat.type === "hotel" && <SiteHotel info={etat.info} sousDomaine={etat.sousDomaine} />}
    </BrowserRouter>
  );
}
