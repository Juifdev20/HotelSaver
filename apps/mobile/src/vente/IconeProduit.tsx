import * as React from "react";
import { View } from "react-native";
import { Beer, Coffee, CupSoda, GlassWater, Utensils } from "lucide-react-native";
import { familleIconeProduit, type FamilleIcone } from "@hotel-chicago/regles";
import type { Produit } from "@hotel-chicago/types";
import { couleurs } from "../tokens";

const STYLES: Record<FamilleIcone, { fond: string; ton: string; Icone: typeof Beer }> = {
  biere: { fond: couleurs.alerteClair, ton: couleurs.alerte, Icone: Beer },
  soda: { fond: couleurs.dangerClair, ton: couleurs.danger, Icone: CupSoda },
  eau: { fond: couleurs.infoClair, ton: couleurs.info, Icone: GlassWater },
  chaud: { fond: couleurs.violetClair, ton: couleurs.violet, Icone: Coffee },
  plat: { fond: couleurs.succesClair, ton: couleurs.succes, Icone: Utensils },
};

/** Pastille colorée à l'icône du produit (les photos viendront plus tard). */
export function IconeProduit({ produit, taille = 40 }: { produit: Pick<Produit, "typeProduit" | "nom" | "categorie">; taille?: number }) {
  const { fond, ton, Icone } = STYLES[familleIconeProduit(produit)];
  return (
    <View style={{ width: taille, height: taille, borderRadius: 12, backgroundColor: fond, alignItems: "center", justifyContent: "center" }} accessible={false} importantForAccessibility="no-hide-descendants">
      <Icone size={Math.round(taille * 0.55)} color={ton} />
    </View>
  );
}
