import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { Role, UtilisateurAuthentifie, peutOperer, type NotificationApp } from "@hotel-chicago/types";
import {
  ArrowLeftRight,
  Bell,
  BedDouble,
  BookOpenCheck,
  CalendarDays,
  ChefHat,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Wallet,
  LayoutDashboard,
  LogOut,
  LucideIcon,
  Menu,
  Moon,
  Package,
  Printer,
  Receipt,
  RefreshCw,
  Search,
  Settings,
  ShoppingCart,
  Sun,
  Ticket,
  UserRound,
  Globe,
  Users,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { useDialogue, useTitrePage } from "@hotel-chicago/ui";
import { EntreeNavigation, IdPage, entreesBarreDuBas, libellePage, sectionsPourRole } from "../navigation";
// Logo de l'APPLICATION HotelSaver (identité plateforme, distincte du logo
// de chaque hôtel — voir DECISIONS.md « branding application vs hôtel »).
import logoHotelSaver from "../../../../../../assets/icons/hotelsaver-icone.png";
import "./coquille.css";

const CLE_BARRE_REDUITE = "hotel-chicago:barre-laterale-reduite";

/** Barre latérale réduite (icônes seules) : préférence mémorisée entre deux lancements. */
function barreReduitePreferee(): boolean {
  try {
    return localStorage.getItem(CLE_BARRE_REDUITE) === "true";
  } catch {
    return false;
  }
}

const ICONES: Record<IdPage, LucideIcon> = {
  "tableau-de-bord": LayoutDashboard,
  chambres: BedDouble,
  reservations: CalendarDays,
  "arrivees-departs": ArrowLeftRight,
  "journal-journee": BookOpenCheck,
  clients: Users,
  facturation: Receipt,
  caisse: ShoppingCart,
  "comptes-ouverts": ClipboardList,
  "retrait-commande": Ticket,
  cuisine: ChefHat,
  menu: UtensilsCrossed,
  stock: Package,
  inventaire: ClipboardCheck,
  parametres: Settings,
  imprimante: Printer,
  utilisateurs: UserRound,
  "site-hotel": Globe,
  rapports: FileText,
  depenses: Wallet,
  synchronisation: RefreshCw,
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

function formaterDateNotification(iso: string): string {
  const date = new Date(iso);
  const memeJour = date.toDateString() === new Date().toDateString();
  return memeJour
    ? date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
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
  /** Centre de notifications (cloche) : liste de MON hôtel / MON rôle, état « lu » par utilisateur. */
  notifications: NotificationApp[];
  nonLues: number;
  onOuvrirNotification: (notification: NotificationApp) => void;
  onToutMarquerLu: () => void;
  /** Indicateur de synchronisation (en-tête) et bandeau « sans Internet » ; fournis par l'application. */
  indicateurSynchro?: React.ReactNode;
  bandeau?: React.ReactNode;
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
      // Barre réduite : le libellé est masqué, l'infobulle et le nom accessible le remplacent.
      title={variante === "laterale" ? entree.libelle : undefined}
      aria-label={variante === "laterale" ? entree.libelle : undefined}
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
  notifications,
  nonLues,
  onOuvrirNotification,
  onToutMarquerLu,
  indicateurSynchro,
  bandeau,
  children,
}: CoquilleProps) {
  const [menuMobileOuvert, setMenuMobileOuvert] = useState(false);
  const [menuProfilOuvert, setMenuProfilOuvert] = useState(false);
  const [notificationsOuvertes, setNotificationsOuvertes] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [barreReduite, setBarreReduite] = useState(barreReduitePreferee);
  const sections = sectionsPourRole(utilisateur.role, peutOperer(utilisateur), utilisateur.cuisineActivee === true);
  const barreDuBas = entreesBarreDuBas(utilisateur.role, peutOperer(utilisateur), utilisateur.cuisineActivee === true);

  const refProfil = useFermetureExterne(menuProfilOuvert, () => setMenuProfilOuvert(false));
  const refNotifications = useFermetureExterne(notificationsOuvertes, () => setNotificationsOuvertes(false));
  const refBoutonProfil = useRef<HTMLButtonElement>(null);
  const refMenuProfil = useRef<HTMLDivElement>(null);
  const refContenu = useRef<HTMLElement>(null);

  // Titre de la fenêtre = écran courant (premier élément annoncé par un lecteur d'écran, et nom de l'onglet/tâche).
  useTitrePage(libellePage(pageActive));

  // Le tiroir mobile est en plein écran (pas de zone "en dehors" à cliquer) : Échap le ferme, le focus
  // reste piégé dedans tant qu'il est ouvert et revient au bouton qui l'a ouvert à la fermeture.
  const refTiroir = useDialogue<HTMLDivElement>({ actif: menuMobileOuvert, onEchap: () => setMenuMobileOuvert(false) });

  // Menu du profil (role="menu") : focus sur le premier choix à l'ouverture, flèches pour naviguer, Échap rend le focus au bouton.
  useEffect(() => {
    if (menuProfilOuvert) refMenuProfil.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [menuProfilOuvert]);

  const surToucheMenuProfil = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      setMenuProfilOuvert(false);
      refBoutonProfil.current?.focus();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    const items = Array.from(refMenuProfil.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (items.length === 0) return;
    e.preventDefault();
    const index = items.indexOf(document.activeElement as HTMLElement);
    const suivant =
      e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : e.key === "ArrowDown" ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
    items[suivant]!.focus();
  };

  const basculerBarre = () => {
    setBarreReduite((valeur) => {
      try {
        localStorage.setItem(CLE_BARRE_REDUITE, String(!valeur));
      } catch {
        // Stockage indisponible : la préférence vaut pour la session en cours seulement.
      }
      return !valeur;
    });
  };

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
    <div className={`coquille${barreReduite ? " coquille--reduite" : ""}`}>
      <button type="button" className="coquille__evitement" onClick={() => refContenu.current?.focus()}>
        Aller au contenu
      </button>
      <aside className="coquille__laterale" aria-label="Navigation principale">
        <button
          type="button"
          className="coquille__bascule"
          onClick={basculerBarre}
          aria-label={barreReduite ? "Agrandir la barre latérale" : "Réduire la barre latérale"}
          aria-expanded={!barreReduite}
          title={barreReduite ? "Agrandir la barre latérale" : "Réduire la barre latérale"}
        >
          {barreReduite ? <ChevronRight size={16} aria-hidden="true" /> : <ChevronLeft size={16} aria-hidden="true" />}
        </button>
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
            {indicateurSynchro}
            <div className="coquille__menu-conteneur" ref={refNotifications}>
              <button
                type="button"
                className="coquille__bouton-icone-rond"
                onClick={() => setNotificationsOuvertes((v) => !v)}
                aria-label={nonLues > 0 ? `Notifications (${nonLues} non lues)` : "Notifications"}
                aria-expanded={notificationsOuvertes}
                aria-controls="panneau-notifications"
              >
                <Bell size={19} aria-hidden="true" />
                {nonLues > 0 && <span className="coquille__pastille">{nonLues > 9 ? "9+" : nonLues}</span>}
              </button>
              {notificationsOuvertes && (
                <div
                  id="panneau-notifications"
                  className="coquille__menu-deroulant coquille__menu-deroulant--notifications"
                  role="region"
                  aria-label="Notifications"
                >
                  <div className="coquille__notifications-entete">
                    <p className="hc-text-body-strong">Notifications</p>
                    {nonLues > 0 && (
                      <button type="button" className="coquille__lien-discret" onClick={onToutMarquerLu}>
                        Tout marquer comme lu
                      </button>
                    )}
                  </div>
                  {notifications.length === 0 ? (
                    <p className="hc-text-caption texte-discret">Aucune notification pour le moment.</p>
                  ) : (
                    <ul className="coquille__notifications-liste">
                      {notifications.map((n) => (
                        <li key={n.id}>
                          <button
                            type="button"
                            className={`coquille__notification${n.lue ? "" : " coquille__notification--non-lue"}`}
                            onClick={() => {
                              setNotificationsOuvertes(false);
                              onOuvrirNotification(n);
                            }}
                          >
                            <span className="hc-text-body-strong">{n.titre}</span>
                            <span className="hc-text-caption">{n.corps}</span>
                            <span className="hc-text-caption texte-discret">{formaterDateNotification(n.createdAt)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
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
                ref={refBoutonProfil}
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
                <div className="coquille__menu-deroulant" role="menu" aria-label="Mon compte" ref={refMenuProfil} onKeyDown={surToucheMenuProfil}>
                  <p className="hc-text-body-strong coquille__menu-entete" role="presentation">{utilisateur.nom}</p>
                  <p className="hc-text-caption texte-discret coquille__menu-sous-entete" role="presentation">
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
        {bandeau}

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

        <main className="coquille__contenu" id="contenu-principal" tabIndex={-1} ref={refContenu}>
          {children}
        </main>
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
        <div className="coquille__tiroir" role="dialog" aria-modal="true" aria-label="Menu" ref={refTiroir}>
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
