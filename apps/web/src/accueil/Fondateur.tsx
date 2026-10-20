import * as React from "react";
import { useState } from "react";
import { formaterTelephone, lienWhatsApp } from "@hotel-chicago/regles";
import { Apparition } from "./animations";
import { EnteteSection } from "./Sections";
import { FONDATEUR } from "./donnees";
import { useFormulesPubliques } from "./useFormules";

function initiales(nom: string): string {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((mot) => mot[0]!.toUpperCase())
    .join("");
}

/** « Le créateur de HotelSaver » : photo, nom, titre et mot du fondateur. Le contenu vit dans donnees.ts (FONDATEUR) ; la photo est le fichier
 * `public/fondateur.jpg`. Si la photo manque ou ne se charge pas, ses initiales s'affichent à la place : jamais d'image cassée. */
export function Fondateur() {
  const [photoCassee, setPhotoCassee] = useState(false);
  const { donnees } = useFormulesPubliques();
  const numero = donnees.contact.whatsapp;

  return (
    <section id="createur" className="section section--alt" aria-labelledby="createur-titre">
      <EnteteSection etiquette="Le créateur" titre="Une application faite par quelqu'un qui connaît votre métier" />
      <Apparition>
        <article className="fondateur">
          <div className="fondateur__photo">
            {photoCassee ? (
              <span className="fondateur__initiales" aria-hidden="true">
                {initiales(FONDATEUR.nom)}
              </span>
            ) : (
              <img src={FONDATEUR.photo} alt={`${FONDATEUR.nom}, ${FONDATEUR.titre} de HotelSaver`} width={320} height={320} loading="lazy" onError={() => setPhotoCassee(true)} />
            )}
          </div>
          <div className="fondateur__texte">
            <h3 id="createur-titre" className="fondateur__nom">
              {FONDATEUR.nom}
            </h3>
            <p className="fondateur__titre">{FONDATEUR.titre}</p>
            {FONDATEUR.paragraphes.map((p) => (
              <p key={p} className="fondateur__paragraphe">
                {p}
              </p>
            ))}
            {numero && (
              <a
                className="bouton-marketing bouton-marketing--contour fondateur__contact"
                href={lienWhatsApp(numero, `Bonjour ${FONDATEUR.nom.split(" ")[0]}, j'ai une question sur HotelSaver`)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Écrivez-moi sur WhatsApp {formaterTelephone(numero)}
                <span className="visuellement-cache"> (s'ouvre dans un nouvel onglet)</span>
              </a>
            )}
          </div>
        </article>
      </Apparition>
    </section>
  );
}
