import * as React from "react";
import { useEffect, useRef, useState } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import { Role, UtilisateurAuthentifie } from "@hotel-chicago/types";
import {
  ArrowLeftRight,
  Bell,
  BedDouble,
  Building2,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Coins,
  LayoutDashboard,
  LogOut,
  LucideIcon,
  Menu,
  Moon,
  Package,
  Receipt,
  Search,
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

/** Ferme un menu déroulant au clic en dehors ou à la touche Échap. Réutilisé
 * par les écrans qui ont leurs propres menus contextuels (ex. Chambres). */
export function useFermetureExterne(ouvert: boolean, fermer: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ouvert) return;
    const surClic = (evenement: MouseEvent) => {
      if (ref.current && !ref.current.contains(evenement.target as Node)) fermer();
    };
    const surEchap = (evenement: KeyboardEvent) => {
      if (evenement.key === "Escape") fermer();
    };
    document.addEventListener("mousedown", surClic);
    document.addEventListener("keydown", surEchap);
    return () => {
      document.removeEventListener("mousedown", surClic);
      document.removeEventListener("keydown", surEchap);
    };
  }, [ouvert, fermer]);
  return ref;
}

export interface CoquilleProps {
  client: ClientApi;
  utilisateur: UtilisateurAuthentifie;
  pageActive: IdPage;
  onNaviguer: (page: IdPage) => void;
  themeSombre: boolean;
  onBasculerTheme: () => void;
  onDeconnexion: () => void;
  /** Recherche globale (barre du haut) → applique le terme sur l'écran Chambres. */
  onRechercherChambre: (terme: string) => void;
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
      <Icone size={variante === "bas" ? 22 : 19} strokeWidth={1.9} aria-hidden="true" />
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
  onRechercherChambre,
  children,
}: CoquilleProps) {
  const [menuMobileOuvert, setMenuMobileOuvert] = useState(false);
  const [menuProfilOuvert, setMenuProfilOuvert] = useState(false);
  const [notificationsOuvertes, setNotificationsOuvertes] = useState(false);
  const [recherche, setRecherche] = useState("");
  const sections = sectionsPourRole(utilisateur.role);
  const barreDuBas = entreesBarreDuBas(utilisateur.role);

  const refProfil = useFermetureExterne(menuProfilOuvert, () => setMenuProfilOuvert(false));
  const refNotifications = useFermetureExterne(notificationsOuvertes, () => setNotificationsOuvertes(false));

  const naviguer = (page: IdPage) => {
    setMenuMobileOuvert(false);
    onNaviguer(page);
  };

  const lancerRecherche = () => {
    if (!recherche.trim()) return;
    onRechercherChambre(recherche.trim());
    onNaviguer("chambres");
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
          <span className="coquille__logo" aria-hidden="true">
            <Building2 size={22} strokeWidth={2} />
          </span>
          <span className="coquille__marque-textes">
            <span className="hc-text-heading coquille__nom-hotel">Hôtel Chicago</span>
            <span className="coquille__slogan">Confort · Élégance · Service</span>
          </span>
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

          <span className="coquille__marque-etroit coquille__seulement-etroit">Hôtel Chicago</span>

          <label className="coquille__recherche coquille__masque-etroit">
            <Search size={18} aria-hidden="true" />
            <span className="visuellement-cache">Rechercher une chambre, un client…</span>
            <input
              type="search"
              placeholder="Rechercher une chambre, un client…"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") lancerRecherche();
              }}
            />
          </label>

          <span className="hc-text-body coquille__date coquille__masque-etroit">{dateDuJour()}</span>

          <div className="coquille__actions-haut">
            <IndicateurConnexion client={client} />

            <div className="coquille__menu-conteneur" ref={refNotifications}>
              <button
                type="button"
                className="coquille__bouton-icone-rond"
                onClick={() => setNotificationsOuvertes((v) => !v)}
                aria-label="Notifications"
                aria-expanded={notificationsOuvertes}
              >
                <Bell size={19} aria-hidden="true" />
              </button>
              {notificationsOuvertes && (
                <div className="coquille__menu-deroulant coquille__menu-deroulant--notifications" role="menu">
                  <p className="hc-text-body-strong">Notifications</p>
                  <p className="hc-text-caption texte-discret">Aucune notification pour le moment.</p>
                </div>
              )}
            </div>

            <button
              type="button"
              className="coquille__bouton-icone-rond"
              onClick={onBasculerTheme}
              aria-label={themeSombre ? "Mode clair" : "Mode sombre"}
              title={themeSombre ? "Mode clair" : "Mode sombre"}
            >
              {themeSombre ? <Sun size={19} aria-hidden="true" /> : <Moon size={19} aria-hidden="true" />}
            </button>

            <div className="coquille__menu-conteneur" ref={refProfil}>
              <button
                type="button"
                className="coquille__utilisateur"
                data-testid="utilisateur-connecte"
                onClick={() => setMenuProfilOuvert((v) => !v)}
                aria-expanded={menuProfilOuvert}
                aria-haspopup="menu"
              >
                <span className="coquille__avatar" aria-hidden="true">
                  {initiales(utilisateur.nom)}
                </span>
                <span className="coquille__identite coquille__masque-etroit">
                  <span className="hc-text-body-strong">{utilisateur.nom}</span>
                  <span className="hc-text-caption coquille__role">{LIBELLE_ROLE[utilisateur.role]}</span>
                </span>
                <ChevronDown size={16} className="coquille__masque-etroit" aria-hidden="true" />
              </button>
              {menuProfilOuvert && (
                <div className="coquille__menu-deroulant" role="menu">
                  <p className="hc-text-body-strong coquille__menu-entete">{utilisateur.nom}</p>
                  <p className="hc-text-caption texte-discret coquille__menu-sous-entete">
                    {LIBELLE_ROLE[utilisateur.role]}
                  </p>
                  <button
                    type="button"
                    className="coquille__item-menu"
                    role="menuitem"
                    onClick={() => {
                      setMenuProfilOuvert(false);
                      naviguer("parametres");
                    }}
                  >
                    <Settings size={17} aria-hidden="true" />
                    Paramètres
                  </button>
                  <button
                    type="button"
                    className="coquille__item-menu coquille__item-menu--danger"
                    role="menuitem"
                    onClick={onDeconnexion}
                  >
                    <LogOut size={17} aria-hidden="true" />
                    Déconnexion
                  </button>
                </div>
              )}
            </div>
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
          <Menu size={22} strokeWidth={1.9} aria-hidden="true" />
          <span className="lien-nav__libelle">Plus</span>
        </button>
      </nav>

      {menuMobileOuvert && (
        <div className="coquille__tiroir" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="coquille__tiroir-entete">
            <div className="coquille__marque">
              <span className="coquille__logo" aria-hidden="true">
                <Building2 size={20} strokeWidth={2} />
              </span>
              <span className="hc-text-heading coquille__nom-hotel">Hôtel Chicago</span>
            </div>
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
