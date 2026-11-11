import * as React from "react";
import { useEffect, useState } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import { dateAbonnement } from "@hotel-chicago/regles";
import type { ContratLicenceVue } from "@hotel-chicago/types";
import { Button } from "@hotel-chicago/ui";
import { FileSignature } from "lucide-react";
import "./contrat-licence.css";

/**
 * Contrat de la licence (11/11/2026) : le patron lit le texte exact puis clique « J'accepte ». Le serveur garde la date, le compte, l'adresse
 * internet et l'appareil, avec l'empreinte du texte lu. Affichée seulement au PATRON d'un hôtel qui a une licence en cours.
 */
export function CarteContratLicence({ client }: { client: Pick<ClientApi, "contratLicence" | "accepterContratLicence"> }) {
  const [contrat, setContrat] = useState<ContratLicenceVue | null | undefined>(undefined);
  const [ouvert, setOuvert] = useState(false);
  const [lu, setLu] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let actif = true;
    client
      .contratLicence()
      .then((c) => actif && setContrat(c))
      .catch(() => actif && setContrat(null));
    return () => {
      actif = false;
    };
  }, [client]);

  if (!contrat) return null;
  const accepte = contrat.accepteLe !== null;

  async function accepter() {
    if (!contrat) return;
    setEnCours(true);
    setErreur(null);
    try {
      setContrat(await client.accepterContratLicence(contrat.licenceId, contrat.empreinte));
      setOuvert(false);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L'acceptation n'a pas pu être enregistrée. Réessayez.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <section className={`cl cl--${accepte ? "ok" : "attente"}`} aria-labelledby="cl-titre" data-testid="contrat-licence">
      <div className="cl__haut">
        <FileSignature size={20} aria-hidden="true" />
        <div>
          <h2 id="cl-titre" className="cl__titre">
            Contrat de licence n° {contrat.numero}
          </h2>
          <p className="cl__detail">
            {accepte
              ? `Vous avez accepté ce contrat le ${dateAbonnement(contrat.accepteLe!)}${contrat.accepteParNom ? ` (${contrat.accepteParNom})` : ""}.`
              : "Lisez votre contrat de licence et de maintenance, puis acceptez-le. C'est votre preuve d'achat."}
          </p>
        </div>
        <Button type="button" variant={accepte ? "secondary" : "primary"} size="sm" onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert}>
          {ouvert ? "Fermer" : accepte ? "Relire" : "Lire et accepter"}
        </Button>
      </div>
      {ouvert && (
        <div className="cl__corps">
          <pre className="cl__texte" tabIndex={0} aria-label="Texte du contrat">
            {contrat.texte}
          </pre>
          {!accepte && (
            <>
              <label className="cl__case">
                <input type="checkbox" checked={lu} onChange={(e) => setLu(e.target.checked)} /> J'ai lu le contrat et je l'accepte au nom de l'hôtel.
              </label>
              {erreur && (
                <p role="alert" className="cl__erreur">
                  {erreur}
                </p>
              )}
              <Button type="button" onClick={() => void accepter()} disabled={!lu || enCours}>
                {enCours ? "Enregistrement…" : "J'accepte"}
              </Button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
