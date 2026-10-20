import * as React from "react";
import { useRef, useState } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { formaterTelephone, lienWhatsApp } from "@hotel-chicago/regles";
import { FONDATEUR } from "./donnees";
import { useFormulesPubliques } from "./useFormules";

function initiales(nom: string): string {
  // Les titres (« Ir. », « Dr », « Prof. ») ne comptent pas dans les initiales.
  return nom
    .split(/\s+/)
    .filter((mot) => mot && !/^(ir|dr|prof|me|mr|mme)\.?$/i.test(mot))
    .slice(0, 2)
    .map((mot) => mot[0]!.toUpperCase())
    .join("");
}

/** Petites bulles qui montent lentement derrière la carte (décor : cachées aux lecteurs d'écran, immobiles si l'animation est réduite). */
const BULLES = [
  { gauche: "6%", taille: 10, delai: 0, duree: 11 },
  { gauche: "18%", taille: 6, delai: 3, duree: 9 },
  { gauche: "31%", taille: 14, delai: 6, duree: 13 },
  { gauche: "47%", taille: 8, delai: 1, duree: 10 },
  { gauche: "62%", taille: 12, delai: 4, duree: 12 },
  { gauche: "74%", taille: 6, delai: 7, duree: 9 },
  { gauche: "86%", taille: 10, delai: 2, duree: 11 },
  { gauche: "94%", taille: 7, delai: 5, duree: 10 },
];

const ENTREE = {
  cache: {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.15 } },
};
const MONTEE = {
  cache: { opacity: 0, y: 26 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
};

/**
 * « Le créateur de HotelSaver » : fond bleu de l'application (dégradé, halos qui dérivent, bulles qui montent), photo dans un anneau lumineux qui
 * tourne, légère inclinaison 3D qui suit la souris, pastilles flottantes « CEO » et « Développeur », texte qui apparaît en cascade.
 * Le contenu vit dans donnees.ts (FONDATEUR) ; la photo est `public/fondateur.jpg` (sans photo : les initiales). Toutes les animations
 * s'arrêtent pour qui a demandé « réduire les animations » dans son système.
 */
export function Fondateur() {
  const reduit = useReducedMotion();
  const [photoCassee, setPhotoCassee] = useState(false);
  const { donnees } = useFormulesPubliques();
  const numero = donnees.contact.whatsapp;

  // Inclinaison douce de la photo selon la position de la souris (ordinateur seulement ; rien au toucher).
  const zone = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rx = useSpring(useTransform(py, [-0.5, 0.5], [9, -9]), { stiffness: 120, damping: 14 });
  const ry = useSpring(useTransform(px, [-0.5, 0.5], [-11, 11]), { stiffness: 120, damping: 14 });
  function suivre(e: React.PointerEvent) {
    if (reduit || e.pointerType !== "mouse" || !zone.current) return;
    const r = zone.current.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width - 0.5);
    py.set((e.clientY - r.top) / r.height - 0.5);
  }
  function relacher() {
    px.set(0);
    py.set(0);
  }

  return (
    <section id="createur" className="createur" aria-labelledby="createur-titre">
      {/* Décor */}
      <div className="createur__decor" aria-hidden="true">
        <span className="createur__halo createur__halo--a" />
        <span className="createur__halo createur__halo--b" />
        <span className="createur__grille" />
        {BULLES.map((b) => (
          <span key={b.gauche} className="createur__bulle" style={{ left: b.gauche, width: b.taille, height: b.taille, animationDelay: `${b.delai}s`, animationDuration: `${b.duree}s` }} />
        ))}
      </div>

      <motion.div className="createur__interieur" variants={ENTREE} initial={reduit ? "visible" : "cache"} whileInView="visible" viewport={{ once: true, margin: "-80px" }}>
        <motion.p className="createur__etiquette" variants={MONTEE}>
          Le créateur
        </motion.p>
        <motion.h2 id="createur-titre" className="createur__titre" variants={MONTEE}>
          Une application faite par quelqu'un qui connaît votre métier
        </motion.h2>

        <div className="createur__carte">
          <motion.div
            ref={zone}
            className="createur__scene"
            variants={{ cache: { opacity: 0, scale: 0.8, rotate: -6 }, visible: { opacity: 1, scale: 1, rotate: 0, transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] } } }}
            onPointerMove={suivre}
            onPointerLeave={relacher}
          >
            <motion.div className="createur__photo-cadre" style={reduit ? undefined : { rotateX: rx, rotateY: ry, transformPerspective: 900 }}>
              <span className="createur__anneau" aria-hidden="true" />
              <span className="createur__pulse" aria-hidden="true" />
              <div className="createur__photo">
                {photoCassee ? (
                  <span className="createur__initiales" aria-hidden="true">
                    {initiales(FONDATEUR.nom)}
                  </span>
                ) : (
                  <img src={FONDATEUR.photo} alt={`${FONDATEUR.nom}, ${FONDATEUR.titre} de HotelSaver`} width={1985} height={1902} loading="lazy" decoding="async" onError={() => setPhotoCassee(true)} />
                )}
              </div>
            </motion.div>
            <span className="createur__puce createur__puce--ceo" aria-hidden="true">
              CEO
            </span>
            <span className="createur__puce createur__puce--dev" aria-hidden="true">
              {"</>"} Développeur
            </span>
          </motion.div>

          <div className="createur__texte">
            <motion.h3 className="createur__nom" variants={MONTEE}>
              {FONDATEUR.nom}
            </motion.h3>
            <motion.p className="createur__fonction" variants={MONTEE}>
              {FONDATEUR.titre}
            </motion.p>
            {FONDATEUR.paragraphes.map((p, i) => (
              <motion.p
                key={p}
                className={i === 0 ? "createur__paragraphe" : "createur__paragraphe createur__paragraphe--suite"}
                variants={MONTEE}
              >
                {p}
              </motion.p>
            ))}
            {numero && (
              <motion.a
                className="createur__contact"
                variants={MONTEE}
                whileHover={reduit ? undefined : { scale: 1.04 }}
                whileTap={reduit ? undefined : { scale: 0.97 }}
                href={lienWhatsApp(numero, `Bonjour ${FONDATEUR.prenom}, j'ai une question sur HotelSaver`)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Écrivez-moi sur WhatsApp<span className="createur__numero"> {formaterTelephone(numero)}</span>
                <span className="createur__fleche" aria-hidden="true">
                  →
                </span>
                <span className="visuellement-cache"> (s'ouvre dans un nouvel onglet)</span>
              </motion.a>
            )}
          </div>
        </div>
      </motion.div>
    </section>
  );
}
