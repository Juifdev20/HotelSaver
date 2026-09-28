import * as React from "react";
import { useEffect, useState } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import { CompteCafeteria, Devise, StatutCompte } from "@hotel-chicago/types";
import { Button, formatMontant } from "@hotel-chicago/ui";
import { ClipboardList } from "lucide-react";

export interface EcranComptesOuvertsProps {
  client: ClientApi;
  onOuvrirCompte: (compteId: string) => void;
}

function totalCompte(compte: CompteCafeteria): { usd: number; cdf: number } {
  let usd = 0;
  let cdf = 0;
  for (const sousCompte of compte.sousComptes) {
    for (const ligne of sousCompte.lignes) {
      const montant = Number(ligne.prixUnitaire) * Number(ligne.quantite);
      if (ligne.devise === Devise.USD) usd += montant;
      else cdf += montant;
    }
  }
  return { usd, cdf };
}

/** Équivalent desktop de apps/mobile/src/ecrans/EcranComptesOuverts.tsx — en
 * ligne directe (pas de miroir), même logique. */
export function EcranComptesOuverts({ client, onOuvrirCompte }: EcranComptesOuvertsProps) {
  const [comptes, setComptes] = useState<CompteCafeteria[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  function charger() {
    client
      .listerComptesCafeteria(StatutCompte.OUVERT)
      .then(setComptes)
      .catch((e: Error) => setErreur(e.message));
  }

  useEffect(charger, [client]);

  return (
    <div className="page">
      <header className="page__entete">
        <div>
          <h1 className="hc-text-display-md page__titre">Comptes ouverts</h1>
          <p className="hc-text-body page__sous-titre">
            {comptes ? `${comptes.length} compte${comptes.length > 1 ? "s" : ""} ouvert${comptes.length > 1 ? "s" : ""}` : "Chargement…"}
          </p>
        </div>
      </header>

      {erreur && (
        <p role="alert" className="hc-text-body texte-erreur">
          {erreur}
        </p>
      )}

      {comptes?.length === 0 && (
        <div className="etat-vide">
          <ClipboardList size={32} strokeWidth={1.5} aria-hidden="true" />
          <p className="hc-text-subheading">Aucun compte ouvert pour le moment</p>
        </div>
      )}

      {comptes && comptes.length > 0 && (
        <div className="carte-tableau" data-testid="tableau-comptes-ouverts">
          <table className="tableau">
            <thead>
              <tr>
                <th>Table / nom</th>
                <th>Personnes</th>
                <th>Total</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {comptes.map((c) => {
                const total = totalCompte(c);
                return (
                  <tr key={c.id}>
                    <td className="hc-text-body-strong">{c.tableOuNom}</td>
                    <td className="texte-discret">{c.sousComptes.length}</td>
                    <td className="texte-discret">
                      {total.usd === 0 && total.cdf === 0
                        ? "—"
                        : [total.usd > 0 ? formatMontant(total.usd, Devise.USD) : null, total.cdf > 0 ? formatMontant(total.cdf, Devise.CDF) : null]
                            .filter(Boolean)
                            .join(" + ")}
                    </td>
                    <td>
                      <Button type="button" variant="secondary" size="sm" onClick={() => onOuvrirCompte(c.id)}>
                        Ouvrir
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
