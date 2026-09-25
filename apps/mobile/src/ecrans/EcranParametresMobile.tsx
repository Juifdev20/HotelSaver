import * as React from "react";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { ClientApi } from "@hotel-chicago/api-client";
import { couleurs, espacements, rayons } from "../tokens";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";
import { ecrireConfiguration, lireConfiguration } from "../stockage/configuration";

export interface EcranParametresMobileProps {
  client: ClientApi;
  onRetour: () => void;
}

type EtatConnexion = "inconnu" | "verification" | "ok" | "echec";

/**
 * Même principe que EcranParametres du desktop (apps/desktop/src/renderer/src/screens/EcranParametres.tsx) :
 * juste l'URL de l'API + un test de connexion. Pas de bascule de thème (pas
 * de mode sombre mobile), pas de bloc Administration (Utilisateurs/Taux de
 * change vivent déjà dans "Plus", inchangés) — voir le plan pour ce cadrage.
 */
export function EcranParametresMobile({ client, onRetour }: EcranParametresMobileProps) {
  const [apiUrl, setApiUrl] = useState("");
  const [chargement, setChargement] = useState(true);
  const [enregistre, setEnregistre] = useState(false);
  const [connexion, setConnexion] = useState<EtatConnexion>("inconnu");

  useEffect(() => {
    lireConfiguration().then((config) => {
      setApiUrl(config.apiUrl);
      setChargement(false);
    });
  }, []);

  async function tester() {
    setConnexion("verification");
    const ok = await client.estJoignable();
    setConnexion(ok ? "ok" : "echec");
  }

  async function enregistrer() {
    await ecrireConfiguration({ apiUrl: apiUrl.trim() });
    setEnregistre(true);
  }

  return (
    <View style={styles.page}>
      <EnteteMobile />
      <EnteteRetour titre="Paramètres" onRetour={onRetour} />

      {chargement ? (
        <ActivityIndicator style={styles.chargement} color={couleurs.bleu} />
      ) : (
        <View style={styles.contenu}>
          <View style={styles.carte}>
            <Text style={styles.label}>URL de l'API</Text>
            <TextInput
              style={styles.champ}
              value={apiUrl}
              onChangeText={(texte) => {
                setApiUrl(texte);
                setEnregistre(false);
                setConnexion("inconnu");
              }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="http://localhost:3001"
              placeholderTextColor={couleurs.encreFaible}
            />
            <Text style={styles.aide}>Adresse du serveur de l'hôtel, par exemple http://localhost:3001.</Text>

            {connexion !== "inconnu" && (
              <Text
                style={[
                  styles.etatConnexion,
                  connexion === "ok" && styles.etatConnexionOk,
                  connexion === "echec" && styles.etatConnexionEchec,
                ]}
              >
                {connexion === "verification" && "Vérification…"}
                {connexion === "ok" && "Connecté."}
                {connexion === "echec" && "Injoignable — vérifiez l'URL ou la connexion internet."}
              </Text>
            )}

            {enregistre && (
              <Text style={styles.confirmation} accessibilityRole="alert">
                Paramètres enregistrés.
              </Text>
            )}

            <View style={styles.boutons}>
              <Pressable style={styles.boutonSecondaire} onPress={tester}>
                <Text style={styles.boutonSecondaireTexte}>Tester la connexion</Text>
              </Pressable>
              <Pressable style={styles.bouton} onPress={enregistrer}>
                <Text style={styles.boutonTexte}>Enregistrer</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface100 },
  chargement: { marginTop: espacements.s6 },
  contenu: { padding: espacements.s4 },
  carte: {
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espacements.s4,
  },
  label: { fontSize: 12, fontWeight: "600", color: couleurs.encreAttenuee, marginBottom: espacements.s1 },
  champ: {
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: rayons.sm,
    paddingHorizontal: espacements.s3,
    height: 44,
    fontSize: 15,
    color: couleurs.encre,
    backgroundColor: couleurs.surface100,
  },
  aide: { fontSize: 12, color: couleurs.encreAttenuee, marginTop: espacements.s2 },
  etatConnexion: { fontSize: 13, marginTop: espacements.s3, color: couleurs.encreAttenuee },
  etatConnexionOk: { color: couleurs.succes },
  etatConnexionEchec: { color: couleurs.danger },
  confirmation: { fontSize: 13, color: couleurs.succes, marginTop: espacements.s3 },
  boutons: { flexDirection: "row", gap: espacements.s3, marginTop: espacements.s4 },
  boutonSecondaire: {
    flex: 1,
    height: 44,
    borderRadius: rayons.sm,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    alignItems: "center",
    justifyContent: "center",
  },
  boutonSecondaireTexte: { color: couleurs.encre, fontWeight: "600", fontSize: 14 },
  bouton: { flex: 1, height: 44, borderRadius: rayons.sm, backgroundColor: couleurs.bleu, alignItems: "center", justifyContent: "center" },
  boutonTexte: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
