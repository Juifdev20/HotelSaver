import * as React from "react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

/** Ce qu'un autre onglet demande à « Séjours » d'ouvrir (11/11/2026) : l'enregistrement d'une arrivée, la fiche d'un séjour, ou sa facturation. */
export type DemandeSejour =
  | { type: "nouvelle"; chambreId: string }
  | { type: "detail"; reservationId: string }
  | { type: "facturer"; reservationId: string };

interface ContexteDemandeSejour {
  demande: DemandeSejour | null;
  demander: (d: DemandeSejour) => void;
  consommer: () => void;
}

const Ctx = createContext<ContexteDemandeSejour | null>(null);

export function FournisseurDemandeSejour({ children }: { children: React.ReactNode }) {
  const [demande, setDemande] = useState<DemandeSejour | null>(null);
  const demander = useCallback((d: DemandeSejour) => setDemande(d), []);
  const consommer = useCallback(() => setDemande(null), []);
  const valeur = useMemo(() => ({ demande, demander, consommer }), [demande, demander, consommer]);
  return <Ctx.Provider value={valeur}>{children}</Ctx.Provider>;
}

export function useDemandeSejour(): ContexteDemandeSejour {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDemandeSejour doit être utilisé sous <FournisseurDemandeSejour>.");
  return v;
}
