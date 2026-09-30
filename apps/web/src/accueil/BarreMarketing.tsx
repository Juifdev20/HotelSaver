import * as React from "react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

const LIENS = [
  { ancre: "fonctionnalites", libelle: "Fonctionnalités" },
  { ancre: "application", libelle: "Application" },
  { ancre: "hotels", libelle: "Hôtels" },
  { ancre: "tarifs", libelle: "Tarifs" },
  { ancre: "faq", libelle: "FAQ" },
];

/** Barre collante de la vitrine : transparente sur le hero, opaque dès qu'on
 * défile. Les ancres ne fonctionnent que sur `/` ; ailleurs elles y ramènent. */
export function BarreMarketing() {
  const [defile, setDefile] = useState(false);
  const [ouvert, setOuvert] = useState(false);
  const { pathname } = useLocation();
  const surAccueil = pathname === "/";

  useEffect(() => {
    const surDefilement = () => setDefile(window.scrollY > 24);
    surDefilement();
    window.addEventListener("scroll", surDefilement, { passive: true });
    return () => window.removeEventListener("scroll", surDefilement);
  }, []);

  const classes = ["marketing-nav", defile || !surAccueil ? "marketing-nav--pleine" : "", surAccueil ? "" : "marketing-nav--statique"].filter(Boolean).join(" ");

  return (
    <nav className={classes} aria-label="Navigation principale">
      <div className="marketing-nav__interieur">
        <Link to="/" className="marketing-nav__marque" onClick={() => setOuvert(false)}>
          <img src="/logo-hotelsaver.png" alt="" width="32" height="32" />
          <span>HotelSaver</span>
        </Link>

        <div className={`marketing-nav__liens ${ouvert ? "marketing-nav__liens--ouvert" : ""}`}>
          {LIENS.map((l) => (
            <a key={l.ancre} href={surAccueil ? `#${l.ancre}` : `/#${l.ancre}`} onClick={() => setOuvert(false)}>
              {l.libelle}
            </a>
          ))}
          <Link to="/inscription" className="bouton-marketing bouton-marketing--primaire" onClick={() => setOuvert(false)}>
            Essai gratuit
          </Link>
        </div>

        <button
          type="button"
          className="marketing-nav__burger"
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
