import * as React from "react";
import { useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import type { ClientApi } from "@hotel-chicago/api-client";
import { Chambre, StatutChambre } from "@hotel-chicago/types";
import { BedDouble } from "lucide-react-native";
import { couleurs, espacements, rayons } from "../tokens";
import { formatMontant } from "../formatMontant";
import { EnteteMobile } from "../composants/EnteteMobile";

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

export interface EcranChambresProps {
  client: ClientApi;
}

export function EcranChambres({ client }: EcranChambresProps) {
  const [chambres, setChambres] = useState<Chambre[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [rafraichissement, setRafraichissement] = useState(false);

  const charger = React.useCallback(() => {
    setRafraichissement(true);
    client
      .listerChambres()
      .then(setChambres)
      .catch((e: Error) => setErreur(e.message))
      .finally(() => setRafraichissement(false));
  }, [client]);

  useEffect(charger, [charger]);

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
        refreshControl={<RefreshControl refreshing={rafraichissement} onRefresh={charger} />}
        renderItem={({ item }) => {
          const tone = COULEUR_PAR_STATUT[item.statut];
          return (
            <View style={styles.carte}>
              <View style={styles.carteEntete}>
                <Text style={styles.numero}>{item.numero}</Text>
                <View style={[styles.badge, { backgroundColor: tone.fond }]}>
                  <Text style={[styles.badgeTexte, { color: tone.texte }]}>{LABEL_PAR_STATUT[item.statut]}</Text>
                </View>
              </View>
              <Text style={styles.type}>{item.type}</Text>
              <Text style={styles.prix}>{formatMontant(item.prixParNuit, item.devise)}</Text>
            </View>
          );
        }}
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
});
