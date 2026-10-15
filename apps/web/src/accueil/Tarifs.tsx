import * as React from "react";
import { Link } from "react-router-dom";
import { montantAbonnement } from "@hotel-chicago/regles";
import type { FormuleProposee, FormulesPubliques } from "@hotel-chicago/types";
import { configuration } from "../config";
import { Apparition } from "./animations";
import { EnteteSection } from "./Sections";
import { ContactWhatsApp } from "./ContactWhatsApp";
import { ETAPES_ABONNEMENT } from "./donnees";
import { useFormulesPubliques } from "./useFormules";

/** Durée d'achat qui donne des mois offerts (12 mois pour le prix de 12 − N). */
const MOIS_ANNEE = 12;

function CarteFormule({ f, parametres }: { f: FormuleProposee; parametres: FormulesPubliques["parametres"] }) {
  const mensuel = f.durees.find((d) => d.mois === 1);
  const annuel = f.durees.find((d) => d.mois === MOIS_ANNEE);
  const moisOfferts = annuel ? annuel.moisOfferts || parametres.moisOffertsAnnuel : 0;
  return (
    <article className={`formule ${f.recommandee ? "formule--recommandee" : ""}`}>
      {f.recommandee && <span className="formule__ruban">Le plus choisi</span>}
      <h3>{f.nom}</h3>
      <p className="formule__description">{f.description}</p>
      <p className="formule__prix">
        <strong>{montantAbonnement(f.prixMensuelUsd, "USD")}</strong>
        <span> / mois</span>
      </p>
      {mensuel && mensuel.prixCdf > 0 && <p className="formule__cdf">soit {montantAbonnement(mensuel.prixCdf, "CDF")} / mois</p>}
      {annuel && moisOfferts > 0 && (
        <p className="formule__annuel">
          ou {montantAbonnement(annuel.prixUsd, "USD")} par an
          <span>
            {" "}
            ({MOIS_ANNEE} mois pour le prix de {MOIS_ANNEE - moisOfferts})
          </span>
        </p>
      )}
      <ul className="formule__liste">
        {f.inclus.map((ligne) => (
          <li key={ligne}>{ligne}</li>
        ))}
      </ul>
      <p className="formule__essai">{parametres.joursEssai} jours d'essai gratuit</p>
      <Link
        to="/inscription"
        className={`bouton-marketing ${f.recommandee ? "bouton-marketing--primaire" : "bouton-marketing--contour"}`}
        aria-label={`Commencer l'essai gratuit, formule ${f.nom}`}
      >
        Commencer l'essai
      </Link>
    </article>
  );
}

function SqueletteFormule() {
  return <div className="formule formule--squelette" aria-hidden="true" />;
}

export function Tarifs() {
  const { donnees, chargement, secours } = useFormulesPubliques();
  const { parametres } = donnees;

  return (
    <section id="tarifs" className="section" aria-busy={chargement}>
      <EnteteSection
        etiquette="Tarifs"
        titre="Un abonnement simple, sans surprise"
        texte={`${parametres.joursEssai} jours d'essai gratuit sur toutes les formules, sans carte bancaire. Vous payez ensuite par Mobile Money (M-Pesa, Airtel Money, Orange Money, Africell) ou par carte bancaire (Visa, Mastercard), en toute sécurité avec ScanLinkPay. Aucun prélèvement automatique : vous payez quand vous le décidez.`}
      />

      {secours && (
        <p className="tarifs__note" role="status">
          Les tarifs ne se sont pas chargés : ceux-ci sont indicatifs. Demandez-nous confirmation sur WhatsApp, nous répondons vite.
        </p>
      )}

      <div className="formules">
        {chargement
          ? [0, 1, 2].map((i) => <SqueletteFormule key={i} />)
          : donnees.formules.map((f, i) => (
              <Apparition key={f.code} delai={i * 0.1}>
                <CarteFormule f={f} parametres={parametres} />
              </Apparition>
            ))}
      </div>
      {!chargement && parametres.tauxCdf > 0 && (
        <p className="tarifs__note">Les prix en francs congolais suivent le taux du jour de HotelSaver : 1 $ = {montantAbonnement(parametres.tauxCdf, "CDF")}.</p>
      )}

      <Apparition>
        <aside className="scanlinkpay-carte" aria-label="Paiement avec ScanLinkPay">
          <h3>Payer simplement avec ScanLinkPay</h3>
          <p>
            ScanLinkPay est l'application de paiement qui vous permet de régler votre abonnement par Mobile Money ou par carte, et de recevoir
            directement sur votre compte les acomptes que vos clients paient en ligne.
          </p>
          {configuration.urlScanLinkPay && (
            <a className="bouton-marketing bouton-marketing--contour" href={configuration.urlScanLinkPay} target="_blank" rel="noopener noreferrer">
              Créer mon compte ScanLinkPay (gratuit)
              <span className="visuellement-cache"> (s'ouvre dans un nouvel onglet)</span>
            </a>
          )}
        </aside>
      </Apparition>

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

      <ContactWhatsApp className="contact-whatsapp--centre" />
    </section>
  );
}
