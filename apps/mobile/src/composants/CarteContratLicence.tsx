import * as React from "react";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { FileSignature } from "lucide-react-native";
import type { ClientApi } from "@hotel-chicago/api-client";
import { dateAbonnement } from "@hotel-chicago/regles";
import type { ContratLicenceVue } from "@hotel-chicago/types";
import { couleurs, espacements, rayons, fonds } from "../tokens";

/**
 * Contrat de la licence (11/11/2026) : le patron lit le texte exact puis appuie sur « J'accepte ». Le serveur garde la date, le compte, l'adresse
 * internet et l'appareil, avec l'empreinte du texte lu.
 */
export function CarteContratLicence({ client }: { client: Pick<ClientApi, "contratLicence" | "accepterContratLicence"> }) {
  const [contrat, setContrat] = useState<ContratLicenceVue | null | undefined>(undefined);
  const [ouvert, setOuvert] = useState(false);
  const [lu, setLu] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let actif = true;
    client
      .contratLicence()
      .then((c) => actif && setContrat(c))
      .catch(() => actif && setContrat(null));
    return () => {
      actif = false;
    };
  }, [client]);

  if (!contrat) return null;
  const accepte = contrat.accepteLe !== null;

  async function accepter() {
    if (!contrat) return;
    setEnCours(true);
    setErreur(null);
    try {
      setContrat(await client.accepterContratLicence(contrat.licenceId, contrat.empreinte));
      setOuvert(false);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L'acceptation n'a pas pu être enregistrée. Réessayez.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <View style={[styles.carte, { borderLeftColor: accepte ? fonds.succes : fonds.alerte }]}>
      <View style={styles.haut}>
        <FileSignature size={20} color={accepte ? couleurs.succes : couleurs.alerte} />
        <View style={styles.textes}>
          <Text style={styles.titre} accessibilityRole="header">
            Contrat de licence n° {contrat.numero}
          </Text>
          <Text style={styles.detail}>
            {accepte
              ? `Vous avez accepté ce contrat le ${dateAbonnement(contrat.accepteLe!)}${contrat.accepteParNom ? ` (${contrat.accepteParNom})` : ""}.`
              : "Lisez votre contrat de licence et de maintenance, puis acceptez-le. C'est votre preuve d'achat."}
          </Text>
        </View>
      </View>
      <Pressable style={[styles.bouton, accepte && styles.boutonSecondaire]} onPress={() => setOuvert((o) => !o)} accessibilityRole="button" accessibilityState={{ expanded: ouvert }}>
        <Text style={[styles.boutonTexte, accepte && styles.boutonTexteSecondaire]}>{ouvert ? "Fermer" : accepte ? "Relire le contrat" : "Lire et accepter"}</Text>
      </Pressable>
      {ouvert && (
        <View style={styles.corps}>
          <ScrollView style={styles.texte} nestedScrollEnabled accessibilityLabel="Texte du contrat">
            <Text style={styles.texteContrat} selectable>
              {contrat.texte}
            </Text>
          </ScrollView>
          {!accepte && (
            <>
              <Pressable style={styles.ligneCase} onPress={() => setLu((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: lu }}>
                <View style={[styles.case, lu && styles.caseCochee]}>{lu && <Text style={styles.coche}>✓</Text>}</View>
                <Text style={styles.libelleCase}>J'ai lu le contrat et je l'accepte au nom de l'hôtel.</Text>
              </Pressable>
              {erreur && (
                <Text style={styles.erreur} accessibilityRole="alert">
                  {erreur}
                </Text>
              )}
              <Pressable
                style={[styles.bouton, (!lu || enCours) && styles.boutonInactif]}
                onPress={() => void accepter()}
                disabled={!lu || enCours}
                accessibilityRole="button"
                accessibilityState={{ disabled: !lu || enCours, busy: enCours }}
              >
                {enCours ? <ActivityIndicator color="#fff" /> : <Text style={styles.boutonTexte}>J'accepte</Text>}
              </Pressable>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  carte: { backgroundColor: couleurs.surface200, borderRadius: rayons.lg, borderWidth: 1, borderColor: couleurs.bordure, borderLeftWidth: 4, padding: espacements.s4, gap: espacements.s2, marginTop: espacements.s4 },
  haut: { flexDirection: "row", gap: espacements.s2, alignItems: "flex-start" },
  textes: { flex: 1, gap: 2 },
  titre: { fontSize: 15, fontWeight: "700", color: couleurs.encre },
  detail: { fontSize: 13, color: couleurs.encreAttenuee },
  corps: { gap: espacements.s2 },
  texte: { maxHeight: 320, borderWidth: 1, borderColor: couleurs.bordure, borderRadius: rayons.md, padding: espacements.s2 },
  texteContrat: { fontSize: 13, lineHeight: 19, color: couleurs.encre },
  ligneCase: { flexDirection: "row", gap: espacements.s2, alignItems: "center" },
  case: { width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: couleurs.encreAttenuee, alignItems: "center", justifyContent: "center" },
  caseCochee: { backgroundColor: couleurs.bleu, borderColor: couleurs.bleu },
  coche: { color: "#fff", fontWeight: "700" },
  libelleCase: { flex: 1, fontSize: 13, color: couleurs.encre },
  erreur: { color: couleurs.danger, fontSize: 13 },
  bouton: { minHeight: 44, borderRadius: rayons.md, backgroundColor: couleurs.bleu, alignItems: "center", justifyContent: "center", paddingHorizontal: espacements.s4 },
  boutonSecondaire: { backgroundColor: "transparent", borderWidth: 1, borderColor: couleurs.bleu },
  boutonInactif: { opacity: 0.5 },
  boutonTexte: { color: "#fff", fontWeight: "700", fontSize: 15 },
  boutonTexteSecondaire: { color: couleurs.bleu },
});
