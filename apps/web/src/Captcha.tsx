import { useEffect, useRef } from "react";

/**
 * Widget anti-robot Cloudflare Turnstile. Activé seulement si `VITE_TURNSTILE_SITE_KEY` est défini au build ; sinon il n'affiche rien
 * et le site fonctionne comme avant (le serveur, lui, n'exige le jeton que si `TURNSTILE_SECRET` est posé).
 */
const CLE_SITE: string | undefined = import.meta.env.VITE_TURNSTILE_SITE_KEY;

interface Turnstile {
  render(element: HTMLElement, options: { sitekey: string; callback: (jeton: string) => void; "expired-callback": () => void; "error-callback": () => void; language?: string }): string;
  remove(id: string): void;
}

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let chargement: Promise<void> | null = null;
function chargerScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  chargement ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Vérification anti-robot indisponible."));
    document.head.appendChild(script);
  });
  return chargement;
}

export const captchaActif = Boolean(CLE_SITE);

export function Captcha({ onJeton }: { onJeton: (jeton: string | undefined) => void }) {
  const conteneur = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!CLE_SITE || !conteneur.current) return;
    let idWidget: string | null = null;
    let annule = false;
    chargerScript()
      .then(() => {
        if (annule || !conteneur.current || !window.turnstile) return;
        idWidget = window.turnstile.render(conteneur.current, {
          sitekey: CLE_SITE,
          language: "fr",
          callback: (jeton) => onJeton(jeton),
          "expired-callback": () => onJeton(undefined),
          "error-callback": () => onJeton(undefined),
        });
      })
      .catch(() => onJeton(undefined));
    return () => {
      annule = true;
      if (idWidget && window.turnstile) window.turnstile.remove(idWidget);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!CLE_SITE) return null;
  return <div ref={conteneur} style={{ margin: "12px 0" }} />;
}
