import * as React from "react";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { Volume2 } from "lucide-react-native";
import type { ClientApi } from "@hotel-chicago/api-client";
import { couleurs, espacements, rayons } from "../tokens";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";
import { annoncerStock, chargerPreferencesSons, ecouterExemple, ecrirePreferencesSons, signalOk, type PreferencesSons } from "../sons/sons";

export interface EcranSonsProps {
  client: ClientApi;
  /** Les alertes de stock ne concernent que la cafétaria et le patron. */
  alertesStock: boolean;
  onRetour: () => void;
}

/**
 * Plus › Sons et voix : le bip de scan, la voix de femme (Delphine) et les alertes de stock. Le bip et la voix suivent le volume média du téléphone.
 * Une alerte de stock revient toutes les 24 h tant que le stock n'est pas rechargé, jusqu'à ce que l'utilisateur la coupe — ici pour tout, ou depuis
 * la notification pour un seul produit.
 */
export function EcranSons({ client, alertesStock, onRetour }: EcranSonsProps) {
  const [prefs, setPrefs] = useState<PreferencesSons>({ bip: true, voix: true });
  const [stockCoupe, setStockCoupe] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    void chargerPreferencesSons().then(setPrefs);
    if (!alertesStock) return;
    client.listerCoupuresAlertesStock().then((c) => setStockCoupe(c.toutes), () => undefined);
  }, [client, alertesStock]);

  async function changer(partielles: Partial<PreferencesSons>) {
    setPrefs(await ecrirePreferencesSons(partielles));
  }

  async function basculerStock(actives: boolean) {
    setOccupe(true);
    setErreur(null);
    try {
      const c = actives ? await client.reactiverAlerteStock() : await client.couperAlerteStock();
      setStockCoupe(c.toutes);
    } catch {
      setErreur("Le réglage n'a pas pu être enregistré : vérifiez la connexion puis réessayez.");
    } finally {
      setOccupe(false);
    }
  }

  return (
    <View style={styles.page}>
      <EnteteMobile />
      <EnteteRetour titre="Sons et voix" onRetour={onRetour} />
      <ScrollView contentContainerStyle={styles.contenu}>
        <View style={styles.carte}>
          <View style={styles.ligne}>
            <View style={styles.texte}>
              <Text style={styles.titre}>Bip de scan</Text>
              <Text style={styles.aide}>Un bip à chaque article lu, un son grave si le scan échoue. Suit le volume de votre téléphone.</Text>
            </View>
            <Switch
              value={prefs.bip}
              onValueChange={(v) => {
                void changer({ bip: v }).then(() => v && signalOk());
              }}
              accessibilityLabel="Bip de scan"
            />
          </View>

          <View style={[styles.ligne, styles.separe]}>
            <View style={styles.texte}>
              <Text style={styles.titre}>Voix</Text>
              <Text style={styles.aide}>Une voix de femme dit « Please try again » quand un scan échoue, et annonce les stocks bas.</Text>
              <Pressable onPress={ecouterExemple} accessibilityRole="button" hitSlop={8} style={styles.exemple}>
                <Volume2 size={14} color={couleurs.bleu} />
                <Text style={styles.exempleTexte}>Écouter un exemple</Text>
              </Pressable>
            </View>
            <Switch value={prefs.voix} onValueChange={(v) => void changer({ voix: v })} accessibilityLabel="Voix" />
          </View>

          {alertesStock && (
            <View style={[styles.ligne, styles.separe]}>
              <View style={styles.texte}>
                <Text style={styles.titre}>Alertes de stock</Text>
                <Text style={styles.aide}>
                  {stockCoupe
                    ? "Coupées : vous n'êtes plus prévenu des stocks bas."
                    : "« Stock bas » est annoncé à la voix, puis rappelé toutes les 24 h tant que le stock n'est pas rechargé — même application fermée."}
                </Text>
                {!stockCoupe && (
                  <Pressable onPress={() => annoncerStock("Fanta 33 cl", false)} accessibilityRole="button" hitSlop={8} style={styles.exemple}>
                    <Volume2 size={14} color={couleurs.bleu} />
                    <Text style={styles.exempleTexte}>Écouter un exemple</Text>
                  </Pressable>
                )}
              </View>
              <Switch value={!stockCoupe} disabled={occupe} onValueChange={(v) => void basculerStock(v)} accessibilityLabel="Alertes de stock" />
            </View>
          )}
        </View>
        {erreur && (
          <Text style={styles.erreur} accessibilityRole="alert">
            {erreur}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface100 },
  contenu: { padding: espacements.s4, gap: espacements.s3 },
  carte: { backgroundColor: couleurs.surface200, borderRadius: rayons.lg, borderWidth: 1, borderColor: couleurs.bordure },
  ligne: { flexDirection: "row", alignItems: "center", gap: espacements.s3, padding: espacements.s4 },
  separe: { borderTopWidth: 1, borderTopColor: couleurs.bordure },
  texte: { flex: 1, gap: 2 },
  titre: { fontSize: 15, fontWeight: "700", color: couleurs.encre },
  aide: { fontSize: 12, color: couleurs.encreAttenuee, lineHeight: 17 },
  exemple: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: espacements.s1, minHeight: 32 },
  exempleTexte: { fontSize: 12, fontWeight: "600", color: couleurs.bleu },
  erreur: { color: couleurs.danger, fontSize: 13 },
});
