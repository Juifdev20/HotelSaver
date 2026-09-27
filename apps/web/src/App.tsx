import * as React from "react";
import { useEffect, useState } from "react";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { inscrireHotel, obtenirInfoPublique } from "@hotel-chicago/api-client";
import type { InscriptionHotelPayload } from "@hotel-chicago/types";
import { configuration } from "./config";
import { resoudreSousDomaine } from "./resoudreSousDomaine";
import { appliquerPalette } from "./appliquerPalette";
import { EcranInscription } from "./EcranInscription";
import { EcranSucces } from "./EcranSucces";
import { EcranChambresPubliques } from "./EcranChambresPubliques";
import { EcranMenuPublique } from "./EcranMenuPublique";

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

/** Pas de sous-domaine résolvable (ex. "localhost" nu, sans ?hotel=) : les
 * pages propres à un hôtel n'ont rien à afficher — voir resoudreSousDomaine.ts. */
function PageSansHotel() {
  return (
    <div className="page">
      <p>
        Aucun hôtel identifié. Ajoutez <code>?hotel=&lt;sous-domaine&gt;</code> à l'URL, ou visitez cette page depuis
        le sous-domaine de l'hôtel.
      </p>
    </div>
  );
}

function BarreNavigation() {
  return (
    <nav className="barre-navigation">
      <Link to="/">Créer un compte hôtel</Link>
      <Link to="/chambres">Chambres</Link>
      <Link to="/menu">Menu</Link>
    </nav>
  );
}

/** react-router-dom introduit ici volontairement (Phase 9, voir
 * DECISIONS.md) : contrairement à mobile/desktop/super-admin (un flux
 * séquentiel, aiguillage par état suffisant), ce site a plusieurs pages
 * indépendantes et partageables par URL. */
export default function App() {
  const sousDomaine = resoudreSousDomaine();

  // Charte graphique dynamique par hôtel (Phase 11) : ne bloque jamais le
  // rendu de la page — le thème générique de packages/ui reste un repli
  // correct tant que la palette n'est pas (ou pas encore) appliquée.
  useEffect(() => {
    if (!sousDomaine) return;
    let annule = false;
    (async () => {
      try {
        const info = await obtenirInfoPublique({ url: configuration.apiUrl }, sousDomaine);
        if (!annule) appliquerPalette(info.palette);
      } catch {
        // Repli silencieux sur le thème générique.
      }
    })();
    return () => {
      annule = true;
    };
  }, [sousDomaine]);

  return (
    <BrowserRouter>
      <BarreNavigation />
      <Routes>
        <Route path="/" element={<EcranInscriptionAvecEtat />} />
        <Route
          path="/chambres"
          element={sousDomaine ? <EcranChambresPubliques sousDomaine={sousDomaine} /> : <PageSansHotel />}
        />
        <Route path="/menu" element={sousDomaine ? <EcranMenuPublique sousDomaine={sousDomaine} /> : <PageSansHotel />} />
      </Routes>
    </BrowserRouter>
  );
}
