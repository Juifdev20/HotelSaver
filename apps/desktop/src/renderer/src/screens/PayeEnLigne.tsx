import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import type { AcompteEnLignePersonnel } from "@hotel-chicago/types";
import { OPERATEURS_MOBILE_MONEY, dateAbonnement, montantAbonnement } from "@hotel-chicago/regles";
import { StatusBadge } from "@hotel-chicago/ui";

/**
 * « Payé en ligne » : la réception et le patron voient quelles réservations ont déjà leur acompte payé par le client sur le site (Mobile Money
 * ou carte), sans ouvrir ScanLinkPay. Lu auprès du serveur (comme les remboursements) : sans connexion Internet, le repère n'apparaît pas — le
 * montant d'acompte, lui, reste affiché partout (il est dans la réservation, même hors ligne).
 */
export function useAcomptesEnLigne(client: ClientApi): { parReservation: Map<string, AcompteEnLignePersonnel[]>; recharger: () => void } {
  const [liste, setListe] = useState<AcompteEnLignePersonnel[]>([]);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let actif = true;
    const lire = () =>
      client
        .acomptesPayesEnLigne()
        // Hors ligne, fonction non incluse, ancien serveur : pas de repère, jamais d'erreur affichée pour ça.
        .then((l) => actif && setListe(l))
        .catch(() => undefined);
    void lire();
    // Un client peut payer pendant que l'écran est ouvert : relecture discrète toutes les 30 secondes.
    const minuteur = setInterval(() => void lire(), 30_000);
    return () => {
      actif = false;
      clearInterval(minuteur);
    };
  }, [client, version]);

  const parReservation = new Map<string, AcompteEnLignePersonnel[]>();
  for (const a of liste) parReservation.set(a.reservationId, [...(parReservation.get(a.reservationId) ?? []), a]);
  return { parReservation, recharger: useCallback(() => setVersion((v) => v + 1), []) };
}

export function libelleMoyen(a: AcompteEnLignePersonnel): string {
  if (a.moyen === "CARTE") return "Carte bancaire";
  return a.operateur ? OPERATEURS_MOBILE_MONEY[a.operateur].libelle : "Mobile Money";
}

/** Petit repère pour les listes : « Payé en ligne », puis où en est l'éventuel remboursement. */
export function BadgePayeEnLigne({ paiements }: { paiements: AcompteEnLignePersonnel[] | undefined }) {
  if (!paiements || paiements.length === 0) return null;
  const statut = paiements.find((p) => p.remboursement !== null)?.remboursement ?? null;
  const label = statut === "A_FAIRE" ? "Payé en ligne · à rembourser ?" : statut === "EFFECTUE" ? "Payé en ligne · remboursé" : statut === "CONSERVE" ? "Payé en ligne · conservé" : "Payé en ligne";
  return (
    <div data-testid="badge-paye-en-ligne" style={{ marginTop: 2 }}>
      <StatusBadge tone={statut === "A_FAIRE" ? "warning" : statut ? "neutral" : "success"} label={label} />
    </div>
  );
}

const TEXTE_REMBOURSEMENT = { A_FAIRE: "Remboursement à décider (écran Remboursements, patron)", EFFECTUE: "Remboursé au client", CONSERVE: "Acompte conservé par l'hôtel" } as const;

/** Détail dans la fiche d'une réservation : combien, comment, quand, quelle référence. */
export function BlocPayeEnLigne({ paiements }: { paiements: AcompteEnLignePersonnel[] | undefined }) {
  if (!paiements || paiements.length === 0) return null;
  return (
    <section className="parametres-ligne" style={{ display: "block" }} aria-label="Paiement en ligne" data-testid="bloc-paye-en-ligne">
      <p className="hc-text-body-strong">Acompte payé en ligne par le client</p>
      <ul>
        {paiements.map((p) => (
          <li key={p.paiementId} className="hc-text-body">
            {montantAbonnement(p.montant, p.devise)} reçus{p.confirmeLe ? ` le ${dateAbonnement(p.confirmeLe)}` : ""} · {libelleMoyen(p)}
            {p.telephoneMasque ? ` (${p.telephoneMasque})` : ""}
            {p.reference ? ` · Réf. ${p.reference}` : ""}
            {p.remboursement ? ` — ${TEXTE_REMBOURSEMENT[p.remboursement]}` : ""}
          </li>
        ))}
      </ul>
      <p className="texte-discret">L'argent est déjà dans le compte ScanLinkPay de l'hôtel.</p>
    </section>
  );
}
