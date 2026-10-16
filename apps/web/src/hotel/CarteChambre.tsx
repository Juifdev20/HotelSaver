import * as React from "react";
import { useState } from "react";
import { BedDouble, ChevronLeft, ChevronRight } from "lucide-react";
import { formatMontant } from "@hotel-chicago/ui";
import type { Chambre, ChambrePublique } from "@hotel-chicago/types";
import { dateAbonnement } from "@hotel-chicago/regles";

/** Carte de chambre avec ses photos (2 au plus) en mini-diaporama. Sans photo :
 * un visuel de remplacement aux couleurs de l'hôtel, jamais une carte cassée. */
export function CarteChambre({ chambre, onReserver, libelleBouton = "Réserver" }: {
  chambre: Chambre | ChambrePublique;
  onReserver?: () => void;
  libelleBouton?: string;
}) {
  const [index, setIndex] = useState(0);
  const photos = chambre.photos ?? [];
  // Une chambre déjà réservée (acompte payé ou réservation confirmée) reste visible mais ne se réserve plus : pas de bouton, étiquette claire.
  const disponibilite = "disponibilite" in chambre ? chambre.disponibilite : "DISPONIBLE";
  const libreLe = "libreLe" in chambre ? chambre.libreLe : null;
  const prise = disponibilite !== "DISPONIBLE";
  const aller = (delta: number) => setIndex((i) => (i + delta + photos.length) % photos.length);

  return (
    <article className={`chambre-carte${prise ? " chambre-carte--prise" : ""}`} data-disponibilite={disponibilite}>
      <div className="chambre-carte__media">
        {photos.length > 0 ? (
          <img key={photos[index]} src={photos[index]} alt={`Chambre ${chambre.numero} — ${chambre.type}`} loading="lazy" />
        ) : (
          <div className="chambre-carte__vide" aria-hidden="true">
            <BedDouble size={44} />
          </div>
        )}
        {photos.length > 1 && (
          <>
            <button type="button" className="chambre-carte__fleche chambre-carte__fleche--g" onClick={() => aller(-1)} aria-label="Photo précédente">
              <ChevronLeft size={18} />
            </button>
            <button type="button" className="chambre-carte__fleche chambre-carte__fleche--d" onClick={() => aller(1)} aria-label="Photo suivante">
              <ChevronRight size={18} />
            </button>
            <div className="chambre-carte__points" aria-hidden="true">
              {photos.map((p, i) => (
                <span key={p} className={i === index ? "actif" : ""} />
              ))}
            </div>
          </>
        )}
        <span className={`chambre-carte__etiquette${prise ? " chambre-carte__etiquette--prise" : ""}`}>
          {disponibilite === "RESERVEE" ? "Déjà réservée" : disponibilite === "EN_COURS_DE_PAIEMENT" ? "Réservation en cours" : "Disponible"}
        </span>
      </div>
      <div className="chambre-carte__corps">
        <div>
          <h3>{chambre.type}</h3>
          <p>Chambre {chambre.numero}</p>
        </div>
        <div className="chambre-carte__prix">
          <strong>{formatMontant(chambre.prixParNuit, chambre.devise)}</strong>
          <small>par nuit</small>
        </div>
      </div>
      {prise && (
        <p className="chambre-carte__prise" role="note">
          {disponibilite === "RESERVEE"
            ? libreLe
              ? `Déjà réservée. Libre à partir du ${dateAbonnement(libreLe)}.`
              : "Déjà réservée pour ces dates. Choisissez d'autres dates ou une autre chambre."
            : "Un autre client est en train de réserver cette chambre. Réessayez dans quelques minutes."}
        </p>
      )}
      {onReserver && !prise && (
        <button type="button" className="chambre-carte__bouton" onClick={onReserver}>
          {libelleBouton}
        </button>
      )}
    </article>
  );
}
