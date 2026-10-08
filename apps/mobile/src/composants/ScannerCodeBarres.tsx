import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { X } from "lucide-react-native";
import { couleurs, espacements, rayons } from "../tokens";

export interface ScannerCodeBarresProps {
  visible: boolean;
  /** « continu » (vente) : la vue reste ouverte, chaque code lu appelle
   * `onCode` ; « unique » (fiche produit) : se ferme au premier code. */
  mode: "continu" | "unique";
  /** Renvoie le message à afficher sur la vue (« Fanta ajouté », « Code
   * inconnu ») — continu seulement. */
  onCode: (code: string) => string | void | Promise<string | void>;
  onFermer: () => void;
  titre?: string;
}

/** Types lus : codes produits du commerce (EAN/UPC), Code128 (étiquettes
 * internes non EAN) et ITF-14 (cartons). Pas de QR : inutile à la caisse. */
const TYPES = ["ean13", "ean8", "upc_a", "upc_e", "code128", "itf14"] as const;

/** Un article tenu devant l'objectif est lu des dizaines de fois par seconde :
 * il n'est compté qu'UNE fois. Chaque nouvelle lecture du même code repousse
 * l'échéance, donc il ne redevient lisible qu'après avoir quitté l'image
 * pendant ce délai (bug constaté le 08/10/2026 : ajout en boucle). Pour en
 * vendre deux, on retire l'article puis on le représente (ou bouton +). */
const ABSENCE_AVANT_RELECTURE_MS = 2000;
/** Pause après chaque article accepté : évite qu'un code voisin dans l'image
 * soit pris dans la foulée. */
const PAUSE_APRES_AJOUT_MS = 700;

/**
 * Vue caméra plein écran (expo-camera, ML Kit sur Android) pour lire un
 * code-barres d'article — scan à la caisse cafétaria (08/10/2026).
 */
export function ScannerCodeBarres({ visible, mode, onCode, onFermer, titre }: ScannerCodeBarresProps) {
  const [permission, demanderPermission] = useCameraPermissions();
  const [message, setMessage] = useState<string | null>(null);
  const [compteur, setCompteur] = useState(0);
  const dernier = useRef<{ code: string; le: number } | null>(null);
  const enTraitement = useRef(false);
  const dernierAjout = useRef(0);
  const termine = useRef(false);

  useEffect(() => {
    if (visible) {
      setMessage(null);
      setCompteur(0);
      dernier.current = null;
      dernierAjout.current = 0;
      termine.current = false;
      if (permission && !permission.granted && permission.canAskAgain) void demanderPermission();
    }
  }, [visible, permission, demanderPermission]);

  async function surCode(resultat: BarcodeScanningResult) {
    const code = resultat.data?.trim();
    if (!code || enTraitement.current || termine.current) return;
    const maintenant = Date.now();
    if (dernier.current && dernier.current.code === code && maintenant - dernier.current.le < ABSENCE_AVANT_RELECTURE_MS) {
      dernier.current.le = maintenant; // toujours visible : on repousse
      return;
    }
    if (maintenant - dernierAjout.current < PAUSE_APRES_AJOUT_MS) return;
    dernier.current = { code, le: maintenant };
    dernierAjout.current = maintenant;
    if (mode === "unique") termine.current = true;
    enTraitement.current = true;
    try {
      const retour = await onCode(code);
      if (mode === "unique") {
        onFermer();
        return;
      }
      setCompteur((n) => n + 1);
      if (typeof retour === "string") setMessage(retour);
    } finally {
      enTraitement.current = false;
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onFermer}>
      <View style={styles.page}>
        {permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: [...TYPES] }}
            onBarcodeScanned={visible ? surCode : undefined}
          />
        ) : (
          <View style={styles.permission}>
            <Text style={styles.permissionTexte}>
              {permission && !permission.canAskAgain
                ? "L'accès à la caméra est refusé. Autorisez-le dans les réglages du téléphone (Applications > HotelSaver > Autorisations)."
                : "HotelSaver a besoin de la caméra pour scanner les codes-barres."}
            </Text>
            <Pressable
              style={styles.bouton}
              onPress={() => (permission && !permission.canAskAgain ? Linking.openSettings() : demanderPermission())}
            >
              <Text style={styles.boutonTexte}>{permission && !permission.canAskAgain ? "Ouvrir les réglages" : "Autoriser la caméra"}</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.haut}>
          <Text style={styles.titre}>{titre ?? (mode === "continu" ? "Scanner les articles" : "Scanner le code-barres")}</Text>
          <Pressable onPress={onFermer} hitSlop={12} accessibilityLabel="Fermer le scanner">
            <X size={26} color="#fff" />
          </Pressable>
        </View>

        {permission?.granted && <View style={styles.cadre} pointerEvents="none" />}

        <View style={styles.bas}>
          {mode === "continu" && (
            <Text style={styles.compteur}>
              {compteur} article{compteur > 1 ? "s" : ""} scanné{compteur > 1 ? "s" : ""}
            </Text>
          )}
          {message && <Text style={styles.message}>{message}</Text>}
          {!message && <Text style={styles.aide}>Placez le code-barres dans le cadre.</Text>}
          {mode === "continu" && (
            <Pressable style={styles.bouton} onPress={onFermer}>
              <Text style={styles.boutonTexte}>Terminer</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#000" },
  haut: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: espacements.s4,
    paddingTop: espacements.s6,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  titre: { color: "#fff", fontSize: 17, fontWeight: "700" },
  cadre: {
    position: "absolute",
    top: "32%",
    left: "10%",
    right: "10%",
    height: 160,
    borderWidth: 3,
    borderColor: "#fff",
    borderRadius: rayons.lg,
  },
  bas: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: espacements.s5,
    gap: espacements.s2,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
  },
  compteur: { color: "#fff", fontSize: 15, fontWeight: "700" },
  message: { color: "#fff", fontSize: 16, textAlign: "center" },
  aide: { color: "rgba(255,255,255,0.8)", fontSize: 14 },
  bouton: {
    minHeight: 48,
    paddingHorizontal: espacements.s6,
    borderRadius: rayons.sm,
    backgroundColor: couleurs.bleu,
    alignItems: "center",
    justifyContent: "center",
    marginTop: espacements.s2,
  },
  boutonTexte: { color: "#fff", fontWeight: "700", fontSize: 15 },
  permission: { flex: 1, alignItems: "center", justifyContent: "center", padding: espacements.s6, gap: espacements.s4 },
  permissionTexte: { color: "#fff", fontSize: 16, textAlign: "center" },
});
