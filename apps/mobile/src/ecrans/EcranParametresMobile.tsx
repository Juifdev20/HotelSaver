import * as React from "react";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { ClientApi } from "@hotel-chicago/api-client";
import { Role, type UtilisateurAuthentifie } from "@hotel-chicago/types";
import { LogOut, UserRound } from "lucide-react-native";
import { couleurs, espacements, rayons } from "../tokens";
import { LIBELLE_ROLE } from "../navigation";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";
import { ecrireConfiguration, lireConfiguration } from "../stockage/configuration";

export interface EcranParametresMobileProps {
  client: ClientApi;
  onRetour: () => void;
  /** Présents une fois connecté : alimentent la carte « Compte » en bas —
   * déconnexion/changement de profil aussi ici, pas seulement dans Plus. */
  utilisateur?: UtilisateurAuthentifie;
  onChangerProfil?: () => void;
  onSeDeconnecter?: () => void;
}

type EtatConnexion = "inconnu" | "verification" | "ok" | "echec";

/**
 * Même principe que EcranParametres du desktop (apps/desktop/src/renderer/src/screens/EcranParametres.tsx) :
 * juste l'URL de l'API + un test de connexion. Pas de bascule de thème (pas
 * de mode sombre mobile), pas de bloc Administration (Utilisateurs/Taux de
 * change vivent déjà dans "Plus", inchangés) — voir le plan pour ce cadrage.
 */
export function EcranParametresMobile({ client, onRetour, utilisateur, onChangerProfil, onSeDeconnecter }: EcranParametresMobileProps) {
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

          {/* Carte « Compte » : la déconnexion vit aussi ici (et en bas de
              l'écran Plus) — un employé cherchant « sortir » dans les
              réglages la trouve sans fouiller. « Changer de profil » reste
              réservé au PATRON, comme dans EcranPlus/App.tsx. */}
          {utilisateur && (
            <View style={[styles.carte, styles.carteCompte]}>
              <View style={styles.compteLigne}>
                <View style={styles.compteAvatar}>
                  <UserRound size={18} color={couleurs.bleu} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.compteNom}>{utilisateur.nom}</Text>
                  <Text style={styles.compteRole}>{LIBELLE_ROLE[utilisateur.role]}</Text>
                </View>
              </View>
              {utilisateur.role === Role.PATRON ? (
                onChangerProfil && (
                  <Pressable style={styles.boutonSecondaire} onPress={onChangerProfil}>
                    <Text style={styles.boutonSecondaireTexte}>Changer de profil</Text>
                  </Pressable>
                )
              ) : (
                onSeDeconnecter && (
                  <Pressable style={styles.boutonDanger} onPress={onSeDeconnecter}>
                    <LogOut size={16} color="#fff" />
                    <Text style={styles.boutonDangerTexte}>Se déconnecter</Text>
                  </Pressable>
                )
              )}
            </View>
          )}
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
  carteCompte: { marginTop: espacements.s3, gap: espacements.s3 },
  compteLigne: { flexDirection: "row", alignItems: "center", gap: espacements.s3 },
  compteAvatar: {
    width: 36,
    height: 36,
    borderRadius: rayons.pill,
    backgroundColor: couleurs.bleuClair,
    alignItems: "center",
    justifyContent: "center",
  },
  compteNom: { fontSize: 15, fontWeight: "700", color: couleurs.encre },
  compteRole: { fontSize: 12, color: couleurs.encreAttenuee },
  boutonDanger: {
    flexDirection: "row",
    height: 44,
    borderRadius: rayons.sm,
    backgroundColor: couleurs.danger,
    alignItems: "center",
    justifyContent: "center",
    gap: espacements.s2,
  },
  boutonDangerTexte: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
