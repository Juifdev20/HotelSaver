import * as React from "react";
import { Link } from "react-router-dom";
import { FORMULES, MOIS_OFFERTS, moisFactures, montantAbonnement, prixAbonnement } from "@hotel-chicago/regles";
import { Apparition } from "./animations";
import { EnteteSection } from "./Sections";
import { ETAPES_ABONNEMENT } from "./donnees";

/** Durée d'achat qui donne des mois offerts (12 mois = 10 payés). */
const MOIS_ANNEE = 12;
const MOIS_PAYES_ANNEE = moisFactures(MOIS_ANNEE);

export function Tarifs() {
  const anneeOfferte = (MOIS_OFFERTS[MOIS_ANNEE] ?? 0) > 0;
  return (
    <section id="tarifs" className="section">
      <EnteteSection
        etiquette="Tarifs"
        titre="Un abonnement simple, sans surprise"
        texte="14 jours d'essai gratuit sur toutes les formules. Paiement par Mobile Money (M-Pesa, Airtel Money, Orange Money, Africell) directement dans l'application, sans carte bancaire. Aucun prélèvement automatique."
      />
      <div className="formules">
        {FORMULES.map((f, i) => (
          <Apparition key={f.code} delai={i * 0.1}>
            <article className={`formule ${f.recommandee ? "formule--recommandee" : ""}`}>
              {f.recommandee && <span className="formule__ruban">Le plus choisi</span>}
              <h3>{f.nom}</h3>
              <p className="formule__description">{f.description}</p>
              <p className="formule__prix">
                <strong>{montantAbonnement(prixAbonnement({ formule: f.code, mois: 1, devise: "USD" }), "USD")}</strong>
                <span> / mois</span>
              </p>
              {anneeOfferte && (
                <p className="formule__annuel">
                  ou {montantAbonnement(prixAbonnement({ formule: f.code, mois: MOIS_ANNEE, devise: "USD" }), "USD")} par an
                  <span> ({MOIS_ANNEE} mois pour le prix de {MOIS_PAYES_ANNEE})</span>
                </p>
              )}
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

      <div className="abonnement-etapes">
        <Apparition>
          <h3 className="abonnement-etapes__titre">Comment ça marche</h3>
        </Apparition>
        <ol className="etapes">
          {ETAPES_ABONNEMENT.map((e, i) => (
            <Apparition key={e.titre} delai={i * 0.12}>
              <li className="etape">
                <span className="etape__numero">{i + 1}</span>
                <h4>{e.titre}</h4>
                <p>{e.texte}</p>
              </li>
            </Apparition>
          ))}
        </ol>
      </div>
    </section>
  );
}
