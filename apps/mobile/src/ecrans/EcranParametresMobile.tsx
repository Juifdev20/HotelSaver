import * as React from "react";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import type { ClientApi } from "@hotel-chicago/api-client";
import { Role, type UtilisateurAuthentifie } from "@hotel-chicago/types";
import { LogOut, UserRound } from "lucide-react-native";
import { couleurs, espacements, rayons } from "../tokens";
import { LIBELLE_ROLE } from "../navigation";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";
import { ConteneurFormulaire } from "../composants/ConteneurFormulaire";

export interface EcranParametresMobileProps {
  client: ClientApi;
  onRetour: () => void;
  /** Présents une fois connecté : alimentent la carte « Compte » en bas —
   * déconnexion/changement de profil aussi ici, pas seulement dans Plus. */
  utilisateur?: UtilisateurAuthentifie;
  onChangerProfil?: () => void;
  onSeDeconnecter?: () => void;
  /** Après modification d'un réglage de l'hôtel : relit le profil pour mettre les écrans à jour. */
  onProfilModifie?: () => void;
}

/**
 * Paramètres du poste : la carte Compte (déconnexion / changement de profil).
 * L'adresse de l'API n'est plus réglable ici — elle est fixée à la compilation
 * (voir DECISIONS.md, 01/10/2026) : un utilisateur n'a pas à manipuler une URL
 * technique. Pas de test de connexion (retour du patron 28/09), pas de bascule de
 * thème (pas de mode sombre mobile), pas de bloc Administration (Utilisateurs et
 * Taux de change vivent dans « Plus »).
 */
