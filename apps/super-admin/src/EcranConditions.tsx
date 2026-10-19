import * as React from "react";
import { useEffect, useState } from "react";
import { Button } from "@hotel-chicago/ui";
import type { ClientSuperAdmin, VersionConditionsAdmin } from "@hotel-chicago/api-client";
import { EnteteApp, type Onglet } from "./EnteteApp";
import { DialogueConfirmation } from "./DialogueConfirmation";

export interface EcranConditionsProps {
  client: ClientSuperAdmin;
  onChangerOnglet: (onglet: Onglet) => void;
  onDeconnexion: () => void;
}

const formatDate = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Lubumbashi" });

/**
 * Conditions d'utilisation (19/10/2026) : vous modifiez le texte et publiez une NOUVELLE version. Les anciennes restent
 * consultables (on sait ce que chaque hôtel a accepté) ; les inscriptions suivantes doivent accepter la dernière, et le
 * prochain installateur Windows construit l'affichera.
 */
export function EcranConditions({ client, onChangerOnglet, onDeconnexion }: EcranConditionsProps) {
  const [versions, setVersions] = useState<VersionConditionsAdmin[]>([]);
  const [texte, setTexte] = useState("");
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [versionOuverte, setVersionOuverte] = useState<number | null>(null);

  async function charger() {
    setChargement(true);
    setErreur(null);
    try {
      const liste = await client.listerConditions();
      setVersions(liste);
      setTexte(liste[0]?.texte ?? "");
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Chargement impossible.");
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    void charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enVigueur = versions[0];
  const modifie = enVigueur ? texte.trim() !== enVigueur.texte.trim() : texte.trim() !== "";

  async function publier() {
    setEnCours(true);
    setErreur(null);
    try {
      const nouvelle = await client.publierConditions(texte);
      setConfirmation(false);
      setSucces(`Version ${nouvelle.version} publiée : les nouvelles inscriptions doivent l'accepter.`);
      await charger();
    } catch (e) {
      setConfirmation(false);
      setErreur(e instanceof Error ? e.message : "Publication impossible.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="page">
      <EnteteApp titre="Conditions d'utilisation" onglet="conditions" onChangerOnglet={onChangerOnglet}>
        <Button variant="secondary" onClick={onDeconnexion}>
          Déconnexion
        </Button>
      </EnteteApp>

      <aside className="encart" aria-label="Aide">
        <p>
          Ce texte est affiché à l'inscription d'un hôtel (site, téléphone, ordinateur) et dans l'installateur Windows. Chaque publication crée une
          nouvelle version : elle s'applique tout de suite aux nouvelles inscriptions, et au prochain installateur construit.
        </p>
      </aside>

      {chargement && (
        <p role="status" className="chargement">
          Chargement…
        </p>
      )}
      {erreur && (
        <p className="erreur" role="alert">
          {erreur}
        </p>
      )}
      {succes && (
        <p className="succes" role="status">
          {succes}
        </p>
      )}

      {!chargement && (
        <section className="carte carte--large conditions-edition">
          <label htmlFor="texte-conditions" className="conditions-edition__titre">
            {enVigueur ? `Version ${enVigueur.version} en vigueur — publiée le ${formatDate.format(new Date(enVigueur.publieLe))}` : "Aucune version publiée"}
          </label>
          <textarea
            id="texte-conditions"
            className="conditions-edition__texte"
            value={texte}
            onChange={(e) => {
              setTexte(e.target.value);
              setSucces(null);
            }}
            spellCheck
          />
          <div className="conditions-edition__actions">
            <span className="conditions-edition__compte">{texte.trim().length} caractères</span>
            <Button variant="secondary" disabled={!modifie || enCours} onClick={() => setTexte(enVigueur?.texte ?? "")}>
              Annuler les modifications
            </Button>
            <Button disabled={!modifie || enCours || texte.trim().length < 200} onClick={() => setConfirmation(true)}>
              Publier une nouvelle version
            </Button>
          </div>
        </section>
      )}

      {versions.length > 0 && (
        <section className="carte carte--large">
          <h2 className="conditions-historique__titre">Historique des versions</h2>
          <ul className="conditions-historique">
            {versions.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  className="conditions-historique__ligne"
                  aria-expanded={versionOuverte === v.version}
                  onClick={() => setVersionOuverte(versionOuverte === v.version ? null : v.version)}
                >
                  <strong>Version {v.version}</strong>
                  <span>{formatDate.format(new Date(v.publieLe))}</span>
                  <span>
                    {v.hotelsAyantAccepte ?? 0} hôtel{(v.hotelsAyantAccepte ?? 0) > 1 ? "s" : ""} l'ont acceptée
                  </span>
                </button>
                {versionOuverte === v.version && <pre className="conditions-historique__texte">{v.texte}</pre>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {confirmation && (
        <DialogueConfirmation
          titre={`Publier la version ${(enVigueur?.version ?? 0) + 1} des conditions ?`}
          message="Les nouvelles inscriptions devront accepter ce texte. Les hôtels déjà inscrits gardent la version qu'ils ont acceptée."
          libelleConfirmer="Publier la nouvelle version"
          enCours={enCours}
          onConfirmer={() => void publier()}
          onAnnuler={() => setConfirmation(false)}
        />
      )}
    </div>
  );
}
