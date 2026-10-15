import * as React from "react";

export type Onglet = "hotels" | "paiements";

const ONGLETS: { id: Onglet; libelle: string }[] = [
  { id: "hotels", libelle: "Hôtels" },
  { id: "paiements", libelle: "Paiements en ligne" },
];

export interface EnteteAppProps {
  titre: string;
  onglet: Onglet;
  onChangerOnglet: (onglet: Onglet) => void;
  /** Boutons d'action de l'écran (à droite). */
  children?: React.ReactNode;
}

/** En-tête commun aux écrans du Super-Admin : logo, titre, actions et navigation entre les sections. */
export function EnteteApp({ titre, onglet, onChangerOnglet, children }: EnteteAppProps) {
  return (
    <>
      <header className="entete">
        <div className="marque">
          <img className="marque__logo" src="/logo-hotelsaver.png" alt="HotelSaver" />
          <h1 className="titre-page">{titre}</h1>
        </div>
        <div className="entete-actions">{children}</div>
      </header>
      <nav className="onglets" aria-label="Sections du Super-Admin">
        {ONGLETS.map((o) => (
          <button
            key={o.id}
            type="button"
            className={`onglet ${o.id === onglet ? "onglet--actif" : ""}`}
            aria-current={o.id === onglet ? "page" : undefined}
            onClick={() => o.id !== onglet && onChangerOnglet(o.id)}
          >
            {o.libelle}
          </button>
        ))}
      </nav>
    </>
  );
}
