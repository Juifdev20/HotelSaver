import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import type { StatutReservation } from "@hotel-chicago/types";
import { BoutonAjouterFlottant } from "../composants/BoutonAjouterFlottant";
import { couleurs, espacements, rayons } from "../tokens";
import { formatMontant } from "../formatMontant";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";
import { useSession } from "../contexteSession";
import { useSyncEtat } from "../hooks/useSyncEtat";
import { ReservationMiroir, listerReservationsMiroir } from "../stockage/reservationsMirroir";
import { EcranReservationDetail } from "./EcranReservationDetail";
import { EcranNouvelleReservation } from "./EcranNouvelleReservation";
import { EcranFacturation } from "./EcranFacturation";

export interface EcranReservationsProps {
  /** Segment affiché à l'ouverture — "aujourdhui" quand l'écran sert de vue
   * « Arrivées et départs » depuis l'onglet Plus. */
  segmentInitial?: SegmentId;
  /** Présent seulement quand l'écran est embarqué dans Plus (un « Retour »
   * ramène à la liste Plus ; en onglet, il n'y a rien à quitter). */
  onRetour?: () => void;
}

type SegmentId = "aujourdhui" | "avenir" | "encours" | "historique";
type Vue = { id: "liste" } | { id: "detail"; reservationId: string } | { id: "nouveau" } | { id: "facturation"; reservationId: string };

const SEGMENTS: { id: SegmentId; libelle: string }[] = [
  { id: "aujourdhui", libelle: "Aujourd'hui" },
  { id: "avenir", libelle: "À venir" },
  { id: "encours", libelle: "En cours" },
  { id: "historique", libelle: "Historique" },
];

const LABEL_STATUT: Record<StatutReservation, string> = {
  EN_ATTENTE: "En attente",
  CONFIRMEE: "Confirmée",
  EN_COURS: "En cours",
  TERMINEE: "Terminée",
  ANNULEE: "Annulée",
};

const COULEUR_STATUT: Record<StatutReservation, { fond: string; texte: string }> = {
  EN_ATTENTE: { fond: couleurs.alerteClair, texte: couleurs.alerte },
  CONFIRMEE: { fond: couleurs.bleuClair, texte: couleurs.bleu },
  EN_COURS: { fond: couleurs.succesClair, texte: couleurs.succes },
  TERMINEE: { fond: couleurs.bordure, texte: couleurs.encreAttenuee },
  ANNULEE: { fond: couleurs.dangerClair, texte: couleurs.danger },
};

