import * as React from "react";
import { useEffect } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import type { InfoHotelPublique } from "@hotel-chicago/types";
import { cheminHotel } from "../resoudreSousDomaine";
import { EcranChambresPubliques } from "../EcranChambresPubliques";
import { EcranCuisinePublique } from "../EcranCuisinePublique";
import { EcranMenuPublique } from "../EcranMenuPublique";
import { EcranSuiviReservation } from "../EcranSuiviReservation";
import { BarreHotel } from "./BarreHotel";
import { AccueilHotel } from "./AccueilHotel";

/** Retour en haut à chaque changement de page (pas pour les ancres `#…`). */
function DefilementHaut() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

function PiedHotel({ info }: { info: InfoHotelPublique }) {
  return (
    <footer className="hotel-pied">
      <div className="hotel-pied__interieur">
        <div>
          <strong>{info.nom}</strong>
          {info.adresse && <p>{info.adresse}</p>}
          {info.telephoneContact && <p>{info.telephoneContact}</p>}
        </div>
        <nav aria-label="Pied de page">
          <Link to={cheminHotel("/chambres")}>Chambres</Link>
          <Link to={cheminHotel("/menu")}>Menu</Link>
          {info.commandeWebActivee && <Link to={cheminHotel("/cuisine")}>Cuisine</Link>}
          <a href={`${cheminHotel("/")}#contact`}>Contact</a>
        </nav>
      </div>
      <p className="hotel-pied__signature">
        © {new Date().getFullYear()} {info.nom} · Site propulsé par <strong>HotelSaver</strong>
      </p>
    </footer>
  );
}

/** Site public d'un hôtel (résolu par sous-domaine). Tout le contenu vient de
 * `GET /public/hotel`, défini par le patron — rien n'est codé en dur ici. */
export function SiteHotel({ info, sousDomaine }: { info: InfoHotelPublique; sousDomaine: string }) {
  useEffect(() => {
    document.title = info.slogan ? `${info.nom} — ${info.slogan}` : info.nom;
  }, [info]);
  const { pathname } = useLocation();

  return (
    <div className={`hotel-site ${pathname === "/" ? "hotel-site--accueil" : ""}`}>
      <DefilementHaut />
      <BarreHotel info={info} />
      <div className="hotel-contenu">
        <Routes>
          <Route path="/" element={<AccueilHotel info={info} sousDomaine={sousDomaine} />} />
          <Route path="/chambres" element={<EcranChambresPubliques sousDomaine={sousDomaine} />} />
          <Route path="/menu" element={<EcranMenuPublique sousDomaine={sousDomaine} />} />
          {info.commandeWebActivee && (
            <Route path="/cuisine" element={<EcranCuisinePublique sousDomaine={sousDomaine} />} />
          )}
          <Route path="/ma-reservation/:jeton" element={<EcranSuiviReservation sousDomaine={sousDomaine} />} />
          <Route path="*" element={<Navigate to={cheminHotel("/")} replace />} />
        </Routes>
      </div>
      <PiedHotel info={info} />
    </div>
  );
}
