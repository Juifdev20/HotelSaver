import * as React from "react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ErreurApi, listerChambresDisponibles } from "@hotel-chicago/api-client";
import type { ChambrePublique, InfoHotelPublique } from "@hotel-chicago/types";
import { configuration } from "./config";
import { FormulaireDemandeReservation } from "./FormulaireDemandeReservation";
import { CarteChambre } from "./hotel/CarteChambre";
import { Apparition } from "./accueil/animations";
import { reservationOuverte } from "./hotel/reservation";

/** Le serveur renvoie TOUTES les chambres avec leur disponibilité pour la période (voir PublicService.findChambresDisponibles) : les chambres
 * déjà réservées restent visibles, marquées « Déjà réservée », sans bouton pour les demander. La disponibilité n'est jamais recalculée ici.
 * Les dates peuvent arriver pré-remplies (`?arrivee=&depart=`) depuis la
 * barre de recherche de l'accueil de l'hôtel. */
export function EcranChambresPubliques({ sousDomaine, info }: { sousDomaine: string; info: InfoHotelPublique }) {
  const reservation = reservationOuverte(info);
  const [params] = useSearchParams();
  const [dateArrivee, setDateArrivee] = useState(params.get("arrivee") ?? "");
  const [dateDepart, setDateDepart] = useState(params.get("depart") ?? "");
  const [chambres, setChambres] = useState<ChambrePublique[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chambreChoisie, setChambreChoisie] = useState<ChambrePublique | null>(null);

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
        if (!annule) setErreur(e instanceof ErreurApi && e.statusCode === 404 ? "Ce service n'est pas disponible pour cet hôtel." : e instanceof Error ? e.message : "Erreur de chargement.");
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
        <p>
          {reservation
            ? "Choisissez vos dates pour voir les chambres libres et envoyer une demande de réservation."
            : "Choisissez vos dates pour voir les chambres libres. Pour réserver, contactez directement l'hôtel."}
        </p>
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

        {!reservation && (info.telephoneContact || info.whatsapp) && (
          <p className="hotel-astuce">
            Pour réserver :{" "}
            {info.telephoneContact && <a href={`tel:${info.telephoneContact.replace(/\s/g, "")}`}>{info.telephoneContact}</a>}
            {info.telephoneContact && info.whatsapp && " · "}
            {info.whatsapp && (
              <a href={`https://wa.me/${info.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">
                WhatsApp {info.whatsapp}
                <span className="visuellement-cache"> (s'ouvre dans un nouvel onglet)</span>
              </a>
            )}
          </p>
        )}

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
                  onReserver={reservation && datesChoisies ? () => setChambreChoisie(c) : undefined}
                  libelleBouton="Demander cette chambre"
                />
              </Apparition>
            ))}
            {chambres.length === 0 && <p className="hotel-vide">Aucune chambre à afficher pour le moment.</p>}
            {chambres.length > 0 && chambres.every((c) => c.disponibilite !== "DISPONIBLE") && (
              <p className="hotel-vide">Toutes nos chambres sont déjà réservées pour cette période. Essayez d'autres dates.</p>
            )}
          </div>
        )}
        {reservation && !datesChoisies && !chargement && chambres.some((c) => c.disponibilite === "DISPONIBLE") && (
          <p className="hotel-astuce">Sélectionnez une date d'arrivée et de départ pour pouvoir réserver.</p>
        )}
      </div>

      {reservation && chambreChoisie && (
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
