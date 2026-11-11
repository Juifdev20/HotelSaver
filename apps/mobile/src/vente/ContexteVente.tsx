import * as React from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { changerQuantite, type Selection } from "@hotel-chicago/regles";
import type { Produit } from "@hotel-chicago/types";
import { useSession } from "../contexteSession";

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
  /** Remplace la sélection d'un onglet (ex. retirer ce qui n'existe plus au catalogue). */
  definir: (onglet: string, selection: Selection) => void;
}

const VIDE: Selection = {};
const Ctx = createContext<ContexteVente | null>(null);

/**
 * Paniers de la caisse : gardés en mémoire pour survivre aux changements d'onglet de l'application ET écrits sur l'appareil (AsyncStorage),
 * pour qu'un téléphone qui redémarre ou une application fermée par Android ne fasse pas perdre une sélection en cours (offline first).
 * Seul ce qui est validé (table créée, produits ajoutés, encaissement) passe par la base locale et la synchronisation.
 */
export function FournisseurVente({ children }: { children: React.ReactNode }) {
  const { utilisateur } = useSession();
  const cle = `hotelsaver:vente:${utilisateur.hotelId}:${utilisateur.userId}`;
  const [etat, setEtat] = useState<EtatVente>({ onglet: ONGLET_NOUVELLE_VENTE, selections: {} });
  const charge = useRef(false);

  useEffect(() => {
    let actif = true;
    charge.current = false;
    AsyncStorage.getItem(cle)
      .then((brut) => {
        if (!actif || !brut) return;
        const lu = JSON.parse(brut) as Partial<EtatVente>;
        if (lu && typeof lu === "object") setEtat({ onglet: typeof lu.onglet === "string" ? lu.onglet : ONGLET_NOUVELLE_VENTE, selections: lu.selections && typeof lu.selections === "object" ? lu.selections : {} });
      })
      .catch(() => undefined)
      .finally(() => {
        charge.current = true;
      });
    return () => {
      actif = false;
    };
  }, [cle]);

  useEffect(() => {
    if (!charge.current) return;
    AsyncStorage.setItem(cle, JSON.stringify(etat)).catch(() => undefined);
  }, [cle, etat]);

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
