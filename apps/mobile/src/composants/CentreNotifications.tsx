import * as React from "react";
import { useMemo } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Bell, CalendarDays, Package, ShieldAlert, Sun } from "lucide-react-native";
import { CATEGORIE_PAR_TYPE, type NotificationApp } from "@hotel-chicago/types";
import { couleurs, espacements, rayons } from "../tokens";
import { useNotifications } from "../notifications/ContexteNotifications";
import { ajouterJours, formaterLubumbashi, heureCourte, jourDeIso, jourLubumbashi } from "../dates";

const ICONES = { reservations: CalendarDays, stock: Package, quotidien: Sun, securite: ShieldAlert };

/** Jours « Aujourd'hui » / « Hier » au calendrier de Lubumbashi (dates.ts), pas à celui du fuseau du téléphone. */
function libelleJour(iso: string): string {
  const jour = jourDeIso(iso);
  if (jour === jourLubumbashi()) return "Aujourd'hui";
  if (jour === jourLubumbashi(ajouterJours(new Date(), -1))) return "Hier";
  return formaterLubumbashi(iso, { weekday: "long", day: "numeric", month: "long" });
}

function heure(iso: string): string {
  return heureCourte(iso);
}

type Ligne = { cle: string; jour: string } | { cle: string; notification: NotificationApp };

/** Centre de notifications plein écran, groupé par jour (ouvert par la cloche de l'en-tête). */
export function CentreNotifications() {
  const { notifications, nonLues, centreOuvert, fermerCentre, toutMarquerLu, ouvrirNotification } = useNotifications();
  const insets = useSafeAreaInsets();

  const lignes = useMemo<Ligne[]>(() => {
    const resultat: Ligne[] = [];
    let dernierJour = "";
    for (const notification of notifications) {
      const jour = libelleJour(notification.createdAt);
      if (jour !== dernierJour) {
        resultat.push({ cle: `jour-${jour}`, jour });
        dernierJour = jour;
      }
      resultat.push({ cle: notification.id, notification });
    }
    return resultat;
  }, [notifications]);

  return (
    <Modal visible={centreOuvert} animationType="slide" onRequestClose={fermerCentre}>
      <View style={styles.ecran}>
        <View style={[styles.entete, { paddingTop: insets.top + espacements.s2 }]}>
          <Pressable onPress={fermerCentre} hitSlop={10} accessibilityRole="button" accessibilityLabel="Retour" style={styles.retour}>
            <ArrowLeft size={22} color={couleurs.navy} />
          </Pressable>
          <Text style={styles.titre} accessibilityRole="header">Notifications</Text>
          {nonLues > 0 ? (
            <Pressable onPress={() => void toutMarquerLu()} hitSlop={8} style={styles.cote} accessibilityRole="button" accessibilityLabel="Tout marquer comme lu">
              <Text style={styles.toutLire}>Tout marquer lu</Text>
            </Pressable>
          ) : (
            <View style={styles.cote} />
          )}
        </View>

        {lignes.length === 0 ? (
          <View style={styles.vide}>
            <Bell size={36} color={couleurs.encreFaible} />
            <Text style={styles.videTexte}>Aucune notification pour le moment.</Text>
          </View>
        ) : (
          <FlatList
            data={lignes}
            keyExtractor={(l) => l.cle}
            contentContainerStyle={{ paddingBottom: insets.bottom + espacements.s4 }}
            renderItem={({ item }) => {
              if ("jour" in item) return <Text style={styles.jour}>{item.jour}</Text>;
              const n = item.notification;
              const Icone = ICONES[CATEGORIE_PAR_TYPE[n.type]];
              return (
                <Pressable
                  style={[styles.carte, !n.lue && styles.carteNonLue]}
                  onPress={() => ouvrirNotification(n)}
                  accessibilityRole="button"
                  accessibilityLabel={`${n.lue ? "" : "Non lue. "}${n.titre}. ${n.corps}`}
                >
                  <View style={styles.icone}>
                    <Icone size={18} color={couleurs.bleu} />
                  </View>
                  <View style={styles.texte}>
                    <Text style={styles.carteTitre}>{n.titre}</Text>
                    <Text style={styles.carteCorps}>{n.corps}</Text>
                  </View>
                  <View style={styles.droite}>
                    <Text style={styles.heure}>{heure(n.createdAt)}</Text>
                    {!n.lue && <View style={styles.point} />}
                  </View>
                </Pressable>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: couleurs.surface200 },
  entete: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: couleurs.surface200,
    borderBottomWidth: 1,
    borderBottomColor: couleurs.bordure,
    paddingHorizontal: espacements.s3,
    paddingBottom: espacements.s3,
  },
  retour: { width: 100, minHeight: 44, justifyContent: "center" },
  cote: { width: 100, minHeight: 44, justifyContent: "center", alignItems: "flex-end" },
  titre: { color: couleurs.navy, fontSize: 17, fontWeight: "700" },
  toutLire: { color: couleurs.bleu, fontWeight: "600", fontSize: 12 },
  jour: {
    fontSize: 12,
    fontWeight: "700",
    color: couleurs.encreAttenuee,
    textTransform: "capitalize",
    paddingHorizontal: espacements.s4,
    paddingTop: espacements.s4,
    paddingBottom: espacements.s2,
  },
  carte: {
    flexDirection: "row",
    alignItems: "center",
    gap: espacements.s3,
    marginHorizontal: espacements.s3,
    marginBottom: espacements.s2,
    padding: espacements.s3,
    borderRadius: rayons.lg,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: couleurs.bordure,
  },
  carteNonLue: { backgroundColor: couleurs.bleuClair },
  icone: {
    width: 36,
    height: 36,
    borderRadius: rayons.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  texte: { flex: 1, gap: 2 },
  carteTitre: { fontSize: 14, fontWeight: "700", color: couleurs.encre },
  carteCorps: { fontSize: 13, color: couleurs.encreAttenuee },
  droite: { alignItems: "flex-end", gap: 6 },
  heure: { fontSize: 11, color: couleurs.encreFaible },
  point: { width: 9, height: 9, borderRadius: rayons.pill, backgroundColor: couleurs.bleu },
  vide: { flex: 1, alignItems: "center", justifyContent: "center", gap: espacements.s3 },
  videTexte: { color: couleurs.encreAttenuee, fontSize: 14 },
});
