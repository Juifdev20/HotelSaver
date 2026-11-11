import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Notifications from "expo-notifications";
import * as IntentLauncher from "expo-intent-launcher";
import { BellRing, CircleAlert, CircleCheck, Send } from "lucide-react-native";
import type { EtatPushNotifications, ResultatTestPush } from "@hotel-chicago/types";
import { couleurs, espacements, fonds, rayons } from "../tokens";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";
import { useSession } from "../contexteSession";
import { enregistrerAppareil } from "../notifications/push";

type Verdict = "ok" | "probleme" | "inconnu";
interface Ligne {
  cle: string;
  titre: string;
  verdict: Verdict;
  detail: string;
  action?: { libelle: string; onPress: () => void };
}

const CANAUX = [
  { id: "reservations", nom: "Réservations" },
  { id: "stock", nom: "Stock" },
  { id: "securite", nom: "Sécurité et abonnement" },
  { id: "quotidien", nom: "Résumés du jour" },
];

/**
 * Plus › Diagnostic des notifications : pourquoi un téléphone fermé ou verrouillé ne reçoit rien ? On vérifie, dans l'ordre, ce qui peut casser la chaîne
 * (permission Android, identifiant Firebase du téléphone, enregistrement auprès du serveur, clé Firebase du serveur, canaux sonores), puis un bouton envoie
 * une vraie notification de test. Chaque point dit quoi faire.
 */
