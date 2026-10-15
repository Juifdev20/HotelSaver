import * as React from "react";
import { useId } from "react";
import { CONTACT_SUPPORT_PAR_DEFAUT, formaterTelephone, lienWhatsApp } from "@hotel-chicago/regles";
import { LifeBuoy, MessageCircle } from "lucide-react";
import "./aide.css";

export interface BlocAideProps {
  /** Contact du support reçu du serveur (`VueAbonnement.contactSupport`) ; à défaut, le contact de secours. */
  contact?: { telephone: string; whatsapp: string } | null;
  /** Message écrit d'avance dans WhatsApp. */
  message?: string;
}

/**
 * « Besoin d'aide ? » : le numéro WhatsApp du support, en un clic. Le lien est un vrai lien https (target _blank) : l'application le fait ouvrir
 * par le navigateur du poste (jamais dans sa propre fenêtre) grâce à son filtre de liens.
 */
export function BlocAide({ contact, message = "Bonjour, j'ai besoin d'aide avec HotelSaver." }: BlocAideProps) {
  const idTitre = useId();
  const c = contact ?? CONTACT_SUPPORT_PAR_DEFAUT;
  const numero = formaterTelephone(c.whatsapp);
  return (
    <section className="aide" aria-labelledby={idTitre} data-testid="bloc-aide">
      <span className="aide__icone" aria-hidden="true">
        <LifeBuoy size={20} />
      </span>
      <div className="aide__corps">
        <p id={idTitre} className="hc-text-body-strong">
          Besoin d'aide ?
        </p>
        <p className="hc-text-body">Écrivez-nous sur WhatsApp. Nous répondons vite.</p>
        <a className="aide__lien" href={lienWhatsApp(c.whatsapp, message)} target="_blank" rel="noopener noreferrer" data-testid="aide-whatsapp">
          <MessageCircle size={16} aria-hidden="true" />
          WhatsApp {numero}
          <span className="visuellement-cache"> (s'ouvre dans une nouvelle fenêtre)</span>
        </a>
      </div>
    </section>
  );
}
