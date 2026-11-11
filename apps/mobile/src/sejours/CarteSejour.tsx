import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CircleCheck, LogIn, LogOut } from "lucide-react-native";
import type { Reservation, StatutReservation } from "@hotel-chicago/types";
import type { ProposeActionSejour } from "@hotel-chicago/regles";
import { couleurs, espacements, rayons } from "../tokens";
import { formatMontant } from "../formatMontant";
import { dateCourte } from "../dates";
import { parTheme } from "../theme/theme";

export type GenreCarte = "arrivee" | "depart" | "present";

const LABEL_STATUT: Record<StatutReservation, string> = {
  EN_ATTENTE: "En attente",
  CONFIRMEE: "Confirmée",
  EN_COURS: "En cours",
  TERMINEE: "Terminée",
  ANNULEE: "Annulée",
};

const TON_STATUT: Record<StatutReservation, { fond: string; texte: string }> = parTheme(() => ({
  EN_ATTENTE: { fond: couleurs.alerteClair, texte: couleurs.alerte },
  CONFIRMEE: { fond: couleurs.bleuClair, texte: couleurs.bleu },
  EN_COURS: { fond: couleurs.succesClair, texte: couleurs.succes },
  TERMINEE: { fond: couleurs.bordure, texte: couleurs.encre },
  ANNULEE: { fond: couleurs.dangerClair, texte: couleurs.danger },
}));

/** Nombre de nuits d'un séjour (au moins une). */
export function nuitsDe(r: Pick<Reservation, "dateArrivee" | "dateDepart">): number {
  return Math.max(1, Math.round((new Date(r.dateDepart).getTime() - new Date(r.dateArrivee).getTime()) / 86_400_000));
}

/** Ce qui reste à payer pour la chambre : prix du séjour moins l'acompte (payé en ligne ou à la réception). */
export function resteAPayerChambre(r: Reservation): number {
  return Math.max(0, Number(r.chambre.prixParNuit) * nuitsDe(r) - Number(r.acompte));
}

function initiales(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  return ((mots[0]?.[0] ?? "?") + (mots.length > 1 ? (mots[mots.length - 1]?.[0] ?? "") : "")).toUpperCase();
}

export interface CarteSejourProps {
  sejour: Reservation;
  genre: GenreCarte;
  action: ProposeActionSejour | null;
  actionEnCours?: boolean;
  /** Ligne d'alerte (chambre déjà prise, en attente de synchro…). */
  alertes?: string[];
  onOuvrir: () => void;
  onAction: (action: ProposeActionSejour) => void;
}

/** Un séjour du jour : qui, quelle chambre, où en est le paiement, et UN gros bouton — la bonne action. */
export function CarteSejour({ sejour, genre, action, actionEnCours = false, alertes = [], onOuvrir, onAction }: CarteSejourProps) {
  const tonStatut = genre === "depart" ? { fond: couleurs.alerteClair, texte: couleurs.alerte } : genre === "present" ? TON_STATUT.EN_COURS : TON_STATUT[sejour.statut];
  const libelleStatut = genre === "depart" ? "À facturer" : genre === "present" ? "Présent" : LABEL_STATUT[sejour.statut];
  const nuits = nuitsDe(sejour);
  const acompte = Number(sejour.acompte);
  const infoSejour =
    genre === "arrivee"
      ? `Chambre ${sejour.chambre.numero} · ${sejour.chambre.type} · ${nuits} nuit${nuits > 1 ? "s" : ""}`
      : `Chambre ${sejour.chambre.numero} · ${sejour.chambre.type} · départ ${dateCourte(sejour.dateDepart)}`;
  const IconeAction = action?.id === "checkin" ? LogIn : action?.id === "facturer" ? LogOut : CircleCheck;
  return (
    <View style={styles.carte}>
      <Pressable
        onPress={onOuvrir}
        style={styles.corps}
        accessibilityRole="button"
        accessibilityLabel={`${sejour.client.nom}, ${infoSejour}, ${libelleStatut}${acompte > 0 ? `, acompte payé ${formatMontant(acompte, sejour.chambre.devise)}` : ""}`}
        accessibilityHint="Ouvre la fiche du séjour"
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarTexte}>{initiales(sejour.client.nom)}</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.entete}>
            <Text style={styles.nom} numberOfLines={1}>
              {sejour.client.nom}
            </Text>
            <View style={[styles.puce, { backgroundColor: tonStatut.fond }]}>
              <Text style={[styles.puceTexte, { color: tonStatut.texte }]}>{libelleStatut}</Text>
            </View>
          </View>
          <Text style={styles.info} numberOfLines={1}>
            {infoSejour}
          </Text>
          {acompte > 0 && <Text style={styles.acompte}>Acompte payé : {formatMontant(acompte, sejour.chambre.devise)}</Text>}
          {alertes.map((a) => (
            <Text key={a} style={styles.alerte}>
              {a}
            </Text>
          ))}
        </View>
      </Pressable>
      {action && (
        <Pressable
          style={[styles.bouton, action.id === "confirmer" ? styles.boutonSecondaire : styles.boutonPrincipal, actionEnCours && { opacity: 0.6 }]}
          onPress={() => onAction(action)}
          disabled={actionEnCours}
          accessibilityRole="button"
          accessibilityLabel={`${action.libelle}, ${sejour.client.nom}`}
          accessibilityState={{ disabled: actionEnCours, busy: actionEnCours }}
        >
          <IconeAction size={18} color={action.id === "confirmer" ? couleurs.bleu : "#fff"} />
          <Text style={[styles.boutonTexte, action.id === "confirmer" && { color: couleurs.bleu }]}>{actionEnCours ? "…" : action.libelle}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  carte: { backgroundColor: couleurs.surface200, borderRadius: rayons.lg, borderWidth: 1, borderColor: couleurs.bordure, padding: espacements.s3, gap: espacements.s3 },
  corps: { flexDirection: "row", gap: espacements.s3, alignItems: "flex-start", minHeight: 44 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: couleurs.bleuClair, alignItems: "center", justifyContent: "center" },
  avatarTexte: { fontSize: 14, fontWeight: "800", color: couleurs.bleu },
  entete: { flexDirection: "row", alignItems: "center", gap: espacements.s2 },
  nom: { flex: 1, fontSize: 16, fontWeight: "700", color: couleurs.encre },
  puce: { paddingHorizontal: espacements.s2, paddingVertical: 3, borderRadius: rayons.pill },
  puceTexte: { fontSize: 11, fontWeight: "700" },
  info: { fontSize: 13, color: couleurs.encreAttenuee },
  acompte: { fontSize: 12, fontWeight: "600", color: couleurs.succes },
  alerte: { fontSize: 12, fontWeight: "700", color: couleurs.danger },
  bouton: { minHeight: 48, borderRadius: rayons.sm, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  boutonPrincipal: { backgroundColor: couleurs.bleu },
  boutonSecondaire: { borderWidth: 1.5, borderColor: couleurs.bleu, backgroundColor: couleurs.surface200 },
  boutonTexte: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
