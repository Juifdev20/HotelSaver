import * as React from "react";
import { useState } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import { Role, UtilisateurAuthentifie } from "@hotel-chicago/types";
import {
  ArrowLeftRight,
  BedDouble,
  CalendarDays,
  ClipboardList,
  Coins,
  LayoutDashboard,
  LogOut,
  LucideIcon,
  Menu,
  Moon,
  Package,
  Receipt,
  Settings,
  ShoppingCart,
  Sun,
  Users,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { EntreeNavigation, IdPage, entreesBarreDuBas, sectionsPourRole } from "../navigation";
import { IndicateurConnexion } from "./IndicateurConnexion";
import "./coquille.css";

const ICONES: Record<IdPage, LucideIcon> = {
  "tableau-de-bord": LayoutDashboard,
  chambres: BedDouble,
  reservations: CalendarDays,
  "arrivees-departs": ArrowLeftRight,
  facturation: Receipt,
  caisse: ShoppingCart,
  "comptes-ouverts": ClipboardList,
  menu: UtensilsCrossed,
  stock: Package,
  utilisateurs: Users,
  "taux-de-change": Coins,
  parametres: Settings,
};

const LIBELLE_ROLE: Record<Role, string> = {
  [Role.PATRON]: "Patron",
  [Role.RECEPTIONNISTE]: "Réceptionniste",
  [Role.CAFETARIA]: "Cafétaria",
};

function dateDuJour(): string {
  const texte = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(
    new Date()
  );
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

function initiales(nom: string): string {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((mot) => mot[0]!.toUpperCase())
    .join("");
}

export interface CoquilleProps {
  client: ClientApi;
  utilisateur: UtilisateurAuthentifie;
  pageActive: IdPage;
  onNaviguer: (page: IdPage) => void;
  themeSombre: boolean;
  onBasculerTheme: () => void;
  onDeconnexion: () => void;
  children: React.ReactNode;
}

function LienNavigation({
  entree,
  actif,
  onNaviguer,
  variante,
}: {
  entree: Pick<EntreeNavigation, "id" | "libelle" | "libelleCourt" | "disponible">;
  actif: boolean;
  onNaviguer: (page: IdPage) => void;
  variante: "laterale" | "bas";
}) {
  const Icone = ICONES[entree.id];
  return (
    <button
      type="button"
      className={`lien-nav lien-nav--${variante}${actif ? " lien-nav--actif" : ""}`}
      onClick={() => onNaviguer(entree.id)}
      aria-current={actif ? "page" : undefined}
    >
      <Icone size={variante === "bas" ? 22 : 20} strokeWidth={1.75} aria-hidden="true" />
      <span className="lien-nav__libelle">{variante === "bas" ? entree.libelleCourt : entree.libelle}</span>
      {!entree.disponible && variante === "laterale" && <span className="lien-nav__bientot">Bientôt</span>}
    </button>
  );
}

export function Coquille({
  client,
  utilisateur,
  pageActive,
  onNaviguer,
  themeSombre,
  onBasculerTheme,
  onDeconnexion,
  children,
}: CoquilleProps) {
  const [menuMobileOuvert, setMenuMobileOuvert] = useState(false);
  const sections = sectionsPourRole(utilisateur.role);
  const barreDuBas = entreesBarreDuBas(utilisateur.role);

  const naviguer = (page: IdPage) => {
    setMenuMobileOuvert(false);
    onNaviguer(page);
  };

  const navigationComplete = (
    <>
      {sections.map((section, index) => (
        <div className="nav-section" key={section.titre ?? `section-${index}`}>
          {section.titre && <p className="hc-text-label nav-section__titre">{section.titre}</p>}
          {section.entrees.map((entree) => (
            <LienNavigation
              key={entree.id}
              entree={entree}
              actif={entree.id === pageActive}
              onNaviguer={naviguer}
              variante="laterale"
            />
          ))}
        </div>
      ))}
    </>
  );

  return (
    <div className="coquille">
      <aside className="coquille__laterale" aria-label="Navigation principale">
        <div className="coquille__marque">
          <span className="hc-text-heading coquille__nom-hotel">Hôtel Chicago</span>
          <span className="hc-text-caption coquille__ville">Kasindi</span>
        </div>
        <nav className="coquille__nav">{navigationComplete}</nav>
        <div className="coquille__pied-laterale">
          <LienNavigation
            entree={{ id: "parametres", libelle: "Paramètres", libelleCourt: "Réglages", disponible: true }}
            actif={pageActive === "parametres"}
            onNaviguer={naviguer}
            variante="laterale"
          />
        </div>
      </aside>

      <div className="coquille__principale">
        <header className="coquille__haut">
          <button
            type="button"
            className="coquille__bouton-icone coquille__seulement-etroit"
            onClick={() => setMenuMobileOuvert(true)}
            aria-label="Ouvrir le menu"
          >
            <Menu size={22} aria-hidden="true" />
          </button>
          <span className="hc-text-body coquille__date">{dateDuJour()}</span>
          <div className="coquille__actions-haut">
            <IndicateurConnexion client={client} />
            <button type="button" className="coquille__bouton-texte" onClick={onBasculerTheme}>
              {themeSombre ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
              <span className="coquille__masque-etroit">{themeSombre ? "Mode clair" : "Mode sombre"}</span>
            </button>
            <div className="coquille__utilisateur" data-testid="utilisateur-connecte">
              <span className="coquille__avatar" aria-hidden="true">
                {initiales(utilisateur.nom)}
              </span>
              <span className="coquille__identite coquille__masque-etroit">
                <span className="hc-text-body-strong">{utilisateur.nom}</span>
                <span className="hc-text-caption coquille__role">{LIBELLE_ROLE[utilisateur.role]}</span>
              </span>
            </div>
            <button type="button" className="coquille__bouton-texte" onClick={onDeconnexion}>
              <LogOut size={18} aria-hidden="true" />
              <span className="coquille__masque-etroit">Déconnexion</span>
            </button>
          </div>
        </header>

        <main className="coquille__contenu">{children}</main>
      </div>

      {/* Fenêtre étroite / tablette / mobile : barre de navigation en bas. */}
      <nav className="coquille__bas" aria-label="Navigation rapide">
        {barreDuBas.map((entree) => (
          <LienNavigation
            key={entree.id}
            entree={entree}
            actif={entree.id === pageActive}
            onNaviguer={naviguer}
            variante="bas"
          />
        ))}
        <button type="button" className="lien-nav lien-nav--bas" onClick={() => setMenuMobileOuvert(true)}>
          <Menu size={22} strokeWidth={1.75} aria-hidden="true" />
          <span className="lien-nav__libelle">Plus</span>
        </button>
      </nav>

      {menuMobileOuvert && (
        <div className="coquille__tiroir" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="coquille__tiroir-entete">
            <span className="hc-text-heading coquille__nom-hotel">Hôtel Chicago</span>
            <button
              type="button"
              className="coquille__bouton-icone"
              onClick={() => setMenuMobileOuvert(false)}
              aria-label="Fermer le menu"
            >
              <X size={22} aria-hidden="true" />
            </button>
          </div>
          <nav className="coquille__nav">
            {navigationComplete}
            <LienNavigation
              entree={{ id: "parametres", libelle: "Paramètres", libelleCourt: "Réglages", disponible: true }}
              actif={pageActive === "parametres"}
              onNaviguer={naviguer}
              variante="laterale"
            />
          </nav>
        </div>
      )}
    </div>
  );
}
