import * as React from "react";
import { useEffect, useRef } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import type { Fonction } from "@hotel-chicago/regles";
import { Role } from "@hotel-chicago/types";
import type { ProfilConnecte } from "@hotel-chicago/types";
import { Button } from "@hotel-chicago/ui";
import { Lock } from "lucide-react";
import { NOM_FONCTION } from "../fonctions";
import { useVueAbonnement } from "../screens/EcranAbonnement";
import { BlocAide } from "./BlocAide";
import "./aide.css";

export interface FonctionNonIncluseProps {
  client: ClientApi;
  utilisateur: Pick<ProfilConnecte, "role">;
  /** Fonction qui manque (pour dire quoi). */
  fonction?: Fonction;
  /** Nom de l'écran demandé (« Cafétaria », « Stock »…). */
  ecran?: string;
  /** Ouvre l'écran Abonnement (patron seulement). */
  onVoirFormules: () => void;
  horsLigne?: boolean;
}

/**
 * Affiché À LA PLACE d'un écran dont la fonction n'est pas incluse dans la formule de l'hôtel : lien profond, notification, ou réponse
 * 403 FONCTION_NON_INCLUSE du serveur. Le patron peut aller voir les formules ; les autres sont invités à le lui demander.
 */
export function FonctionNonIncluse({ client, utilisateur, fonction, ecran, onVoirFormules, horsLigne = false }: FonctionNonIncluseProps) {
  const lecture = useVueAbonnement(client, horsLigne);
  const titre = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titre.current?.focus();
  }, []);
  const estPatron = utilisateur.role === Role.PATRON;
  const formuleActuelle = lecture.vue?.formules.find((f) => f.code === lecture.vue?.formuleActuelle)?.nom ?? null;
  const quoi = fonction ? NOM_FONCTION[fonction] : ecran ? `l'écran « ${ecran} »` : "cette partie de l'application";

  return (
    <div className="page">
      <section className="non-incluse" aria-labelledby="non-incluse-titre" data-testid="fonction-non-incluse">
        <span className="non-incluse__icone" aria-hidden="true">
          <Lock size={24} />
        </span>
        <h1 id="non-incluse-titre" className="hc-text-display-md" tabIndex={-1} ref={titre}>
          Cette fonction n'est pas incluse dans votre formule
        </h1>
        <p className="hc-text-body">
          {ecran ? `« ${ecran} » fait partie de ${quoi}.` : `Vous demandez ${quoi}.`} Votre formule actuelle{formuleActuelle ? ` (${formuleActuelle})` : ""} ne l'ouvre pas.
        </p>
        {estPatron ? (
          <>
            <p className="hc-text-body">Passez à une formule qui l'inclut pour l'utiliser tout de suite.</p>
            <Button type="button" onClick={onVoirFormules}>
              Voir les formules
            </Button>
          </>
        ) : (
          <p className="hc-text-body-strong" data-testid="non-incluse-patron">
            Demandez au patron de passer à une formule supérieure.
          </p>
        )}
        <BlocAide contact={lecture.vue?.contactSupport} message="Bonjour, je voudrais une formule HotelSaver qui inclut plus de fonctions." />
      </section>
    </div>
  );
}
