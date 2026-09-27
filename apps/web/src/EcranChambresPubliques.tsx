import * as React from "react";
import { useEffect, useState } from "react";
import { listerChambresDisponibles } from "@hotel-chicago/api-client";
import { RoomCard } from "@hotel-chicago/ui";
import type { Chambre } from "@hotel-chicago/types";
import { configuration } from "./config";
import { FormulaireDemandeReservation } from "./FormulaireDemandeReservation";

/** Le backend ne renvoie déjà que des chambres disponibles (voir
 * PublicService.findChambresDisponibles) — "Disponible" est donc vrai pour
 * chaque ligne affichée ici, pas une donnée à recalculer côté client. */
export function EcranChambresPubliques({ sousDomaine }: { sousDomaine: string }) {
  const [dateArrivee, setDateArrivee] = useState("");
  const [dateDepart, setDateDepart] = useState("");
  const [chambres, setChambres] = useState<Chambre[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chambreChoisie, setChambreChoisie] = useState<Chambre | null>(null);

  const datesChoisies = Boolean(dateArrivee && dateDepart);

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
    <div className="page">
      <h1 className="titre-page">Chambres disponibles</h1>

      <div className="selecteur-dates">
        <div>
          <label className="label" htmlFor="date-arrivee">
            Arrivée
          </label>
          <input id="date-arrivee" className="champ" type="date" value={dateArrivee} onChange={(e) => setDateArrivee(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="date-depart">
            Départ
          </label>
          <input id="date-depart" className="champ" type="date" value={dateDepart} onChange={(e) => setDateDepart(e.target.value)} />
        </div>
      </div>
      {!datesChoisies && <p className="sous-titre" style={{ textAlign: "left" }}>Choisissez vos dates pour pouvoir envoyer une demande de réservation.</p>}

      {chargement && <p>Chargement…</p>}
      {erreur && <p className="erreur">{erreur}</p>}

      {!chargement && !erreur && (
        <div className="grille-cartes">
          {chambres.map((c) => (
            <RoomCard
              key={c.id}
              numero={c.numero}
              type={c.type}
              prix={c.prixParNuit}
              devise={c.devise}
              statutTone="success"
              statutLabel="Disponible"
              onClick={datesChoisies ? () => setChambreChoisie(c) : undefined}
            />
          ))}
          {chambres.length === 0 && <p>Aucune chambre disponible pour cette période.</p>}
        </div>
      )}

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
