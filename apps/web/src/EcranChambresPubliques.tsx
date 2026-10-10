import * as React from "react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { listerChambresDisponibles } from "@hotel-chicago/api-client";
import type { Chambre } from "@hotel-chicago/types";
import { configuration } from "./config";
import { FormulaireDemandeReservation } from "./FormulaireDemandeReservation";
import { CarteChambre } from "./hotel/CarteChambre";
import { Apparition } from "./accueil/animations";

/** Le backend ne renvoie déjà que des chambres disponibles (voir
 * PublicService.findChambresDisponibles) — "Disponible" est donc vrai pour
 * chaque ligne affichée ici, pas une donnée à recalculer côté client.
 * Les dates peuvent arriver pré-remplies (`?arrivee=&depart=`) depuis la
 * barre de recherche de l'accueil de l'hôtel. */
export function EcranChambresPubliques({ sousDomaine }: { sousDomaine: string }) {
  const [params] = useSearchParams();
  const [dateArrivee, setDateArrivee] = useState(params.get("arrivee") ?? "");
  const [dateDepart, setDateDepart] = useState(params.get("depart") ?? "");
  const [chambres, setChambres] = useState<Chambre[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chambreChoisie, setChambreChoisie] = useState<Chambre | null>(null);

  const datesChoisies = Boolean(dateArrivee && dateDepart && dateArrivee < dateDepart);

  useEffect(() => {
    let annule = false;
    (async () => {
      setChargement(true);
      setErreur(null);
      try {
        const resultat = await listerChambresDisponibles(
          { url: configuration.apiUrl },
          sousDomaine,
          datesChoisies ? { dateArrivee, dateDepart } : undefined
        );
        if (!annule) setChambres(resultat);
      } catch (e) {
        if (!annule) setErreur(e instanceof Error ? e.message : "Erreur de chargement.");
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sousDomaine, dateArrivee, dateDepart]);

  return (
    <div className="hotel-page">
      <div className="hotel-page__entete">
        <h1>Nos chambres</h1>
        <p>Choisissez vos dates pour voir les chambres libres et envoyer une demande de réservation.</p>
      </div>

      <div className="hotel-page__corps">
        <div className="hotel-filtre">
          <label>
            Arrivée
            <input type="date" value={dateArrivee} onChange={(e) => setDateArrivee(e.target.value)} />
          </label>
          <label>
            Départ
            <input type="date" value={dateDepart} min={dateArrivee} onChange={(e) => setDateDepart(e.target.value)} />
          </label>
        </div>

        {chargement && (
          <div className="hotel-grille-chambres" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="chambre-carte chambre-carte--squelette" />
            ))}
          </div>
        )}
        {erreur && (
          <p className="erreur" role="alert">
            {erreur}
          </p>
        )}

        {!chargement && !erreur && (
          <div className="hotel-grille-chambres">
            {chambres.map((c, i) => (
              <Apparition key={c.id} delai={(i % 3) * 0.07}>
                <CarteChambre
                  chambre={c}
                  onReserver={datesChoisies ? () => setChambreChoisie(c) : undefined}
                  libelleBouton="Demander cette chambre"
                />
              </Apparition>
            ))}
            {chambres.length === 0 && <p className="hotel-vide">Aucune chambre disponible pour cette période.</p>}
          </div>
        )}
        {!datesChoisies && !chargement && chambres.length > 0 && (
          <p className="hotel-astuce">Sélectionnez une date d'arrivée et de départ pour pouvoir réserver.</p>
        )}
      </div>

      {chambreChoisie && (
        <FormulaireDemandeReservation
          sousDomaine={sousDomaine}
          chambre={chambreChoisie}
          dateArrivee={dateArrivee}
          dateDepart={dateDepart}
          onFermer={() => setChambreChoisie(null)}
        />
      )}
    </div>
  );
}
