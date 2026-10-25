import * as React from "react";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Bluetooth, Check } from "lucide-react-native";
import { couleurs, espacements, rayons } from "../tokens";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";
import { AppareilImprimante, ecrireAppareilImprimante, lireAppareilImprimante } from "../impression/appareilImprimante";
import { imprimerTicketDeTest, listerAppareilsAppaires, ouvrirReglagesBluetooth } from "../impression/imprimante";
import { enteteHotel } from "@hotel-chicago/receipts";
import type { ProfilConnecte } from "@hotel-chicago/types";
import { messageErreur, messageImpressionEnvoyee } from "../messagesErreur";

export interface EcranImprimanteProps {
  /** Le ticket de test porte le nom de l'hôtel de l'utilisateur. */
  utilisateur: ProfilConnecte;
  onRetour: () => void;
}

/**
 * Réglage de l'imprimante Bluetooth (section 11) — liste uniquement les
 * appareils déjà appairés au niveau du système Android, aucun appairage
 * possible depuis l'app elle-même (limite documentée dans le plan).
 */
export function EcranImprimante({ utilisateur, onRetour }: EcranImprimanteProps) {
  const [appareils, setAppareils] = useState<AppareilImprimante[] | null>(null);
  const [choisi, setChoisi] = useState<AppareilImprimante | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enTest, setEnTest] = useState<string | null>(null);
  const [messageTest, setMessageTest] = useState<string | null>(null);

  useEffect(() => {
    lireAppareilImprimante().then(setChoisi);
    charger();
  }, []);

  function charger() {
    setErreur(null);
    setAppareils(null);
    listerAppareilsAppaires()
      .then(setAppareils)
      .catch((e: unknown) => {
        setErreur(messageErreur(e, "La liste des appareils Bluetooth n'a pas pu être lue. Vérifiez que le Bluetooth est activé."));
        setAppareils([]);
      });
  }

  async function choisir(appareil: AppareilImprimante) {
    await ecrireAppareilImprimante(appareil);
    setChoisi(appareil);
  }

  async function tester(appareil: AppareilImprimante) {
    setEnTest(appareil.address);
    setMessageTest(null);
    try {
      await imprimerTicketDeTest(appareil.address, enteteHotel(utilisateur));
      setMessageTest(messageImpressionEnvoyee("Ticket de test"));
    } catch (e) {
      setMessageTest(`Impression impossible : ${messageErreur(e, "l'imprimante n'a pas répondu.")}`);
    } finally {
      setEnTest(null);
    }
  }

  return (
    <View style={styles.page}>
      <EnteteMobile />
      <EnteteRetour titre="Imprimante" onRetour={onRetour} />

      <View style={styles.contenu}>
        <View style={styles.etapes}>
          <Text style={styles.etapesTitre}>Pour connecter votre imprimante</Text>
          <Text style={styles.aide}>1. Allumez l'imprimante et activez le Bluetooth du téléphone.</Text>
          <Text style={styles.aide}>2. Dans les réglages Bluetooth, appairez l'imprimante (code 0000 ou 1234 si le téléphone le demande).</Text>
          <Text style={styles.aide}>3. Revenez ici : elle apparaît dans la liste. Touchez-la, puis imprimez un ticket de test.</Text>
          <Pressable style={styles.boutonBluetooth} onPress={() => void ouvrirReglagesBluetooth()} accessibilityRole="button" accessibilityLabel="Ouvrir les réglages Bluetooth du téléphone">
            <Bluetooth size={16} color={couleurs.bleu} />
            <Text style={styles.boutonBluetoothTexte}>Ouvrir les réglages Bluetooth</Text>
          </Pressable>
        </View>

        {erreur && (
          <Text style={styles.erreur} accessibilityRole="alert">
            {erreur}
          </Text>
        )}
        {messageTest && (
          <Text style={styles.confirmation} accessibilityLiveRegion="polite">
            {messageTest}
          </Text>
        )}

        {appareils === null && <ActivityIndicator style={styles.chargement} color={couleurs.bleu} accessibilityLabel="Recherche des appareils" />}

        {appareils?.length === 0 && !erreur && (
          <Text style={styles.vide}>Aucun appareil Bluetooth appairé pour l'instant.</Text>
        )}

        <FlatList
          data={appareils ?? []}
          keyExtractor={(a) => a.address}
          contentContainerStyle={styles.liste}
          renderItem={({ item }) => {
            const estChoisi = choisi?.address === item.address;
            return (
              <View style={[styles.carte, estChoisi && styles.carteChoisie]}>
                <Pressable
                  style={styles.carteContenu}
                  onPress={() => choisir(item)}
                  accessibilityRole="radio"
                  accessibilityLabel={`Imprimante ${item.nom}, adresse ${item.address}`}
                  accessibilityState={{ checked: estChoisi }}
                >
                  <Bluetooth size={18} color={estChoisi ? couleurs.bleu : couleurs.encreAttenuee} />
                  <View style={styles.carteTexte}>
                    <Text style={styles.nom}>{item.nom}</Text>
                    <Text style={styles.adresse}>{item.address}</Text>
                  </View>
                  {estChoisi && <Check size={18} color={couleurs.bleu} />}
                </Pressable>
                <Pressable
                  style={styles.boutonTest}
                  onPress={() => tester(item)}
                  disabled={enTest === item.address}
                  accessibilityRole="button"
                  accessibilityLabel={`Imprimer un ticket de test sur ${item.nom}`}
                  accessibilityState={{ disabled: enTest === item.address, busy: enTest === item.address }}
                >
                  <Text style={styles.boutonTestTexte}>{enTest === item.address ? "…" : "Imprimer un ticket de test"}</Text>
                </Pressable>
              </View>
            );
          }}
        />

        <Pressable style={styles.boutonSecondaire} onPress={charger} accessibilityRole="button">
          <Text style={styles.boutonSecondaireTexte}>Actualiser la liste</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface100 },
  chargement: { marginTop: espacements.s6 },
  contenu: { flex: 1, padding: espacements.s4, gap: espacements.s3 },
  aide: { fontSize: 12, color: couleurs.encreAttenuee },
  etapes: { gap: espacements.s2, padding: espacements.s3, backgroundColor: couleurs.surface200, borderRadius: rayons.lg, borderWidth: 1, borderColor: couleurs.bordure },
  etapesTitre: { fontSize: 13, fontWeight: "700", color: couleurs.encre },
  boutonBluetooth: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: espacements.s2, minHeight: 44, marginTop: espacements.s1, borderRadius: rayons.sm, borderWidth: 1, borderColor: couleurs.bleu },
  boutonBluetoothTexte: { color: couleurs.bleu, fontWeight: "600", fontSize: 14 },
  erreur: { color: couleurs.danger, fontSize: 13 },
  confirmation: { color: couleurs.succes, fontSize: 13 },
  vide: { fontSize: 13, color: couleurs.encreAttenuee, fontStyle: "italic", textAlign: "center", marginTop: espacements.s5 },
  liste: { gap: espacements.s3 },
  carte: {
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    overflow: "hidden",
  },
  carteChoisie: { borderColor: couleurs.bleu },
  carteContenu: { flexDirection: "row", alignItems: "center", gap: espacements.s3, padding: espacements.s4 },
  carteTexte: { flex: 1 },
  nom: { fontSize: 15, fontWeight: "700", color: couleurs.encre },
  adresse: { fontSize: 12, color: couleurs.encreAttenuee },
  boutonTest: { borderTopWidth: 1, borderTopColor: couleurs.bordure, padding: espacements.s3, minHeight: 44, alignItems: "center", justifyContent: "center" },
  boutonTestTexte: { fontSize: 13, fontWeight: "600", color: couleurs.bleu },
  boutonSecondaire: {
    minHeight: 44,
    borderRadius: rayons.sm,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    alignItems: "center",
    justifyContent: "center",
  },
  boutonSecondaireTexte: { color: couleurs.encre, fontWeight: "600", fontSize: 14 },
});
