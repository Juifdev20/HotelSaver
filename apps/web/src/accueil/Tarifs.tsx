import * as React from "react";
import { Link } from "react-router-dom";
import { Apparition } from "./animations";
import { EnteteSection } from "./Sections";
import { FORMULES } from "./donnees";

export function Tarifs() {
  return (
    <section id="tarifs" className="section">
      <EnteteSection
        etiquette="Tarifs"
        titre="Un abonnement simple, sans surprise"
        texte="14 jours d'essai gratuit sur toutes les formules. Paiement par virement, Mobile Money ou espèces."
      />
      <div className="formules">
        {FORMULES.map((f, i) => (
          <Apparition key={f.nom} delai={i * 0.1}>
            <article className={`formule ${f.recommandee ? "formule--recommandee" : ""}`}>
              {f.recommandee && <span className="formule__ruban">Le plus choisi</span>}
              <h3>{f.nom}</h3>
              <p className="formule__description">{f.description}</p>
              <p className="formule__prix">
                <strong>{f.prix} $</strong>
                <span> / mois</span>
              </p>
              <ul className="formule__liste">
                {f.inclus.map((ligne) => (
                  <li key={ligne}>{ligne}</li>
                ))}
              </ul>
              <Link
                to="/inscription"
                className={`bouton-marketing ${f.recommandee ? "bouton-marketing--primaire" : "bouton-marketing--contour"}`}
              >
                Commencer l'essai
              </Link>
            </article>
          </Apparition>
        ))}
      </div>
    </section>
  );
}
