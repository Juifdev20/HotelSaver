import * as React from "react";
import { CircleCheck, Download, RefreshCw, RotateCw } from "lucide-react";
import { useMiseAJourBureau } from "./useMiseAJourBureau";
import "./miseajour.css";

/**
 * Réglages › Mise à jour. Le bouton est grisé tant qu'aucune nouvelle version n'existe, actif dès qu'il y en a une : télécharger (en arrière-plan, avec la
 * progression), puis « Redémarrer maintenant » — ou plus tard : la mise à jour s'installe alors toute seule quand on quitte l'application (« Quitter » dans la
 * zone de notification de Windows).
 */
export function CarteMiseAJour() {
  const { etat, verifier, telecharger, installer } = useMiseAJourBureau();
  if (etat.etat === "indisponible") return null; // version de développement : pas d'installateur à mettre à jour

  const disponible = etat.etat === "disponible" || etat.etat === "erreur";
  const enCours = etat.etat === "telechargement";
  const prete = etat.etat === "prete";
  const nouvelle = disponible || enCours || prete;

  const titre = prete
    ? `La version ${etat.version} est prête`
    : enCours
      ? `Téléchargement de la version ${etat.version}`
      : nouvelle
        ? `Nouvelle version ${etat.version} disponible`
        : etat.etat === "a-jour"
          ? "Votre application est à jour"
          : etat.etat === "verification"
            ? "Recherche en cours…"
            : "Version non vérifiée";

  return (
    <div className="carte-formulaire" data-testid="carte-mise-a-jour">
      <p className="hc-text-label texte-discret">Mise à jour</p>
      <div className="maj-carte__entete">
        <span className={`maj-carte__icone ${nouvelle ? "maj-carte__icone--nouvelle" : "maj-carte__icone--ok"}`}>
          {nouvelle ? <Download size={20} aria-hidden="true" /> : <CircleCheck size={20} aria-hidden="true" />}
        </span>
        <div>
          <p className="hc-text-body-strong" role="status">
            {titre}
          </p>
          <p className="hc-text-caption texte-discret">Version installée : {etat.versionInstallee}</p>
        </div>
      </div>

      {nouvelle && !prete && !enCours && <p className="hc-text-body">Le téléchargement se fait en arrière-plan : vous pouvez continuer à travailler.</p>}
      {nouvelle && etat.notes !== "" && (
        <div>
          <p className="hc-text-caption texte-discret">Ce qui change</p>
          <p className="hc-text-body maj-carte__notes">{etat.notes}</p>
        </div>
      )}

      {enCours && (
        <div>
          <div className="maj-progres" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={etat.progres} aria-label="Téléchargement de la mise à jour">
            <div className="maj-progres__barre" style={{ width: `${etat.progres}%` }} />
          </div>
          <p className="hc-text-body-strong">{etat.progres} %</p>
          <p className="hc-text-caption texte-discret">Vous pouvez travailler pendant ce temps.</p>
        </div>
      )}

      {prete && (
        <p className="hc-text-body">
          Le téléchargement est terminé. Redémarrez maintenant pour appliquer la mise à jour — ou plus tard : elle s'installera toute seule quand vous quitterez l'application.
        </p>
      )}

      {etat.erreur && (
        <p role="alert" className="hc-text-body texte-erreur">
          {etat.erreur}
        </p>
      )}

      <div className="maj-actions">
        <button
          type="button"
          className="maj-bouton"
          disabled={!(disponible || prete)}
          onClick={() => void (prete ? installer() : telecharger())}
          aria-label={prete ? "Redémarrer et installer la mise à jour" : disponible ? "Télécharger la mise à jour" : enCours ? "Téléchargement en cours" : "Aucune mise à jour disponible"}
        >
          {prete ? <RotateCw size={18} aria-hidden="true" /> : <Download size={18} aria-hidden="true" />}
          {prete ? "Redémarrer maintenant" : enCours ? `Téléchargement… ${etat.progres} %` : disponible ? "Télécharger la mise à jour" : "Mettre à jour"}
        </button>
        {!enCours && !prete && (
          <button type="button" className="maj-bouton maj-bouton--lien" onClick={() => void verifier()} disabled={etat.etat === "verification"}>
            <RefreshCw size={16} aria-hidden="true" /> {etat.etat === "verification" ? "Recherche…" : "Chercher une mise à jour"}
          </button>
        )}
      </div>
    </div>
  );
}
