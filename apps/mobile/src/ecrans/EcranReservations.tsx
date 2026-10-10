import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { peutOperer } from "@hotel-chicago/types";
import type { Reservation, StatutReservation } from "@hotel-chicago/types";
import { BoutonAjouterFlottant } from "../composants/BoutonAjouterFlottant";
import { couleurs, espacements, rayons } from "../tokens";
import { formatMontant } from "../formatMontant";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";
import { useSession } from "../contexteSession";
import { useSyncEtat } from "../hooks/useSyncEtat";
import { EcranReservationDetail } from "./EcranReservationDetail";
import { EcranNouvelleReservation } from "./EcranNouvelleReservation";
import { EcranFacturation } from "./EcranFacturation";
import { EcranPlanning } from "./EcranPlanning";

export interface EcranReservationsProps {
  /** Segment affiché à l'ouverture — "aujourdhui" quand l'écran sert de vue
   * « Arrivées et départs » depuis l'onglet Plus. */
  segmentInitial?: SegmentId;
  /** « Retour » en en-tête : vers la liste Plus quand l'écran y est
   * embarqué, vers l'Accueil depuis l'onglet Réserv. */
  onRetour?: () => void;
  /** Deep-link notification : ouvre directement le détail de la réservation. */
  reservationInitiale?: string;
}

type SegmentId = "aujourdhui" | "avenir" | "encours" | "historique" | "planning";
type Vue =
  | { id: "liste" }
  | { id: "detail"; reservationId: string }
  | { id: "nouveau"; chambreInitialeId?: string; dateArriveeInitiale?: string }
  | { id: "facturation"; reservationId: string };

const SEGMENTS: { id: SegmentId; libelle: string }[] = [
  { id: "aujourdhui", libelle: "Aujourd'hui" },
  { id: "avenir", libelle: "À venir" },
  { id: "encours", libelle: "En cours" },
  { id: "historique", libelle: "Historique" },
  { id: "planning", libelle: "Planning" },
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

function filtrer(reservations: Reservation[], segment: SegmentId): Reservation[] {
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
    case "planning":
      return reservations; // affiché par EcranPlanning, pas par la liste
  }
}

const VIDE_PAR_SEGMENT: Record<SegmentId, string> = {
  aujourdhui: "Aucune arrivée ni départ aujourd'hui.",
  avenir: "Aucune réservation à venir.",
  encours: "Aucun client présent.",
  historique: "Aucun séjour passé.",
  planning: "Aucune réservation sur la fenêtre.",
};

/**
 * Hub Réception : lit toujours le miroir SQLite (fonctionne hors ligne), la
 * synchronisation tourne en tâche de fond (montage, pull-to-refresh, cycle
 * du moteur). Liste → Détail (actions) → Nouvelle réservation →
 * Facturation, tout géré par un état local — même principe que
 * EcranOngletCaisse, sans stack de navigation.
 */
export function EcranReservations({ segmentInitial = "aujourdhui", onRetour, reservationInitiale }: EcranReservationsProps) {
  const { client, moteurSync, miroir, utilisateur } = useSession();
  const etatSync = useSyncEtat();
  const [vue, setVue] = useState<Vue>(reservationInitiale ? { id: "detail", reservationId: reservationInitiale } : { id: "liste" });
  const [segment, setSegment] = useState<SegmentId>(segmentInitial);
  const [reservations, setReservations] = useState<Reservation[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [rafraichissement, setRafraichissement] = useState(false);

  const rechargerMiroir = useCallback(() => {
    client
      .listerReservations()
      .then(setReservations)
      .catch(() => setReservations((courant) => courant ?? []));
  }, [client]);

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
  const sousTitre = reservations ? `${liste.length} séjour${liste.length > 1 ? "s" : ""}` : "Chargement…";

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
        chambreInitialeId={vue.chambreInitialeId}
        dateArriveeInitiale={vue.dateArriveeInitiale}
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
      {onRetour ? (
        <EnteteRetour titre="Réservations" sousTitre={sousTitre} onRetour={onRetour} />
      ) : (
        <View style={styles.entete}>
          <View>
            <Text style={styles.titre}>Réservations</Text>
            <Text style={styles.sousTitre}>{sousTitre}</Text>
          </View>
        </View>
      )}

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

      {erreur && <Text style={styles.erreur}>{erreur}</Text>}

      {segment === "planning" ? (
        <EcranPlanning
          onNouvelleReservation={(chambreId, dateIso) =>
            setVue({ id: "nouveau", chambreInitialeId: chambreId, dateArriveeInitiale: dateIso })
          }
          onOuvrirReservation={(id) => setVue({ id: "detail", reservationId: id })}
        />
      ) : (
        <>
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
                    {miroir.estCreationEnAttente(item.id) ? " · en attente de synchro" : ""}
                    {item.origine === "SITE_PUBLIC" ? " · site public" : ""}
                  </Text>
                  {item.note && <Text style={styles.noteTexte}>Note : {item.note}</Text>}
                  {item.preEnregistreLe && (
                    <Text style={styles.preEnregistre}>
                      ✓ Pré-enregistré{item.heureArriveePrevue ? ` · arrivée vers ${item.heureArriveePrevue}` : ""}
                    </Text>
                  )}
                </Pressable>
              );
            }}
          />
        </>
      )}

      {/* « + » flottant bas-droite — sous le pouce, standard Android
          (remplace l'ancien bouton d'en-tête). */}
      {peutOperer(utilisateur) && (
        <BoutonAjouterFlottant onPress={() => setVue({ id: "nouveau" })} accessibilityLabel="Nouvelle réservation" />
      )}
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
  noteTexte: { fontSize: 12, color: couleurs.violet, fontStyle: "italic" },
  preEnregistre: { fontSize: 12, fontWeight: "600", color: couleurs.succes },
});
