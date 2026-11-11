import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Minus, Plus } from "lucide-react-native";
import { estEpuise, limiteDisponible } from "@hotel-chicago/regles";
import type { Produit } from "@hotel-chicago/types";
import { couleurs, espacements, rayons } from "../tokens";
import { formatMontant } from "../formatMontant";
import { IconeProduit } from "./IconeProduit";

/** Carte d'un produit : un tap sur « + » l'ajoute, un compteur apparaît ensuite. Les produits épuisés sont grisés ; « Plus que N » prévient quand le stock baisse. */
export function CarteProduitVente({ produit, quantite, onChanger }: { produit: Produit; quantite: number; onChanger: (delta: number) => void }) {
  const epuise = estEpuise(produit);
  const limite = limiteDisponible(produit);
  const bientotEpuise = !epuise && limite !== null && limite > 0 && limite <= 5;
  const choisi = quantite > 0;
  return (
    <View style={[styles.carte, choisi && styles.carteChoisie, epuise && styles.carteEpuisee]}>
      <View style={styles.haut}>
        <IconeProduit produit={produit} />
        {bientotEpuise && (
          <View style={styles.alerte}>
            <Text style={styles.alerteTexte}>Plus que {limite}</Text>
          </View>
        )}
      </View>
      <Text style={styles.nom} numberOfLines={2}>
        {produit.nom}
      </Text>
      <View style={styles.bas}>
        <Text style={styles.prix}>{formatMontant(Number(produit.prix), produit.devise)}</Text>
        {epuise ? (
          <View style={styles.epuise}>
            <Text style={styles.epuiseTexte}>Épuisé</Text>
          </View>
        ) : !choisi ? (
          <Pressable style={styles.plus} onPress={() => onChanger(1)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Ajouter ${produit.nom}`}>
            <Plus size={18} color={couleurs.bleu} strokeWidth={2.6} />
          </Pressable>
        ) : (
          <View style={styles.compteur}>
            <Pressable style={styles.compteurBouton} onPress={() => onChanger(-1)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Retirer un ${produit.nom}`}>
              <Minus size={16} color="#fff" strokeWidth={2.8} />
            </Pressable>
            <Text style={styles.compteurValeur} accessibilityLabel={`${quantite} ${produit.nom}`}>
              {quantite}
            </Text>
            <Pressable style={styles.compteurBouton} onPress={() => onChanger(1)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Ajouter un ${produit.nom}`}>
              <Plus size={16} color="#fff" strokeWidth={2.8} />
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  carte: { flex: 1, backgroundColor: couleurs.surface200, borderWidth: 1.5, borderColor: couleurs.bordure, borderRadius: rayons.lg, padding: 10, gap: 8, minHeight: 128 },
  carteChoisie: { backgroundColor: couleurs.bleuClair, borderColor: couleurs.bleu },
  carteEpuisee: { opacity: 0.55 },
  haut: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  alerte: { backgroundColor: couleurs.alerteClair, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  alerteTexte: { fontSize: 10.5, fontWeight: "700", color: couleurs.alerte },
  nom: { flex: 1, fontSize: 13.5, fontWeight: "600", color: couleurs.encre, lineHeight: 17 },
  bas: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: espacements.s1 },
  prix: { fontSize: 15, fontWeight: "800", color: couleurs.encre, flexShrink: 1 },
  plus: { width: 36, height: 36, borderRadius: 18, backgroundColor: couleurs.bleuClair, alignItems: "center", justifyContent: "center" },
  epuise: { backgroundColor: couleurs.dangerClair, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  epuiseTexte: { fontSize: 11, fontWeight: "700", color: couleurs.danger },
  compteur: { flexDirection: "row", alignItems: "center", backgroundColor: couleurs.bleu, borderRadius: 18, height: 36 },
  compteurBouton: { width: 32, height: 36, alignItems: "center", justifyContent: "center" },
  compteurValeur: { color: "#fff", fontWeight: "800", fontSize: 14, minWidth: 14, textAlign: "center" },
});
