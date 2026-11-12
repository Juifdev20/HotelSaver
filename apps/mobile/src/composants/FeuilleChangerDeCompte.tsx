import * as React from "react";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight, Undo2 } from "lucide-react-native";
import { couleurs, espacements, rayons } from "../tokens";
import { useSession } from "../contexteSession";
import { LIBELLE_ROLE } from "../navigation";
import { messageErreur } from "../messagesErreur";
import { FeuilleModale } from "./FeuilleModale";

function initiales(nom: string): string {
  return nom.split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]!.toUpperCase()).join("") || "?";
}

/**
 * Liste des comptes vers lesquels passer (12/11/2026) : un seul toucher, sans se déconnecter ni retaper de mot de passe. Pendant la « visite »,
 * la première ligne est « Revenir à mon compte ». Utilisée dans le menu du compte (directement, sans étape de plus) et dans la feuille ouverte
 * par le bandeau ou par Réglages. `apres` : appelée une fois le changement fait (fermer le menu).
 */
export function ListeComptes({ apres }: { apres: () => void }) {
  const { comptes, visite, utilisateur, basculerVers, retourMonCompte, rafraichirComptes } = useSession();
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    rafraichirComptes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function lancer(cle: string, action: () => Promise<void>) {
    setEnCours(cle);
    setErreur(null);
    try {
      await action();
      apres();
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnCours(null);
    }
  }

  // Compte actuellement utilisé : pas proposé (on y est déjà). Pendant une visite, le patron revient par « Revenir à mon compte ».
  const autres = comptes.filter((c) => c.id !== utilisateur.userId);

  return (
    <View style={styles.liste}>
      {visite && (
        <Pressable
          style={[styles.ligne, styles.ligneRetour]}
          onPress={() => void lancer("retour", retourMonCompte)}
          disabled={enCours !== null}
          accessibilityRole="button"
          accessibilityLabel={`Revenir à mon compte, ${visite.patronNom}`}
        >
          <View style={[styles.avatar, { backgroundColor: couleurs.bleu }]}>
            <Undo2 size={20} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.nom}>Revenir à mon compte</Text>
            <Text style={styles.role}>{visite.patronNom} · Patron</Text>
          </View>
          {enCours === "retour" ? <ActivityIndicator color={couleurs.bleu} /> : <ChevronRight size={18} color={couleurs.bleu} />}
        </Pressable>
      )}

      {autres.length === 0 && !visite && <Text style={styles.vide}>Aucun autre compte actif. Ajoutez-en dans Plus › Utilisateurs.</Text>}
      {autres.map((c) => (
        <Pressable
          key={c.id}
          style={styles.ligne}
          onPress={() => void lancer(c.id, () => basculerVers(c.id))}
          disabled={enCours !== null}
          accessibilityRole="button"
          accessibilityLabel={`Passer au compte de ${c.nom}, ${LIBELLE_ROLE[c.role]}`}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarTexte}>{initiales(c.nom)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.nom}>{c.nom}</Text>
            <Text style={styles.role}>{enCours === c.id ? "Ouverture du compte…" : LIBELLE_ROLE[c.role]}</Text>
          </View>
          {enCours === c.id ? <ActivityIndicator color={couleurs.bleu} /> : <ChevronRight size={18} color={couleurs.encreFaible} />}
        </Pressable>
      ))}

      {erreur && (
        <Text style={styles.erreur} accessibilityRole="alert">
          {erreur}
        </Text>
      )}
    </View>
  );
}

/** Feuille « Changer de compte » (ouverte par le bandeau « Revenir à mon compte » et par Réglages). */
export function FeuilleChangerDeCompte({ visible, onFermer }: { visible: boolean; onFermer: () => void }) {
  return (
    <FeuilleModale visible={visible} onFermer={onFermer} titre="Changer de compte">
      <Text style={styles.aide}>Ce que vous faites est enregistré au nom du compte choisi. Si vous fermez l'application, vous retrouvez votre compte.</Text>
      {visible && <ListeComptes apres={onFermer} />}
    </FeuilleModale>
  );
}

const styles = StyleSheet.create({
  liste: { gap: espacements.s2 },
  aide: { fontSize: 13, color: couleurs.encreAttenuee, lineHeight: 19 },
  ligne: { flexDirection: "row", alignItems: "center", gap: espacements.s3, minHeight: 64, padding: espacements.s3, borderRadius: rayons.md, borderWidth: 1, borderColor: couleurs.bordure, backgroundColor: couleurs.surface100 },
  ligneRetour: { borderColor: couleurs.bleu, backgroundColor: couleurs.bleuClair },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: couleurs.navy, alignItems: "center", justifyContent: "center" },
  avatarTexte: { color: "#fff", fontWeight: "800", fontSize: 15 },
  nom: { fontSize: 16, fontWeight: "700", color: couleurs.encre },
  role: { fontSize: 13, color: couleurs.encreAttenuee, marginTop: 1 },
  vide: { fontSize: 14, color: couleurs.encreAttenuee, textAlign: "center", paddingVertical: espacements.s4 },
  erreur: { color: couleurs.danger, fontSize: 13, fontWeight: "600" },
});
