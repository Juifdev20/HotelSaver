import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { ClientApi } from "@hotel-chicago/api-client";
import { StatutLigne } from "@hotel-chicago/types";
import { ChefHat, Clock, RefreshCw } from "lucide-react-native";
import { couleurs, espacements, rayons } from "../tokens";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";

interface LigneCuisine {
  id: string;
  produit: { nom: string };
  sousCompte: { nom: string };
  quantite: number;
  statut: StatutLigne;
  createdAt: string;
  note?: string | null;
}

interface GroupeCuisine {
  compteId: string;
  tableOuNom: string;
  ouvertLe: string;
  lignes: LigneCuisine[];
}

function dureeDepuis(iso: string, maintenant: number): string {
  const diff = Math.floor((maintenant - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  return `${Math.floor(diff / 3600)}h${Math.floor((diff % 3600) / 60).toString().padStart(2, "0")}`;
}

export interface EcranCuisineProps {
  client: ClientApi;
  onRetour: () => void;
  /** Tap sur l'en-tête d'une commande : ouvre le détail complet du compte. */
  onOuvrirCompte?: (compteId: string) => void;
}

/**
 * Écran de cuisine mobile (KDS — Kitchen Display System).
 * Affiche les lignes EN_ATTENTE et EN_PREPARATION groupées par table.
 * Actualisation automatique toutes les 10 secondes.
 */
export function EcranCuisine({ client, onRetour, onOuvrirCompte }: EcranCuisineProps) {
  const [groupes, setGroupes] = useState<GroupeCuisine[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const [enCours, setEnCours] = useState<Set<string>>(new Set());

  const charger = useCallback(
    (silencieux = false) => {
      if (!silencieux) setChargement(true);
      setErreur(null);
      client
        .lignesPourCuisine()
        .then((data) => setGroupes(data as GroupeCuisine[]))
        .catch((e: Error) => setErreur(e.message))
        .finally(() => setChargement(false));
    },
    [client]
  );

  useEffect(() => { charger(); }, [charger]);

  // Actualisation automatique toutes les 10 secondes
  useEffect(() => {
    const id = setInterval(() => charger(true), 10_000);
    return () => clearInterval(id);
  }, [charger]);

  // Horloge pour les timers (toutes les 5 secondes)
  useEffect(() => {
    const id = setInterval(() => setMaintenant(Date.now()), 5_000);
    return () => clearInterval(id);
  }, []);

  async function avancerStatut(ligneId: string, statut: StatutLigne) {
    setEnCours((prev) => new Set(prev).add(ligneId));
    try {
      await client.majStatutLigne(ligneId, statut);
      charger(true);
    } catch {
      // Silencieux : le rafraîchissement automatique remettra l'état correct
    } finally {
      setEnCours((prev) => {
        const next = new Set(prev);
        next.delete(ligneId);
        return next;
      });
    }
  }

  const attente = groupes.flatMap((g) => g.lignes).filter((l) => l.statut === StatutLigne.EN_ATTENTE).length;
  const enPrep = groupes.flatMap((g) => g.lignes).filter((l) => l.statut === StatutLigne.EN_PREPARATION).length;

  return (
    <View style={styles.page}>
      <EnteteMobile />
      <EnteteRetour
        titre="Cuisine"
        sousTitre={
          attente === 0 && enPrep === 0 && !chargement ? "Aucune commande active." : undefined
        }
        onRetour={onRetour}
        action={
          <Pressable style={styles.boutonRafraichir} onPress={() => charger()}>
            <RefreshCw size={18} color={couleurs.encre} />
          </Pressable>
        }
      />

      {(attente > 0 || enPrep > 0) && (
        <View style={styles.compteurs}>
          {attente > 0 && (
            <View style={[styles.badge, styles.badgeAttente]}>
              <Text style={[styles.badgeTexte, styles.badgeAttenteTexte]}>{attente} en attente</Text>
            </View>
          )}
          {enPrep > 0 && (
            <View style={[styles.badge, styles.badgePrep]}>
              <Text style={[styles.badgeTexte, styles.badgePrepTexte]}>{enPrep} en préparation</Text>
            </View>
          )}
        </View>
      )}

      {erreur && <Text style={styles.erreur}>{erreur}</Text>}

      {chargement && groupes.length === 0 && (
        <View style={styles.videConteneur}>
          <ActivityIndicator color={couleurs.bleu} />
          <Text style={styles.videTitre}>Chargement…</Text>
        </View>
      )}

      {!chargement && groupes.length === 0 && (
        <View style={styles.videConteneur}>
          <ChefHat size={48} color={couleurs.encreFaible} />
          <Text style={styles.videTitre}>Cuisine à jour !</Text>
          <Text style={styles.videDescription}>Toutes les commandes ont été servies.</Text>
        </View>
      )}

      <FlatList
        data={groupes}
        keyExtractor={(g) => g.compteId}
        contentContainerStyle={styles.liste}
        renderItem={({ item: groupe }) => {
          const plusAncienne = groupe.lignes[0]?.createdAt ?? groupe.ouvertLe;
          const diffMin = Math.floor((maintenant - new Date(plusAncienne).getTime()) / 60_000);
          const urgente = diffMin >= 15;
          const alerte = diffMin >= 8;
          return (
            <View
              style={[
                styles.carte,
                urgente ? styles.carteUrgente : alerte ? styles.carteAlerte : undefined,
              ]}
            >
              <Pressable
                style={styles.carteEntete}
                onPress={() => onOuvrirCompte?.(groupe.compteId)}
                accessibilityRole="button"
                accessibilityLabel={`Ouvrir le compte ${groupe.tableOuNom}`}
              >
                <Text style={styles.carteTable}>{groupe.tableOuNom}</Text>
                <View style={styles.carteTimer}>
                  <Clock size={12} color={urgente ? couleurs.danger : couleurs.encreAttenuee} />
                  <Text style={[styles.carteTimerTexte, urgente && styles.carteTimerUrgent]}>
                    {dureeDepuis(plusAncienne, maintenant)}
                  </Text>
                  {onOuvrirCompte && <Text style={styles.carteChevron}>›</Text>}
                </View>
              </Pressable>

              {groupe.lignes.map((ligne) => {
                const occupee = enCours.has(ligne.id);
                const enAttente = ligne.statut === StatutLigne.EN_ATTENTE;
                return (
                  <View
                    key={ligne.id}
                    style={[styles.ligne, enAttente ? styles.ligneAttente : styles.lignePreparation]}
                  >
                    <View style={styles.ligneInfo}>
                      <Text style={styles.ligneNom}>
                        {ligne.quantite > 1 && (
                          <Text style={styles.ligneQte}>{ligne.quantite}× </Text>
                        )}
                        {ligne.produit.nom}
                      </Text>
                      {!!ligne.sousCompte.nom && (
                        <Text style={styles.lignePour}>pour {ligne.sousCompte.nom}</Text>
                      )}
                      {!!ligne.note && (
                        <Text style={styles.ligneNote}>{ligne.note}</Text>
                      )}
                    </View>
                    <Pressable
                      style={[styles.boutonStatut, enAttente ? styles.boutonPrendre : styles.boutonPret]}
                      onPress={() =>
                        avancerStatut(ligne.id, enAttente ? StatutLigne.EN_PREPARATION : StatutLigne.PRET)
                      }
                      disabled={occupee}
                    >
                      {occupee ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.boutonStatutTexte}>
                          {enAttente ? "Prendre en charge" : "Prêt ✓"}
                        </Text>
                      )}
                    </Pressable>
                  </View>
                );
              })}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface100 },

  entete: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: espacements.s4,
    paddingVertical: espacements.s3,
    borderBottomWidth: 1,
    borderBottomColor: couleurs.bordure,
    backgroundColor: couleurs.surface200,
    gap: espacements.s3,
  },
  titre: { fontSize: 20, fontWeight: "700", color: couleurs.encre },
  sousTitre: { fontSize: 13, color: couleurs.encreAttenuee, marginTop: 2 },
  compteurs: { flexDirection: "row", gap: espacements.s2, marginTop: 4, flexWrap: "wrap" },
  badge: { borderRadius: rayons.pill, paddingHorizontal: espacements.s2, paddingVertical: 2, borderWidth: 1 },
  badgeAttente: { backgroundColor: couleurs.alerteClair, borderColor: couleurs.alerte },
  badgeAttenteTexte: { color: couleurs.alerte },
  badgePrep: { backgroundColor: couleurs.bleuClair, borderColor: couleurs.bleu },
  badgePrepTexte: { color: couleurs.bleu },
  badgeTexte: { fontSize: 12, fontWeight: "700" },

  enteteActions: { flexDirection: "row", gap: espacements.s2, alignItems: "center" },
  boutonRetour: {
    borderWidth: 1, borderColor: couleurs.bordure, borderRadius: rayons.sm,
    paddingHorizontal: espacements.s3, height: 36, justifyContent: "center",
    backgroundColor: couleurs.surface100,
  },
  boutonRetourTexte: { fontSize: 13, fontWeight: "600", color: couleurs.encre },
  boutonRafraichir: {
    width: 36, height: 36, borderRadius: rayons.sm,
    borderWidth: 1, borderColor: couleurs.bordure,
    alignItems: "center", justifyContent: "center",
    backgroundColor: couleurs.surface100,
  },

  erreur: { color: couleurs.danger, fontSize: 13, padding: espacements.s4 },
  liste: { padding: espacements.s4, gap: espacements.s4, paddingBottom: 40 },

  videConteneur: { flex: 1, alignItems: "center", justifyContent: "center", gap: espacements.s2, padding: espacements.s7 },
  videTitre: { fontSize: 17, fontWeight: "700", color: couleurs.encre },
  videDescription: { fontSize: 14, color: couleurs.encreAttenuee, textAlign: "center" },

  carte: {
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    overflow: "hidden",
  },
  carteAlerte: { borderColor: couleurs.alerte, borderWidth: 2 },
  carteUrgente: { borderColor: couleurs.danger, borderWidth: 2 },
  carteEntete: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: espacements.s4,
    paddingVertical: espacements.s3,
    borderBottomWidth: 1,
    borderBottomColor: couleurs.bordure,
    backgroundColor: couleurs.surface300,
  },
  carteTable: { fontSize: 16, fontWeight: "700", color: couleurs.encre },
  carteTimer: { flexDirection: "row", alignItems: "center", gap: 4 },
  carteTimerTexte: { fontSize: 13, color: couleurs.encreAttenuee },
  carteTimerUrgent: { color: couleurs.danger, fontWeight: "700" },
  carteChevron: { fontSize: 18, color: couleurs.encreFaible, marginLeft: 4 },

  ligne: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: espacements.s4,
    paddingVertical: espacements.s3,
    borderBottomWidth: 1,
    borderBottomColor: couleurs.bordure,
    gap: espacements.s3,
  },
  ligneAttente: { backgroundColor: couleurs.surface200 },
  lignePreparation: { backgroundColor: couleurs.alerteClair },
  ligneInfo: { flex: 1, gap: 2 },
  ligneNom: { fontSize: 15, fontWeight: "600", color: couleurs.encre },
  ligneQte: { fontWeight: "700", color: couleurs.bleu },
  lignePour: { fontSize: 12, color: couleurs.encreAttenuee },
  ligneNote: { fontSize: 12, color: couleurs.alerte, fontStyle: "italic" },

  boutonStatut: {
    borderRadius: rayons.sm,
    paddingHorizontal: espacements.s3,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 100,
  },
  boutonPrendre: { backgroundColor: couleurs.bleu },
  boutonPret: { backgroundColor: couleurs.succes },
  boutonStatutTexte: { color: "#fff", fontSize: 12, fontWeight: "700" },
});
