import * as React from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import type { ClientApi } from "@hotel-chicago/api-client";
import { CompteCafeteria, Devise, StatutCompte } from "@hotel-chicago/types";
import { ClipboardList } from "lucide-react-native";
import { couleurs, espacements, rayons } from "../tokens";
import { formatMontant } from "../formatMontant";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";
import { useDonnee } from "../hooks/useDonnee";

export interface EcranComptesOuvertsProps {
  client: ClientApi;
  onOuvrirCompte: (compteId: string) => void;
  onRetour: () => void;
}

function totalCompte(compte: CompteCafeteria): { usd: number; cdf: number } {
  let usd = 0;
  let cdf = 0;
  for (const sousCompte of compte.sousComptes) {
    for (const ligne of sousCompte.lignes) {
      const montant = Number(ligne.prixUnitaire) * Number(ligne.quantite);
      if (ligne.devise === Devise.USD) usd += montant;
      else cdf += montant;
    }
  }
  return { usd, cdf };
}

export function EcranComptesOuverts({ client, onOuvrirCompte, onRetour }: EcranComptesOuvertsProps) {
  const {
    donnee: comptes,
    erreur,
    enCours,
    recharger,
  } = useDonnee(() => client.listerComptesCafeteria(StatutCompte.OUVERT), client);

  return (
    <View style={styles.page}>
      <EnteteMobile />
      <EnteteRetour
        titre="Comptes ouverts"
        sousTitre={
          comptes ? `${comptes.length} compte${comptes.length > 1 ? "s" : ""} ouvert${comptes.length > 1 ? "s" : ""}` : "Chargement…"
        }
        onRetour={onRetour}
      />

      {erreur && <Text style={styles.erreur}>{erreur}</Text>}

      {comptes?.length === 0 && (
        <View style={styles.videConteneur}>
          <ClipboardList size={32} color={couleurs.encreFaible} />
          <Text style={styles.videTitre}>Aucun compte ouvert pour le moment.</Text>
        </View>
      )}

      <FlatList
        data={comptes ?? []}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.liste}
        refreshControl={<RefreshControl refreshing={enCours} onRefresh={recharger} />}
        renderItem={({ item }) => {
          const total = totalCompte(item);
          const nombrePersonnes = item.sousComptes.length;
          return (
            <Pressable style={styles.carte} onPress={() => onOuvrirCompte(item.id)}>
              <View style={styles.carteEntete}>
                <Text style={styles.nom}>{item.tableOuNom}</Text>
                <Text style={styles.personnes}>
                  {nombrePersonnes} personne{nombrePersonnes > 1 ? "s" : ""}
                </Text>
              </View>
              <View style={styles.totaux}>
                {total.usd > 0 && <Text style={styles.total}>{formatMontant(total.usd, Devise.USD)}</Text>}
                {total.cdf > 0 && <Text style={styles.total}>{formatMontant(total.cdf, Devise.CDF)}</Text>}
                {total.usd === 0 && total.cdf === 0 && <Text style={styles.totalVide}>Aucune ligne pour l'instant</Text>}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface100 },
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
  nom: { fontSize: 16, fontWeight: "700", color: couleurs.encre },
  personnes: { fontSize: 12, color: couleurs.encreAttenuee },
  totaux: { flexDirection: "row", gap: espacements.s3, marginTop: 4 },
  total: { fontSize: 15, fontWeight: "700", color: couleurs.encre },
  totalVide: { fontSize: 13, color: couleurs.encreAttenuee, fontStyle: "italic" },
});
