import type { InfoHotelPublique } from "@hotel-chicago/types";

/**
 * La formule de l'hôtel inclut-elle la réception, donc la réservation en ligne ? Le serveur répond `reservationEnLigne: false` quand ce
 * n'est pas le cas ; absent (ancien serveur) = ouverte, on ne ferme jamais un site par erreur.
 */
export function reservationOuverte(info: InfoHotelPublique): boolean {
  return (info as InfoHotelPublique & { reservationEnLigne?: boolean }).reservationEnLigne !== false;
}
