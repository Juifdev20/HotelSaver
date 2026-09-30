import * as React from "react";

/** Téléphone factice en CSS : aucune image lourde, s'adapte à tout écran. */
export function MaquetteTelephone() {
  const lignes = [
    { n: "101", t: "Double", s: "Occupée", c: "occupee" },
    { n: "102", t: "Simple", s: "Libre", c: "libre" },
    { n: "103", t: "Suite", s: "Réservée", c: "reservee" },
    { n: "104", t: "Double", s: "Libre", c: "libre" },
  ];
  return (
    <div className="telephone" aria-hidden="true">
      <div className="telephone__ecran">
        <div className="telephone__entete">
          <span>Chambres</span>
          <span className="telephone__en-ligne">● En ligne</span>
        </div>
        <div className="telephone__stats">
          <div>
            <strong>12</strong>
            <small>Libres</small>
          </div>
          <div>
            <strong>8</strong>
            <small>Occupées</small>
          </div>
          <div>
            <strong>3</strong>
            <small>Arrivées</small>
          </div>
        </div>
        {lignes.map((l) => (
          <div key={l.n} className="telephone__ligne">
            <span className="telephone__numero">{l.n}</span>
            <span className="telephone__type">{l.t}</span>
            <span className={`telephone__statut telephone__statut--${l.c}`}>{l.s}</span>
          </div>
        ))}
        <div className="telephone__bouton">+ Nouvelle réservation</div>
      </div>
    </div>
  );
}
