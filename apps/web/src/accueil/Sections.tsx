import * as React from "react";
import { Apparition, Compteur } from "./animations";
import { Icone } from "./Icone";
import { BLOCS_DETAIL, CHIFFRES, ETAPES, FONCTIONNALITES } from "./donnees";
import type { NomVisuel } from "./donnees";

export function Chiffres() {
  return (
    <section className="chiffres" aria-label="En bref">
      <div className="chiffres__interieur">
        {CHIFFRES.map((c, i) => (
          <Apparition key={c.libelle} delai={i * 0.08} className="chiffres__item">
            <strong className="chiffres__valeur">
              <Compteur valeur={c.valeur} />
            </strong>
            <span className="chiffres__libelle">{c.libelle}</span>
          </Apparition>
        ))}
      </div>
    </section>
  );
}

export function EnteteSection({ etiquette, titre, texte }: { etiquette: string; titre: string; texte?: string }) {
  return (
    <Apparition className="entete-section">
      <span className="entete-section__etiquette">{etiquette}</span>
      <h2 className="entete-section__titre">{titre}</h2>
      {texte && <p className="entete-section__texte">{texte}</p>}
    </Apparition>
  );
}

export function Fonctionnalites() {
  return (
    <section id="fonctionnalites" className="section">
      <EnteteSection
        etiquette="Fonctionnalités"
        titre="Tout ce qu'il faut pour faire tourner votre hôtel"
        texte="Un seul outil, des rôles clairs, et des données qui restent justes même sans internet."
      />
      <div className="grille-fonctions">
        {FONCTIONNALITES.map((f, i) => (
          <Apparition key={f.titre} delai={(i % 3) * 0.08}>
            <article className="fonction">
              <span className="fonction__icone">
                <Icone nom={f.icone} />
              </span>
              <h3>{f.titre}</h3>
              <p>{f.texte}</p>
            </article>
          </Apparition>
        ))}
      </div>
    </section>
  );
}

function Visuel({ type }: { type: NomVisuel }) {
  if (type === "reception") {
    return (
      <div className="visuel" aria-hidden="true">
        <div className="visuel__titre">Arrivées du jour</div>
        {["M. Kabila · Ch. 102", "Mme Amani · Ch. 205", "M. Lukusa · Ch. 108"].map((l, i) => (
          <div key={l} className="visuel__ligne">
            <span>{l}</span>
            <span className={`visuel__tag ${i === 0 ? "visuel__tag--ok" : ""}`}>{i === 0 ? "Enregistré" : "Attendu"}</span>
          </div>
        ))}
        <div className="visuel__total">
          <span>Solde à payer</span>
          <strong>120,00 $</strong>
        </div>
      </div>
    );
  }
  if (type === "cafeteria") {
    return (
      <div className="visuel" aria-hidden="true">
        <div className="visuel__titre">Compte · Table 4</div>
        {[
          ["Bière locale ×2", "4,00 $"],
          ["Brochettes ×1", "6,00 $"],
          ["Eau minérale ×3", "3,00 $"],
        ].map(([a, b]) => (
          <div key={a} className="visuel__ligne">
            <span>{a}</span>
            <span>{b}</span>
          </div>
        ))}
        <div className="visuel__total">
          <span>Total</span>
          <strong>13,00 $</strong>
        </div>
      </div>
    );
  }
  return (
    <div className="visuel" aria-hidden="true">
      <div className="visuel__titre">Synchronisation</div>
      <div className="visuel__ligne">
        <span>Réseau</span>
        <span className="visuel__tag visuel__tag--alerte">Hors ligne</span>
      </div>
      <div className="visuel__ligne">
        <span>3 modifications en attente</span>
        <span className="visuel__tag">En file</span>
      </div>
      <div className="visuel__barre">
        <span />
      </div>
      <div className="visuel__ligne">
        <span>Réseau rétabli</span>
        <span className="visuel__tag visuel__tag--ok">Synchronisé</span>
      </div>
    </div>
  );
}

export function BlocsDetail() {
  return (
    <section className="section section--large">
      {BLOCS_DETAIL.map((b, i) => (
        <div key={b.etiquette} className={`detail ${i % 2 ? "detail--inverse" : ""}`}>
          <Apparition direction={i % 2 ? "droite" : "gauche"} className="detail__texte">
            <span className="entete-section__etiquette">{b.etiquette}</span>
            <h3 className="detail__titre">{b.titre}</h3>
            <p>{b.texte}</p>
            <ul className="detail__points">
              {b.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </Apparition>
          <Apparition direction={i % 2 ? "gauche" : "droite"} className="detail__visuel">
            <Visuel type={b.visuel} />
          </Apparition>
        </div>
      ))}
    </section>
  );
}

export function Etapes() {
  return (
    <section className="section section--alt">
      <EnteteSection etiquette="Démarrage" titre="Prêt en trois étapes" />
      <ol className="etapes">
        {ETAPES.map((e, i) => (
          <Apparition key={e.titre} delai={i * 0.12}>
            <li className="etape">
              <span className="etape__numero">{i + 1}</span>
              <h3>{e.titre}</h3>
              <p>{e.texte}</p>
            </li>
          </Apparition>
        ))}
      </ol>
    </section>
  );
}