export function EcranDiagnosticNotifications({ onRetour }: { onRetour: () => void }) {
  const { client } = useSession();
  const [lignes, setLignes] = useState<Ligne[] | null>(null);
  const [test, setTest] = useState<{ encours: boolean; resultat: ResultatTestPush | null; erreur: string | null }>({ encours: false, resultat: null, erreur: null });

  const diagnostiquer = useCallback(async () => {
    const resultat: Ligne[] = [];
    const reglages = () => void Linking.openSettings();

    // 1. Permission d'afficher des notifications.
    const permission = await Notifications.getPermissionsAsync().catch(() => null);
    const autorise = permission?.granted === true;
    resultat.push({
      cle: "permission",
      titre: "Notifications autorisées",
      verdict: autorise ? "ok" : "probleme",
      detail: autorise ? "Android autorise HotelSaver à afficher des notifications." : "Android bloque les notifications de HotelSaver : rien ne peut s'afficher, ni sonner. Autorisez-les dans les réglages.",
      action: autorise ? undefined : { libelle: "Ouvrir les réglages", onPress: reglages },
    });

    // 2. Identifiant Firebase de ce téléphone.
    let jeton: string | null = null;
    let erreurJeton: string | null = null;
    try {
      const j = (await Notifications.getDevicePushTokenAsync()).data;
      jeton = typeof j === "string" && j ? j : null;
    } catch (e) {
      erreurJeton = e instanceof Error ? e.message : "inconnue";
    }
    resultat.push({
      cle: "jeton",
      titre: "Ce téléphone a un identifiant Firebase",
      verdict: jeton ? "ok" : "probleme",
      detail: jeton
        ? "Le téléphone peut recevoir des notifications même application fermée."
        : "Ce téléphone n'a pas d'identifiant Firebase : cette version de l'application a été construite sans Firebase (fichier google-services.json) ou les services Google sont absents du téléphone. Sans cela, aucune notification n'arrive application fermée : il faut une version construite avec Firebase (voir FIREBASE.md).",
    });

    // 3 et 4. Côté serveur : enregistré ? clé Firebase présente ?
    let etat: EtatPushNotifications | null = null;
    let erreurServeur = false;
    try {
      etat = await client.etatPushNotifications(jeton ?? undefined);
    } catch {
      erreurServeur = true;
    }
    resultat.push({
      cle: "enregistre",
      titre: "Ce téléphone est enregistré au nom de votre compte",
      verdict: etat === null ? "inconnu" : jeton && etat.cetAppareilEnregistre ? "ok" : jeton ? "probleme" : "inconnu",
      detail:
        etat === null
          ? "Impossible de joindre le serveur pour le vérifier (pas de connexion ?)."
          : !jeton
            ? "Impossible à vérifier sans identifiant Firebase (point précédent)."
            : etat.cetAppareilEnregistre
              ? "Le serveur sait que ce téléphone est à vous : il lui enverra vos notifications."
              : "Le serveur ne connaît pas ce téléphone : il ne lui enverra rien. Touchez « Enregistrer maintenant ».",
      action:
        etat && jeton && !etat.cetAppareilEnregistre
          ? {
              libelle: "Enregistrer maintenant",
              onPress: () => void enregistrerAppareil(client).then(diagnostiquer),
            }
          : undefined,
    });
    resultat.push({
      cle: "serveur",
      titre: "Le serveur peut envoyer des notifications",
      verdict: etat === null ? "inconnu" : etat.serveurPret ? "ok" : "probleme",
      detail:
        etat === null
          ? erreurServeur
            ? "Impossible de joindre le serveur pour le vérifier."
            : ""
          : etat.serveurPret
            ? "La clé Firebase est configurée sur le serveur."
            : "Le serveur n'a pas la clé Firebase : il ne peut rien envoyer aux téléphones fermés. Le propriétaire de l'application doit ajouter la variable FIREBASE_SERVICE_ACCOUNT_JSON sur Render (voir FIREBASE.md).",
    });

    // 5. Canaux Android : un canal silencieux ne sonne pas.
    if (Platform.OS === "android") {
      const canaux = await Notifications.getNotificationChannelsAsync().catch(() => []);
      const muets = CANAUX.filter((c) => {
        const canal = canaux.find((x) => x.id === c.id);
        return canal && (canal.importance <= Notifications.AndroidImportance.LOW || canal.sound === null);
      });
      resultat.push({
        cle: "canaux",
        titre: "Les canaux de notification font du bruit",
        verdict: muets.length === 0 ? "ok" : "probleme",
        detail: muets.length === 0 ? "Aucune catégorie n'est mise en silencieux." : `Silencieux dans les réglages Android : ${muets.map((c) => c.nom).join(", ")}. Mettez-les en « Son » (importance élevée).`,
        action: muets.length === 0 ? undefined : { libelle: "Ouvrir les réglages", onPress: reglages },
      });
    }
    setLignes(resultat);
  }, [client]);

  useEffect(() => {
    void diagnostiquer();
  }, [diagnostiquer]);

  async function envoyerTest() {
    setTest({ encours: true, resultat: null, erreur: null });
    try {
      setTest({ encours: false, resultat: await client.testerPushNotifications(), erreur: null });
    } catch {
      setTest({ encours: false, resultat: null, erreur: "Impossible de joindre le serveur. Vérifiez la connexion Internet." });
    }
  }

  const raisons: Record<string, string> = {
    SERVEUR_NON_CONFIGURE: "Le serveur n'a pas la clé Firebase (voir plus haut).",
    AUCUN_APPAREIL: "Aucun téléphone n'est enregistré à votre nom : touchez « Enregistrer maintenant » plus haut.",
    ENVOI_REFUSE: "Firebase a refusé l'envoi (identifiant périmé ou mal configuré). Réessayez après avoir rouvert l'application ; sinon la version installée n'a pas la bonne configuration Firebase.",
  };

  return (
    <View style={styles.page}>
      <EnteteMobile />
      <EnteteRetour titre="Diagnostic des notifications" onRetour={onRetour} />
      <ScrollView contentContainerStyle={styles.contenu}>
        <Text style={styles.intro}>Si vous ne recevez rien quand l'application est fermée ou le téléphone verrouillé, ces vérifications disent pourquoi.</Text>

        {lignes === null && <ActivityIndicator color={couleurs.bleu} accessibilityLabel="Vérification en cours" />}
        {lignes?.map((l) => (
          <View key={l.cle} style={styles.carte}>
            <View style={styles.entete}>
              {l.verdict === "ok" ? <CircleCheck size={22} color={couleurs.succes} /> : l.verdict === "probleme" ? <CircleAlert size={22} color={couleurs.danger} /> : <CircleAlert size={22} color={couleurs.encreAttenuee} />}
              <Text style={styles.titre}>{l.titre}</Text>
            </View>
            <Text style={styles.detail}>{l.detail}</Text>
            {l.action && (
              <Pressable style={styles.actionSecondaire} onPress={l.action.onPress} accessibilityRole="button">
                <Text style={styles.actionSecondaireTexte}>{l.action.libelle}</Text>
              </Pressable>
            )}
          </View>
        ))}

        {lignes && (
          <View style={styles.carte}>
            <View style={styles.entete}>
              <BellRing size={22} color={couleurs.bleu} />
              <Text style={styles.titre}>Envoyer une notification de test</Text>
            </View>
            <Text style={styles.detail}>
              Touchez le bouton, puis <Text style={{ fontWeight: "800" }}>fermez l'application et verrouillez l'écran</Text>. En quelques secondes, une notification avec un son doit apparaître.
            </Text>
            <Pressable style={[styles.bouton, test.encours && { opacity: 0.6 }]} disabled={test.encours} onPress={() => void envoyerTest()} accessibilityRole="button" accessibilityLabel="Envoyer une notification de test">
              {test.encours ? <ActivityIndicator color="#fff" /> : <Send size={18} color="#fff" />}
              <Text style={styles.boutonTexte}>{test.encours ? "Envoi…" : "Envoyer le test"}</Text>
            </Pressable>
            {test.resultat && (
              <Text style={[styles.resultat, { color: test.resultat.envoyes > 0 ? couleurs.succes : couleurs.danger }]} accessibilityRole="alert">
                {test.resultat.envoyes > 0
                  ? `Envoyée à ${test.resultat.envoyes} téléphone${test.resultat.envoyes > 1 ? "s" : ""}. Rien n'est apparu après quelques secondes ? Voir « Batterie » ci-dessous.`
                  : (test.resultat.raison && raisons[test.resultat.raison]) || "Rien n'a été envoyé."}
              </Text>
            )}
            {test.erreur && (
              <Text style={[styles.resultat, { color: couleurs.danger }]} accessibilityRole="alert">
                {test.erreur}
              </Text>
            )}
          </View>
        )}

        {Platform.OS === "android" && (
          <View style={styles.carte}>
            <Text style={styles.titre}>Batterie : si le test est « envoyé » mais n'apparaît pas</Text>
            <Text style={styles.detail}>
              Beaucoup de téléphones (Tecno, Infinix, Xiaomi, Samsung, Huawei…) arrêtent les applications fermées pour économiser la batterie, ce qui bloque les notifications. Dans les réglages de HotelSaver, mettez la batterie sur « Sans restriction » et autorisez le démarrage automatique.
            </Text>
            <View style={styles.actions}>
              <Pressable style={styles.actionSecondaire} onPress={() => void IntentLauncher.startActivityAsync("android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS").catch(() => Linking.openSettings())} accessibilityRole="button">
                <Text style={styles.actionSecondaireTexte}>Réglages de la batterie</Text>
              </Pressable>
              <Pressable style={styles.actionSecondaire} onPress={() => void Linking.openSettings()} accessibilityRole="button">
                <Text style={styles.actionSecondaireTexte}>Réglages de HotelSaver</Text>
              </Pressable>
            </View>
          </View>
        )}

        <Pressable style={styles.lien} onPress={() => void diagnostiquer()} accessibilityRole="button">
          <Text style={styles.lienTexte}>Revérifier</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface100 },
  contenu: { padding: espacements.s4, gap: espacements.s3, paddingBottom: espacements.s7 },
  intro: { fontSize: 14, color: couleurs.encreAttenuee, lineHeight: 20 },
  carte: { backgroundColor: couleurs.surface200, borderRadius: rayons.lg, borderWidth: 1, borderColor: couleurs.bordure, padding: espacements.s4, gap: espacements.s2 },
  entete: { flexDirection: "row", alignItems: "center", gap: espacements.s2 },
  titre: { flex: 1, fontSize: 15, fontWeight: "700", color: couleurs.encre },
  detail: { fontSize: 14, color: couleurs.encre, lineHeight: 20 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: espacements.s2 },
  actionSecondaire: { minHeight: 44, paddingHorizontal: espacements.s4, borderRadius: rayons.sm, borderWidth: 1.5, borderColor: couleurs.bleu, alignItems: "center", justifyContent: "center", alignSelf: "flex-start" },
  actionSecondaireTexte: { color: couleurs.bleu, fontWeight: "700", fontSize: 14 },
  bouton: { minHeight: 48, borderRadius: rayons.md, backgroundColor: fonds.bleu, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  boutonTexte: { color: "#fff", fontWeight: "800", fontSize: 15 },
  resultat: { fontSize: 14, fontWeight: "600", lineHeight: 20 },
  lien: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  lienTexte: { color: couleurs.bleu, fontWeight: "700", fontSize: 14 },
});
