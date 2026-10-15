import * as React from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import { actualiserEtatAbonnement } from "@hotel-chicago/regles";
import { Role } from "@hotel-chicago/types";
import type { EtatAbonnement, ProfilConnecte } from "@hotel-chicago/types";
import { Button, useTitrePage } from "@hotel-chicago/ui";
import { ZonePaiement, useVueAbonnement } from "./EcranAbonnement";
import { BlocAide } from "../components/BlocAide";
import logo from "../../../../../../assets/icons/hotelsaver-icone.png";
import "./abonnement.css";

export interface EcranAbonnementBloqueProps {
  client: ClientApi;
  utilisateur: ProfilConnecte;
  horsLigne: boolean;
  /** Après un paiement réussi : relit le profil, le mémorise, relance la synchronisation. L'application normale revient d'elle-même. */
  onPaiementReussi: () => Promise<void>;
  onSeDeconnecter: () => void;
}

function titreEtExplication(etat: EtatAbonnement | null): { titre: string; explication: string } {
  if (etat?.statut === "RESILIE") {
    return { titre: "Votre abonnement est résilié", explication: "Vos données sont conservées. Contactez le support HotelSaver pour rouvrir l'accès de votre hôtel." };
  }
  if (etat?.statut === "SUSPENDU") {
    return { titre: "L'accès de votre hôtel est suspendu", explication: "Vos données sont conservées. Contactez le support HotelSaver pour savoir pourquoi et rouvrir l'accès." };
  }
  return { titre: "Votre abonnement a expiré", explication: "Pas d'inquiétude : vos données sont conservées. Dès que l'abonnement est renouvelé, vous retrouvez l'application exactement comme vous l'avez laissée." };
}

/**
 * Affiché À LA PLACE de l'application quand le serveur coupe l'accès (abonnement expiré après le délai de grâce, hôtel suspendu ou résilié).
 * Le patron peut payer ici ; les autres rôles voient quoi faire. Les actions déjà saisies restent sur l'ordinateur et partent après le renouvellement.
 */
export function EcranAbonnementBloque({ client, utilisateur, horsLigne, onPaiementReussi, onSeDeconnecter }: EcranAbonnementBloqueProps) {
  const lecture = useVueAbonnement(client, horsLigne);
  const brut = lecture.vue?.etat ?? utilisateur.abonnement ?? null;
  const etat = brut ? actualiserEtatAbonnement(brut) : null;
  const { titre, explication } = titreEtExplication(etat);
  useTitrePage(titre);

  return (
    <div className="abo-bloque" data-testid="abonnement-bloque">
      <main className="abo-bloque__contenu" id="contenu-principal">
        <div className="abo-bloque__entete">
          <img className="abo-bloque__logo" src={logo} alt="" />
          <span className="hc-text-heading">HotelSaver</span>
        </div>

        <header className="abo-carte">
          <h1 className="hc-text-display-md">
            {titre}
          </h1>
          <p className="hc-text-body">{explication}</p>
          {utilisateur.role !== Role.PATRON && etat?.renouvelable !== false && <p className="hc-text-body-strong">Connecté en tant que {utilisateur.nom}.</p>}
        </header>

        <ZonePaiement client={client} utilisateur={utilisateur} etat={etat} lecture={lecture} horsLigne={horsLigne} mode="bloque" onPaiementReussi={onPaiementReussi} />

        <BlocAide contact={lecture.vue?.contactSupport} message="Bonjour, l'accès de mon hôtel HotelSaver est bloqué, j'ai besoin d'aide." />

        <div className="abo-bloque__actions">
          <Button type="button" variant="secondary" onClick={onSeDeconnecter}>
            Se déconnecter
          </Button>
        </div>
      </main>
    </div>
  );
}
