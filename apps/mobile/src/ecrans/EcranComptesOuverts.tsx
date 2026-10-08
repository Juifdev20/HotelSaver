import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { CompteCafeteria, Devise } from "@hotel-chicago/types";
import { ClipboardList } from "lucide-react-native";
import { couleurs, espacements, rayons } from "../tokens";
import { formatMontant } from "../formatMontant";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";
import { useSession } from "../contexteSession";
import { useSyncEtat } from "../hooks/useSyncEtat";
import { listerComptesOuvertsMiroir } from "../stockage/cafeteriaMirroir";

export interface EcranComptesOuvertsProps {
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

/**
 * Hors ligne (Phase 6, 26/09/2026) : lit toujours le miroir SQLite local,
 * jamais l'API directement — même patron que EcranChambres.tsx.
 */
export function EcranComptesOuverts({ onOuvrirCompte, onRetour }: EcranComptesOuvertsProps) {
  const { moteurSync } = useSession();
  const etatSync = useSyncEtat();
  const [comptes, setComptes] = useState<CompteCafeteria[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [rafraichissement, setRafraichissement] = useState(false);

  const rechargerMiroir = useCallback(() => {
    listerComptesOuvertsMiroir()
      .then(setComptes)
      .catch((e: Error) => setErreur(e.message));
  }, []);

  useEffect(() => {
    rechargerMiroir();
    moteurSync.forcerSynchronisation();
  }, [rechargerMiroir, moteurSync]);

  useEffect(() => {
    if (etatSync.dernierePousseeLe) rechargerMiroir();
  }, [etatSync.dernierePousseeLe, rechargerMiroir]);

  async function actualiser() {
    setRafraichissement(true);
    await moteurSync.forcerSynchronisation();
    rechargerMiroir();
    setRafraichissement(false);
  }

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
        refreshControl={<RefreshControl refreshing={rafraichissement} onRefresh={actualiser} />}
        renderItem={({ item }) => {
          const total = totalCompte(item);
          const nombrePersonnes = item.sousComptes.length;
          return (
            <Pressable style={styles.carte} onPress={() => onOuvrirCompte(item.id)}>
              <View style={styles.carteEntete}>
                <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: espacements.s2 }}>
                  <Text style={styles.nom} numberOfLines={1}>{item.tableOuNom}</Text>
                  {item.origine === "SITE_PUBLIC" && (
                    <View style={styles.badgeWeb}>
                      <Text style={styles.badgeWebTexte}>Réf. {item.id.slice(0, 8).toUpperCase()}</Text>
                    </View>
                  )}
                </View>
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
  nom: { fontSize: 16, fontWeight: "700", color: couleurs.encre, flexShrink: 1 },
  badgeWeb: { backgroundColor: couleurs.bleuClair, borderRadius: rayons.pill, paddingHorizontal: espacements.s2, paddingVertical: 2 },
  badgeWebTexte: { fontSize: 10, fontWeight: "700", color: couleurs.bleu },
  personnes: { fontSize: 12, color: couleurs.encreAttenuee },
  totaux: { flexDirection: "row", gap: espacements.s3, marginTop: 4 },
  total: { fontSize: 15, fontWeight: "700", color: couleurs.encre },
  totalVide: { fontSize: 13, color: couleurs.encreAttenuee, fontStyle: "italic" },
});
