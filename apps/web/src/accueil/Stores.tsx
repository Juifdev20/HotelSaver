import * as React from "react";
import { useState } from "react";
import { BellRing, Cloud, ShieldCheck } from "lucide-react";
import { configuration } from "../config";
import { Apparition } from "./animations";
import { MaquetteTelephone } from "./MaquetteTelephone";

interface BoutonStoreProps {
  /** Lien de la fiche de l'application (variable VITE_URL_*) ; null = pas encore publiée. */
  url: string | null;
  /** Badge officiel du store (public/stores/). */
  image: string;
  libelle: string;
  nomStore: string;
}

/** Badge de store. Avec un lien renseigné : vrai lien, ouvert dans un nouvel
 * onglet. Sans lien (application pas encore publiée) : le bouton reste
 * cliquable et le dit honnêtement, au lieu de pointer vers une page vide. */
function BoutonStore({ url, image, libelle, nomStore }: BoutonStoreProps) {
  const [bientot, setBientot] = useState(false);

  const contenu = <img src={image} alt="" draggable={false} />;

  if (url) {
    return (
      <a className="badge-store" href={url} target="_blank" rel="noopener noreferrer" aria-label={libelle}>
        {contenu}
      </a>
    );
  }
  return (
    <span className="badge-store-conteneur">
      <button type="button" className="badge-store" onClick={() => setBientot(true)} aria-label={libelle}>
        {contenu}
      </button>
      {bientot && (
        <span className="badge-store__bientot" role="status">
          Bientôt disponible sur {nomStore}
        </span>
      )}
    </span>
  );
}

/** Les deux badges, réutilisés sur l'accueil et après l'inscription. */
export function BoutonsStores() {
  return (
    <div className="badges-stores">
      <BoutonStore url={configuration.urlPlayStore} image="/stores/google-play.png" libelle="Télécharger sur Google Play" nomStore="Google Play" />
      <BoutonStore url={configuration.urlAppStore} image="/stores/app-store.png" libelle="Télécharger sur l'App Store" nomStore="l'App Store" />
    </div>
  );
}

const ATOUTS = [
  { icone: Cloud, titre: "Fonctionne hors ligne", texte: "Tout se synchronise au retour du réseau." },
  { icone: ShieldCheck, titre: "Accès sécurisé", texte: "Un compte par rôle, géré par le patron." },
  { icone: BellRing, titre: "Toujours à jour", texte: "Vos chambres et réservations en direct." },
];

/** Section « Téléchargez notre application mobile » de la page d'accueil. */
export function SectionApplication() {
  return (
    <section id="application" className="application">
      <div className="application__interieur">
        <Apparition direction="gauche" className="application__texte">
          <span className="entete-section__etiquette">Application mobile</span>
          <h2>
            Téléchargez notre <span className="application__accent">application mobile</span>
          </h2>
          <p>Gérez votre réception, votre cafétaria et vos réservations directement depuis votre smartphone, où que vous soyez.</p>
          <BoutonsStores />
          <ul className="application__atouts">
            {ATOUTS.map(({ icone: Icone, titre, texte }) => (
              <li key={titre}>
                <span>
                  <Icone size={20} aria-hidden="true" />
                </span>
                <div>
                  <strong>{titre}</strong>
                  <small>{texte}</small>
                </div>
              </li>
            ))}
          </ul>
        </Apparition>

        <Apparition direction="droite" className="application__visuel">
          <div className="application__blob" aria-hidden="true" />
          <div className="application__telephone">
            <MaquetteTelephone />
          </div>
          <p className="application__mot" aria-hidden="true">
            Votre hôtel, à portée de main !
          </p>
        </Apparition>
      </div>
    </section>
  );
}
