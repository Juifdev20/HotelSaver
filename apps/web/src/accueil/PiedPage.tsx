import * as React from "react";
import { Link } from "react-router-dom";
import { Apparition } from "./animations";

export function AppelFinal() {
  return (
    <section className="appel-final">
      <Apparition className="appel-final__interieur">
        <h2>Prêt à simplifier la gestion de votre hôtel ?</h2>
        <p>Créez votre compte en quelques minutes. 14 jours d'essai, sans carte bancaire.</p>
        <Link to="/inscription" className="bouton-marketing bouton-marketing--clair bouton-marketing--grand">
          Créer le compte de mon hôtel
        </Link>
      </Apparition>
    </section>
  );
}

export function PiedPage() {
  return (
    <footer className="pied">
      <div className="pied__interieur">
        <div className="pied__marque">
          <img src="/logo-hotelsaver.png" alt="" width="28" height="28" />
          <span>HotelSaver</span>
        </div>
        <nav className="pied__liens" aria-label="Pied de page">
          <a href="#fonctionnalites">Fonctionnalités</a>
          <a href="#application">Application</a>
          <a href="#hotels">Hôtels</a>
          <a href="#tarifs">Tarifs</a>
          <a href="#faq">FAQ</a>
          <Link to="/inscription">Créer un compte</Link>
        </nav>
        <small>© {new Date().getFullYear()} HotelSaver. Tous droits réservés.</small>
      </div>
    </footer>
  );
}
