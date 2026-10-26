import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Bluetooth, Check } from "lucide-react-native";
import { couleurs, espacements, rayons } from "../tokens";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";
import {
  AppareilImprimante,
  ecrireAppareilImprimante,
  ecrireLargeurPapier,
  ecrireModeImpression,
  lireAppareilImprimante,
  lireLargeurPapier,
  lireModeImpression,
  ModeImpression,
} from "../impression/appareilImprimante";
import { activerBluetooth, appairerAppareil, AppareilTrouve, chercherAppareils, imprimerTicketDeTest, ouvrirReglagesBluetooth } from "../impression/imprimante";
import { enteteHotel, type LargeurPapier } from "@hotel-chicago/receipts";
import type { ProfilConnecte } from "@hotel-chicago/types";
import { messageErreur, messageImpressionEnvoyee } from "../messagesErreur";

export interface EcranImprimanteProps {
  /** Le ticket de test porte le nom de l'hôtel de l'utilisateur. */
  utilisateur: ProfilConnecte;
  onRetour: () => void;
}

/**
 * Réglage de l'imprimante Bluetooth. Tout se fait ici, sans passer par les réglages du téléphone : activation du Bluetooth, recherche des
 * imprimantes autour, appairage, ticket de test puis confirmation « le ticket est-il sorti ? ». Le mode « Application RawBT » sert de
 * secours aux imprimantes qui refusent la connexion directe.
 */
