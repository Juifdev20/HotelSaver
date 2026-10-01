import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import photo from "../assets/hotel-chambre-bleue.jpg";

const ATOUTS = ["Gestion centralisée", "Plus de réservations", "Un support réactif"];

/** Fond pleine page commun à la connexion et à l'inscription : photo à gauche
 * qui se fond dans la page, arguments, puis la carte au centre (children). */
export function MiseEnPageAuth({ children }: { children: React.ReactNode }) {
  return (
    <div className="hc-auth">
      <div className="hc-auth__photo" aria-hidden="true">
        <div className="hc-auth__image" style={{ backgroundImage: `url(${photo})` }} />
        <div className="hc-auth__voile" />
      </div>
      <aside className="hc-auth__texte">
        <p className="hc-auth__accroche">Bienvenue sur HotelSaver</p>
        <p className="hc-auth__description">
          La plateforme qui simplifie la gestion de votre hôtel et booste vos réservations.
        </p>
        <ul>
          {ATOUTS.map((a) => (
            <li key={a}>
              <CheckCircle2 size={20} aria-hidden="true" />
              {a}
            </li>
          ))}
        </ul>
      </aside>
      <main>{children}</main>
    </div>
  );
}
