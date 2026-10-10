import * as React from "react";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { ClientApi } from "@hotel-chicago/api-client";
import { couleurs, espacements, rayons } from "../tokens";
import { confirmerAction } from "../confirmer";
import { messageErreur } from "../messagesErreur";
import { CHOIX_INACTIVITE, ecrirePreferencesSecurite, lirePreferencesSecurite } from "../stockage/preferencesSecurite";

interface Props {
  client: ClientApi;
  /** Actions non envoyées sur ce téléphone : citées dans l'avertissement avant d'effacer. */
  actionsEnAttente: number;
  onEffacerDonnees: () => Promise<void>;
}

/** Réglages de sécurité du poste : tout est facultatif et éteint par défaut (voir PLAN-SECURITE-UX.md). */
export function BlocSecuriteMobile({ client, actionsEnAttente, onEffacerDonnees }: Props) {
  const [inactivite, setInactivite] = useState<number | null>(null);
  const [actuel, setActuel] = useState("");
  const [nouveau, setNouveau] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);

  useEffect(() => {
    void lirePreferencesSecurite().then((p) => setInactivite(p.inactiviteMinutes));
  }, []);

  function choisirInactivite(minutes: number | null) {
    setInactivite(minutes);
    void ecrirePreferencesSecurite({ inactiviteMinutes: minutes }).catch(() => {});
  }

  async function changerMotDePasse() {
    if (nouveau.length < 8) return setRetour({ ok: false, texte: "Le nouveau mot de passe doit faire au moins 8 caractères." });
    if (nouveau !== confirmation) return setRetour({ ok: false, texte: "Les deux saisies du nouveau mot de passe sont différentes." });
    setEnCours(true);
    setRetour(null);
    try {
      await client.changerMotDePasse(actuel, nouveau);
      setActuel("");
      setNouveau("");
      setConfirmation("");
      setRetour({ ok: true, texte: "Mot de passe changé. Vos autres appareils devront se reconnecter." });
    } catch (e) {
      setRetour({ ok: false, texte: messageErreur(e, "Le mot de passe n'a pas pu être changé. Vérifiez la connexion puis réessayez.") });
    } finally {
      setEnCours(false);
    }
  }

  function demanderEffacement() {
    confirmerAction({
      titre: "Effacer les données de cet appareil ?",
      message:
        (actionsEnAttente > 0
          ? `${actionsEnAttente} action(s) n'ont pas encore été envoyées au serveur : elles seront PERDUES. `
          : "") + "Les comptes mémorisés seront oubliés ; reconnectez-vous en ligne pour récupérer les données de l'hôtel.",
      libelleConfirmer: "Effacer",
      destructif: true,
      onConfirmer: onEffacerDonnees,
    });
  }

  return (
    <View style={styles.carte}>
      <Text style={styles.titre} accessibilityRole="header">Sécurité</Text>

      <Text style={styles.libelle}>Redemander le mot de passe après une absence</Text>
      <Text style={styles.aide}>Facultatif. Par défaut l'application reste ouverte ; choisissez un délai pour la verrouiller quand vous la quittez.</Text>
      <View style={styles.rangee}>
        {CHOIX_INACTIVITE.map((c) => {
          const actif = c.minutes === inactivite;
          return (
            <Pressable
              key={String(c.minutes)}
              style={[styles.chip, actif && styles.chipActif]}
              onPress={() => choisirInactivite(c.minutes)}
              accessibilityRole="radio"
              accessibilityState={{ selected: actif }}
              accessibilityLabel={`Verrouiller après ${c.libelle}`}
            >
              <Text style={[styles.chipTexte, actif && styles.chipTexteActif]}>{c.libelle}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.libelle, { marginTop: espacements.s4 }]}>Changer mon mot de passe</Text>
      <TextInput style={styles.champ} value={actuel} onChangeText={setActuel} secureTextEntry autoComplete="current-password" placeholder="Mot de passe actuel" accessibilityLabel="Mot de passe actuel" />
      <TextInput style={styles.champ} value={nouveau} onChangeText={setNouveau} secureTextEntry autoComplete="new-password" placeholder="Nouveau mot de passe (8 caractères minimum)" accessibilityLabel="Nouveau mot de passe" />
      <TextInput style={styles.champ} value={confirmation} onChangeText={setConfirmation} secureTextEntry autoComplete="new-password" placeholder="Confirmer le nouveau mot de passe" accessibilityLabel="Confirmer le nouveau mot de passe" />
      {retour && (
        <Text style={[styles.retour, { color: retour.ok ? couleurs.succes : couleurs.danger }]} accessibilityRole="alert">{retour.texte}</Text>
      )}
      <Pressable
        style={[styles.bouton, (enCours || !actuel || !nouveau) && styles.boutonInactif]}
        onPress={() => void changerMotDePasse()}
        disabled={enCours || !actuel || !nouveau}
        accessibilityRole="button"
        accessibilityState={{ disabled: enCours || !actuel || !nouveau, busy: enCours }}
      >
        {enCours ? <ActivityIndicator color="#fff" /> : <Text style={styles.boutonTexte}>Changer le mot de passe</Text>}
      </Pressable>

      <Text style={[styles.libelle, { marginTop: espacements.s4 }]}>Données de cet appareil</Text>
      <Text style={styles.aide}>À utiliser avant de prêter ou de rendre ce téléphone : efface la copie locale de l'hôtel et oublie les comptes.</Text>
      <Pressable style={styles.boutonDanger} onPress={demanderEffacement} accessibilityRole="button">
        <Text style={styles.boutonTexte}>Effacer les données de cet appareil</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  carte: { backgroundColor: couleurs.surface200, borderRadius: rayons.lg, borderWidth: 1, borderColor: couleurs.bordure, padding: espacements.s4, marginTop: espacements.s3, gap: espacements.s2 },
  titre: { fontSize: 15, fontWeight: "700", color: couleurs.encre },
  libelle: { fontSize: 14, fontWeight: "600", color: couleurs.encre },
  aide: { fontSize: 12, color: couleurs.encreAttenuee },
  rangee: { flexDirection: "row", flexWrap: "wrap", gap: espacements.s2 },
  chip: { minHeight: 44, paddingHorizontal: espacements.s4, borderRadius: rayons.pill, borderWidth: 1, borderColor: couleurs.bordure, alignItems: "center", justifyContent: "center", backgroundColor: couleurs.surface100 },
  chipActif: { backgroundColor: couleurs.bleu, borderColor: couleurs.bleu },
  chipTexte: { color: couleurs.encre, fontSize: 13, fontWeight: "600" },
  chipTexteActif: { color: "#fff" },
  champ: { borderWidth: 1, borderColor: couleurs.bordure, borderRadius: rayons.sm, paddingHorizontal: espacements.s3, minHeight: 44, fontSize: 15, color: couleurs.encre, backgroundColor: couleurs.surface100 },
  retour: { fontSize: 13 },
  bouton: { minHeight: 44, borderRadius: rayons.sm, backgroundColor: couleurs.bleu, alignItems: "center", justifyContent: "center" },
  boutonInactif: { opacity: 0.5 },
  boutonDanger: { minHeight: 44, borderRadius: rayons.sm, backgroundColor: couleurs.danger, alignItems: "center", justifyContent: "center" },
  boutonTexte: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
