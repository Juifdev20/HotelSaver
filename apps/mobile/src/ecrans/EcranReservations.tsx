import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import type { Reservation } from "@hotel-chicago/types";
import { CalendarCheck } from "lucide-react-native";
import { couleurs, espacements, rayons } from "../tokens";
import { EnteteMobile } from "../composants/EnteteMobile";
import { useSession } from "../contexteSession";
import { EcranFacturation } from "./EcranFacturation";

type Vue = { id: "liste" } | { id: "facturation"; reservationId: string };

const VUE_LISTE: Vue = { id: "liste" };

function nombreDeNuits(dateArrivee: string, dateDepart: string): number {
  const millisecondesParJour = 1000 * 60 * 60 * 24;
  return Math.max(1, Math.round((new Date(dateDepart).getTime() - new Date(dateArrivee).getTime()) / millisecondesParJour));
}

/**
 * Onglet "Réserv." — les séjours en cours (`statut: EN_COURS`) pas encore
 * facturés (`facture === null`, filtré ici : l'API n'a pas ce filtre, voir
 * le plan). Sert de point d'entrée à la facturation/check-out
 * (`EcranFacturation.tsx`) — pas d'écran "Facturation" séparé dans "Plus",
 * ce serait un deuxième chemin vers le même endroit (voir navigation.ts).
 */
export function EcranReservations() {
  const { client } = useSession();
  const [vue, setVue] = useState<Vue>(VUE_LISTE);
  const [reservations, setReservations] = useState<Reservation[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [rafraichissement, setRafraichissement] = useState(false);

  const charger = useCallback(() => {
    setRafraichissement(true);
    client
      .listerReservations({ statut: "EN_COURS" })
      .then((liste) => setReservations(liste.filter((r) => r.facture === null)))
      .catch((e: Error) => setErreur(e.message))
      .finally(() => setRafraichissement(false));
  }, [client]);

  useEffect(charger, [charger]);

  if (vue.id === "facturation") {
    return (
      <EcranFacturation
        reservationId={vue.reservationId}
        onRetour={() => {
          setVue(VUE_LISTE);
          charger();
        }}
      />
    );
  }

  return (
    <View style={styles.page}>
      <EnteteMobile />
      <View style={styles.entete}>
        <Text style={styles.titre}>Réservations</Text>
        <Text style={styles.sousTitre}>
          {reservations ? `${reservations.length} séjour${reservations.length > 1 ? "s" : ""} à facturer` : "Chargement…"}
        </Text>
      </View>

      {erreur && <Text style={styles.erreur}>{erreur}</Text>}

      {reservations?.length === 0 && (
        <View style={styles.videConteneur}>
          <CalendarCheck size={32} color={couleurs.encreFaible} />
          <Text style={styles.videTitre}>Aucun séjour en cours à facturer.</Text>
        </View>
      )}

      <FlatList
        data={reservations ?? []}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.liste}
        refreshControl={<RefreshControl refreshing={rafraichissement} onRefresh={charger} />}
        renderItem={({ item }) => (
          <Pressable style={styles.carte} onPress={() => setVue({ id: "facturation", reservationId: item.id })}>
            <View style={styles.carteEntete}>
              <Text style={styles.numero}>Chambre {item.chambre.numero}</Text>
              <Text style={styles.nuits}>
                {nombreDeNuits(item.dateArrivee, item.dateDepart)} nuit{nombreDeNuits(item.dateArrivee, item.dateDepart) > 1 ? "s" : ""}
              </Text>
            </View>
            <Text style={styles.client}>{item.client.nom}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface100 },
  entete: { padding: espacements.s4, paddingBottom: espacements.s2 },
  titre: { fontSize: 22, fontWeight: "700", color: couleurs.navy },
  sousTitre: { fontSize: 13, color: couleurs.encreAttenuee, marginTop: 2 },
  erreur: { color: couleurs.danger, fontSize: 13, paddingHorizontal: espacements.s4 },
  liste: { padding: espacements.s4, gap: espacements.s3 },
  videConteneur: { alignItems: "center", padding: espacements.s7, gap: espacements.s2 },
  videTitre: { fontSize: 15, fontWeight: "600", color: couleurs.encre, textAlign: "center" },
  carte: {
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espacements.s4,
    gap: 4,
  },
  carteEntete: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  numero: { fontSize: 16, fontWeight: "700", color: couleurs.encre },
  nuits: { fontSize: 13, color: couleurs.encreAttenuee },
  client: { fontSize: 14, color: couleurs.encreAttenuee },
});
