import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import type { JourneeReception } from "@hotel-chicago/api-client";
import { Devise } from "@hotel-chicago/types";
import { couleurs, espacements, rayons } from "../tokens";
import { formatMontant } from "../formatMontant";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";
import { useSession } from "../contexteSession";

export interface EcranJourneeReceptionProps {
  onRetour?: () => void;
}

function ListeSejours({ items, vide }: { items: JourneeReception["arrivees"]["restantes"]; vide: string }) {
  if (items.length === 0) return <Text style={styles.ligneSecondaire}>{vide}</Text>;
  return (
    <View style={styles.liste}>
      {items.map((r, i) => (
        <Text key={i} style={styles.ligne}>
          Ch. {r.chambre.numero} · {r.client.nom}
        </Text>
      ))}
    </View>
  );
}

/**
 * Journal de la journée (remise de poste) : encaissements du jour par
 * département et devise, arrivées/départs faits et restants, état du parc.
 * Calculé sur la base locale de l'appareil (marche hors ligne).
 */
export function EcranJourneeReception({ onRetour }: EcranJourneeReceptionProps) {
  const { client } = useSession();
  const [journal, setJournal] = useState<JourneeReception | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [rafraichissement, setRafraichissement] = useState(false);

  const charger = useCallback(async () => {
    setErreur(null);
    try {
      setJournal(await client.journeeReception());
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Impossible de charger le journal.");
    }
  }, [client]);

  useEffect(() => {
    void charger();
  }, [charger]);

  async function actualiser() {
    setRafraichissement(true);
    await charger();
    setRafraichissement(false);
  }

  return (
    <View style={styles.page}>
      <EnteteMobile />
      {onRetour ? (
        <EnteteRetour titre="Journal de la journée" sousTitre="Remise de poste" onRetour={onRetour} />
      ) : (
        <View style={styles.entete}>
          <Text style={styles.titre}>Journal de la journée</Text>
        </View>
      )}
      {erreur && <Text style={styles.erreur}>{erreur}</Text>}

      {!journal ? (
        <ActivityIndicator style={{ marginTop: espacements.s6 }} color={couleurs.bleu} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.contenu}
          refreshControl={<RefreshControl refreshing={rafraichissement} onRefresh={actualiser} />}
        >
          <View style={styles.carte}>
            <Text style={styles.titreCarte}>Encaissements du jour</Text>
            <View style={styles.ligneMontant}>
              <Text style={styles.ligneSecondaire}>Chambres ({journal.recette.chambres.nombreFactures} facture{journal.recette.chambres.nombreFactures > 1 ? "s" : ""})</Text>
              <Text style={styles.montant}>
                {formatMontant(journal.recette.chambres.montantUSD, Devise.USD)}
                {journal.recette.chambres.montantCDF > 0 ? ` + ${formatMontant(journal.recette.chambres.montantCDF, Devise.CDF)}` : ""}
              </Text>
            </View>
            <View style={styles.ligneMontant}>
              <Text style={styles.ligneSecondaire}>Cafétéria ({journal.recette.cafeteria.nombreVentes} vente{journal.recette.cafeteria.nombreVentes > 1 ? "s" : ""})</Text>
              <Text style={styles.montant}>
                {formatMontant(journal.recette.cafeteria.montantUSD, Devise.USD)}
                {journal.recette.cafeteria.montantCDF > 0 ? ` + ${formatMontant(journal.recette.cafeteria.montantCDF, Devise.CDF)}` : ""}
              </Text>
            </View>
            <View style={[styles.ligneMontant, styles.total]}>
              <Text style={styles.totalLibelle}>Total</Text>
              <Text style={styles.totalMontant}>
                {formatMontant(journal.recette.total.montantUSD, Devise.USD)}
                {journal.recette.total.montantCDF > 0 ? ` + ${formatMontant(journal.recette.total.montantCDF, Devise.CDF)}` : ""}
              </Text>
            </View>
          </View>

          <View style={styles.carte}>
            <Text style={styles.titreCarte}>
              Arrivées · {journal.arrivees.effectuees.length} faite{journal.arrivees.effectuees.length > 1 ? "s" : ""} ·{" "}
              {journal.arrivees.restantes.length} restante{journal.arrivees.restantes.length > 1 ? "s" : ""}
            </Text>
            {journal.arrivees.restantes.length > 0 && (
              <>
                <Text style={styles.sousTitreCarte}>Reste à accueillir</Text>
                <ListeSejours items={journal.arrivees.restantes} vide="" />
              </>
            )}
          </View>

          <View style={styles.carte}>
            <Text style={styles.titreCarte}>
              Départs · {journal.departs.effectues.length} fait{journal.departs.effectues.length > 1 ? "s" : ""} ·{" "}
              {journal.departs.restants.length} restant{journal.departs.restants.length > 1 ? "s" : ""}
            </Text>
            {journal.departs.restants.length > 0 && (
              <>
                <Text style={styles.sousTitreCarte}>Reste à facturer</Text>
                <ListeSejours items={journal.departs.restants} vide="" />
              </>
            )}
          </View>

          <View style={styles.carte}>
            <Text style={styles.titreCarte}>Parc de chambres ({journal.chambres.tauxOccupationPourcent}% occupé)</Text>
            <View style={styles.parc}>
              <View style={[styles.puce, { backgroundColor: couleurs.succesClair }]}>
                <Text style={styles.puceValeur}>{journal.chambres.libres}</Text>
                <Text style={styles.puceLibelle}>libres</Text>
              </View>
              <View style={[styles.puce, { backgroundColor: couleurs.dangerClair }]}>
                <Text style={styles.puceValeur}>{journal.chambres.occupees}</Text>
                <Text style={styles.puceLibelle}>occupées</Text>
              </View>
              <View style={[styles.puce, { backgroundColor: couleurs.bleuClair }]}>
                <Text style={styles.puceValeur}>{journal.chambres.reservees}</Text>
                <Text style={styles.puceLibelle}>réservées</Text>
              </View>
              <View style={[styles.puce, { backgroundColor: couleurs.alerteClair }]}>
                <Text style={styles.puceValeur}>{journal.chambres.enNettoyage}</Text>
                <Text style={styles.puceLibelle}>nettoyage</Text>
              </View>
            </View>
            <Text style={styles.ligneSecondaire}>
              {journal.comptesCafeteriaOuverts} compte{journal.comptesCafeteriaOuverts > 1 ? "s" : ""} cafétéria ouvert
              {journal.comptesCafeteriaOuverts > 1 ? "s" : ""}
            </Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface100 },
  entete: { paddingHorizontal: espacements.s4, paddingBottom: espacements.s2 },
  titre: { fontSize: 22, fontWeight: "700", color: couleurs.navy },
  erreur: { color: couleurs.danger, fontSize: 13, paddingHorizontal: espacements.s4 },
  contenu: { padding: espacements.s4, gap: espacements.s3, paddingBottom: 88 },
  carte: {
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espacements.s4,
    gap: espacements.s2,
  },
  titreCarte: { fontSize: 14, fontWeight: "700", color: couleurs.navy },
  sousTitreCarte: { fontSize: 12, fontWeight: "700", color: couleurs.encreAttenuee, textTransform: "uppercase", marginTop: 4 },
  ligneMontant: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  ligne: { fontSize: 14, color: couleurs.encre },
  ligneSecondaire: { fontSize: 12, color: couleurs.encreAttenuee },
  liste: { gap: 2, marginTop: 2 },
  montant: { fontSize: 14, fontWeight: "700", color: couleurs.encre },
  total: { borderTopWidth: 1, borderColor: couleurs.bordure, paddingTop: espacements.s2, marginTop: 2 },
  totalLibelle: { fontSize: 14, fontWeight: "700", color: couleurs.navy },
  totalMontant: { fontSize: 15, fontWeight: "700", color: couleurs.navy },
  parc: { flexDirection: "row", gap: espacements.s2, marginTop: 2 },
  puce: { flex: 1, borderRadius: rayons.sm, paddingVertical: espacements.s2, alignItems: "center" },
  puceValeur: { fontSize: 16, fontWeight: "700", color: couleurs.encre },
  puceLibelle: { fontSize: 10, color: couleurs.encreAttenuee },
});
