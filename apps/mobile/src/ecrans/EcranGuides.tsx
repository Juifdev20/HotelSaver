import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { BookOpen, Download } from "lucide-react-native";
import type { GuideDisponible } from "@hotel-chicago/types";
import { couleurs, espacements, rayons } from "../tokens";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";
import { ConteneurFormulaire } from "../composants/ConteneurFormulaire";
import { useSession } from "../contexteSession";
import { ouvrirLienSur } from "../liens";
import { messageErreur } from "../messagesErreur";

export interface EcranGuidesProps {
  onRetour: () => void;
}

const mo = (octets: number) => `${(octets / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;

/**
 * Guides d'utilisation PDF (20/10/2026) : le serveur ne propose que ceux du rôle (le patron tous, le personnel celui de son poste).
 * Chaque ouverture demande un lien signé de 5 minutes, ouvert par le téléphone (Linking) — internet nécessaire.
 */
export function EcranGuides({ onRetour }: EcranGuidesProps) {
  const { client } = useSession();
  const [guides, setGuides] = useState<GuideDisponible[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);

  const charger = useCallback(() => {
    client
      .listerGuides()
      .then((liste) => {
        setGuides(liste);
        setErreur(null);
      })
      .catch((e: unknown) => setErreur(messageErreur(e, "Les guides n'ont pas pu être chargés. Vérifiez la connexion puis rouvrez l'écran.")));
  }, [client]);

  useEffect(charger, [charger]);

  async function ouvrir(g: GuideDisponible) {
    setEnCours(g.guide);
    setErreur(null);
    try {
      const { url } = await client.lienGuide(g.guide);
      await ouvrirLienSur(url);
    } catch (e) {
      setErreur(`Le guide n'a pas pu être ouvert : ${messageErreur(e, "vérifiez la connexion et qu'une application peut lire les PDF.")}`);
    } finally {
      setEnCours(null);
    }
  }

  return (
    <View style={styles.page}>
      <EnteteMobile />
      <EnteteRetour titre="Guide d'utilisation" onRetour={onRetour} />
      <ConteneurFormulaire styleContenu={styles.contenu}>
        <Text style={styles.discret}>Le guide pas à pas de HotelSaver, en PDF. Il demande une connexion internet pour s'ouvrir.</Text>
        {erreur && <Text style={styles.erreur}>{erreur}</Text>}
        {!guides && !erreur && <Text style={styles.discret}>Chargement…</Text>}
        {guides && guides.length === 0 && <Text style={styles.discret}>Aucun guide n'est encore publié pour votre compte.</Text>}
        {guides?.map((g) => (
          <View key={g.guide} style={styles.carte}>
            <View style={styles.carteEntete}>
              <BookOpen size={22} color={couleurs.bleu} />
              <View style={{ flex: 1 }}>
                <Text style={styles.carteTitre}>{g.libelle}</Text>
                <Text style={styles.discret}>
                  {g.edition ?? `Version ${g.version}`} · PDF, {mo(g.taille)}
                </Text>
              </View>
            </View>
            <Pressable
              style={[styles.bouton, enCours !== null && { opacity: 0.6 }]}
              disabled={enCours !== null}
              onPress={() => void ouvrir(g)}
              accessibilityRole="button"
              accessibilityLabel={`Ouvrir le ${g.libelle}`}
            >
              <Download size={18} color="#fff" />
              <Text style={styles.boutonTexte}>{enCours === g.guide ? "Ouverture…" : "Ouvrir le guide"}</Text>
            </Pressable>
          </View>
        ))}
      </ConteneurFormulaire>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface100 },
  contenu: { gap: espacements.s4 },
  erreur: { color: couleurs.danger, fontSize: 14 },
  discret: { color: couleurs.encreFaible, fontSize: 14 },
  carte: {
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg,
    padding: espacements.s4,
    gap: espacements.s3,
    borderWidth: 1,
    borderColor: couleurs.bordure,
  },
  carteEntete: { flexDirection: "row", alignItems: "center", gap: espacements.s3 },
  carteTitre: { fontSize: 16, fontWeight: "700", color: couleurs.encre },
  bouton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: couleurs.bleu,
    borderRadius: rayons.md,
    minHeight: 44,
    paddingHorizontal: 14,
  },
  boutonTexte: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
