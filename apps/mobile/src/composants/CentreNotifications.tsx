import * as React from "react";
import { useMemo, useState } from "react";
import { Animated, FlatList, Modal, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Bell, CalendarDays, CheckCheck, Package, ShieldAlert, Sun, Trash2 } from "lucide-react-native";
import { CATEGORIE_PAR_TYPE, type NotificationApp } from "@hotel-chicago/types";
import { confirmerAction } from "../confirmer";
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

type Ligne = { cle: string; titre: string } | { cle: string; notification: NotificationApp };

const LARGEUR_EFFACER = 104;

/**
 * Une notification : un toucher l'ouvre ; en la glissant vers la gauche on découvre « Effacer ». Les lecteurs d'écran ont l'action « Effacer » (sans geste).
 */
function LigneNotification({ n, onOuvrir, onEffacer, pied }: { n: NotificationApp; onOuvrir: () => void; onEffacer: () => void; pied?: React.ReactNode }) {
  const decalage = React.useRef(new Animated.Value(0)).current;
  const ouvert = React.useRef(false);
  const finDeGeste = React.useRef(0); // un « clic » qui suit tout de suite un glissement n'est pas un toucher
  const [revele, setRevele] = React.useState(false);
  const Icone = ICONES[CATEGORIE_PAR_TYPE[n.type]];
  const aller = (valeur: number) => {
    ouvert.current = valeur !== 0;
    if (valeur !== 0) setRevele(true);
    Animated.timing(decalage, { toValue: valeur, duration: 140, useNativeDriver: true }).start(() => {
      if (valeur === 0) setRevele(false);
    });
  };
  const geste = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderMove: (_e, g) => {
          if (g.dx < -4) setRevele(true);
          decalage.setValue(Math.max(-LARGEUR_EFFACER, Math.min(0, (ouvert.current ? -LARGEUR_EFFACER : 0) + g.dx)));
        },
        onPanResponderRelease: (_e, g) => {
          finDeGeste.current = Date.now();
          aller((ouvert.current ? -LARGEUR_EFFACER : 0) + g.dx < -LARGEUR_EFFACER / 2 ? -LARGEUR_EFFACER : 0);
        },
        onPanResponderTerminate: () => aller(ouvert.current ? -LARGEUR_EFFACER : 0),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  return (
    <View>
      <View style={styles.rangee}>
        {/* Le bouton n'apparaît qu'à mesure que la carte glisse (sinon il dépasse aux coins arrondis). */}
        <View style={[styles.effacer, { opacity: revele ? 1 : 0 }]} pointerEvents={revele ? "auto" : "none"}>
          <Pressable style={styles.effacerBouton} onPress={onEffacer} accessibilityRole="button" accessibilityLabel={`Effacer la notification : ${n.titre}`}>
            <Trash2 size={22} color="#fff" />
            <Text style={styles.effacerTexte}>Effacer</Text>
          </Pressable>
        </View>
        <Animated.View style={{ transform: [{ translateX: decalage }] }} {...geste.panHandlers}>
          <Pressable
            style={[styles.carte, !n.lue && styles.carteNonLue]}
            onPress={() => {
              if (Date.now() - finDeGeste.current < 300) return;
              if (ouvert.current) aller(0);
              else onOuvrir();
            }}
            accessibilityRole="button"
            accessibilityLabel={`${n.lue ? "" : "Non lue. "}${n.titre}. ${n.corps}`}
            accessibilityActions={[{ name: "delete", label: "Effacer" }]}
            onAccessibilityAction={(e) => {
              if (e.nativeEvent.actionName === "delete") onEffacer();
            }}
          >
            <View style={styles.icone}>
              <Icone size={18} color={couleurs.bleu} />
            </View>
            <View style={styles.texte}>
              <Text style={styles.carteTitre}>{n.titre}</Text>
              <Text style={styles.carteCorps}>{n.corps}</Text>
              <View style={styles.meta}>
                <Text style={styles.heure}>
                  {libelleJour(n.createdAt) === "Aujourd'hui" ? "" : `${libelleJour(n.createdAt)} · `}
                  {heure(n.createdAt)}
                </Text>
              </View>
            </View>
            {!n.lue && <View style={styles.point} />}
          </Pressable>
        </Animated.View>
      </View>
      {pied}
    </View>
  );
}

