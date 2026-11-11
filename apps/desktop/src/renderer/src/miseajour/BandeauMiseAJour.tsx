import * as React from "react";
import { useState } from "react";
import { Download } from "lucide-react";
import { useMiseAJourBureau } from "./useMiseAJourBureau";
import "./miseajour.css";

/** Bandeau en haut de l'application : nouvelle version trouvée, téléchargement en cours, ou prête (« Redémarrer maintenant » / « Plus tard »). */
export function BandeauMiseAJour({ onOuvrir }: { onOuvrir: () => void }) {
  const { etat, telecharger, installer } = useMiseAJourBureau();
  const [plusTard, setPlusTard] = useState<string | null>(null); // « Plus tard » : masqué pour cette version, jusqu'au prochain lancement
  const nouvelle = etat.etat === "disponible" || etat.etat === "telechargement" || etat.etat === "prete";
  if (!nouvelle || plusTard === `${etat.etat}-${etat.version}`) return null;

  return (
    <div className="bandeau-maj hc-text-body" role="status" data-testid="bandeau-mise-a-jour">
      <Download size={18} aria-hidden="true" />
      <span className="bandeau-maj__texte">
        {etat.etat === "prete"
          ? `La mise à jour ${etat.version} est prête. Redémarrez pour l'appliquer, maintenant ou plus tard (elle s'installera toute seule à la fermeture).`
          : etat.etat === "telechargement"
            ? `Téléchargement de la mise à jour ${etat.version}… ${etat.progres} %`
            : `Nouvelle version ${etat.version} disponible.`}
      </span>
      {etat.etat === "disponible" && (
        <button type="button" onClick={() => void telecharger()}>
          Télécharger
        </button>
      )}
      {etat.etat === "prete" && (
        <>
          <button type="button" onClick={() => void installer()}>
            Redémarrer maintenant
          </button>
          <button type="button" onClick={() => setPlusTard(`${etat.etat}-${etat.version}`)}>
            Plus tard
          </button>
        </>
      )}
      <button type="button" onClick={onOuvrir}>
        Détails
      </button>
    </div>
  );
}