function debutJournee(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function memeJour(iso: string, jour: Date): boolean {
  const d = new Date(iso);
  const debut = debutJournee(jour);
  const fin = new Date(debut.getFullYear(), debut.getMonth(), debut.getDate() + 1);
  return d >= debut && d < fin;
}

function dateCourte(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function filtrer(reservations: ReservationMiroir[], segment: SegmentId): ReservationMiroir[] {
  const aujourdhui = new Date();
  const finJournee = new Date(aujourdhui.getFullYear(), aujourdhui.getMonth(), aujourdhui.getDate() + 1);
  switch (segment) {
    case "aujourdhui":
      // Arrivées du jour (encore à accueillir ou déjà en cours) + départs du jour.
      return reservations.filter(
        (r) =>
          (r.statut === "CONFIRMEE" || r.statut === "EN_ATTENTE" || r.statut === "EN_COURS") &&
          (memeJour(r.dateArrivee, aujourdhui) || (r.statut === "EN_COURS" && memeJour(r.dateDepart, aujourdhui)))
      );
    case "avenir":
      return reservations.filter(
        (r) => (r.statut === "CONFIRMEE" || r.statut === "EN_ATTENTE") && new Date(r.dateArrivee) >= finJournee
      );
    case "encours":
      return reservations.filter((r) => r.statut === "EN_COURS");
    case "historique":
      return reservations.filter((r) => r.statut === "TERMINEE" || r.statut === "ANNULEE");
  }
}

const VIDE_PAR_SEGMENT: Record<SegmentId, string> = {
  aujourdhui: "Aucune arrivée ni départ aujourd'hui.",
  avenir: "Aucune réservation à venir.",
  encours: "Aucun client présent.",
  historique: "Aucun séjour passé.",
};

/**
 * Hub Réception : lit toujours le miroir SQLite (fonctionne hors ligne), la
 * synchronisation tourne en tâche de fond (montage, pull-to-refresh, cycle
 * du moteur). Liste → Détail (actions) → Nouvelle réservation →
 * Facturation, tout géré par un état local — même principe que
 * EcranOngletCaisse, sans stack de navigation.
 */
export function EcranReservations({ segmentInitial = "aujourdhui", onRetour }: EcranReservationsProps) {
  const { moteurSync } = useSession();
  const etatSync = useSyncEtat();
  const [vue, setVue] = useState<Vue>({ id: "liste" });
  const [segment, setSegment] = useState<SegmentId>(segmentInitial);
  const [reservations, setReservations] = useState<ReservationMiroir[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [rafraichissement, setRafraichissement] = useState(false);

  const rechargerMiroir = useCallback(() => {
    listerReservationsMiroir()
      .then(setReservations)
      .catch((e: Error) => setErreur(e.message));
  }, []);

  useEffect(() => {
    rechargerMiroir();
    moteurSync.forcerSynchronisation();
  }, [rechargerMiroir, moteurSync]);

  // Une synchro vient de finir : relit le miroir (lignes tirées du serveur,
  // confirmations de push, statuts modifiés par un autre poste).
  useEffect(() => {
    if (etatSync.dernierePousseeLe) rechargerMiroir();
  }, [etatSync.dernierePousseeLe, rechargerMiroir]);

  async function actualiser() {
    setRafraichissement(true);
    await moteurSync.forcerSynchronisation();
    rechargerMiroir();
    setRafraichissement(false);
  }

  const liste = useMemo(() => filtrer(reservations ?? [], segment), [reservations, segment]);

  if (vue.id === "detail") {
    return (
      <EcranReservationDetail
        reservationId={vue.reservationId}
        onRetour={() => {
          setVue({ id: "liste" });
          rechargerMiroir();
        }}
        onChange={rechargerMiroir}
        onFacturer={(idServeur) => setVue({ id: "facturation", reservationId: idServeur })}
      />
    );
  }

  if (vue.id === "nouveau") {
    return (
      <EcranNouvelleReservation
        onRetour={() => setVue({ id: "liste" })}
        onCree={(id) => {
          rechargerMiroir();
          setVue({ id: "detail", reservationId: id });
        }}
      />
    );
  }

  if (vue.id === "facturation") {
    return (
      <EcranFacturation
        reservationId={vue.reservationId}
        onRetour={() => {
          setVue({ id: "liste" });
          void moteurSync.forcerSynchronisation().then(rechargerMiroir);
        }}
      />
    );
  }

  return (
    <View style={styles.page}>
      <EnteteMobile />
      <View style={styles.entete}>
        <View>
          <Text style={styles.titre}>Réservations</Text>
          <Text style={styles.sousTitre}>
            {reservations ? `${liste.length} séjour${liste.length > 1 ? "s" : ""}` : "Chargement…"}
          </Text>
        </View>
      </View>

      <View style={styles.segments}>
        {SEGMENTS.map((s) => (
          <Pressable
            key={s.id}
            style={[styles.segment, segment === s.id && styles.segmentActif]}
            onPress={() => setSegment(s.id)}
          >
            <Text style={[styles.segmentTexte, segment === s.id && styles.segmentTexteActif]}>{s.libelle}</Text>
          </Pressable>
        ))}
      </View>

      {onRetour && (
        <Pressable onPress={onRetour} style={styles.retourExterne} hitSlop={10} accessibilityRole="button">
          <Text style={styles.retourExterneTexte}>‹ Retour</Text>
        </Pressable>
      )}

      {erreur && <Text style={styles.erreur}>{erreur}</Text>}

      {reservations && liste.length === 0 && (
        <View style={styles.videConteneur}>
          <Text style={styles.videTexte}>{VIDE_PAR_SEGMENT[segment]}</Text>
        </View>
      )}

      <FlatList
        data={liste}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.liste}
        refreshControl={<RefreshControl refreshing={rafraichissement} onRefresh={actualiser} />}
        renderItem={({ item }) => {
          const tone = COULEUR_STATUT[item.statut];
          return (
            <Pressable style={styles.carte} onPress={() => setVue({ id: "detail", reservationId: item.id })}>
              <View style={styles.carteEntete}>
                <Text style={styles.clientNom}>{item.client.nom}</Text>
                <View style={[styles.badge, { backgroundColor: tone.fond }]}>
                  <Text style={[styles.badgeTexte, { color: tone.texte }]}>{LABEL_STATUT[item.statut]}</Text>
                </View>
              </View>
              <Text style={styles.ligne}>
                Ch. {item.chambre.numero} · {dateCourte(item.dateArrivee)} → {dateCourte(item.dateDepart)}
              </Text>
              <Text style={styles.ligneSecondaire}>
                {formatMontant(item.chambre.prixParNuit, item.chambre.devise)} / nuit
                {item.remoteId === null ? " · en attente de synchro" : ""}
                {item.origine === "SITE_PUBLIC" ? " · site public" : ""}
              </Text>
            </Pressable>
          );
        }}
      />

      {/* « + » flottant bas-droite — sous le pouce, standard Android
          (remplace l'ancien bouton d'en-tête). */}
      <BoutonAjouterFlottant onPress={() => setVue({ id: "nouveau" })} accessibilityLabel="Nouvelle réservation" />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface100 },
  entete: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: espacements.s4,
    paddingBottom: espacements.s2,
  },
  titre: { fontSize: 22, fontWeight: "700", color: couleurs.navy },
  sousTitre: { fontSize: 13, color: couleurs.encreAttenuee, marginTop: 2 },
  segments: { flexDirection: "row", paddingHorizontal: espacements.s4, gap: espacements.s2, paddingBottom: espacements.s2 },
  segment: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: rayons.pill,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    alignItems: "center",
    backgroundColor: couleurs.surface200,
  },
  segmentActif: { backgroundColor: couleurs.bleu, borderColor: couleurs.bleu },
  segmentTexte: { fontSize: 12, fontWeight: "600", color: couleurs.encreAttenuee },
  segmentTexteActif: { color: "#fff" },
  // Zone tactile ≥44px — le « ‹ Retour » de 13px était trop petit
  // (retour du patron 28/09, écran Arrivées et départs).
  retourExterne: {
    paddingHorizontal: espacements.s4,
    paddingVertical: espacements.s2,
    marginBottom: espacements.s1,
    minHeight: 44,
    justifyContent: "center",
  },
  retourExterneTexte: { fontSize: 15, fontWeight: "600", color: couleurs.encre },
  erreur: { color: couleurs.danger, fontSize: 13, paddingHorizontal: espacements.s4 },
  // 88px de marge basse : le FAB ne recouvre pas la dernière carte.
  liste: { padding: espacements.s4, paddingBottom: 88, gap: espacements.s3 },
  videConteneur: { alignItems: "center", padding: espacements.s7 },
  videTexte: { fontSize: 14, color: couleurs.encreAttenuee },
  carte: {
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espacements.s4,
    gap: 4,
  },
  carteEntete: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  clientNom: { fontSize: 16, fontWeight: "700", color: couleurs.encre, flex: 1 },
  badge: { paddingHorizontal: espacements.s2, paddingVertical: 3, borderRadius: rayons.pill },
  badgeTexte: { fontSize: 11, fontWeight: "700" },
  ligne: { fontSize: 14, color: couleurs.encre },
  ligneSecondaire: { fontSize: 12, color: couleurs.encreAttenuee },
});
