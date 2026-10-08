import { useEffect, useRef } from "react";
import { DetecteurRafale } from "@hotel-chicago/receipts";

let contexteAudio: AudioContext | null = null;

/** Bip court généré (WebAudio, aucun fichier) : aigu = article ajouté,
 * grave = code inconnu ou article épuisé. */
export function bip(type: "ok" | "erreur"): void {
  try {
    contexteAudio ??= new AudioContext();
    const oscillateur = contexteAudio.createOscillator();
    const volume = contexteAudio.createGain();
    oscillateur.frequency.value = type === "ok" ? 1400 : 300;
    volume.gain.value = 0.15;
    oscillateur.connect(volume).connect(contexteAudio.destination);
    const debut = contexteAudio.currentTime;
    oscillateur.start(debut);
    oscillateur.stop(debut + (type === "ok" ? 0.08 : 0.35));
  } catch {
    /* pas de son disponible : le message à l'écran suffit */
  }
}

/**
 * Douchette USB/Bluetooth (elle « tape » le code puis Entrée) : écoute le
 * clavier de toute la fenêtre tant que l'écran est affiché — le scan marche
 * même si aucun champ n'a le focus. Une frappe humaine (lente) n'est pas
 * interceptée et reste une saisie normale.
 */
export function useDouchette(surCode: (code: string) => void, actif = true): void {
  const rappel = useRef(surCode);
  rappel.current = surCode;

  useEffect(() => {
    if (!actif) return;
    const detecteur = new DetecteurRafale();
    const surTouche = (e: KeyboardEvent) => {
      const code = detecteur.touche(e.key, e.timeStamp || performance.now());
      if (!code) return;
      e.preventDefault();
      // La rafale a peut-être été tapée dans un champ focalisé : on l'en retire.
      const cible = e.target as HTMLInputElement | null;
      if (cible && "value" in cible && typeof cible.value === "string" && cible.value.endsWith(code)) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(cible, cible.value.slice(0, -code.length));
        cible.dispatchEvent(new Event("input", { bubbles: true }));
      }
      rappel.current(code);
    };
    window.addEventListener("keydown", surTouche, true);
    return () => window.removeEventListener("keydown", surTouche, true);
  }, [actif]);
}
