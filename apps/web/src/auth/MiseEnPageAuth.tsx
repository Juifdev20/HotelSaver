import * as React from "react";
import { CheckCircle2, ShieldCheck, TrendingUp, Zap } from "lucide-react";

const ARGUMENTS = [
  { icone: Zap, titre: "Gagnez du temps", texte: "Automatisez vos tâches et simplifiez votre quotidien." },
  { icone: TrendingUp, titre: "Augmentez vos réservations", texte: "Un site de réservation à vos couleurs, ouvert 24 h/24." },
  { icone: ShieldCheck, titre: "Un outil fiable", texte: "Vos données restent séparées de celles des autres hôtels." },
];

/** Fond pleine page : photo qui se fond dans la page à droite, arguments à
 * gauche, carte centrée au milieu de l'écran (comme la maquette). Sur mobile,
 * seule la carte reste, sous la barre marketing navy. */
export function MiseEnPageAuth({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth">
      <div className="auth__photo" aria-hidden="true" />
      <aside className="auth__texte">
        <h2>La solution tout-en-un pour les hôtels modernes</h2>
        <ul>
          {ARGUMENTS.map(({ icone: Icone, titre, texte }) => (
            <li key={titre}>
              <span className="auth__icone">
                <Icone size={20} aria-hidden="true" />
              </span>
              <span>
                <strong>{titre}</strong>
                <small>{texte}</small>
              </span>
            </li>
          ))}
        </ul>
      </aside>
      <main className="auth__contenu">{children}</main>
    </div>
  );
}

export function Etapes({ etape }: { etape: 1 | 2 }) {
  return (
    <ol className="auth-etapes" aria-label={`Étape ${etape} sur 2`}>
      <li className={`auth-etapes__item ${etape >= 1 ? "auth-etapes__item--actif" : ""}`}>
        <span className="auth-etapes__pastille">{etape > 1 ? <CheckCircle2 size={18} /> : 1}</span>
        <span>Votre hôtel</span>
      </li>
      <li className="auth-etapes__trait" aria-hidden="true" />
      <li className={`auth-etapes__item ${etape >= 2 ? "auth-etapes__item--actif" : ""}`}>
        <span className="auth-etapes__pastille">2</span>
        <span>Vos coordonnées</span>
      </li>
    </ol>
  );
}
