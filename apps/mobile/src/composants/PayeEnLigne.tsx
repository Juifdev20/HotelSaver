import * as React from "react";
import { StyleSheet, Text, View } from "react-native";
import { CircleCheck } from "lucide-react-native";
import type { AcompteEnLignePersonnel } from "@hotel-chicago/types";
import { OPERATEURS_MOBILE_MONEY, dateAbonnement, montantAbonnement } from "@hotel-chicago/regles";
import { couleurs, espacements, rayons } from "../tokens";

function moyen(a: AcompteEnLignePersonnel): string {
  if (a.moyen === "CARTE") return "carte bancaire";
  return a.operateur ? OPERATEURS_MOBILE_MONEY[a.operateur].libelle : "Mobile Money";
}

const REMBOURSEMENT = { A_FAIRE: "remboursement à décider (patron)", EFFECTUE: "remboursé au client", CONSERVE: "acompte conservé par l'hôtel" } as const;

/** Petit repère pour les listes : « Payé en ligne », puis où en est l'éventuel remboursement. */
export function BadgePayeEnLigne({ paiements }: { paiements: AcompteEnLignePersonnel[] | undefined }) {
  if (!paiements || paiements.length === 0) return null;
  const statut = paiements.find((p) => p.remboursement !== null)?.remboursement ?? null;
  const label = statut === "A_FAIRE" ? "Payé en ligne · à rembourser ?" : statut === "EFFECTUE" ? "Payé en ligne · remboursé" : statut === "CONSERVE" ? "Payé en ligne · conservé" : "Payé en ligne";
  const attention = statut === "A_FAIRE";
  return (
    <View style={[styles.badge, attention && styles.badgeAttention]} accessibilityLabel={label}>
      <CircleCheck size={14} color={attention ? couleurs.alerte : couleurs.succes} />
      <Text style={[styles.badgeTexte, attention && { color: couleurs.alerte }]}>{label}</Text>
    </View>
  );
}

/** Détail dans la fiche de réservation : combien, comment, quand, quelle référence. */
export function BlocPayeEnLigne({ paiements }: { paiements: AcompteEnLignePersonnel[] | undefined }) {
  if (!paiements || paiements.length === 0) return null;
  return (
    <View style={styles.bloc} accessibilityRole="summary">
      <Text style={styles.titre}>Acompte payé en ligne par le client</Text>
      {paiements.map((p) => (
        <Text key={p.paiementId} style={styles.ligne}>
          {montantAbonnement(p.montant, p.devise)} reçus{p.confirmeLe ? ` le ${dateAbonnement(p.confirmeLe)}` : ""} · {moyen(p)}
          {p.telephoneMasque ? ` (${p.telephoneMasque})` : ""}
          {p.reference ? ` · Réf. ${p.reference}` : ""}
          {p.remboursement ? ` — ${REMBOURSEMENT[p.remboursement]}` : ""}
        </Text>
      ))}
      <Text style={styles.aide}>L'argent est déjà dans le compte ScanLinkPay de l'hôtel.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", backgroundColor: couleurs.succesClair, borderRadius: rayons.pill, paddingHorizontal: espacements.s2, paddingVertical: 2 },
  badgeAttention: { backgroundColor: couleurs.alerteClair },
  badgeTexte: { fontSize: 12, fontWeight: "700", color: couleurs.succes },
  bloc: { backgroundColor: couleurs.succesClair, borderRadius: rayons.md, padding: espacements.s3, gap: 4 },
  titre: { fontSize: 14, fontWeight: "700", color: couleurs.succes },
  ligne: { fontSize: 13, color: couleurs.encre, lineHeight: 18 },
  aide: { fontSize: 12, color: couleurs.encreAttenuee },
});
