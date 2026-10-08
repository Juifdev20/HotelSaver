import * as React from "react";
import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import type { InfoHotelPublique } from "@hotel-chicago/types";
import { cheminHotel } from "../resoudreSousDomaine";

function initiales(nom: string): string {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m[0]!.toUpperCase())
    .join("");
}

/** Barre de l'hôtel : transparente sur le hero de l'accueil, pleine ailleurs
 * ou dès qu'on défile. Les ancres (services, galerie, contact) ne vivent que
 * sur l'accueil. */
export function BarreHotel({ info }: { info: InfoHotelPublique }) {
  const { pathname } = useLocation();
  const surAccueil = pathname === "/";
  const [defile, setDefile] = useState(false);
  const [ouvert, setOuvert] = useState(false);

  useEffect(() => {
    const surDefilement = () => setDefile(window.scrollY > 40);
    surDefilement();
    window.addEventListener("scroll", surDefilement, { passive: true });
    return () => window.removeEventListener("scroll", surDefilement);
  }, []);

  useEffect(() => setOuvert(false), [pathname]);

  const transparente = surAccueil && !defile && !ouvert;
  const ancre = (id: string) => (surAccueil ? `#${id}` : cheminHotel(`/#${id}`));

  return (
    <nav className={`hotel-nav ${transparente ? "hotel-nav--transparente" : ""}`} aria-label="Navigation de l'hôtel">
      <div className="hotel-nav__interieur">
        <Link to={cheminHotel("/")} className="hotel-nav__marque">
          {info.logoUrl ? (
            <img src={info.logoUrl} alt="" className="hotel-nav__logo" />
          ) : (
            <span className="hotel-nav__monogramme">{initiales(info.nom)}</span>
          )}
          <span className="hotel-nav__nom">{info.nom}</span>
        </Link>

        <div className={`hotel-nav__liens ${ouvert ? "hotel-nav__liens--ouvert" : ""}`}>
          <NavLink to={cheminHotel("/chambres")}>Chambres</NavLink>
          {info.services.length > 0 && <a href={ancre("services")}>Services</a>}
          {info.galerie.length > 0 && <a href={ancre("galerie")}>Galerie</a>}
          <NavLink to={cheminHotel("/menu")}>Menu</NavLink>
          {info.commandeWebActivee && <NavLink to={cheminHotel("/cuisine")}>Cuisine</NavLink>}
          <a href={ancre("contact")}>Contact</a>
          <Link to={cheminHotel("/chambres")} className="hotel-bouton hotel-bouton--primaire hotel-nav__cta">
            Réserver
          </Link>
        </div>

        <button
          type="button"
          className="hotel-nav__burger"
          aria-label={ouvert ? "Fermer le menu" : "Ouvrir le menu"}
          aria-expanded={ouvert}
          onClick={() => setOuvert((o) => !o)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>
    </nav>
  );
}
