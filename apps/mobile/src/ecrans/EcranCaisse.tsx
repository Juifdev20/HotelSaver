import * as React from "react";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { ClientApi } from "@hotel-chicago/api-client";
import { couleurs, espacements, rayons } from "../tokens";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";

export interface EcranCaisseProps {
  client: ClientApi;
  onCompteOuvert: (compteId: string) => void;
  onRetour: () => void;
}

/** Point d'entrée d'une nouvelle vente : ouvre un compte cafétaria puis passe
 * directement à son détail (EcranCompteCafeteria) pour y ajouter des lignes.
 * "Comptes ouverts" reste l'écran pour reprendre un compte déjà en cours. */
export function EcranCaisse({ client, onCompteOuvert, onRetour }: EcranCaisseProps) {
  const [tableOuNom, setTableOuNom] = useState("");
  const [nomPremierSousCompte, setNomPremierSousCompte] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function ouvrir() {
    if (!tableOuNom.trim()) {
      setErreur("Le nom de la table ou du client est obligatoire.");
      return;
    }
    setEnCours(true);
    setErreur(null);
    try {
      const compte = await client.ouvrirCompteCafeteria({
        tableOuNom: tableOuNom.trim(),
        nomPremierSousCompte: nomPremierSousCompte.trim() || undefined,
      });
      setTableOuNom("");
      setNomPremierSousCompte("");
      onCompteOuvert(compte.id);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <View style={styles.page}>
      <EnteteMobile />
      <EnteteRetour titre="Caisse" sousTitre="Ouvrir un nouveau compte cafétaria." onRetour={onRetour} />

      <View style={styles.contenu}>
        <View style={styles.carte}>
          <Text style={styles.label}>Table ou nom du client</Text>
          <TextInput
            style={styles.champ}
            value={tableOuNom}
            onChangeText={setTableOuNom}
            placeholder="Ex. Table 4"
            placeholderTextColor={couleurs.encreFaible}
          />

          <Text style={styles.label}>Nom de la première personne (optionnel)</Text>
          <TextInput
            style={styles.champ}
            value={nomPremierSousCompte}
            onChangeText={setNomPremierSousCompte}
            placeholder="Personne 1"
            placeholderTextColor={couleurs.encreFaible}
          />

          {erreur && <Text style={styles.erreur}>{erreur}</Text>}

          <Pressable style={styles.bouton} onPress={ouvrir} disabled={enCours}>
            <Text style={styles.boutonTexte}>{enCours ? "…" : "Ouvrir le compte"}</Text>
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
    padding: espacements.s4,
    gap: espacements.s1,
  },
  label: { fontSize: 12, fontWeight: "600", color: couleurs.encreAttenuee, marginTop: espacements.s2, marginBottom: espacements.s1 },
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
  erreur: { color: couleurs.danger, fontSize: 13, marginTop: espacements.s2 },
  bouton: { height: 48, borderRadius: rayons.sm, backgroundColor: couleurs.bleu, alignItems: "center", justifyContent: "center", marginTop: espacements.s4 },
  boutonTexte: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
