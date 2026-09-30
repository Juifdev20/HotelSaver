import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";

/** Apparition au défilement : fondu + glissement. Sans animation si
 * l'utilisateur a demandé `prefers-reduced-motion`. */
export function Apparition({
  children,
  delai = 0,
  direction = "haut",
  className,
}: {
  children: React.ReactNode;
  delai?: number;
  direction?: "haut" | "gauche" | "droite";
  className?: string;
}) {
  const reduit = useReducedMotion();
  if (reduit) return <div className={className}>{children}</div>;
  const decalage = { haut: { y: 28 }, gauche: { x: -40 }, droite: { x: 40 } }[direction];
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, ...decalage }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, delay: delai, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** Nombre qui monte de 0 à `valeur` quand il entre à l'écran. */
export function Compteur({ valeur }: { valeur: number }) {
  const reduit = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const visible = useInView(ref, { once: true });
  const [affiche, setAffiche] = useState(reduit ? valeur : 0);

  useEffect(() => {
    if (!visible || reduit) return;
    const duree = 1200;
    const debut = performance.now();
    let image = 0;
    const etape = (maintenant: number) => {
      const progres = Math.min((maintenant - debut) / duree, 1);
      setAffiche(Math.round(valeur * (1 - Math.pow(1 - progres, 3))));
      if (progres < 1) image = requestAnimationFrame(etape);
    };
    image = requestAnimationFrame(etape);
    return () => cancelAnimationFrame(image);
  }, [visible, reduit, valeur]);

  return <span ref={ref}>{affiche}</span>;
}