/** Centre de notifications plein écran (ouvert par la cloche de l'en-tête) : les nouvelles, puis les déjà lues (qui s'effacent toutes seules, sans rien afficher). */
export function CentreNotifications() {
  const { notifications, nonLues, centreOuvert, fermerCentre, toutMarquerLu, toutEffacer, effacer, ouvrirNotification, couperAlerteStock } = useNotifications();
  // Produits dont l'alerte vient d'être coupée depuis cette liste (le bouton devient une confirmation).
  const [coupes, setCoupes] = useState<Record<string, "occupe" | "fait">>({});

  async function couper(produitId: string) {
    setCoupes((c) => ({ ...c, [produitId]: "occupe" }));
    try {
      await couperAlerteStock(produitId);
      setCoupes((c) => ({ ...c, [produitId]: "fait" }));
    } catch {
      setCoupes((c) => {
        const { [produitId]: _retire, ...reste } = c;
        return reste;
      });
    }
  }
  const insets = useSafeAreaInsets();

  const lignes = useMemo<Ligne[]>(() => {
    const nouvelles = notifications.filter((n) => !n.lue);
    const lues = notifications.filter((n) => n.lue);
    const resultat: Ligne[] = [];
    if (nouvelles.length > 0) {
      resultat.push({ cle: "titre-nouvelles", titre: `NOUVELLES · ${nouvelles.length}` });
      for (const n of nouvelles) resultat.push({ cle: n.id, notification: n });
    }
    if (lues.length > 0) {
      resultat.push({ cle: "titre-lues", titre: "DÉJÀ LUES" });
      for (const n of lues) resultat.push({ cle: n.id, notification: n });
    }
    return resultat;
  }, [notifications]);

  function demanderToutEffacer() {
    confirmerAction({
      titre: "Tout effacer ?",
      message: `Les ${notifications.length} notification${notifications.length > 1 ? "s" : ""} seront supprimées de votre liste. Cela ne change rien pour les autres personnes de l'hôtel.`,
      libelleConfirmer: "Tout effacer",
      libelleRefuser: "Garder",
      destructif: true,
      onConfirmer: () => void toutEffacer(),
    });
  }

  return (
    <Modal visible={centreOuvert} animationType="slide" onRequestClose={fermerCentre}>
      <View style={styles.ecran}>
        <View style={[styles.entete, { paddingTop: insets.top + espacements.s2 }]}>
          <Pressable onPress={fermerCentre} hitSlop={10} accessibilityRole="button" accessibilityLabel="Retour" style={styles.retour}>
            <ArrowLeft size={22} color={couleurs.navy} />
          </Pressable>
          <Text style={styles.titre} accessibilityRole="header">Notifications</Text>
          <View style={styles.cote} />
        </View>

        {notifications.length > 0 && (
          <View style={styles.actions}>
            {nonLues > 0 && (
              <Pressable onPress={() => void toutMarquerLu()} style={styles.action} accessibilityRole="button" accessibilityLabel="Tout marquer comme lu">
                <CheckCheck size={16} color={couleurs.bleu} />
                <Text style={styles.actionTexte}>Tout lire</Text>
              </Pressable>
            )}
            <Pressable onPress={demanderToutEffacer} style={styles.action} accessibilityRole="button" accessibilityLabel="Tout effacer">
              <Trash2 size={16} color={couleurs.danger} />
              <Text style={[styles.actionTexte, { color: couleurs.danger }]}>Tout effacer</Text>
            </Pressable>
          </View>
        )}

        {lignes.length === 0 ? (
          <View style={styles.vide}>
            <View style={styles.videRond}>
              <Bell size={40} color={couleurs.succes} />
            </View>
            <Text style={styles.videTitre}>Vous êtes à jour</Text>
            <Text style={styles.videTexte}>Aucune notification pour le moment. Les nouvelles apparaîtront ici, même écran verrouillé.</Text>
          </View>
        ) : (
          <FlatList
            data={lignes}
            keyExtractor={(l) => l.cle}
            contentContainerStyle={{ paddingBottom: insets.bottom + espacements.s4 }}
            ListFooterComponent={<Text style={styles.aide}>Glissez une notification vers la gauche pour l'effacer.</Text>}
            renderItem={({ item }) => {
              if ("titre" in item) return <Text style={styles.jour}>{item.titre}</Text>;
              const n = item.notification;
              const produitId = (n.type === "STOCK_BAS" || n.type === "STOCK_EPUISE") && n.lien.id ? n.lien.id : null;
              return (
                <LigneNotification
                  n={n}
                 
                  onOuvrir={() => ouvrirNotification(n)}
                  onEffacer={() => void effacer(n.id)}
                  pied={
                    produitId ? (
                      <Pressable
                        style={styles.couper}
                        onPress={() => void couper(produitId)}
                        disabled={coupes[produitId] !== undefined}
                        accessibilityRole="button"
                        accessibilityLabel={`Ne plus m'alerter pour ${n.lien.nom ?? "ce produit"}`}
                      >
                        <Text style={styles.couperTexte}>
                          {coupes[produitId] === "fait" ? "C'est coupé : ce produit ne vous sera plus annoncé" : "Ne plus m'alerter pour ce produit"}
                        </Text>
                      </Pressable>
                    ) : undefined
                  }
                />
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: espacements.s2, paddingHorizontal: espacements.s3, paddingTop: espacements.s2 },
  action: { minHeight: 40, paddingHorizontal: espacements.s3, borderRadius: rayons.sm, borderWidth: 1, borderColor: couleurs.bordure, backgroundColor: couleurs.surface200, flexDirection: "row", alignItems: "center", gap: 6 },
  actionTexte: { color: couleurs.bleu, fontWeight: "700", fontSize: 13 },
  rangee: { marginHorizontal: espacements.s3, marginBottom: espacements.s2, borderRadius: rayons.lg, overflow: "hidden" },
  effacer: { position: "absolute", right: 0, top: 0, bottom: 0, width: 104, backgroundColor: couleurs.danger },
  effacerBouton: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4 },
  effacerTexte: { color: "#fff", fontWeight: "800", fontSize: 13 },
  meta: { flexDirection: "row", alignItems: "center", gap: espacements.s3, marginTop: 2 },
  aide: { fontSize: 12.5, color: couleurs.encreAttenuee, textAlign: "center", paddingHorizontal: espacements.s5, paddingTop: espacements.s3 },
  videRond: { width: 84, height: 84, borderRadius: 42, backgroundColor: couleurs.succesClair, alignItems: "center", justifyContent: "center" },
  videTitre: { fontSize: 20, fontWeight: "800", color: couleurs.encre },
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
  couper: { marginHorizontal: espacements.s4, marginTop: -4, marginBottom: espacements.s2, minHeight: 32, justifyContent: "center" },
  couperTexte: { fontSize: 12, fontWeight: "600", color: couleurs.encreAttenuee, textDecorationLine: "underline" },
  jour: {
    fontSize: 12,
    fontWeight: "700",
    color: couleurs.encreAttenuee,
    paddingHorizontal: espacements.s4,
    paddingTop: espacements.s4,
    paddingBottom: espacements.s2,
  },
  carte: {
    flexDirection: "row",
    alignItems: "center",
    gap: espacements.s3,
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
  vide: { flex: 1, alignItems: "center", justifyContent: "center", gap: espacements.s3, paddingHorizontal: espacements.s6 },
  videTexte: { color: couleurs.encreAttenuee, fontSize: 14.5, textAlign: "center", lineHeight: 21 },
});
