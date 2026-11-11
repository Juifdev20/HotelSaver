import * as React from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CircleCheck, Download, RefreshCw, RotateCw } from "lucide-react-native";
import { tailleLisible } from "@hotel-chicago/regles";
import { couleurs, espacements, fonds, rayons } from "../tokens";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";
import { useMiseAJour } from "../miseAJour/ContexteMiseAJour";

/**
 * Plus › Mise à jour. Le bouton est grisé tant qu'aucune nouvelle version n'existe, actif dès qu'il y en a une : télécharger (en arrière-plan, avec la
 * progression), puis installer maintenant ou plus tard. Android demande lui-même un dernier « Installer » — la première fois, il demande aussi
 * d'autoriser l'installation depuis HotelSaver.
 */
export function EcranMiseAJour({ onRetour }: { onRetour: () => void }) {
  const { possible, etat, maj, progres, erreur, versionInstallee, derniereVerification, verifier, telecharger, installer } = useMiseAJour();

  const aJour = etat === "a-jour";
  const disponible = etat === "disponible" || etat === "erreur";
  const enCours = etat === "telechargement";
  const prete = etat === "prete";

  const titre = !possible
    ? "Mises à jour par l'application"
    : prete
      ? `La version ${maj?.version} est prête`
      : enCours
        ? `Téléchargement de la version ${maj?.version}`
        : maj
          ? `Nouvelle version ${maj.version} disponible`
          : aJour
            ? "Votre application est à jour"
            : etat === "verification"
              ? "Recherche en cours…"
              : "Version non vérifiée";

  return (
    <View style={styles.page}>
      <EnteteMobile />
      <EnteteRetour titre="Mise à jour" onRetour={onRetour} />
      <ScrollView contentContainerStyle={styles.contenu}>
        <View style={styles.carte}>
          <View style={styles.entete}>
            <View style={[styles.pastille, { backgroundColor: maj ? couleurs.alerteClair : couleurs.succesClair }]}>
              {maj ? <Download size={20} color={couleurs.alerte} /> : <CircleCheck size={20} color={couleurs.succes} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.titre} accessibilityRole="header">
                {titre}
              </Text>
              <Text style={styles.aide}>Version installée : {versionInstallee}</Text>
            </View>
          </View>

          {!possible && <Text style={styles.texte}>Sur ce type d'appareil, les mises à jour se font depuis le site HotelSaver.</Text>}

          {maj && !prete && !enCours && (
            <Text style={styles.texte}>
              {maj.taille > 0 ? `Téléchargement : ${tailleLisible(maj.taille)}. ` : ""}Il se fait pendant que vous travaillez ; vous pouvez continuer à utiliser l'application.
            </Text>
          )}
          {maj && maj.notes !== "" && (
            <View style={styles.notes}>
              <Text style={styles.notesTitre}>Ce qui change</Text>
              <Text style={styles.texte}>{maj.notes}</Text>
            </View>
          )}

          {enCours && (
            <View accessible accessibilityRole="progressbar" accessibilityLabel={`Téléchargement ${progres} pour cent`} accessibilityValue={{ min: 0, max: 100, now: progres }}>
              <View style={styles.piste}>
                <View style={[styles.barre, { width: `${progres}%` }]} />
              </View>
              <Text style={styles.pourcent}>{progres} %</Text>
              <Text style={styles.aide}>Vous pouvez travailler pendant ce temps. Si la connexion coupe, le téléchargement reprendra là où il s'est arrêté.</Text>
            </View>
          )}

          {prete && (
            <Text style={styles.texte}>
              Le téléchargement est terminé. Touchez « Installer » : Android demandera une dernière confirmation, puis l'application se rouvrira à jour. Vous pouvez aussi le faire plus tard, quand vous aurez fini ce que vous faites.
            </Text>
          )}

          {erreur && (
            <Text style={styles.erreur} accessibilityRole="alert">
              {erreur}
            </Text>
          )}

          {possible && (
            <Pressable
              style={[styles.bouton, !(disponible || prete) && styles.boutonGrise]}
              disabled={!(disponible || prete)}
              onPress={() => void (prete ? installer() : telecharger())}
              accessibilityRole="button"
              accessibilityState={{ disabled: !(disponible || prete), busy: enCours }}
              accessibilityLabel={prete ? "Installer la mise à jour" : disponible ? "Télécharger la mise à jour" : enCours ? "Téléchargement en cours" : "Aucune mise à jour disponible"}
            >
              {enCours ? <ActivityIndicator color="#fff" /> : prete ? <RotateCw size={18} color="#fff" /> : <Download size={18} color={disponible ? "#fff" : couleurs.encreAttenuee} />}
              <Text style={[styles.boutonTexte, !(disponible || prete) && { color: couleurs.encreAttenuee }]}>
                {prete ? "Installer et redémarrer" : enCours ? `Téléchargement… ${progres} %` : disponible ? "Télécharger la mise à jour" : "Mettre à jour"}
              </Text>
            </Pressable>
          )}

          {possible && !enCours && !prete && (
            <Pressable style={styles.lien} onPress={() => void verifier(true)} disabled={etat === "verification"} accessibilityRole="button" accessibilityLabel="Chercher une mise à jour">
              <RefreshCw size={16} color={couleurs.bleu} />
              <Text style={styles.lienTexte}>{etat === "verification" ? "Recherche…" : "Chercher une mise à jour"}</Text>
            </Pressable>
          )}
          {derniereVerification && (
            <Text style={styles.aide}>Dernière recherche à {derniereVerification.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}.</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface100 },
  contenu: { padding: espacements.s4, gap: espacements.s3 },
  carte: { backgroundColor: couleurs.surface200, borderRadius: rayons.lg, borderWidth: 1, borderColor: couleurs.bordure, padding: espacements.s4, gap: espacements.s3 },
  entete: { flexDirection: "row", alignItems: "center", gap: espacements.s3 },
  pastille: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  titre: { fontSize: 16, fontWeight: "700", color: couleurs.encre },
  aide: { fontSize: 12, color: couleurs.encreAttenuee },
  texte: { fontSize: 14, color: couleurs.encre, lineHeight: 20 },
  notes: { gap: 2, borderTopWidth: 1, borderTopColor: couleurs.bordure, paddingTop: espacements.s3 },
  notesTitre: { fontSize: 12, fontWeight: "700", color: couleurs.encreAttenuee },
  piste: { height: 10, borderRadius: 5, backgroundColor: couleurs.bordure, overflow: "hidden" },
  barre: { height: 10, borderRadius: 5, backgroundColor: fonds.bleu },
  pourcent: { fontSize: 22, fontWeight: "800", color: couleurs.encre, marginTop: espacements.s2 },
  erreur: { color: couleurs.danger, fontSize: 13, fontWeight: "600" },
  bouton: { minHeight: 52, borderRadius: rayons.md, backgroundColor: fonds.bleu, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  boutonGrise: { backgroundColor: couleurs.bordure },
  boutonTexte: { color: "#fff", fontWeight: "800", fontSize: 15 },
  lien: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  lienTexte: { color: couleurs.bleu, fontWeight: "700", fontSize: 14 },
});
