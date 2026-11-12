import * as React from "react";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import type { ClientApi } from "@hotel-chicago/api-client";
import { Role, type UtilisateurAuthentifie } from "@hotel-chicago/types";
import { BellRing, BookOpen, CreditCard, Download, HandCoins, Info, LogOut, Printer, RefreshCw, Trash2, UserRound, Volume2, ChevronRight } from "lucide-react-native";
import { useSyncEtat } from "../hooks/useSyncEtat";
import { useMiseAJour } from "../miseAJour/ContexteMiseAJour";
import { actualiserEtatAbonnement, resumerAbonnement } from "@hotel-chicago/regles";
import { couleurs, espacements, rayons } from "../tokens";
import { LIBELLE_ROLE } from "../navigation";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";
import { ConteneurFormulaire } from "../composants/ConteneurFormulaire";
import { messageErreur } from "../messagesErreur";
import { BlocSecuriteMobile } from "../composants/BlocSecuriteMobile";
import { useSession } from "../contexteSession";
import { URL_SUPPRESSION_COMPTE, ouvrirLienSur } from "../liens";
import { CarteApparence } from "../composants/CarteApparence";
import { FeuilleChangerDeCompte } from "../composants/FeuilleChangerDeCompte";

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
  /** Ouvre l'écran « Abonnement » (visible par tous les rôles ; seul le patron y paie). */
  onOuvrirAbonnement?: () => void;
  /** Ouvre « Paiement en ligne des acomptes » (PATRON) : compte ScanLinkPay de l'hôtel et pourcentage d'acompte. */
  onOuvrirPaiementEnLigne?: () => void;
  /** Rangées « Cet appareil » et « Aide » (12/11/2026) : tout ce qui se règle au même endroit. */
  onOuvrirImprimante?: () => void;
  onOuvrirSons?: () => void;
  onOuvrirDiagnostic?: () => void;
  onOuvrirSynchronisation?: () => void;
  onOuvrirMiseAJour?: () => void;
  onOuvrirGuide?: () => void;
}

