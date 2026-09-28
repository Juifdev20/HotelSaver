import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { Role, UtilisateurAuthentifie } from "@hotel-chicago/types";
import {
  ArrowLeftRight,
  Bell,
  BedDouble,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  LucideIcon,
  Menu,
  Moon,
  Package,
  Printer,
  Receipt,
  Search,
  Settings,
  ShoppingCart,
  Sun,
  UserRound,
  Users,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { EntreeNavigation, IdPage, entreesBarreDuBas, sectionsPourRole } from "../navigation";
// Logo de l'APPLICATION HotelSaver (identité plateforme, distincte du logo
// de chaque hôtel — voir DECISIONS.md « branding application vs hôtel »).
import logoHotelSaver from "../../../../../../assets/icons/hotelsaver-icone.png";
import "./coquille.css";

const ICONES: Record<IdPage, LucideIcon> = {
  "tableau-de-bord": LayoutDashboard,
  chambres: BedDouble,
  reservations: CalendarDays,
  "arrivees-departs": ArrowLeftRight,
  clients: Users,
  facturation: Receipt,
  caisse: ShoppingCart,
  "comptes-ouverts": ClipboardList,
  menu: UtensilsCrossed,
  stock: Package,
  parametres: Settings,
  imprimante: Printer,
  utilisateurs: UserRound,
};

const LIBELLE_ROLE: Record<Role, string> = {
  [Role.PATRON]: "Patron",
  [Role.RECEPTIONNISTE]: "Réceptionniste",
  [Role.CAFETARIA]: "Cafétaria",
};

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

  // Le tiroir mobile est en plein écran (pas de zone "en dehors" à cliquer) :
  // seule la touche Échap le ferme, comme les autres menus déroulants.
  useEffect(() => {
    if (!menuMobileOuvert) return;
    const surEchap = (evenement: KeyboardEvent) => {
      if (evenement.key === "Escape") setMenuMobileOuvert(false);
    };
    document.addEventListener("keydown", surEchap);
    return () => document.removeEventListener("keydown", surEchap);
  }, [menuMobileOuvert]);

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
          <img className="coquille__logo coquille__logo-img" src={logoHotelSaver} alt="" />
          <span className="coquille__marque-textes">
            <span className="hc-text-heading coquille__nom-hotel">HotelSaver</span>
            <span className="coquille__slogan">Gestion hôtelière</span>
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

          <span className="coquille__marque-etroit coquille__seulement-etroit">
            <img className="coquille__logo-mini" src={logoHotelSaver} alt="" />
            HotelSaver
          </span>

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

          <div className="coquille__actions-haut">
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
              className="coquille__bouton-icone-rond coquille__masque-etroit"
              onClick={onBasculerTheme}
              aria-label={themeSombre ? "Mode clair" : "Mode sombre"}
              title={themeSombre ? "Mode clair" : "Mode sombre"}
            >
              {themeSombre ? <Sun size={19} aria-hidden="true" /> : <Moon size={19} aria-hidden="true" />}
            </button>

            <div className="coquille__menu-conteneur coquille__masque-etroit" ref={refProfil}>
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

        {/* Fenêtre étroite : l'avatar/nom/rôle de la barre du haut est masqué
            (faute de place) ; cette ligne le remplace, purement informative
            (Paramètres/Déconnexion restent dans le tiroir « Plus »). */}
        <div className="coquille__accueil-etroit coquille__seulement-etroit" data-testid="accueil-mobile">
          <span className="coquille__avatar" aria-hidden="true">
            {initiales(utilisateur.nom)}
          </span>
          <span className="coquille__identite">
            <span className="hc-text-body-strong">Bonjour, {utilisateur.nom}</span>
            <span className="hc-text-caption coquille__role">{LIBELLE_ROLE[utilisateur.role]}</span>
          </span>
        </div>

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
              <img className="coquille__logo coquille__logo-img" src={logoHotelSaver} alt="" />
              <span className="hc-text-heading coquille__nom-hotel">HotelSaver</span>
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
          <div className="coquille__pied-tiroir">
            <button type="button" className="lien-nav lien-nav--laterale lien-nav--danger" onClick={onDeconnexion}>
              <LogOut size={19} strokeWidth={1.9} aria-hidden="true" />
              <span className="lien-nav__libelle">Déconnexion</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
