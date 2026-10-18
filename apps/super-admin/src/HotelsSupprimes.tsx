import * as React from "react";
import { useEffect, useId, useState } from "react";
import { Button, useDialogue } from "@hotel-chicago/ui";
import type { HotelSupprimeVue } from "@hotel-chicago/types";

const date = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

export interface HotelsSupprimesProps {
  charger: () => Promise<HotelSupprimeVue[]>;
  onFermer: () => void;
}

/**
 * Hôtels supprimés automatiquement (18/10/2026, protection contre les essais abusifs) : essais terminés sans aucun paiement, effacés
 * après le délai réglé dans « Réglages de la plateforme ». Seule une trace reste (nom, sous-domaine, dates, motif) — plus aucune donnée.
 */
export function HotelsSupprimes({ charger, onFermer }: HotelsSupprimesProps) {
  const idTitre = useId();
  const ref = useDialogue<HTMLDivElement>({ onEchap: onFermer });
  const [lignes, setLignes] = useState<HotelSupprimeVue[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    charger()
      .then(setLignes)
      .catch((e: Error) => setErreur(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fond-modale" onMouseDown={(e) => e.target === e.currentTarget && onFermer()}>
      <div ref={ref} className="carte paiements-hotel" role="dialog" aria-modal="true" aria-labelledby={idTitre}>
        <h2 id={idTitre} className="titre">
          Hôtels supprimés
        </h2>
        <p className="sous-titre">Essais terminés sans aucun paiement, supprimés automatiquement. Seule cette trace est gardée.</p>

        {erreur && (
          <p className="erreur" role="alert">
            {erreur}
          </p>
        )}
        {lignes === null && !erreur && <p>Chargement…</p>}
        {lignes?.length === 0 && <p>Aucun hôtel supprimé pour le moment.</p>}

        {lignes && lignes.length > 0 && (
          <ul className="paiements-hotel__liste">
            {lignes.map((l) => (
              <li key={l.id} className="paiements-hotel__ligne">
                <div className="paiements-hotel__infos">
                  <strong className="paiements-hotel__montant">{l.nom}</strong>
                  <span>
                    {l.sousDomaine} · créé le {date(l.creeLe)} · supprimé le {date(l.supprimeLe)}
                  </span>
                  <span className="paiements-hotel__source">{l.motif}</span>
                </div>
              </li>
            ))}
          </ul>
        )}

        <Button variant="secondary" onClick={onFermer} style={{ marginTop: 16 }}>
          Fermer
        </Button>
      </div>
    </div>
  );
}
