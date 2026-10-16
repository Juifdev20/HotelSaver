import { useEffect, useState } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import type { AcompteEnLignePersonnel } from "@hotel-chicago/types";

/**
 * « Payé en ligne » : les acomptes que les clients ont déjà payés sur le site, par réservation. Lu auprès du serveur (rafraîchi toutes les
 * 30 secondes tant que l'écran est ouvert) ; sans Internet ou sans la fonction, la liste est vide et rien ne s'affiche — jamais d'erreur pour ça.
 */
export function useAcomptesEnLigne(client: Pick<ClientApi, "acomptesPayesEnLigne">): Map<string, AcompteEnLignePersonnel[]> {
  const [liste, setListe] = useState<AcompteEnLignePersonnel[]>([]);
  useEffect(() => {
    let actif = true;
    const lire = () =>
      client
        .acomptesPayesEnLigne()
        .then((l) => actif && setListe(l))
        .catch(() => undefined);
    void lire();
    const minuteur = setInterval(() => void lire(), 30_000);
    return () => {
      actif = false;
      clearInterval(minuteur);
    };
  }, [client]);
  const parReservation = new Map<string, AcompteEnLignePersonnel[]>();
  for (const a of liste) parReservation.set(a.reservationId, [...(parReservation.get(a.reservationId) ?? []), a]);
  return parReservation;
}
