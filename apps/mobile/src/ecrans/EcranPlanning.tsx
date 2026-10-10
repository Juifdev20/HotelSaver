import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Chambre, Reservation, StatutReservation } from "@hotel-chicago/types";
import { couleurs, espacements, rayons } from "../tokens";
import { useSession } from "../contexteSession";
import { useSyncEtat } from "../hooks/useSyncEtat";

export interface EcranPlanningProps {
  /** Cellule vide : nouvelle réservation pré-remplie (chambre + date d'arrivée). */
  onNouvelleReservation: (chambreId: string, dateArriveeIso: string) => void;
  /** Barre existante : détail de la réservation. */
  onOuvrirReservation: (reservationId: string) => void;
}

const NB_JOURS = 7;
const LARGEUR_JOUR = 44;

const COULEUR_STATUT: Record<StatutReservation, string> = {
  EN_ATTENTE: couleurs.alerte,
  CONFIRMEE: couleurs.bleu,
  EN_COURS: couleurs.succes,
  TERMINEE: couleurs.encreFaible,
  ANNULEE: couleurs.danger,
};

const STATUTS_VISIBLES = new Set<StatutReservation>(["EN_ATTENTE", "CONFIRMEE", "EN_COURS"]);

function debutJournee(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isoJour(d: Date): string {
  const d2 = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
  return d2.toISOString();
}

const LIBELLE_JOUR = ["di", "lu", "ma", "me", "je", "ve", "sa"];

/**
 * Planning visuel : une ligne par chambre, sept colonnes (7 jours à partir
 * d'aujourd'hui). Une réservation qui couvre un jour colore la cellule ;
 * une cellule vide ouvre le formulaire pré-rempli (chambre + arrivée).
 * Lit le miroir SQLite — fonctionne hors ligne. Toujours embarqué dans
 * EcranReservations : l'en-tête (EnteteMobile, titre, retour) est rendu
 * par le parent — cet écran n'affiche que la grille.
 */
export function EcranPlanning({ onNouvelleReservation, onOuvrirReservation }: EcranPlanningProps) {
  const { client, moteurSync } = useSession();
  const etatSync = useSyncEtat();
  const [chambres, setChambres] = useState<Chambre[] | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);

  const recharger = useCallback(() => {
    Promise.all([client.listerChambres(), client.listerReservations()])
      .then(([c, r]) => {
        setChambres(c);
        setReservations(r);
      })
      .catch((e: Error) => setErreur(e.message));
  }, [client]);

  useEffect(() => {
    recharger();
    moteurSync.forcerSynchronisation();
  }, [recharger, moteurSync]);

  useEffect(() => {
    if (etatSync.dernierePousseeLe) recharger();
  }, [etatSync.dernierePousseeLe, recharger]);

  const jours = useMemo(() => {
    const aujourdhui = debutJournee();
    return Array.from({ length: NB_JOURS }, (_, i) => {
      const d = new Date(aujourdhui.getFullYear(), aujourdhui.getMonth(), aujourdhui.getDate() + i);
      return d;
    });
  }, []);

  // réservationsVisibles[chambreId][indexJour] = réservation couvrant ce jour
  const reservationsVisibles = useMemo(() => {
    const fenetreDebut = jours[0].getTime();
    const fenetreFin = new Date(jours[jours.length - 1].getTime() + 86400000).getTime();
    const dansFenetre = reservations.filter(
      (r) =>
        STATUTS_VISIBLES.has(r.statut) &&
        new Date(r.dateArrivee).getTime() < fenetreFin &&
        new Date(r.dateDepart).getTime() > fenetreDebut
    );
    const parJour = (chambreId: string, jour: Date) => {
      const debut = jour.getTime();
      const fin = debut + 86400000;
      return dansFenetre.find(
        (r) =>
          r.chambreId === chambreId &&
          new Date(r.dateArrivee).getTime() < fin &&
          new Date(r.dateDepart).getTime() > debut
      );
    };
    return { dansFenetre, parJour };
  }, [reservations, jours]);

  return (
    <View style={styles.page}>
      {erreur && <Text style={styles.erreur}>{erreur}</Text>}

      <ScrollView contentContainerStyle={styles.contenu}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            {/* En-tête des jours */}
            <View style={styles.ligneEntete}>
              <View style={styles.celluleChambre}>
                <Text style={styles.celluleChambreTexte}>Chambre</Text>
              </View>
              {jours.map((j, i) => (
                <View key={i} style={styles.celluleJour}>
                  <Text style={styles.celluleJourNom}>{LIBELLE_JOUR[j.getDay()]}</Text>
                  {/* Numéro du jour : cercle bleu centré sur aujourd'hui
                      (comme les calendriers natifs), rien sur les autres. */}
                  <View style={styles.numeroConteneur}>
                    <View style={i === 0 ? styles.cercleAujourdhui : undefined}>
                      <Text style={[styles.celluleJourNumero, i === 0 && styles.numeroAujourdhui]}>{j.getDate()}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>

            {chambres === null && (
              <Text style={styles.info}>Chargement des chambres…</Text>
            )}
            {chambres?.length === 0 && (
              <Text style={styles.info}>Aucune chambre — synchronisez ou créez des chambres d'abord.</Text>
            )}

            {(chambres ?? []).map((chambre) => (
              <View key={chambre.id} style={styles.ligne}>
                <View style={[styles.celluleChambre, styles.celluleChambreDonnee]}>
                  <Text style={styles.numero}>{chambre.numero}</Text>
                  <Text style={styles.typeChambre} numberOfLines={1}>{chambre.type}</Text>
                </View>
                {jours.map((jour, i) => {
                  const reservation = reservationsVisibles.parJour(chambre.id, jour);
                  return reservation ? (
                    <Pressable
                      key={i}
                      style={[styles.celluleJour, { backgroundColor: COULEUR_STATUT[reservation.statut] }]}
                      onPress={() => onOuvrirReservation(reservation.id)}
                      accessibilityLabel={`Réservation ${reservation.client.nom}`}
                    >
                      {/* Premier jour de la barre : nom du client */}
                      <Text style={styles.celluleReservee} numberOfLines={1}>
                        {new Date(reservation.dateArrivee).getTime() >= debutJournee(jour).getTime()
                          ? reservation.client.nom.split(" ")[0]
                          : ""}
                      </Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      key={i}
                      style={styles.celluleJour}
                      onPress={() => onNouvelleReservation(chambre.id, isoJour(jour))}
                      accessibilityLabel={`Réserver chambre ${chambre.numero} le ${jour.toLocaleDateString("fr-FR")}`}
                    >
                      <Text style={styles.celluleVide}>+</Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>

        {/* Légende */}
        <View style={styles.legende}>
          {(["EN_ATTENTE", "CONFIRMEE", "EN_COURS"] as const).map((s) => (
            <View key={s} style={styles.legendeItem}>
              <View style={[styles.legendeCarre, { backgroundColor: COULEUR_STATUT[s] }]} />
              <Text style={styles.legendeTexte}>
                {s === "EN_ATTENTE" ? "En attente" : s === "CONFIRMEE" ? "Confirmée" : "En cours"}
              </Text>
            </View>
          ))}
          <Text style={styles.legendeTexte}>· cellule vide = créer</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface100 },
  erreur: { color: couleurs.danger, fontSize: 13, paddingHorizontal: espacements.s4 },
  info: { fontSize: 13, color: couleurs.encreAttenuee, paddingVertical: espacements.s3 },
  contenu: { padding: espacements.s4, paddingBottom: 88 },
  ligneEntete: { flexDirection: "row", marginBottom: 4 },
  ligne: { flexDirection: "row", marginBottom: 4 },
  celluleChambre: { width: 88, paddingVertical: 8, paddingRight: espacements.s2 },
  celluleChambreDonnee: {
    borderRightWidth: 1,
    borderColor: couleurs.bordure,
  },
  celluleChambreTexte: { fontSize: 11, fontWeight: "700", color: couleurs.encreAttenuee },
  numero: { fontSize: 14, fontWeight: "700", color: couleurs.encre },
  typeChambre: { fontSize: 10, color: couleurs.encreAttenuee },
  celluleJour: {
    width: LARGEUR_JOUR,
    height: 44,
    marginRight: 3,
    borderRadius: rayons.sm,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: couleurs.surface200,
  },
  celluleJourNom: { fontSize: 9, fontWeight: "700", color: couleurs.encreAttenuee, textTransform: "uppercase" },
  numeroConteneur: { height: 24, justifyContent: "center" },
  cercleAujourdhui: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: couleurs.bleu,
    alignItems: "center",
    justifyContent: "center",
  },
  celluleJourNumero: { fontSize: 13, fontWeight: "700", color: couleurs.encre },
  numeroAujourdhui: { color: "#fff" },
  celluleReservee: { fontSize: 9, fontWeight: "700", color: "#fff" },
  celluleVide: { fontSize: 14, color: couleurs.encreFaible },
  legende: { flexDirection: "row", alignItems: "center", gap: espacements.s3, marginTop: espacements.s4, flexWrap: "wrap" },
  legendeItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendeCarre: { width: 12, height: 12, borderRadius: 3 },
  legendeTexte: { fontSize: 11, color: couleurs.encreAttenuee },
});
