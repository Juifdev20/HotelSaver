/**
 * Barres de défilement discrètes : invisibles au repos, elles n'apparaissent que PENDANT
 * le défilement, puis disparaissent (comme sur mobile). CSS : voir styles.css
 * (`[data-defile]`). L'événement `scroll` ne remonte pas dans le DOM : on l'écoute en phase
 * de capture sur le document, ce qui couvre la page comme tout conteneur défilant
 * (barre latérale, tableaux…).
 */
const DELAI_MASQUAGE_MS = 900;

export function installerBarresDefilementDiscretes(): void {
  const minuteurs = new WeakMap<Element, number>();

  document.addEventListener(
    "scroll",
    (evenement) => {
      const cible = evenement.target === document ? document.documentElement : evenement.target;
      if (!(cible instanceof Element)) return;
      cible.setAttribute("data-defile", "");
      window.clearTimeout(minuteurs.get(cible));
      minuteurs.set(
        cible,
        window.setTimeout(() => cible.removeAttribute("data-defile"), DELAI_MASQUAGE_MS)
      );
    },
    { capture: true, passive: true }
  );
}