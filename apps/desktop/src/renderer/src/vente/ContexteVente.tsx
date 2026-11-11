import * as React from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { changerQuantite, type Selection } from "@hotel-chicago/regles";
import type { Produit } from "@hotel-chicago/types";

/** Identifiant de l'onglet « Nouvelle vente » (les autres onglets portent l'identifiant de leur table). */
export const ONGLET_NOUVELLE_VENTE = "nouvelle";

interface EtatVente {
  onglet: string;
  /** Une sélection par onglet : le panier de la nouvelle vente, et les produits choisis mais pas encore ajoutés à chaque table. */
  selections: Record<string, Selection>;
}

interface ContexteVente {
  onglet: string;
  choisirOnglet: (id: string) => void;
  selection: (onglet: string) => Selection;
  changer: (onglet: string, produit: Produit, delta: number) => void;
  vider: (onglet: string) => void;
  definir: (onglet: string, selection: Selection) => void;
}

const VIDE: Selection = {};
const Ctx = createContext<ContexteVente | null>(null);

function lire(cle: string): EtatVente {
  try {
    const brut = localStorage.getItem(cle);
    if (!brut) return { onglet: ONGLET_NOUVELLE_VENTE, selections: {} };
    const lu = JSON.parse(brut) as Partial<EtatVente>;
    return { onglet: typeof lu.onglet === "string" ? lu.onglet : ONGLET_NOUVELLE_VENTE, selections: lu.selections && typeof lu.selections === "object" ? lu.selections : {} };
  } catch {
    return { onglet: ONGLET_NOUVELLE_VENTE, selections: {} };
  }
}

/**
 * Paniers de la caisse : gardés en mémoire pour survivre aux changements de page ET écrits sur le poste (localStorage), pour qu'une fermeture de
 * l'application ou une coupure de courant ne fasse pas perdre une sélection en cours (offline first). Seul ce qui est validé (table créée, produits
 * ajoutés, encaissement) passe par la base locale et la synchronisation. `cle` = hôtel + utilisateur : deux comptes sur un poste ne se mélangent pas.
 */
export function FournisseurVente({ cle, children }: { cle: string; children: React.ReactNode }) {
  const [etat, setEtat] = useState<EtatVente>(() => lire(cle));
  const cleCourante = useRef(cle);

  useEffect(() => {
    if (cleCourante.current === cle) return;
    cleCourante.current = cle;
    setEtat(lire(cle));
  }, [cle]);

  useEffect(() => {
    try {
      localStorage.setItem(cleCourante.current, JSON.stringify(etat));
    } catch {
      // Stockage plein ou refusé : la sélection reste en mémoire, rien de bloquant.
    }
  }, [etat]);

  const choisirOnglet = useCallback((id: string) => setEtat((e) => (e.onglet === id ? e : { ...e, onglet: id })), []);
  const changer = useCallback(
    (onglet: string, produit: Produit, delta: number) =>
      setEtat((e) => {
        const courante = e.selections[onglet] ?? VIDE;
        const suivante = changerQuantite(courante, produit, delta);
        return suivante === courante ? e : { ...e, selections: { ...e.selections, [onglet]: suivante } };
      }),
    []
  );
  const definir = useCallback((onglet: string, selection: Selection) => setEtat((e) => ({ ...e, selections: { ...e.selections, [onglet]: selection } })), []);
  const vider = useCallback(
    (onglet: string) =>
      setEtat((e) => {
        if (!e.selections[onglet]) return e;
        const { [onglet]: _retire, ...reste } = e.selections;
        return { ...e, selections: reste };
      }),
    []
  );

  const valeur = useMemo<ContexteVente>(
    () => ({ onglet: etat.onglet, choisirOnglet, selection: (o) => etat.selections[o] ?? VIDE, changer, vider, definir }),
    [etat, choisirOnglet, changer, vider, definir]
  );
  return <Ctx.Provider value={valeur}>{children}</Ctx.Provider>;
}

export function useVente(): ContexteVente {
  const v = useContext(Ctx);
  if (!v) throw new Error("useVente doit être utilisé sous <FournisseurVente>.");
  return v;
}
