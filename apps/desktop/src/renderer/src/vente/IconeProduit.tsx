import * as React from "react";
import { Beer, Coffee, CupSoda, GlassWater, Utensils } from "lucide-react";
import { familleIconeProduit, type FamilleIcone } from "@hotel-chicago/regles";
import type { Produit } from "@hotel-chicago/types";

const ICONES: Record<FamilleIcone, typeof Beer> = { biere: Beer, soda: CupSoda, eau: GlassWater, chaud: Coffee, plat: Utensils };

/** Pastille colorée à l'icône du produit (les photos viendront plus tard). Couleurs par thème : voir vente.css. */
export function IconeProduit({ produit, taille = 48 }: { produit: Pick<Produit, "typeProduit" | "nom" | "categorie">; taille?: number }) {
  const famille = familleIconeProduit(produit);
  const Icone = ICONES[famille];
  return (
    <span className={`vente-icone vente-icone--${famille}`} style={{ width: taille, height: taille }} aria-hidden="true">
      <Icone size={Math.round(taille * 0.55)} />
    </span>
  );
}
