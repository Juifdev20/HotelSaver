import { useEffect, useRef } from "react";

const SELECTEUR_FOCALISABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focalisables(conteneur: HTMLElement): HTMLElement[] {
  return Array.from(conteneur.querySelectorAll<HTMLElement>(SELECTEUR_FOCALISABLE)).filter(
    (el) => !el.hasAttribute("hidden") && el.getAttribute("aria-hidden") !== "true"
  );
}

export interface OptionsDialogue {
  /** Appelée à la touche Échap (si absente, Échap ne fait rien). */
  onEchap?: () => void;
  /** Tant que c'est faux, rien n'est installé (dialogue fermé). Par défaut : vrai. */
  actif?: boolean;
}

/**
 * Comportement clavier d'une fenêtre modale : focus initial dans la fenêtre
 * (élément portant `data-autofocus`, sinon le premier champ ou bouton, sinon
 * le conteneur), Tab/Maj+Tab qui bouclent dans la fenêtre, Échap, et retour du
 * focus à l'élément qui l'avait avant l'ouverture. Le conteneur doit porter
 * `role="dialog"`, `aria-modal="true"` et `aria-labelledby` (à poser par l'appelant).
 */
export function useDialogue<T extends HTMLElement = HTMLDivElement>({ onEchap, actif = true }: OptionsDialogue = {}) {
  const ref = useRef<T>(null);
  const echapRef = useRef(onEchap);
  echapRef.current = onEchap;

  useEffect(() => {
    if (!actif) return;
    const conteneur = ref.current;
    if (!conteneur) return;
    const precedent = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const initial = conteneur.querySelector<HTMLElement>("[data-autofocus]") ?? focalisables(conteneur)[0];
    if (initial) {
      initial.focus();
    } else {
      conteneur.tabIndex = -1;
      conteneur.focus();
    }

    const surTouche = (evenement: KeyboardEvent) => {
      if (evenement.key === "Escape") {
        if (echapRef.current) {
          evenement.stopPropagation();
          echapRef.current();
        }
        return;
      }
      if (evenement.key !== "Tab") return;
      const liste = focalisables(conteneur);
      if (liste.length === 0) {
        evenement.preventDefault();
        return;
      }
      const premier = liste[0]!;
      const dernier = liste[liste.length - 1]!;
      const courant = document.activeElement;
      if (evenement.shiftKey && (courant === premier || !conteneur.contains(courant))) {
        evenement.preventDefault();
        dernier.focus();
      } else if (!evenement.shiftKey && (courant === dernier || !conteneur.contains(courant))) {
        evenement.preventDefault();
        premier.focus();
      }
    };
    document.addEventListener("keydown", surTouche);
    return () => {
      document.removeEventListener("keydown", surTouche);
      // Retour du focus à l'élément d'origine (s'il est encore dans la page).
      if (precedent && document.contains(precedent)) precedent.focus();
    };
  }, [actif]);

  return ref;
}
