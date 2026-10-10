import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { TauxChange } from "@hotel-chicago/api-client";
import { couleurs, espacements, rayons } from "../tokens";
import { formatMontant } from "../formatMontant";
import { Devise } from "@hotel-chicago/types";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";
import { ConteneurFormulaire } from "../composants/ConteneurFormulaire";
import { useSession } from "../contexteSession";
import { useSyncEtat } from "../hooks/useSyncEtat";
import { lireTauxChange } from "@hotel-chicago/regles";
import { confirmerAction } from "../confirmer";
import { dateComplete, heureCourte } from "../dates";
import { messageErreur } from "../messagesErreur";

/** L'historique affiche les derniers taux seulement : le reste n'apporte rien à la caisse. */
const MAX_HISTORIQUE = 30;

export interface EcranTauxChangeProps {
  onRetour: () => void;
}

/**
 * Taux de change USD/CDF (PATRON, section 9.4) — saisie du taux du jour et
 * historique. En ligne uniquement : les taux sont une donnée serveur sans
 * miroir local (comme la gestion des Utilisateurs) — l'écran
 * d'encaissement, lui, lit le taux via l'API au moment du paiement croisé.
 */
export function EcranTauxChange({ onRetour }: EcranTauxChangeProps) {
  const { client } = useSession();
  const etatSync = useSyncEtat();
  const [historique, setHistorique] = useState<TauxChange[] | null>(null);
  const [saisie, setSaisie] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const recharger = useCallback(() => {
    Promise.all([client.listerTauxChange()])
      .then(([h]) => {
        setHistorique(h);
        setErreur(null);
      })
      .catch((e: unknown) => setErreur(messageErreur(e, "L'historique des taux n'a pas pu être chargé. Réessayez.")));
  }, [client]);

  useEffect(recharger, [recharger]);

  const actuel = historique?.[0] ?? null;

  /** Lit le taux (« 2.800 » = 2 800), le fait confirmer avec rappel de l'ancien, puis l'enregistre. */
  function demanderConfirmation() {
    const lu = lireTauxChange(saisie);
    if (!lu.ok) {
      setErreur(lu.message);
      return;
    }
    setErreur(null);
    const ancien = actuel ? `Taux actuel : 1 $ = ${formatMontant(actuel.cdfParUsd, Devise.CDF)}.\n` : "";
    confirmerAction({
      titre: "Confirmer le nouveau taux ?",
      message: `${ancien}Nouveau taux : 1 $ = ${formatMontant(lu.valeur, Devise.CDF)}.\nIl servira aux prochains paiements croisés.`,
      libelleConfirmer: "Enregistrer le taux",
      libelleRefuser: "Corriger",
      onConfirmer: () => enregistrer(lu.valeur),
    });
  }

  async function enregistrer(valeur: number) {
    setEnCours(true);
    setErreur(null);
    setConfirmation(null);
    try {
      await client.creerTauxChange(valeur);
      setSaisie("");
      setConfirmation(`Taux enregistré : 1 $ = ${formatMontant(valeur, Devise.CDF)}`);
      recharger();
    } catch (e) {
      setErreur(messageErreur(e, "Le taux n'a pas pu être enregistré. Réessayez."));
    } finally {
      setEnCours(false);
    }
  }

  return (
    <View style={styles.page}>
      <EnteteMobile />
      <EnteteRetour titre="Taux de change" sousTitre="1 dollar américain (USD) en francs congolais (CDF)." onRetour={onRetour} />

      {!etatSync.enLigne && (
        <Text style={styles.horsLigne}>Hors ligne — la saisie et l'historique nécessitent une connexion.</Text>
      )}

      <ConteneurFormulaire styleContenu={{ gap: espacements.s3 }}>
        <View style={styles.carteActuel}>
          <Text style={styles.labelActuel}>Taux en vigueur</Text>
          <Text style={styles.valeurActuel}>
            {actuel ? `1 $ = ${formatMontant(actuel.cdfParUsd, Devise.CDF)}` : historique ? "Aucun taux défini" : "…"}
          </Text>
          {actuel && (
            <Text style={styles.dateActuel}>Depuis le {dateComplete(actuel.createdAt)}</Text>
          )}
        </View>

        <View style={styles.carte}>
          <Text style={styles.champLabel}>Nouveau taux (CDF pour 1 USD)</Text>
          <TextInput
            style={styles.champ}
            value={saisie}
            onChangeText={setSaisie}
            accessibilityLabel="Nouveau taux : francs congolais pour 1 dollar"
            placeholder="Ex. 2800"
            placeholderTextColor={couleurs.encreFaible}
            keyboardType="numeric"
          />
          {erreur && (
            <Text style={styles.erreur} accessibilityRole="alert">
              {erreur}
            </Text>
          )}
          {confirmation && (
            <Text style={styles.confirmation} accessibilityLiveRegion="polite">
              {confirmation}
            </Text>
          )}
          <Pressable
            style={[styles.bouton, !etatSync.enLigne && styles.boutonInactif]}
            onPress={demanderConfirmation}
            disabled={enCours || !etatSync.enLigne}
            accessibilityRole="button"
            accessibilityState={{ disabled: enCours || !etatSync.enLigne, busy: enCours }}
          >
            <Text style={styles.boutonTexte}>{enCours ? "…" : "Enregistrer"}</Text>
          </Pressable>
          <Text style={styles.note}>
            Chaque saisie crée une entrée d'historique — les reçus déjà encaissés gardent le taux utilisé le jour J.
          </Text>
        </View>

        {!historique && <ActivityIndicator color={couleurs.bleu} />}
        {historique && historique.length > 0 && (
          <FlatList
            data={historique.slice(0, MAX_HISTORIQUE)}
            keyExtractor={(t) => t.id}
            scrollEnabled={false}
            contentContainerStyle={styles.historique}
            renderItem={({ item }) => (
              <View style={styles.ligneHistorique}>
                <Text style={styles.valeurHistorique}>1 $ = {formatMontant(item.cdfParUsd, Devise.CDF)}</Text>
                <Text style={styles.dateHistorique}>
                  {dateComplete(item.createdAt)} {heureCourte(item.createdAt)}
                </Text>
              </View>
            )}
          />
        )}
      </ConteneurFormulaire>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface100 },
  contenu: { padding: espacements.s4, gap: espacements.s3 },
  horsLigne: { color: couleurs.alerte, fontSize: 13, paddingHorizontal: espacements.s4 },
  carteActuel: {
    backgroundColor: couleurs.bleuClair,
    borderRadius: rayons.lg,
    padding: espacements.s5,
    alignItems: "center",
    gap: 4,
  },
  labelActuel: { fontSize: 12, fontWeight: "700", color: couleurs.bleu, textTransform: "uppercase" },
  valeurActuel: { fontSize: 22, fontWeight: "800", color: couleurs.navy },
  dateActuel: { fontSize: 12, color: couleurs.encreAttenuee },
  carte: {
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espacements.s4,
    gap: espacements.s2,
  },
  champLabel: { fontSize: 12, fontWeight: "600", color: couleurs.encreAttenuee },
  champ: {
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: rayons.sm,
    paddingHorizontal: espacements.s3,
    minHeight: 44,
    fontSize: 15,
    color: couleurs.encre,
    backgroundColor: couleurs.surface100,
  },
  erreur: { color: couleurs.danger, fontSize: 13 },
  confirmation: { color: couleurs.succes, fontSize: 13 },
  bouton: { minHeight: 48, borderRadius: rayons.sm, backgroundColor: couleurs.bleu, alignItems: "center", justifyContent: "center", marginTop: espacements.s2 },
  boutonInactif: { opacity: 0.45 },
  boutonTexte: { color: "#fff", fontWeight: "700", fontSize: 15 },
  note: { fontSize: 12, color: couleurs.encreAttenuee },
  historique: { gap: espacements.s2 },
  ligneHistorique: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.md,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espacements.s3,
  },
  valeurHistorique: { fontSize: 14, fontWeight: "700", color: couleurs.encre },
  dateHistorique: { fontSize: 12, color: couleurs.encreAttenuee },
});
