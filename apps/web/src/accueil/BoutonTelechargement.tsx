import * as React from "react";
import { Download } from "lucide-react";
import type { Smartphone } from "lucide-react";

/** Lien de téléchargement direct d'une application (installateur Windows, APK Android) — partagé par l'accueil et l'écran
 * après inscription. Sans lien (pas encore publié) : affiché grisé, « Lien bientôt disponible ». Styles : auth/auth.css. */
export function BoutonTelechargement({ url, icone: Icone, libelle, detail = "Télécharger" }: { url: string | null; icone: typeof Smartphone; libelle: string; detail?: string }) {
  if (!url) {
    return (
      <span className="telechargement telechargement--bientot" aria-disabled="true">
        <Icone size={20} aria-hidden="true" />
        <span>
          {libelle}
          <small>Lien bientôt disponible</small>
        </span>
      </span>
    );
  }
  return (
    <a className="telechargement" href={url} rel="noopener">
      <Icone size={20} aria-hidden="true" />
      <span>
        {libelle}
        <small>{detail}</small>
      </span>
      <Download size={18} aria-hidden="true" className="telechargement__fleche" />
    </a>
  );
}
