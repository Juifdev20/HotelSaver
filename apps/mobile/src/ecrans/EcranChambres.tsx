import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Chambre, StatutChambre } from "@hotel-chicago/types";
import { BedDouble } from "lucide-react-native";
import { couleurs, espacements, rayons } from "../tokens";
import { formatMontant } from "../formatMontant";
import { EnteteMobile } from "../composants/EnteteMobile";
import { FeuilleModale } from "../composants/FeuilleModale";
import { useSession } from "../contexteSession";
import { useSyncEtat } from "../hooks/useSyncEtat";
import { listerChambresMiroir, ecrireStatutChambreLocal } from "../stockage/chambresMirroir";

const COULEUR_PAR_STATUT: Record<StatutChambre, { fond: string; texte: string }> = {
  [StatutChambre.LIBRE]: { fond: couleurs.succesClair, texte: couleurs.succes },
  [StatutChambre.RESERVEE]: { fond: couleurs.alerteClair, texte: couleurs.alerte },
  [StatutChambre.OCCUPEE]: { fond: couleurs.dangerClair, texte: couleurs.danger },
  [StatutChambre.NETTOYAGE]: { fond: couleurs.violetClair, texte: couleurs.violet },
};

const LABEL_PAR_STATUT: Record<StatutChambre, string> = {
  [StatutChambre.LIBRE]: "Libre",
  [StatutChambre.RESERVEE]: "Réservée",
  [StatutChambre.OCCUPEE]: "Occupée",
  [StatutChambre.NETTOYAGE]: "Nettoyage",
};

const TOUS_LES_STATUTS = [StatutChambre.LIBRE, StatutChambre.RESERVEE, StatutChambre.OCCUPEE, StatutChambre.NETTOYAGE];

/**
 * Premier écran hors-ligne réel (voir @hotel-chicago/sync-engine) : lit
 * toujours le miroir SQLite local, jamais l'API directement — fonctionne
 * donc sans connexion. Une synchronisation est déclenchée en tâche de fond
 * (montage + tirer vers le bas) mais l'écran ne l'attend jamais pour
 * s'afficher. Changer le statut d'une chambre écrit dans le miroir tout de
 * suite (optimiste, comme `changerStatut` côté desktop) et met la
 * modification en file — elle part dès que possible, avec conflit visible
 * dans "Synchronisation" si le `syncVersion` a bougé entre-temps.
 */
export function EcranChambres() {
  const { moteurSync } = useSession();
  const etatSync = useSyncEtat();
  const [chambres, setChambres] = useState<Chambre[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [rafraichissement, setRafraichissement] = useState(false);
  const [chambreChoisie, setChambreChoisie] = useState<Chambre | null>(null);

  const rechargerMiroir = useCallback(() => {
    listerChambresMiroir()
      .then(setChambres)
      .catch((e: Error) => setErreur(e.message));
  }, []);

  useEffect(() => {
    rechargerMiroir();
    moteurSync.forcerSynchronisation();
  }, [rechargerMiroir, moteurSync]);

  // Une synchro (poll périodique ou manuelle) vient de finir : relit le
  // miroir pour refléter d'éventuelles lignes tirées du serveur.
  useEffect(() => {
    if (etatSync.dernierePousseeLe) rechargerMiroir();
  }, [etatSync.dernierePousseeLe, rechargerMiroir]);

  async function actualiser() {
    setRafraichissement(true);
    await moteurSync.forcerSynchronisation();
    rechargerMiroir();
    setRafraichissement(false);
  }

  async function choisirStatut(statut: StatutChambre) {
    if (!chambreChoisie) return;
    const chambre = chambreChoisie;
    setChambreChoisie(null);
    await ecrireStatutChambreLocal(chambre.id, statut);
    setChambres((liste) => liste?.map((c) => (c.id === chambre.id ? { ...c, statut } : c)) ?? liste);
    await moteurSync.mettreEnFile({
      entiteType: "Chambre",
      localId: chambre.id,
      remoteId: chambre.id,
      operation: "UPDATE",
      payload: { statut },
      baseSyncVersion: chambre.syncVersion,
    });
  }

  return (
    <View style={styles.page}>
      <EnteteMobile />
      <View style={styles.entete}>
        <Text style={styles.titre}>Chambres</Text>
        <Text style={styles.sousTitre}>
          {chambres ? `${chambres.length} chambre${chambres.length > 1 ? "s" : ""}` : "Chargement…"}
        </Text>
      </View>

      {erreur && <Text style={styles.erreur}>{erreur}</Text>}

      {chambres?.length === 0 && (
        <View style={styles.videConteneur}>
          <BedDouble size={32} color={couleurs.encreFaible} />
          <Text style={styles.videTitre}>Aucune chambre enregistrée</Text>
        </View>
      )}

      <FlatList
        data={chambres ?? []}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.liste}
        refreshControl={<RefreshControl refreshing={rafraichissement} onRefresh={actualiser} />}
        renderItem={({ item }) => {
          const tone = COULEUR_PAR_STATUT[item.statut];
          return (
            <Pressable style={styles.carte} onPress={() => setChambreChoisie(item)}>
              <View style={styles.carteEntete}>
                <Text style={styles.numero}>{item.numero}</Text>
                <View style={[styles.badge, { backgroundColor: tone.fond }]}>
                  <Text style={[styles.badgeTexte, { color: tone.texte }]}>{LABEL_PAR_STATUT[item.statut]}</Text>
                </View>
              </View>
              <Text style={styles.type}>{item.type}</Text>
              <Text style={styles.prix}>{formatMontant(item.prixParNuit, item.devise)}</Text>
            </Pressable>
          );
        }}
      />

      <FeuilleModale
        visible={!!chambreChoisie}
        onFermer={() => setChambreChoisie(null)}
        titre={chambreChoisie ? `Chambre ${chambreChoisie.numero}` : undefined}
      >
        {TOUS_LES_STATUTS.map((statut) => (
          <Pressable key={statut} style={styles.optionStatut} onPress={() => choisirStatut(statut)}>
            <View style={[styles.pastilleStatut, { backgroundColor: COULEUR_PAR_STATUT[statut].texte }]} />
            <Text style={styles.optionStatutTexte}>{LABEL_PAR_STATUT[statut]}</Text>
          </Pressable>
        ))}
      </FeuilleModale>
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
  videTitre: { fontSize: 15, fontWeight: "600", color: couleurs.encre },
  carte: {
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espacements.s4,
    gap: 4,
  },
  carteEntete: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  numero: { fontSize: 17, fontWeight: "700", color: couleurs.encre },
  badge: { paddingHorizontal: espacements.s2, paddingVertical: 3, borderRadius: rayons.pill },
  badgeTexte: { fontSize: 11, fontWeight: "700" },
  type: { fontSize: 14, color: couleurs.encreAttenuee },
  prix: { fontSize: 16, fontWeight: "700", color: couleurs.encre, marginTop: 2 },
  optionStatut: { flexDirection: "row", alignItems: "center", gap: espacements.s3, paddingVertical: espacements.s3 },
  pastilleStatut: { width: 12, height: 12, borderRadius: rayons.pill },
  optionStatutTexte: { fontSize: 15, fontWeight: "600", color: couleurs.encre },
});
