import * as React from "react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CalendarDays, Clock, Mail, MapPin, MessageCircle, Navigation, Phone, X } from "lucide-react";
import { listerChambresDisponibles } from "@hotel-chicago/api-client";
import { useDialogue } from "@hotel-chicago/ui";
import { RESEAUX_SOCIAUX } from "@hotel-chicago/types";
import type { Chambre, InfoHotelPublique } from "@hotel-chicago/types";
import { configuration } from "../config";
import { cheminHotel } from "../resoudreSousDomaine";
import { Apparition } from "../accueil/animations";
import { CarteChambre } from "./CarteChambre";
import { ICONES_SERVICES, IconeReseau, LIBELLE_RESEAU } from "./icones";

/** Les hôtels sont au Congo (UTC+2, sans heure d'été) : « aujourd'hui » est le jour LÀ-BAS, pas la date UTC (qui retarde d'un jour après 22 h). */
const FUSEAU_HOTEL = "Africa/Lubumbashi";

/** Date AAAA-MM-JJ du jour de l'hôtel, décalée de `decalageJours`. */
function aujourdhui(decalageJours = 0): string {
  const instant = new Date(Date.now() + decalageJours * 86_400_000);
  // La locale « en-CA » écrit la date en AAAA-MM-JJ, ce que demandent les champs <input type="date">.
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSEAU_HOTEL, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

/** Lendemain d'une date AAAA-MM-JJ (calcul en UTC pur : aucun fuseau en jeu). */
function lendemain(jour: string): string {
  const d = new Date(`${jour}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function EnteteSection({ etiquette, titre, texte }: { etiquette: string; titre: string; texte?: string }) {
  return (
    <Apparition className="hotel-entete">
      <span>{etiquette}</span>
      <h2>{titre}</h2>
      {texte && <p>{texte}</p>}
    </Apparition>
  );
}

/** Hero : photo de couverture plein écran (zoom lent), nom, slogan, recherche de dates. */
function Hero({ info }: { info: InfoHotelPublique }) {
  const navigate = useNavigate();
  const reduit = useReducedMotion();
  const [arrivee, setArrivee] = useState(aujourdhui(1));
  const [depart, setDepart] = useState(aujourdhui(2));

  function rechercher(e: React.FormEvent) {
    e.preventDefault();
    navigate(cheminHotel(`/chambres?arrivee=${arrivee}&depart=${depart}`));
  }

  const entree = (delai: number) =>
    reduit
      ? {}
      : { initial: { opacity: 0, y: 26 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.8, delay: delai, ease: [0.22, 1, 0.36, 1] as const } };

  return (
    <header className="hotel-hero">
      {info.couvertureUrl ? (
        <img className="hotel-hero__photo" src={info.couvertureUrl} alt="" fetchPriority="high" />
      ) : (
        <div className="hotel-hero__degrade" aria-hidden="true" />
      )}
      <div className="hotel-hero__voile" aria-hidden="true" />

      <div className="hotel-hero__contenu">
        <motion.p className="hotel-hero__sur-titre" {...entree(0)}>
          Bienvenue à
        </motion.p>
        <motion.h1 {...entree(0.1)}>{info.nom}</motion.h1>
        {info.slogan && (
          <motion.p className="hotel-hero__slogan" {...entree(0.2)}>
            {info.slogan}
          </motion.p>
        )}
        <motion.div className="hotel-hero__actions" {...entree(0.3)}>
          <Link to={cheminHotel("/chambres")} className="hotel-bouton hotel-bouton--primaire hotel-bouton--grand">
            Voir les chambres
          </Link>
          <a href="#contact" className="hotel-bouton hotel-bouton--fantome hotel-bouton--grand">
            Nous contacter
          </a>
        </motion.div>
      </div>

      <motion.form className="hotel-recherche" onSubmit={rechercher} {...entree(0.45)} aria-label="Rechercher une chambre">
        <label>
          <CalendarDays size={18} aria-hidden="true" />
          <span>
            Arrivée
            <input
              type="date"
              value={arrivee}
              min={aujourdhui()}
              onChange={(e) => {
                const nouvelle = e.target.value;
                setArrivee(nouvelle);
                // Le départ suit : jamais avant le lendemain de l'arrivée.
                if (nouvelle && depart <= nouvelle) setDepart(lendemain(nouvelle));
              }}
              required
            />
          </span>
        </label>
        <label>
          <CalendarDays size={18} aria-hidden="true" />
          <span>
            Départ
            <input type="date" value={depart} min={arrivee ? lendemain(arrivee) : undefined} onChange={(e) => setDepart(e.target.value)} required />
          </span>
        </label>
        <button type="submit" className="hotel-bouton hotel-bouton--primaire">
          Vérifier la disponibilité
        </button>
      </motion.form>
    </header>
  );
}

function APropos({ info }: { info: InfoHotelPublique }) {
  const faits = [
    info.reception24h ? "Réception ouverte 24 h/24" : null,
    info.horaireArrivee ? `Arrivée dès ${info.horaireArrivee}` : null,
    info.horaireDepart ? `Départ avant ${info.horaireDepart}` : null,
  ].filter(Boolean) as string[];
  if (!info.presentation && faits.length === 0) return null;

  return (
    <section id="apropos" className="hotel-section hotel-section--etroite">
      <EnteteSection etiquette="À propos" titre={`Découvrez ${info.nom}`} />
      {info.presentation && (
        <Apparition>
          <p className="hotel-presentation">{info.presentation}</p>
        </Apparition>
      )}
      {faits.length > 0 && (
        <Apparition delai={0.1}>
          <ul className="hotel-faits">
            {faits.map((f) => (
              <li key={f}>
                <Clock size={16} aria-hidden="true" /> {f}
              </li>
            ))}
          </ul>
        </Apparition>
      )}
    </section>
  );
}

function ChambresApercu({ sousDomaine }: { sousDomaine: string }) {
  const [chambres, setChambres] = useState<Chambre[] | null>(null);

  useEffect(() => {
    let annule = false;
    listerChambresDisponibles({ url: configuration.apiUrl }, sousDomaine)
      .then((liste) => !annule && setChambres(liste))
      .catch(() => !annule && setChambres([]));
    return () => {
      annule = true;
    };
  }, [sousDomaine]);

  // Cette section ne casse jamais la page : liste vide ou erreur = elle disparaît.
  if (chambres === null) {
    return (
      <section className="hotel-section hotel-section--alt" aria-hidden="true">
        <div className="hotel-grille-chambres">
          {[0, 1, 2].map((i) => (
            <div key={i} className="chambre-carte chambre-carte--squelette" />
          ))}
        </div>
      </section>
    );
  }
  if (chambres.length === 0) return null;

  // Les chambres avec photo d'abord : c'est ce qui donne envie.
  const choisies = [...chambres].sort((a, b) => (b.photos?.length ?? 0) - (a.photos?.length ?? 0)).slice(0, 3);

  return (
    <section id="chambres" className="hotel-section hotel-section--alt">
      <EnteteSection etiquette="Hébergement" titre="Nos chambres" texte="Des chambres confortables, prêtes à vous accueillir." />
      <div className="hotel-grille-chambres">
        {choisies.map((c, i) => (
          <Apparition key={c.id} delai={i * 0.1}>
            <CarteChambre chambre={c} />
          </Apparition>
        ))}
      </div>
      <Apparition className="hotel-centre">
        <Link to={cheminHotel("/chambres")} className="hotel-bouton hotel-bouton--contour">
          Voir toutes les chambres et réserver
        </Link>
      </Apparition>
    </section>
  );
}

function Services({ info }: { info: InfoHotelPublique }) {
  if (info.services.length === 0) return null;
  return (
    <section id="services" className="hotel-section">
      <EnteteSection etiquette="Services" titre="Tout pour votre séjour" texte="Ce que nous mettons à votre disposition." />
      <div className="hotel-services">
        {info.services.map((s, i) => {
          const Icone = ICONES_SERVICES[s.icone] ?? ICONES_SERVICES.autre;
          return (
            <Apparition key={`${s.titre}-${i}`} delai={(i % 4) * 0.07}>
              <article className="hotel-service">
                <span className="hotel-service__icone">
                  <Icone size={26} aria-hidden="true" />
                </span>
                <h3>{s.titre}</h3>
                {s.description && <p>{s.description}</p>}
              </article>
            </Apparition>
          );
        })}
      </div>
    </section>
  );
}

/** Photo agrandie : vraie fenêtre modale (focus piégé, Échap, focus rendu à la vignette). */
function Lightbox({ url, onFermer }: { url: string; onFermer: () => void }) {
  const ref = useDialogue<HTMLDivElement>({ onEchap: onFermer });
  return (
    <motion.div
      ref={ref}
      className="hotel-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Photo agrandie"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onFermer}
    >
      <button type="button" className="hotel-lightbox__fermer" onClick={onFermer} aria-label="Fermer la photo">
        <X size={24} aria-hidden="true" />
      </button>
      <img src={url} alt="" onClick={(e) => e.stopPropagation()} />
    </motion.div>
  );
}

function Galerie({ info }: { info: InfoHotelPublique }) {
  const [ouverte, setOuverte] = useState<number | null>(null);

  useEffect(() => {
    if (ouverte === null) return;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOuverte(null);
      if (e.key === "ArrowRight") setOuverte((i) => (i === null ? i : (i + 1) % info.galerie.length));
      if (e.key === "ArrowLeft") setOuverte((i) => (i === null ? i : (i - 1 + info.galerie.length) % info.galerie.length));
    };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, [ouverte, info.galerie.length]);

  if (info.galerie.length === 0) return null;
  return (
    <section id="galerie" className="hotel-section hotel-section--alt">
      <EnteteSection etiquette="Galerie" titre="L'hôtel en images" />
      <div className="hotel-galerie">
        {info.galerie.map((url, i) => (
          <Apparition key={url} delai={(i % 3) * 0.08}>
            <button type="button" className="hotel-galerie__vignette" onClick={() => setOuverte(i)} aria-label={`Agrandir la photo ${i + 1}`}>
              <img src={url} alt="" loading="lazy" />
            </button>
          </Apparition>
        ))}
      </div>

      <AnimatePresence>
        {ouverte !== null && <Lightbox key="lightbox" url={info.galerie[ouverte]!} onFermer={() => setOuverte(null)} />}
      </AnimatePresence>
    </section>
  );
}

function Contact({ info }: { info: InfoHotelPublique }) {
  const reseaux = RESEAUX_SOCIAUX.filter((r) => info.reseaux[r]);
  const whatsapp = info.whatsapp?.replace(/[^\d]/g, "");
  const itineraire =
    info.lienCarte ?? (info.adresse ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${info.nom} ${info.adresse}`)}` : null);
  const aDesInfos = info.adresse || info.telephoneContact || info.emailContact || whatsapp || reseaux.length > 0;
  if (!aDesInfos) return null;

  return (
    <section id="contact" className="hotel-section">
      <EnteteSection etiquette="Contact" titre="Nous trouver" texte="Une question, une demande particulière ? Écrivez-nous ou appelez-nous." />
      <div className="hotel-contact">
        <Apparition direction="gauche">
          <ul className="hotel-contact__liste">
            {info.adresse && (
              <li>
                <MapPin size={20} aria-hidden="true" />
                <span>
                  <strong>Adresse</strong>
                  {info.adresse}
                </span>
              </li>
            )}
            {info.telephoneContact && (
              <li>
                <Phone size={20} aria-hidden="true" />
                <span>
                  <strong>Téléphone</strong>
                  <a href={`tel:${info.telephoneContact.replace(/\s/g, "")}`}>{info.telephoneContact}</a>
                </span>
              </li>
            )}
            {whatsapp && (
              <li>
                <MessageCircle size={20} aria-hidden="true" />
                <span>
                  <strong>WhatsApp</strong>
                  <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer">
                    {info.whatsapp}
                  </a>
                </span>
              </li>
            )}
            {info.emailContact && (
              <li>
                <Mail size={20} aria-hidden="true" />
                <span>
                  <strong>E-mail</strong>
                  <a href={`mailto:${info.emailContact}`}>{info.emailContact}</a>
                </span>
              </li>
            )}
            {(info.horaireArrivee || info.horaireDepart || info.reception24h) && (
              <li>
                <Clock size={20} aria-hidden="true" />
                <span>
                  <strong>Horaires</strong>
                  {info.reception24h && <>Réception 24 h/24<br /></>}
                  {info.horaireArrivee && <>Arrivée dès {info.horaireArrivee}<br /></>}
                  {info.horaireDepart && <>Départ avant {info.horaireDepart}</>}
                </span>
              </li>
            )}
          </ul>
        </Apparition>

        <Apparition direction="droite">
          <div className="hotel-contact__carte">
            <h3>Réservez votre séjour</h3>
            <p>Choisissez vos dates et envoyez votre demande : l'hôtel vous répond pour confirmer.</p>
            <Link to={cheminHotel("/chambres")} className="hotel-bouton hotel-bouton--primaire">
              Demander une réservation
            </Link>
            {itineraire && (
              <a href={itineraire} target="_blank" rel="noopener noreferrer" className="hotel-bouton hotel-bouton--contour">
                <Navigation size={16} aria-hidden="true" /> Itinéraire
              </a>
            )}
            {reseaux.length > 0 && (
              <div className="hotel-reseaux">
                {reseaux.map((r) => (
                  <a key={r} href={info.reseaux[r]} target="_blank" rel="noopener noreferrer" aria-label={LIBELLE_RESEAU[r]}>
                    <IconeReseau reseau={r} />
                  </a>
                ))}
              </div>
            )}
          </div>
        </Apparition>
      </div>
    </section>
  );
}

export function AccueilHotel({ info, sousDomaine }: { info: InfoHotelPublique; sousDomaine: string }) {
  return (
    <>
      <Hero info={info} />
      <APropos info={info} />
      <ChambresApercu sousDomaine={sousDomaine} />
      <Services info={info} />
      <Galerie info={info} />
      <Contact info={info} />
    </>
  );
}
