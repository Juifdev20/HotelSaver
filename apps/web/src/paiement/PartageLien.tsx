import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { Check, Copy, Link2, MessageCircle, Share2 } from "lucide-react";

/** Copie un texte dans le presse-papiers ; repli (zone de texte sélectionnée) pour les navigateurs sans Clipboard API ou hors https. */
export async function copierTexte(texte: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(texte);
      return true;
    }
  } catch {
    // On tente le repli ci-dessous.
  }
  try {
    const zone = document.createElement("textarea");
    zone.value = texte;
    zone.setAttribute("readonly", "");
    zone.style.position = "fixed";
    zone.style.opacity = "0";
    document.body.appendChild(zone);
    zone.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(zone);
    return ok;
  } catch {
    return false;
  }
}

/** « Copié ✓ » pendant 2,5 s après une copie réussie. */
export function useCopie(): [string | null, (cle: string, texte: string) => void] {
  const [copie, setCopie] = useState<string | null>(null);
  const minuteur = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(minuteur.current), []);
  return [
    copie,
    (cle, texte) => {
      void copierTexte(texte).then((ok) => {
        if (!ok) return;
        setCopie(cle);
        clearTimeout(minuteur.current);
        minuteur.current = setTimeout(() => setCopie(null), 2500);
      });
    },
  ];
}

export interface PartageLienProps {
  /** Code lisible de la réservation (ex. RES-3C6CD449), repris dans le message partagé. */
  code: string;
  nomHotel?: string;
}

/**
 * « Gardez votre lien » (17/10/2026) : le lien de la page « Ma réservation » est le seul accès du client à sa
 * réservation. On le montre en clair, avec Copier, Partager (feuille de partage du téléphone) et WhatsApp —
 * pour l'envoyer à soi-même ou à un proche sans avoir à sélectionner la barre d'adresse.
 */
export function PartageLien({ code, nomHotel }: PartageLienProps) {
  const lien = window.location.href;
  const [copie, copier] = useCopie();
  const texte = `Ma réservation ${code}${nomHotel ? ` à ${nomHotel}` : ""} : ${lien}`;
  const partageNatif = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <section className="partage" aria-labelledby="partage-titre">
      <div className="partage__entete">
        <span className="partage__icone" aria-hidden="true">
          <Link2 size={20} />
        </span>
        <div>
          <h2 id="partage-titre">Gardez le lien de votre réservation</h2>
          <p>Il vous permet de la suivre, de payer l'acompte ou de l'annuler à tout moment.</p>
        </div>
      </div>
      <div className="partage__lien">
        <input
          className="partage__url"
          value={lien}
          readOnly
          aria-label="Lien de votre réservation"
          onFocus={(e) => e.currentTarget.select()}
        />
        <button type="button" className={`partage__copier ${copie === "lien" ? "partage__copier--ok" : ""}`} onClick={() => copier("lien", lien)}>
          {copie === "lien" ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}
          <span>{copie === "lien" ? "Lien copié" : "Copier"}</span>
        </button>
      </div>
      <div className="partage__actions">
        {partageNatif && (
          <button
            type="button"
            className="partage__action"
            onClick={() => void navigator.share({ title: `Réservation ${code}`, text: texte, url: lien }).catch(() => undefined)}
          >
            <Share2 size={17} aria-hidden="true" /> Partager
          </button>
        )}
        <a className="partage__action partage__action--whatsapp" href={`https://wa.me/?text=${encodeURIComponent(texte)}`} target="_blank" rel="noopener noreferrer">
          <MessageCircle size={17} aria-hidden="true" /> Envoyer sur WhatsApp
          <span className="visuellement-cache"> (s'ouvre dans un nouvel onglet)</span>
        </a>
      </div>
      <p className="visuellement-cache" role="status" aria-live="polite">
        {copie === "lien" ? "Lien copié dans le presse-papiers." : ""}
      </p>
    </section>
  );
}