export function EcranParametresMobile({ client, onRetour, utilisateur, onChangerProfil, onSeDeconnecter, onProfilModifie }: EcranParametresMobileProps) {
  const [enregistrement, setEnregistrement] = useState(false);
  const patronOpere = utilisateur?.patronPeutOperer === true;
  const cuisineActivee = utilisateur?.cuisineActivee === true;
  const commandeWebActivee = utilisateur?.commandeWebActivee === true;

  async function basculerPatronOpere(valeur: boolean) {
    setEnregistrement(true);
    try {
      await client.modifierReglagesHotel({ patronPeutOperer: valeur });
      onProfilModifie?.();
    } catch (e) {
      Alert.alert("Réglage non enregistré", e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnregistrement(false);
    }
  }

  async function basculerCuisine(valeur: boolean) {
    setEnregistrement(true);
    try {
      await client.modifierReglagesHotel({ cuisineActivee: valeur });
      onProfilModifie?.();
    } catch (e) {
      Alert.alert("Réglage non enregistré", e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnregistrement(false);
    }
  }

  async function basculerCommandeWeb(valeur: boolean) {
    setEnregistrement(true);
    try {
      await client.modifierReglagesHotel({ commandeWebActivee: valeur });
      onProfilModifie?.();
    } catch (e) {
      Alert.alert("Réglage non enregistré", e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnregistrement(false);
    }
  }

  /** Confirmation avant de fermer la session — un tap par inadvertance ne
   * doit pas faire perdre la session en cours (retour du patron 28/09). */
  function confirmerDeconnexion() {
    if (!onSeDeconnecter) return;
    Alert.alert("Se déconnecter", "Voulez-vous vraiment vous déconnecter ?", [
      { text: "Annuler", style: "cancel" },
      { text: "Se déconnecter", style: "destructive", onPress: onSeDeconnecter },
    ]);
  }

  return (
    <View style={styles.page}>
      <EnteteMobile />
      <EnteteRetour titre="Paramètres" onRetour={onRetour} />

      <ConteneurFormulaire>
          {/* Carte « Compte » : la déconnexion vit aussi ici (et en bas de
              l'écran Plus) — un employé cherchant « sortir » dans les
              réglages la trouve sans fouiller. « Changer de profil » reste
              réservé au PATRON, comme dans EcranPlus/App.tsx. */}
          {utilisateur?.role === Role.PATRON && (
            <View style={styles.carte}>
              <View style={styles.compteLigne}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.compteNom}>Le patron peut aussi opérer</Text>
                  <Text style={styles.compteRole}>
                    Réserver, check-in/out, facturer et caisse sont réservés au personnel pour éviter toute confusion. Activez seulement si vous
                    travaillez seul. Administration, rapports et annulations restent au patron.
                  </Text>
                </View>
                <Switch value={patronOpere} onValueChange={(v) => void basculerPatronOpere(v)} disabled={enregistrement} />
              </View>
              <View style={styles.compteLigne}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.compteNom}>Suivi des commandes en cuisine</Text>
                  <Text style={styles.compteRole}>
                    Activez si des plats sont préparés par une équipe séparée : les commandes partent sur l'écran Cuisine jusqu'à
                    leur service. Laissez éteint pour une vente au comptoir (articles servis immédiatement).
                  </Text>
                </View>
                <Switch value={cuisineActivee} onValueChange={(v) => void basculerCuisine(v)} disabled={enregistrement} />
              </View>
              <View style={styles.compteLigne}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.compteNom}>Commande en ligne sur le site</Text>
                  <Text style={styles.compteRole}>
                    Un onglet « Cuisine » apparaît sur le site web de l'hôtel : les clients y commandent les produits
                    marqués « Visible et commandable sur le site » (écran Menu). La cafétéria est notifiée et le client
                    paie au comptoir.
                  </Text>
                </View>
                <Switch value={commandeWebActivee} onValueChange={(v) => void basculerCommandeWeb(v)} disabled={enregistrement} />
              </View>
            </View>
          )}

          {utilisateur && (
            <View style={[styles.carte, styles.carteCompte]}>
              <View style={styles.compteLigne}>
                <View style={styles.compteAvatar}>
                  <UserRound size={18} color={couleurs.bleu} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.compteNom}>{utilisateur.nom}</Text>
                  <Text style={styles.compteRole}>{LIBELLE_ROLE[utilisateur.role]}</Text>
                </View>
              </View>
              {utilisateur.role === Role.PATRON ? (
                onChangerProfil && (
                  <Pressable style={styles.boutonSecondaire} onPress={onChangerProfil}>
                    <Text style={styles.boutonSecondaireTexte}>Changer de profil</Text>
                  </Pressable>
                )
              ) : (
                onSeDeconnecter && (
                  <Pressable style={styles.boutonDanger} onPress={confirmerDeconnexion}>
                    <LogOut size={16} color="#fff" />
                    <Text style={styles.boutonDangerTexte}>Se déconnecter</Text>
                  </Pressable>
                )
              )}
            </View>
          )}
      </ConteneurFormulaire>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface100 },
  chargement: { marginTop: espacements.s6 },
  carte: {
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espacements.s4,
  },
  label: { fontSize: 12, fontWeight: "600", color: couleurs.encreAttenuee, marginBottom: espacements.s1 },
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
  aide: { fontSize: 12, color: couleurs.encreAttenuee, marginTop: espacements.s2 },
  confirmation: { fontSize: 13, color: couleurs.succes, marginTop: espacements.s3 },
  boutons: { flexDirection: "row", gap: espacements.s3, marginTop: espacements.s4 },
  boutonSecondaire: {
    flex: 1,
    height: 44,
    borderRadius: rayons.sm,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    alignItems: "center",
    justifyContent: "center",
  },
  boutonSecondaireTexte: { color: couleurs.encre, fontWeight: "600", fontSize: 14 },
  bouton: { flex: 1, height: 44, borderRadius: rayons.sm, backgroundColor: couleurs.bleu, alignItems: "center", justifyContent: "center" },
  boutonTexte: { color: "#fff", fontWeight: "700", fontSize: 14 },
  carteCompte: { marginTop: espacements.s3, gap: espacements.s3 },
  compteLigne: { flexDirection: "row", alignItems: "center", gap: espacements.s3 },
  compteAvatar: {
    width: 36,
    height: 36,
    borderRadius: rayons.pill,
    backgroundColor: couleurs.bleuClair,
    alignItems: "center",
    justifyContent: "center",
  },
  compteNom: { fontSize: 15, fontWeight: "700", color: couleurs.encre },
  compteRole: { fontSize: 12, color: couleurs.encreAttenuee },
  boutonDanger: {
    flexDirection: "row",
    height: 44,
    borderRadius: rayons.sm,
    backgroundColor: couleurs.danger,
    alignItems: "center",
    justifyContent: "center",
    gap: espacements.s2,
  },
  boutonDangerTexte: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
