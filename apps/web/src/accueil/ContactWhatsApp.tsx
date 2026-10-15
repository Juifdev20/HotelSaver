import * as React from "react";
import { formaterTelephone, lienWhatsApp } from "@hotel-chicago/regles";
import { useFormulesPubliques } from "./useFormules";

/** « Une question ? WhatsApp +243 828 497 218 » — le numéro est celui que le super-admin a réglé (valeur de secours si le serveur ne répond pas). */
export function ContactWhatsApp({ className = "" }: { className?: string }) {
  const { donnees } = useFormulesPubliques();
  const numero = donnees.contact.whatsapp;
  if (!numero) return null;
  return (
    <p className={`contact-whatsapp ${className}`}>
      Une question ?{" "}
      <a href={lienWhatsApp(numero, "Bonjour, j'ai une question sur HotelSaver")} target="_blank" rel="noopener noreferrer">
        WhatsApp {formaterTelephone(numero)}
        <span className="visuellement-cache"> (s'ouvre dans un nouvel onglet)</span>
      </a>
    </p>
  );
}
