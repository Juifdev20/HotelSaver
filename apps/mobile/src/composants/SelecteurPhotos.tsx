import * as React from "react";
import { useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { ImagePlus, X } from "lucide-react-native";
import type { ClientApi } from "@hotel-chicago/api-client";
import type { UsageImage } from "@hotel-chicago/types";
import { couleurs, espacements, rayons } from "../tokens";

export interface SelecteurPhotosProps {
  client: ClientApi;
  usage: UsageImage;
  /** URLs actuelles, dans l'ordre (la première sert de couverture). */
  photos: string[];
  max: number;
  onChange: (photos: string[]) => void;
  /** Notifie chaque image envoyée pendant l'édition, pour retirer du stockage
   * celles qui ne seront finalement pas gardées. */
  onEnvoyee?: (url: string) => void;
  libelle?: string;
}

/** Envoi d'images depuis la galerie du téléphone. `quality: 0.7` compresse déjà
 * le JPEG sur l'appareil (une photo de 12 Mo ne traverse pas un réseau
 * instable) ; le serveur redimensionne et convertit ensuite en WebP. */
export function SelecteurPhotos({ client, usage, photos, max, onChange, onEnvoyee, libelle }: SelecteurPhotosProps) {
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function ajouter() {
    setErreur(null);
    const restantes = max - photos.length;
    if (restantes <= 0) return;
    const choix = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: restantes > 1,
      selectionLimit: restantes,
      quality: 0.7,
    });
    if (choix.canceled) return;

    setEnCours(true);
    let courantes = photos;
    try {
      for (const asset of choix.assets.slice(0, restantes)) {
        const corps = new FormData();
        // Expo SDK 57 remplace le fetch/FormData global par son implémentation
        // WinterCG, qui ne comprend plus la convention React Native classique
        // { uri, name, type } ("Unsupported FormDataPart implementation") —
        // il faut un objet Blob-like réel, fourni par expo-file-system.
        corps.append("fichier", new File(asset.uri), asset.fileName ?? "photo.jpg");
        const { url } = await client.televerserImage(corps, usage);
        onEnvoyee?.(url);
        courantes = [...courantes, url];
        onChange(courantes);
      }
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Envoi impossible.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <View style={styles.conteneur}>
      {libelle && (
        <Text style={styles.libelle}>
          {libelle} ({photos.length}/{max})
        </Text>
      )}
      <View style={styles.grille}>
        {photos.map((url, i) => (
          <View key={url} style={styles.vignette}>
            <Image source={{ uri: url }} style={styles.image} resizeMode="cover" accessibilityLabel={`Photo ${i + 1}`} />
            <Pressable
              style={styles.retirer}
              onPress={() => onChange(photos.filter((p) => p !== url))}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Retirer la photo ${i + 1}`}
            >
              <X size={14} color="#fff" />
            </Pressable>
          </View>
        ))}
        {photos.length < max && (
          <Pressable style={styles.ajouter} onPress={ajouter} disabled={enCours} accessibilityRole="button">
            {enCours ? <ActivityIndicator color={couleurs.bleu} /> : <ImagePlus size={24} color={couleurs.bleu} />}
            <Text style={styles.ajouterTexte}>{enCours ? "Envoi…" : "Ajouter"}</Text>
          </Pressable>
        )}
      </View>
      {erreur && <Text style={styles.erreur}>{erreur}</Text>}
    </View>
  );
}

/** Supprime du stockage les images qui ne sont plus référencées (retirées, ou
 * envoyées puis abandonnées). Jamais bloquant. */
export async function nettoyerImages(client: ClientApi, avant: string[], envoyees: string[], gardees: string[]): Promise<void> {
  const inutiles = [...new Set([...avant, ...envoyees])].filter((u) => !gardees.includes(u));
  await Promise.all(inutiles.map((u) => client.supprimerImage(u).catch(() => undefined)));
}

const styles = StyleSheet.create({
  conteneur: { marginTop: espacements.s2, marginBottom: espacements.s2 },
  libelle: { fontSize: 12, fontWeight: "600", color: couleurs.encreAttenuee, marginBottom: espacements.s2 },
  grille: { flexDirection: "row", flexWrap: "wrap", gap: espacements.s3 },
  vignette: { width: 104, height: 80, borderRadius: rayons.md, overflow: "hidden", backgroundColor: couleurs.surface100 },
  image: { width: "100%", height: "100%" },
  retirer: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(10,26,46,0.78)",
    alignItems: "center",
    justifyContent: "center",
  },
  ajouter: {
    width: 104,
    height: 80,
    borderRadius: rayons.md,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.surface100,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  ajouterTexte: { fontSize: 12, fontWeight: "600", color: couleurs.bleu },
  erreur: { color: couleurs.danger, fontSize: 13, marginTop: espacements.s2 },
});
