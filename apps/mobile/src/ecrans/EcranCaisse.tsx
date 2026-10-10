import * as React from "react";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { ScanBarcode } from "lucide-react-native";
import { couleurs, espacements, rayons } from "../tokens";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";
import { ConteneurFormulaire } from "../composants/ConteneurFormulaire";
import { useSession } from "../contexteSession";

export interface EcranCaisseProps {
  /** `venteRapide` : ouvrir directement l'ajout de consommations, caméra prête. */
  onCompteOuvert: (compteId: string, options?: { venteRapide: boolean }) => void;
  onRetour: () => void;
}

/**
 * Point d'entrée d'une nouvelle vente : ouvre un compte cafétaria puis passe
 * directement à son détail (EcranCompteCafeteria) pour y ajouter des lignes.
 * "Comptes ouverts" reste l'écran pour reprendre un compte déjà en cours.
 *
 * Le compte (+ son premier sous-compte) est écrit instantanément dans la
 * base locale, puis envoyé au serveur en arrière-plan — marche hors ligne.
 */
export function EcranCaisse({ onCompteOuvert, onRetour }: EcranCaisseProps) {
  const { client } = useSession();
  const [tableOuNom, setTableOuNom] = useState("");
  const [nomPremierSousCompte, setNomPremierSousCompte] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  /** `venteRapide` (scan au comptoir, 08/10/2026) : compte « Comptoir HH:MM »
   * créé sans rien saisir, puis ouverture directe de l'ajout avec la caméra. */
  async function ouvrir(venteRapide = false) {
    const heure = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    const nom = venteRapide ? `Comptoir ${heure}` : tableOuNom.trim();
    if (!nom) {
      setErreur("Le nom de la table ou du client est obligatoire.");
      return;
    }
    setEnCours(true);
    setErreur(null);
    try {
      const compte = await client.ouvrirCompteCafeteria({
        tableOuNom: nom,
        nomPremierSousCompte: venteRapide ? "Client" : nomPremierSousCompte.trim() || undefined,
      });
      setTableOuNom("");
      setNomPremierSousCompte("");
      onCompteOuvert(compte.id, { venteRapide });
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

      <ConteneurFormulaire>
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

          <Pressable style={styles.bouton} onPress={() => ouvrir(false)} disabled={enCours}>
            <Text style={styles.boutonTexte}>{enCours ? "…" : "Ouvrir le compte"}</Text>
          </Pressable>
        </View>

        <View style={[styles.carte, { marginTop: espacements.s4 }]}>
          <Text style={styles.titreRapide}>Vente au comptoir</Text>
          <Text style={styles.aideRapide}>
            Scannez directement les articles (caméra ou douchette) : un compte « Comptoir » est ouvert pour vous.
          </Text>
          <Pressable style={[styles.bouton, styles.boutonRapide]} onPress={() => ouvrir(true)} disabled={enCours}>
            <ScanBarcode size={18} color="#fff" />
            <Text style={styles.boutonTexte}>Vente rapide (scanner)</Text>
          </Pressable>
        </View>
      </ConteneurFormulaire>
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
  boutonRapide: { flexDirection: "row", gap: espacements.s2, marginTop: espacements.s2 },
  titreRapide: { fontSize: 16, fontWeight: "700", color: couleurs.navy },
  aideRapide: { fontSize: 13, color: couleurs.encreAttenuee },
});
