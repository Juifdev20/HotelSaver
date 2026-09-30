import * as React from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { MaquetteTelephone } from "./MaquetteTelephone";
import { BoutonsStores } from "./Stores";

export function Hero() {
  const reduit = useReducedMotion();
  const { scrollY } = useScroll();
  const decalage = useTransform(scrollY, [0, 500], [0, reduit ? 0 : -50]);

  const entree = (delai: number) =>
    reduit
      ? {}
      : {
          initial: { opacity: 0, y: 24 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.7, delay: delai, ease: [0.22, 1, 0.36, 1] as const },
        };

  return (
    <header className="hero">
      <div className="hero__photo" aria-hidden="true" />
      <div className="hero__halo hero__halo--1" aria-hidden="true" />
      <div className="hero__halo hero__halo--2" aria-hidden="true" />

      <div className="hero__interieur">
        <div className="hero__texte">
          <motion.span className="hero__pastille" {...entree(0)}>
            Pensé pour les hôtels d'Afrique centrale
          </motion.span>
          <motion.h1 className="hero__titre" {...entree(0.1)}>
            Gérez votre hôtel, <span className="hero__accent">simplement.</span>
          </motion.h1>
          <motion.p className="hero__sous-titre" {...entree(0.2)}>
            Réception, cafétaria et réservations en ligne dans une seule application. Sur téléphone comme sur
            ordinateur, même quand le réseau lâche.
          </motion.p>
          <motion.div className="hero__actions" {...entree(0.3)}>
            <Link to="/inscription" className="bouton-marketing bouton-marketing--primaire bouton-marketing--grand">
              Essayer gratuitement 14 jours
            </Link>
            <a href="#fonctionnalites" className="bouton-marketing bouton-marketing--fantome bouton-marketing--grand">
              Découvrir
            </a>
          </motion.div>
          <motion.div className="hero__stores" {...entree(0.35)}>
            <BoutonsStores />
          </motion.div>
          <motion.ul className="hero__garanties" {...entree(0.4)}>
            <li>Sans carte bancaire</li>
            <li>Hors ligne</li>
            <li>USD et CDF</li>
          </motion.ul>
        </div>

        <motion.div className="hero__visuel" style={{ y: decalage }} {...entree(0.25)}>
          <div className="flotte">
            <MaquetteTelephone />
            <div className="pastille-flottante pastille-flottante--a">
              <strong>+ 1 réservation</strong>
              <small>depuis le site public</small>
            </div>
            <div className="pastille-flottante pastille-flottante--b">
              <strong>Reçu imprimé</strong>
              <small>45,00 $ · 128 000 FC</small>
            </div>
          </div>
        </motion.div>
      </div>
    </header>
  );
}
