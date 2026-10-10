import * as React from "react";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { ClientApi } from "@hotel-chicago/api-client";
import { Ticket } from "lucide-react-native";
import { couleurs, espacements, rayons } from "../tokens";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";

export interface EcranRetraitCommandeProps {
  client: ClientApi;
  onRetour: () => void;
  /** Ouvre le détail du compte trouvé (lignes, encaissement, servir). */
  onOuvrirCompte: (compteId: string) => void;
}

/**
 * Le client présente la référence de sa commande web (ticket PDF / écran de
 * confirmation). La recherche ne trouve que les commandes encore OUVERTES :
 * une fois le compte encaissé et clôturé, la référence devient obsolète —
 * elle ne peut pas être réutilisée pour se faire servir une deuxième fois.
 */
export function EcranRetraitCommande({ client, onRetour, onOuvrirCompte }: EcranRetraitCommandeProps) {
  const [reference, setReference] = useState("");
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function rechercher() {
    if (!reference.trim() || chargement) return;
    setChargement(true);
    setErreur(null);
    try {
      const compte = await client.trouverCompteParReference(reference);
      onOuvrirCompte(compte.id);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Recherche impossible pour le moment.");
    } finally {
      setChargement(false);
    }
  }

  return (
    <View style={styles.page}>
      <EnteteMobile />
      <EnteteRetour titre="Retrait commande" sousTitre="Commande passée sur le site web" onRetour={onRetour} />

      <View style={styles.contenu}>
        <View style={styles.carte}>
          <Ticket size={28} color={couleurs.bleu} />
          <Text style={styles.titre}>Référence du ticket</Text>
          <Text style={styles.description}>
            Le client présente la référence affichée sur son ticket (ex. E6A5E231). Tapez-la pour ouvrir sa commande,
            l'encaisser et la marquer servie.
          </Text>
          <TextInput
            style={styles.champ}
            value={reference}
            onChangeText={setReference}
            placeholder="Ex. E6A5E231"
            placeholderTextColor={couleurs.encreFaible}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => void rechercher()}
          />
          {erreur && <Text style={styles.erreur}>{erreur}</Text>}
          <Pressable
            style={[styles.bouton, (!reference.trim() || chargement) && styles.boutonDesactive]}
            disabled={!reference.trim() || chargement}
            onPress={() => void rechercher()}
          >
            {chargement ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.boutonTexte}>Ouvrir la commande</Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface100 },
  contenu: { padding: espacements.s4 },
  carte: {
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espacements.s5,
    gap: espacements.s3,
  },
  titre: { fontSize: 17, fontWeight: "700", color: couleurs.encre },
  description: { fontSize: 13, color: couleurs.encreAttenuee, lineHeight: 19 },
  champ: {
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: rayons.md,
    backgroundColor: couleurs.surface100,
    paddingHorizontal: espacements.s3,
    minHeight: 46,
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 1,
    color: couleurs.encre,
  },
  erreur: { color: couleurs.danger, fontSize: 13 },
  bouton: {
    backgroundColor: couleurs.bleu,
    borderRadius: rayons.md,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  boutonDesactive: { opacity: 0.5 },
  boutonTexte: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