export function EcranImprimante({ utilisateur, onRetour }: EcranImprimanteProps) {
  const [appareils, setAppareils] = useState<AppareilTrouve[] | null>(null);
  const [recherche, setRecherche] = useState(false);
  const [choisi, setChoisi] = useState<AppareilImprimante | null>(null);
  const [mode, setMode] = useState<ModeImpression>("bluetooth");
  const [largeur, setLargeur] = useState<LargeurPapier>(58);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState<string | null>(null);
  const [messageTest, setMessageTest] = useState<{ adresse: string | null; texte: string; ok: boolean } | null>(null);
  const [aConfirmer, setAConfirmer] = useState<string | null>(null);
  const [enregistree, setEnregistree] = useState(false);

  const charger = useCallback(() => {
    setErreur(null);
    setRecherche(true);
    chercherAppareils((trouves) => setAppareils(trouves))
      .then((trouves) => {
        setAppareils(trouves);
        // Une seule imprimante appairée et aucune déjà retenue : on la présélectionne.
        setChoisi((actuel) => {
          if (actuel) return actuel;
          const appairees = trouves.filter((a) => a.appairee);
          return appairees.length === 1 ? { address: appairees[0]!.address, nom: appairees[0]!.nom } : null;
        });
      })
      .catch((e: unknown) => {
        setErreur(messageErreur(e, "La recherche Bluetooth a échoué. Vérifiez que le Bluetooth est activé."));
        setAppareils((a) => a ?? []);
      })
      .finally(() => setRecherche(false));
  }, []);

  useEffect(() => {
    void lireAppareilImprimante().then(setChoisi);
    void lireModeImpression().then(setMode);
    void lireLargeurPapier().then(setLargeur);
    charger();
  }, [charger]);

  async function changerMode(nouveau: ModeImpression) {
    setMode(nouveau);
    setMessageTest(null);
    setAConfirmer(null);
    await ecrireModeImpression(nouveau);
  }

  async function changerLargeur(nouvelle: LargeurPapier) {
    setLargeur(nouvelle);
    setMessageTest(null);
    await ecrireLargeurPapier(nouvelle);
  }

  async function choisir(appareil: AppareilTrouve) {
    setErreur(null);
    setMessageTest(null);
    setAConfirmer(null);
    setEnregistree(false);
    if (!appareil.appairee) {
      setOccupe(appareil.address);
      try {
        await appairerAppareil(appareil.address);
        setAppareils((liste) => liste?.map((a) => (a.address === appareil.address ? { ...a, appairee: true } : a)) ?? null);
      } catch (e) {
        setErreur(messageErreur(e, "L'appairage n'a pas abouti."));
        return;
      } finally {
        setOccupe(null);
      }
    }
    setChoisi({ address: appareil.address, nom: appareil.nom });
  }

  async function tester(adresse: string | null, nom: string) {
    setOccupe(adresse ?? "rawbt");
    setMessageTest(null);
    setAConfirmer(null);
    try {
      await imprimerTicketDeTest(adresse, enteteHotel(utilisateur));
      setMessageTest({ adresse, texte: messageImpressionEnvoyee("Ticket de test"), ok: true });
      setAConfirmer(adresse ?? "rawbt");
    } catch (e) {
      setMessageTest({ adresse, texte: `Impression impossible sur ${nom} : ${messageErreur(e, "l'imprimante n'a pas répondu.")}`, ok: false });
    } finally {
      setOccupe(null);
    }
  }

  async function confirmer(appareil: AppareilImprimante | null) {
    if (appareil) await ecrireAppareilImprimante(appareil);
    setChoisi(appareil);
    setAConfirmer(null);
    setEnregistree(true);
  }

  return (
    <View style={styles.page}>
      <EnteteMobile />
      <EnteteRetour titre="Imprimante" onRetour={onRetour} />

      <ScrollView contentContainerStyle={styles.contenu}>
        <View style={styles.modes}>
          {(["bluetooth", "rawbt"] as ModeImpression[]).map((m) => (
            <Pressable
              key={m}
              style={[styles.mode, mode === m && styles.modeChoisi]}
              onPress={() => void changerMode(m)}
              accessibilityRole="radio"
              accessibilityState={{ checked: mode === m }}
            >
              <Text style={[styles.modeTexte, mode === m && styles.modeTexteChoisi]}>{m === "bluetooth" ? "Bluetooth direct" : "Application RawBT"}</Text>
            </Pressable>
          ))}
        </View>

        {mode === "rawbt" ? (
          <View style={styles.etapes}>
            <Text style={styles.etapesTitre}>Mode de secours : application RawBT</Text>
            <Text style={styles.aide}>1. Installez « RawBT » depuis le Play Store (gratuit).</Text>
            <Text style={styles.aide}>2. Ouvrez RawBT, choisissez votre imprimante (Bluetooth, BLE ou USB) et imprimez-y la page de test de RawBT.</Text>
            <Text style={styles.aide}>3. Revenez ici et imprimez un ticket de test : HotelSaver confie alors chaque ticket à RawBT.</Text>
            <Pressable style={styles.boutonPrincipal} onPress={() => void tester(null, "RawBT")} disabled={occupe !== null} accessibilityRole="button">
              <Text style={styles.boutonPrincipalTexte}>{occupe === "rawbt" ? "Envoi…" : "Imprimer un ticket de test"}</Text>
            </Pressable>
            {aConfirmer === "rawbt" && (
              <View style={styles.confirmation}>
                <Text style={styles.confirmationTitre}>Le ticket est-il sorti de l'imprimante ?</Text>
                <View style={styles.rangee}>
                  <Pressable style={styles.boutonPrincipalCompact} onPress={() => void confirmer(choisi)} accessibilityRole="button">
                    <Text style={styles.boutonPrincipalTexte}>Oui</Text>
                  </Pressable>
                  <Pressable
                    style={styles.boutonSecondaireCompact}
                    onPress={() => {
                      setAConfirmer(null);
                      setMessageTest({ adresse: null, texte: "Rien n'est sorti : vérifiez dans RawBT que l'imprimante est bien connectée (page de test de RawBT), puis réessayez.", ok: false });
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={styles.boutonSecondaireTexte}>Non</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.etapes}>
            <Text style={styles.etapesTitre}>Pour connecter votre imprimante</Text>
            <Text style={styles.aide}>1. Allumez l'imprimante, posez-la près du téléphone et déconnectez-la de tout autre appareil.</Text>
            <Text style={styles.aide}>2. Touchez votre imprimante dans la liste ci-dessous : l'application l'appaire (code 0000 ou 1234 si le téléphone le demande).</Text>
            <Text style={styles.aide}>3. Imprimez un ticket de test et confirmez qu'il est sorti.</Text>
            <View style={styles.rangee}>
              <Pressable
                style={styles.boutonBluetooth}
                onPress={() => void activerBluetooth().then(charger)}
                accessibilityRole="button"
                accessibilityLabel="Activer le Bluetooth"
              >
                <Bluetooth size={16} color={couleurs.bleu} />
                <Text style={styles.boutonBluetoothTexte}>Activer le Bluetooth</Text>
              </Pressable>
              <Pressable style={styles.boutonBluetooth} onPress={() => void ouvrirReglagesBluetooth()} accessibilityRole="button" accessibilityLabel="Ouvrir les réglages Bluetooth du téléphone">
                <Text style={styles.boutonBluetoothTexte}>Réglages Bluetooth</Text>
              </Pressable>
            </View>
          </View>
        )}

        <View style={styles.etapes}>
          <Text style={styles.etapesTitre}>Largeur du papier</Text>
          <Text style={styles.aide}>Mesurez le rouleau : 58 mm (petites imprimantes) ou 80 mm (grandes). Si le ticket est coupé ou trop étroit, changez ce réglage.</Text>
          <View style={styles.rangee}>
            {([58, 80] as LargeurPapier[]).map((l) => (
              <Pressable
                key={l}
                style={[styles.mode, largeur === l && styles.modeChoisi]}
                onPress={() => void changerLargeur(l)}
                accessibilityRole="radio"
                accessibilityState={{ checked: largeur === l }}
              >
                <Text style={[styles.modeTexte, largeur === l && styles.modeTexteChoisi]}>{l} mm</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {erreur && (
          <Text style={styles.erreur} accessibilityRole="alert">
            {erreur}
          </Text>
        )}
        {messageTest && mode === "bluetooth" && (
          <Text style={messageTest.ok ? styles.succes : styles.erreur} accessibilityLiveRegion="polite">
            {messageTest.texte}
          </Text>
        )}
        {messageTest && mode === "rawbt" && !messageTest.ok && (
          <Text style={styles.erreur} accessibilityLiveRegion="polite">
            {messageTest.texte}
          </Text>
        )}
        {enregistree && (
          <Text style={styles.succes} accessibilityLiveRegion="polite">
            C'est enregistré : les tickets sortiront sur cette imprimante.
          </Text>
        )}

        {mode === "bluetooth" && (
          <>
            <View style={styles.titreListe}>
              <Text style={styles.etapesTitre}>Imprimantes trouvées</Text>
              {recherche && <ActivityIndicator color={couleurs.bleu} accessibilityLabel="Recherche en cours" />}
            </View>
            {appareils?.length === 0 && !recherche && !erreur && (
              <Text style={styles.vide}>Aucun appareil trouvé. Allumez l'imprimante (voyant Bluetooth qui clignote), rapprochez-la et touchez « Chercher à nouveau ». Toutes les marques fonctionnent : choisissez simplement l'appareil qui porte le nom de votre imprimante.</Text>
            )}
            {appareils?.map((item) => {
              const estChoisi = choisi?.address === item.address;
              const enCours = occupe === item.address;
              return (
                <View key={item.address} style={[styles.carte, estChoisi && styles.carteChoisie]}>
                  <Pressable
                    style={styles.carteContenu}
                    onPress={() => void choisir(item)}
                    disabled={occupe !== null}
                    accessibilityRole="radio"
                    accessibilityLabel={`Imprimante ${item.nom}, adresse ${item.address}`}
                    accessibilityState={{ checked: estChoisi }}
                  >
                    <Bluetooth size={18} color={estChoisi ? couleurs.bleu : couleurs.encreAttenuee} />
                    <View style={styles.carteTexte}>
                      <Text style={styles.nom}>{item.nom}{item.probable ? "  · imprimante de tickets" : ""}</Text>
                      <Text style={styles.adresse}>
                        {enCours ? "Appairage en cours…" : item.appairee ? `Appairée · ${item.address}` : `Touchez pour appairer · ${item.address}`}
                      </Text>
                    </View>
                    {estChoisi && <Check size={18} color={couleurs.bleu} />}
                  </Pressable>
                  {estChoisi && (
                    <View style={styles.carteActions}>
                      <Pressable
                        style={styles.boutonTest}
                        onPress={() => void tester(item.address, item.nom)}
                        disabled={occupe !== null}
                        accessibilityRole="button"
                        accessibilityLabel={`Imprimer un ticket de test sur ${item.nom}`}
                        accessibilityState={{ disabled: occupe !== null, busy: occupe === item.address }}
                      >
                        <Text style={styles.boutonTestTexte}>{occupe === item.address ? "Envoi en cours…" : "Imprimer un ticket de test"}</Text>
                      </Pressable>
                      {aConfirmer === item.address && (
                        <View style={styles.confirmation}>
                          <Text style={styles.confirmationTitre}>Le ticket est-il sorti de l'imprimante ?</Text>
                          <View style={styles.rangee}>
                            <Pressable style={styles.boutonPrincipalCompact} onPress={() => void confirmer({ address: item.address, nom: item.nom })} accessibilityRole="button">
                              <Text style={styles.boutonPrincipalTexte}>Oui, utiliser</Text>
                            </Pressable>
                            <Pressable
                              style={styles.boutonSecondaireCompact}
                              onPress={() => {
                                setAConfirmer(null);
                                setMessageTest({
                                  adresse: item.address,
                                  texte: "Rien n'est sorti. Vérifiez le papier et le capot, déconnectez l'imprimante de tout autre appareil, éteignez-la puis rallumez-la, et réessayez. Sinon, essayez le mode « Application RawBT ».",
                                  ok: false,
                                });
                              }}
                              accessibilityRole="button"
                            >
                              <Text style={styles.boutonSecondaireTexte}>Non</Text>
                            </Pressable>
                          </View>
                        </View>
                      )}
                      {aConfirmer !== item.address && choisi?.address === item.address && !enregistree && (
                        <Pressable style={styles.boutonTest} onPress={() => void confirmer({ address: item.address, nom: item.nom })} accessibilityRole="button">
                          <Text style={styles.boutonTestTexte}>Utiliser sans tester</Text>
                        </Pressable>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
            <Pressable style={styles.boutonSecondaire} onPress={charger} disabled={recherche} accessibilityRole="button">
              <Text style={styles.boutonSecondaireTexte}>{recherche ? "Recherche…" : "Chercher à nouveau"}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface100 },
  contenu: { padding: espacements.s4, gap: espacements.s3 },
  aide: { fontSize: 12, color: couleurs.encreAttenuee },
  etapes: { gap: espacements.s2, padding: espacements.s3, backgroundColor: couleurs.surface200, borderRadius: rayons.lg, borderWidth: 1, borderColor: couleurs.bordure },
  etapesTitre: { fontSize: 13, fontWeight: "700", color: couleurs.encre },
  boutonBluetooth: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: espacements.s2, minHeight: 44, marginTop: espacements.s1, borderRadius: rayons.sm, borderWidth: 1, borderColor: couleurs.bleu },
  boutonBluetoothTexte: { color: couleurs.bleu, fontWeight: "600", fontSize: 14 },
  erreur: { color: couleurs.danger, fontSize: 13 },
  succes: { color: couleurs.succes, fontSize: 13 },
  modes: { flexDirection: "row", gap: espacements.s2 },
  mode: { flex: 1, minHeight: 44, borderRadius: rayons.sm, borderWidth: 1, borderColor: couleurs.bordure, alignItems: "center", justifyContent: "center", backgroundColor: couleurs.surface200 },
  modeChoisi: { borderColor: couleurs.bleu, backgroundColor: couleurs.bleu },
  modeTexte: { fontSize: 13, fontWeight: "600", color: couleurs.encre },
  modeTexteChoisi: { color: "#fff" },
  rangee: { flexDirection: "row", gap: espacements.s2 },
  titreListe: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  carteActions: { borderTopWidth: 1, borderTopColor: couleurs.bordure },
  confirmation: { gap: espacements.s2, padding: espacements.s3, borderTopWidth: 1, borderTopColor: couleurs.bordure },
  confirmationTitre: { fontSize: 13, fontWeight: "700", color: couleurs.encre },
  boutonPrincipal: { minHeight: 44, borderRadius: rayons.sm, backgroundColor: couleurs.bleu, alignItems: "center", justifyContent: "center" },
  boutonPrincipalCompact: { flex: 1, minHeight: 44, borderRadius: rayons.sm, backgroundColor: couleurs.bleu, alignItems: "center", justifyContent: "center" },
  boutonPrincipalTexte: { color: "#fff", fontWeight: "600", fontSize: 14 },
  boutonSecondaireCompact: { flex: 1, minHeight: 44, borderRadius: rayons.sm, borderWidth: 1, borderColor: couleurs.bordure, alignItems: "center", justifyContent: "center" },
  vide: { fontSize: 13, color: couleurs.encreAttenuee, fontStyle: "italic", textAlign: "center", marginTop: espacements.s5 },
  carte: {
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    overflow: "hidden",
  },
  carteChoisie: { borderColor: couleurs.bleu },
  carteContenu: { flexDirection: "row", alignItems: "center", gap: espacements.s3, padding: espacements.s4 },
  carteTexte: { flex: 1 },
  nom: { fontSize: 15, fontWeight: "700", color: couleurs.encre },
  adresse: { fontSize: 12, color: couleurs.encreAttenuee },
  boutonTest: { padding: espacements.s3, minHeight: 44, alignItems: "center", justifyContent: "center" },
  boutonTestTexte: { fontSize: 13, fontWeight: "600", color: couleurs.bleu },
  boutonSecondaire: {
    minHeight: 44,
    borderRadius: rayons.sm,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    alignItems: "center",
    justifyContent: "center",
  },
  boutonSecondaireTexte: { color: couleurs.encre, fontWeight: "600", fontSize: 14 },
});