/** Une rangée de « Réglages » : icône, nom, valeur à droite (état), pastille éventuelle et chevron quand elle ouvre un écran. */
function LigneReglage({ icone: Icone, libelle, valeur, pastille, onPress, dernier }: { icone: React.ComponentType<{ size?: number; color?: string }>; libelle: string; valeur?: string; pastille?: string; onPress?: () => void; dernier?: boolean }) {
  return (
    <Pressable
      style={[styles.ligneReglage, !dernier && styles.ligneReglageBordure]}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${libelle}${valeur ? `, ${valeur}` : ""}${pastille ? `, ${pastille}` : ""}`}
    >
      <View style={styles.ligneReglageIcone}>
        <Icone size={18} color={couleurs.bleu} />
      </View>
      <Text style={styles.ligneReglageTexte}>{libelle}</Text>
      {pastille && (
        <View style={styles.ligneReglagePastille}>
          <Text style={styles.ligneReglagePastilleTexte}>{pastille}</Text>
        </View>
      )}
      {valeur && <Text style={styles.ligneReglageValeur}>{valeur}</Text>}
      {onPress && <ChevronRight size={16} color={couleurs.encreFaible} />}
    </Pressable>
  );
}

/**
 * Paramètres du poste : la carte Compte (déconnexion / changement de profil).
 * L'adresse de l'API n'est plus réglable ici — elle est fixée à la compilation
 * (voir DECISIONS.md, 01/10/2026) : un utilisateur n'a pas à manipuler une URL
 * technique. Pas de test de connexion (retour du patron 28/09), pas de bascule de
 * thème (pas de mode sombre mobile), pas de bloc Administration (Utilisateurs et
 * Taux de change vivent dans « Plus »).
 */
export function EcranParametresMobile({ client, onRetour, utilisateur, onChangerProfil, onSeDeconnecter, onProfilModifie, onOuvrirAbonnement, onOuvrirPaiementEnLigne, onOuvrirImprimante, onOuvrirSons, onOuvrirDiagnostic, onOuvrirSynchronisation, onOuvrirMiseAJour, onOuvrirGuide }: EcranParametresMobileProps) {
  const etatSync = useSyncEtat();
  const miseAJour = useMiseAJour();
  const nouvelleVersion = miseAJour.etat === "disponible" || miseAJour.etat === "telechargement" || miseAJour.etat === "prete";
  const [enregistrement, setEnregistrement] = useState(false);
  const [changementOuvert, setChangementOuvert] = useState(false);
  const { miroir, effacerDonneesAppareil, utilisateur: profil } = useSession();
  const resumeAbonnement = profil.abonnement ? resumerAbonnement(actualiserEtatAbonnement(profil.abonnement)) : null;
  const patronOpere = utilisateur?.patronPeutOperer === true;
  const cuisineActivee = utilisateur?.cuisineActivee === true;
  const commandeWebActivee = utilisateur?.commandeWebActivee === true;

  async function basculerPatronOpere(valeur: boolean) {
    setEnregistrement(true);
    try {
      await client.modifierReglagesHotel({ patronPeutOperer: valeur });
      onProfilModifie?.();
    } catch (e) {
      Alert.alert("Réglage non enregistré", messageErreur(e, "Le réglage n'a pas pu être enregistré. Vérifiez la connexion puis réessayez."));
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
      Alert.alert("Réglage non enregistré", messageErreur(e, "Le réglage n'a pas pu être enregistré. Vérifiez la connexion puis réessayez."));
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
      Alert.alert("Réglage non enregistré", messageErreur(e, "Le réglage n'a pas pu être enregistré. Vérifiez la connexion puis réessayez."));
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

  /** La suppression se fait sur le site (raison du départ, nom de l'hôtel retapé), comme Google Play le demande. */
  function supprimerCompte() {
    if (!URL_SUPPRESSION_COMPTE) {
      Alert.alert("Supprimer mon compte", "Rendez-vous sur le site HotelSaver, page « Supprimer mon compte », ou contactez le support HotelSaver.");
      return;
    }
    Alert.alert(
      "Supprimer mon compte",
      "Votre compte, votre hôtel et tout son contenu (équipe, clients, réservations, factures, site) seront supprimés définitivement. La suppression se fait sur le site HotelSaver : il s'ouvre dans votre navigateur.",
      [
        { text: "Annuler", style: "cancel" },
        { text: "Ouvrir le site", style: "destructive", onPress: () => ouvrirLienSur(URL_SUPPRESSION_COMPTE).catch(() => Alert.alert("Supprimer mon compte", "Le navigateur ne s'est pas ouvert. Contactez le support HotelSaver.")) },
      ]
    );
  }

  return (
    <View style={styles.page}>
      <EnteteMobile />
      <EnteteRetour titre="Réglages" sousTitre="Tout ce qui se règle, rangé par thème" onRetour={onRetour} />

      <ConteneurFormulaire>
          {/* Apparence : tout en haut, propre à cet appareil (Auto par défaut). */}
          <CarteApparence />

          {/* Cet appareil : imprimante, sons, notifications, synchronisation, mise à jour (avant : 6 lignes séparées dans « Plus »). */}
          <Text style={styles.titreGroupe}>CET APPAREIL</Text>
          <View style={styles.groupe}>
            {onOuvrirImprimante && <LigneReglage icone={Printer} libelle="Imprimante" onPress={onOuvrirImprimante} />}
            {onOuvrirSons && <LigneReglage icone={Volume2} libelle="Sons et voix" onPress={onOuvrirSons} />}
            {onOuvrirDiagnostic && <LigneReglage icone={BellRing} libelle="Notifications" valeur="Vérifier et tester" onPress={onOuvrirDiagnostic} />}
            {onOuvrirSynchronisation && (
              <LigneReglage
                icone={RefreshCw}
                libelle="Synchronisation"
                valeur={etatSync.enAttente + etatSync.conflits > 0 ? `${etatSync.enAttente + etatSync.conflits} à envoyer` : "À jour ✓"}
                onPress={onOuvrirSynchronisation}
              />
            )}
            {onOuvrirMiseAJour && miseAJour.possible && (
              <LigneReglage icone={Download} libelle="Mise à jour" valeur={`v${miseAJour.versionInstallee}`} pastille={nouvelleVersion ? "Nouvelle" : undefined} onPress={onOuvrirMiseAJour} dernier />
            )}
          </View>

          {/* Abonnement : visible par tous (l'état concerne toute l'équipe) ; le paiement, lui, est réservé au patron dans l'écran qui s'ouvre. */}
          {onOuvrirAbonnement && (
            <View style={[styles.carte, styles.carteAbonnement]}>
              <View style={styles.compteLigne}>
                <View style={styles.compteAvatar}>
                  <CreditCard size={18} color={couleurs.bleu} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.compteNom} accessibilityRole="header">Abonnement</Text>
                  <Text style={styles.compteRole}>{resumeAbonnement ? `${resumeAbonnement.titre}. ${resumeAbonnement.detail}` : "Voir l'état de votre abonnement."}</Text>
                </View>
              </View>
              <Pressable style={styles.boutonSecondaire} onPress={onOuvrirAbonnement} accessibilityRole="button" accessibilityLabel={utilisateur?.role === Role.PATRON ? "Gérer l'abonnement" : "Voir l'abonnement"}>
                <Text style={styles.boutonSecondaireTexte}>{utilisateur?.role === Role.PATRON ? "Gérer l'abonnement" : "Voir l'abonnement"}</Text>
              </Pressable>
            </View>
          )}

          {/* Paiement en ligne des acomptes : réservé au patron (c'est son compte ScanLinkPay, son argent). L'écran explique lui-même si la formule ne l'inclut pas. */}
          {onOuvrirPaiementEnLigne && utilisateur?.role === Role.PATRON && (
            <View style={[styles.carte, styles.carteAbonnement]}>
              <View style={styles.compteLigne}>
                <View style={styles.compteAvatar}>
                  <HandCoins size={18} color={couleurs.bleu} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.compteNom} accessibilityRole="header">Paiement en ligne des acomptes</Text>
                  <Text style={styles.compteRole}>Vos clients paient un acompte sur le site de l'hôtel. L'argent arrive sur votre compte ScanLinkPay.</Text>
                </View>
              </View>
              <Pressable style={styles.boutonSecondaire} onPress={onOuvrirPaiementEnLigne} accessibilityRole="button" accessibilityLabel="Régler le paiement en ligne des acomptes">
                <Text style={styles.boutonSecondaireTexte}>Régler le paiement en ligne</Text>
              </Pressable>
            </View>
          )}

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
                <Switch
                  value={patronOpere}
                  onValueChange={(v) => void basculerPatronOpere(v)}
                  disabled={enregistrement}
                  accessibilityLabel="Le patron peut aussi opérer : réserver, facturer et encaisser"
                />
              </View>
              <View style={styles.compteLigne}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.compteNom}>Suivi des commandes en cuisine</Text>
                  <Text style={styles.compteRole}>
                    Activez si des plats sont préparés par une équipe séparée : les commandes partent sur l'écran Cuisine jusqu'à
                    leur service. Laissez éteint pour une vente au comptoir (articles servis immédiatement).
                  </Text>
                </View>
                <Switch
                  value={cuisineActivee}
                  onValueChange={(v) => void basculerCuisine(v)}
                  disabled={enregistrement}
                  accessibilityLabel="Suivi des commandes en cuisine"
                />
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
                <Switch
                  value={commandeWebActivee}
                  onValueChange={(v) => void basculerCommandeWeb(v)}
                  disabled={enregistrement}
                  accessibilityLabel="Commande en ligne sur le site de l'hôtel"
                />
              </View>
            </View>
          )}

          <Text style={styles.titreGroupe}>AIDE</Text>
          <View style={styles.groupe}>
            {onOuvrirGuide && <LigneReglage icone={BookOpen} libelle="Guide d'utilisation" onPress={onOuvrirGuide} />}
            <LigneReglage icone={Info} libelle="À propos de HotelSaver" valeur={`v${miseAJour.versionInstallee}`} dernier />
          </View>

          {utilisateur && (
            <BlocSecuriteMobile client={client} actionsEnAttente={miroir.actionsEnAttenteTotal()} onEffacerDonnees={effacerDonneesAppareil} />
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
                <Pressable style={styles.boutonSecondaire} onPress={() => setChangementOuvert(true)} accessibilityRole="button">
                  <Text style={styles.boutonSecondaireTexte}>Changer de compte</Text>
                </Pressable>
              ) : (
                onSeDeconnecter && (
                  <Pressable style={styles.boutonDanger} onPress={confirmerDeconnexion} accessibilityRole="button">
                    <LogOut size={16} color="#fff" />
                    <Text style={styles.boutonDangerTexte}>Se déconnecter</Text>
                  </Pressable>
                )
              )}
              {/* Le patron seul : son compte part avec l'hôtel. La réception et la cafétéria sont retirées par le patron. */}
              {utilisateur.role === Role.PATRON && (
                <Pressable style={styles.lienSuppression} onPress={supprimerCompte} accessibilityRole="button">
                  <Trash2 size={15} color={couleurs.danger} />
                  <Text style={styles.lienSuppressionTexte}>Supprimer mon compte et mon hôtel</Text>
                </Pressable>
              )}
            </View>
          )}
      </ConteneurFormulaire>
      <FeuilleChangerDeCompte visible={changementOuvert} onFermer={() => setChangementOuvert(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  titreGroupe: { fontSize: 12, fontWeight: "800", letterSpacing: 0.6, color: couleurs.encreAttenuee, marginTop: espacements.s2 },
  groupe: { backgroundColor: couleurs.surface200, borderRadius: rayons.lg, borderWidth: 1, borderColor: couleurs.bordure, overflow: "hidden" },
  ligneReglage: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: espacements.s3, paddingHorizontal: espacements.s3 },
  ligneReglageBordure: { borderBottomWidth: 1, borderBottomColor: couleurs.bordure },
  ligneReglageIcone: { width: 32, height: 32, borderRadius: 9, backgroundColor: couleurs.bleuClair, alignItems: "center", justifyContent: "center" },
  ligneReglageTexte: { flex: 1, fontSize: 14.5, fontWeight: "600", color: couleurs.encre },
  ligneReglageValeur: { fontSize: 12.5, color: couleurs.encreAttenuee },
  ligneReglagePastille: { paddingHorizontal: espacements.s2, paddingVertical: 3, borderRadius: rayons.pill, backgroundColor: couleurs.alerteClair },
  ligneReglagePastilleTexte: { fontSize: 11, fontWeight: "800", color: couleurs.alerte },
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
    minHeight: 44,
    fontSize: 15,
    color: couleurs.encre,
    backgroundColor: couleurs.surface100,
  },
  aide: { fontSize: 12, color: couleurs.encreAttenuee, marginTop: espacements.s2 },
  confirmation: { fontSize: 13, color: couleurs.succes, marginTop: espacements.s3 },
  boutons: { flexDirection: "row", gap: espacements.s3, marginTop: espacements.s4 },
  boutonSecondaire: {
    flex: 1,
    minHeight: 44,
    borderRadius: rayons.sm,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    alignItems: "center",
    justifyContent: "center",
  },
  boutonSecondaireTexte: { color: couleurs.encre, fontWeight: "600", fontSize: 14 },
  bouton: { flex: 1, minHeight: 44, borderRadius: rayons.sm, backgroundColor: couleurs.bleu, alignItems: "center", justifyContent: "center" },
  boutonTexte: { color: "#fff", fontWeight: "700", fontSize: 14 },
  carteCompte: { marginTop: espacements.s3, gap: espacements.s3 },
  carteAbonnement: { marginBottom: espacements.s3, gap: espacements.s3 },
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
    minHeight: 44,
    borderRadius: rayons.sm,
    backgroundColor: couleurs.danger,
    alignItems: "center",
    justifyContent: "center",
    gap: espacements.s2,
  },
  boutonDangerTexte: { color: "#fff", fontWeight: "700", fontSize: 14 },
  lienSuppression: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: espacements.s3, paddingVertical: espacements.s2 },
  lienSuppressionTexte: { color: couleurs.danger, fontWeight: "600", fontSize: 13 },
});
