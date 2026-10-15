import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { CircleAlert, CircleCheck, Lock } from "lucide-react-native";
import type { ClientApi } from "@hotel-chicago/api-client";
import { montantAbonnement } from "@hotel-chicago/regles";
import type { ModifierReglagesPaiementEnLigne, ReglagesPaiementEnLigne } from "@hotel-chicago/types";
import { couleurs, espacements, rayons } from "../tokens";
import { confirmerAction } from "../confirmer";
import { messageErreur } from "../messagesErreur";
import { ouvrirLienSur } from "../liens";
import { EnteteMobile } from "../composants/EnteteMobile";
import { EnteteRetour } from "../composants/EnteteRetour";
import { ConteneurFormulaire } from "../composants/ConteneurFormulaire";
import { BoutonPlein } from "../composants/BoutonPlein";
import { BlocAideAuto } from "../composants/AideSupport";
import { useNotifications } from "../notifications/ContexteNotifications";

export interface EcranPaiementEnLigneProps {
  client: ClientApi;
  onRetour: () => void;
}

const LONGUEUR_MAX_CONDITIONS = 1000;

type Retour = { ok: boolean; texte: string };

/** Garde seulement les chiffres : « 3O » ou « 30 % » deviennent « 3 » / « 30 ». */
function chiffres(texte: string): string {
  return texte.replace(/\D/g, "").slice(0, 3);
}

function arrondiCentimes(valeur: number): number {
  return Math.round(valeur * 100) / 100;
}

/**
 * Réglages → « Paiement en ligne des acomptes » (PATRON) : relie l'hôtel à son compte marchand ScanLinkPay et fixe le pourcentage d'acompte
 * demandé sur le site public. L'argent arrive directement sur ce compte ScanLinkPay, que le patron peut vider vers son Mobile Money.
 * Les messages d'erreur du serveur (numéro inconnu, compte refusé…) sont montrés tels quels.
 */
export function EcranPaiementEnLigne({ client, onRetour }: EcranPaiementEnLigneProps) {
  const { ouvrirAbonnement } = useNotifications();
  const monte = useRef(true);
  const [reglages, setReglages] = useState<ReglagesPaiementEnLigne | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreurChargement, setErreurChargement] = useState<string | null>(null);

  const [numero, setNumero] = useState("");
  const [pourcentage, setPourcentage] = useState("0");
  const [fraisClient, setFraisClient] = useState(false);
  const [conditions, setConditions] = useState("");

  const [enCours, setEnCours] = useState<"compte" | "regle" | null>(null);
  const [retourCompte, setRetourCompte] = useState<Retour | null>(null);
  const [retourRegle, setRetourRegle] = useState<Retour | null>(null);
  const [erreurLien, setErreurLien] = useState<string | null>(null);

  useEffect(() => {
    monte.current = true;
    return () => {
      monte.current = false;
    };
  }, []);

  const remplirFormulaire = useCallback((r: ReglagesPaiementEnLigne) => {
    setNumero(r.numeroScanLinkPay ?? "");
    setPourcentage(String(r.pourcentageAcompte));
    setFraisClient(r.fraisPayesParClient);
    setConditions(r.conditionsAnnulation ?? "");
  }, []);

  // Chaque chargement porte un numéro : une réponse arrivée après un autre chargement (ou la fermeture) est ignorée.
  const numeroChargement = useRef(0);
  const charger = useCallback(async () => {
    const mien = ++numeroChargement.current;
    setChargement(true);
    setErreurChargement(null);
    try {
      const r = await client.reglagesPaiementEnLigne();
      if (!monte.current || mien !== numeroChargement.current) return;
      setReglages(r);
      remplirFormulaire(r);
    } catch (e) {
      if (!monte.current || mien !== numeroChargement.current) return;
      setErreurChargement(messageErreur(e, "Les réglages n'ont pas pu être chargés. Vérifiez la connexion puis réessayez."));
    } finally {
      if (monte.current && mien === numeroChargement.current) setChargement(false);
    }
  }, [client, remplirFormulaire]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const pourcentageNombre = pourcentage === "" ? null : Number(pourcentage);
  const pourcentageValide = pourcentageNombre !== null && pourcentageNombre >= 0 && pourcentageNombre <= 100;
  const modifieRegle =
    reglages !== null &&
    (pourcentageNombre !== reglages.pourcentageAcompte ||
      fraisClient !== reglages.fraisPayesParClient ||
      conditions.trim() !== (reglages.conditionsAnnulation ?? ""));
  const modifieNumero = reglages !== null && numero.trim() !== (reglages.numeroScanLinkPay ?? "");

  /** Une seule requête à la fois ; renvoie le réglage mis à jour, ou null si le serveur a refusé (le message est alors à l'écran). */
  async function enregistrer(
    cible: "compte" | "regle",
    dto: ModifierReglagesPaiementEnLigne,
    afficher: (r: Retour | null) => void,
    messageSucces: (nouveau: ReglagesPaiementEnLigne) => string
  ): Promise<ReglagesPaiementEnLigne | null> {
    if (enCours) return null;
    setEnCours(cible);
    afficher(null);
    try {
      const nouveau = await client.modifierReglagesPaiementEnLigne(dto);
      if (!monte.current) return nouveau;
      setReglages(nouveau);
      afficher({ ok: true, texte: messageSucces(nouveau) });
      return nouveau;
    } catch (e) {
      if (monte.current) afficher({ ok: false, texte: messageErreur(e, "Les réglages n'ont pas pu être enregistrés. Vérifiez la connexion puis réessayez.") });
      return null;
    } finally {
      if (monte.current) setEnCours(null);
    }
  }

  async function verifierEtEnregistrerNumero() {
    const saisi = numero.trim().toUpperCase();
    if (!saisi) {
      setRetourCompte({ ok: false, texte: "Entrez d'abord le numéro ScanLinkPay de votre hôtel (il commence par SLP-)." });
      return;
    }
    const nouveau = await enregistrer(
      "compte",
      { numeroScanLinkPay: saisi },
      setRetourCompte,
      (r) => (r.nomScanLinkPay ? `Compte trouvé : ${r.nomScanLinkPay}. Vérifiez que c'est bien le nom de votre entreprise.` : "Numéro enregistré.")
    );
    if (nouveau && monte.current) setNumero(nouveau.numeroScanLinkPay ?? saisi);
  }

  function demanderRetraitCompte() {
    confirmerAction({
      titre: "Retirer le compte ScanLinkPay ?",
      message: "Vos clients ne pourront plus payer l'acompte en ligne tant qu'un compte n'est pas relié.",
      libelleConfirmer: "Retirer le compte",
      destructif: true,
      onConfirmer: async () => {
        const nouveau = await enregistrer("compte", { numeroScanLinkPay: null }, setRetourCompte, () => "Compte retiré. Le paiement en ligne est arrêté.");
        if (nouveau && monte.current) remplirFormulaire(nouveau);
      },
    });
  }

  async function enregistrerRegle() {
    if (!pourcentageValide || pourcentageNombre === null) {
      setRetourRegle({ ok: false, texte: "Entrez un pourcentage entre 0 et 100." });
      return;
    }
    const nouveau = await enregistrer(
      "regle",
      { pourcentageAcompte: pourcentageNombre, fraisPayesParClient: fraisClient, conditionsAnnulation: conditions.trim() ? conditions.trim() : null },
      setRetourRegle,
      (r) => (r.pourcentageAcompte > 0 ? `Enregistré. Vos clients paient ${r.pourcentageAcompte} % d'acompte en ligne.` : "Enregistré. Le paiement de l'acompte en ligne est désactivé.")
    );
    if (nouveau && monte.current) {
      setPourcentage(String(nouveau.pourcentageAcompte));
      setFraisClient(nouveau.fraisPayesParClient);
      setConditions(nouveau.conditionsAnnulation ?? "");
    }
  }

  async function ouvrirCreationCompte() {
    setErreurLien(null);
    try {
      await ouvrirLienSur(reglages?.urlScanLinkPay);
    } catch {
      setErreurLien("Le lien n'a pas pu s'ouvrir. Réessayez avec une connexion Internet.");
    }
  }

  function retour() {
    if (modifieNumero || modifieRegle) {
      confirmerAction({
        titre: "Quitter sans enregistrer ?",
        message: "Ce que vous avez changé ne sera pas gardé.",
        libelleConfirmer: "Quitter",
        libelleRefuser: "Rester ici",
        destructif: true,
        onConfirmer: onRetour,
      });
      return;
    }
    onRetour();
  }

  const exemple = (() => {
    if (pourcentageNombre === null || !pourcentageValide) return "Entrez un pourcentage entre 0 et 100.";
    if (pourcentageNombre === 0) return "À 0, le paiement de l'acompte en ligne est désactivé : vos clients ne peuvent pas payer sur le site.";
    const total = 20 * 4;
    const acompte = arrondiCentimes((total * pourcentageNombre) / 100);
    return `Exemple : chambre ${montantAbonnement(20, "USD")} × 4 nuits = ${montantAbonnement(total, "USD")} → acompte ${pourcentageNombre} % = ${montantAbonnement(acompte, "USD")}`;
  })();

  const compteRelie = !!reglages?.numeroScanLinkPay;

  return (
    <View style={styles.page}>
      <EnteteMobile />
      <EnteteRetour titre="Paiement en ligne des acomptes" onRetour={retour} />
      <ConteneurFormulaire styleContenu={styles.contenu}>
        {chargement && !reglages && (
          <View style={styles.centre}>
            <ActivityIndicator color={couleurs.bleu} accessibilityLabel="Chargement des réglages" />
            <Text style={styles.texte}>Chargement…</Text>
          </View>
        )}

        {!reglages && erreurChargement && (
          <View style={styles.carte}>
            <Text style={styles.erreur} accessibilityRole="alert">
              {erreurChargement}
            </Text>
            <BoutonPlein libelle="Réessayer" variante="secondaire" onPress={() => void charger()} occupe={chargement} />
          </View>
        )}

        {reglages && !reglages.fonctionIncluse && (
          <>
            <View style={styles.carteVerrou}>
              <Lock size={24} color={couleurs.alerte} />
              <Text style={styles.titreCarte} accessibilityRole="header">
                Le paiement en ligne n'est pas inclus dans votre formule
              </Text>
              <Text style={styles.texte}>
                Avec une formule qui l'inclut, vos clients paient l'acompte de leur réservation sur le site de l'hôtel (Mobile Money ou carte Visa/Mastercard).
              </Text>
              <BoutonPlein libelle="Voir les formules" onPress={ouvrirAbonnement} />
            </View>
            <BlocAideAuto />
          </>
        )}

        {reglages && reglages.fonctionIncluse && !reglages.serveurRelie && (
          <>
            <View style={styles.carteVerrou}>
              <CircleAlert size={24} color={couleurs.alerte} />
              <Text style={styles.titreCarte} accessibilityRole="header">
                Le paiement en ligne n'est pas encore disponible
              </Text>
              <Text style={styles.texte}>Le serveur HotelSaver n'est pas encore relié à ScanLinkPay. Contactez le support : nous réglons cela avec vous.</Text>
            </View>
            <BlocAideAuto />
          </>
        )}

        {reglages && reglages.fonctionIncluse && reglages.serveurRelie && (
          <>
            <View style={styles.aideBleue}>
              <Text style={styles.texte}>
                Vos clients paient l'acompte de leur réservation sur le site de l'hôtel (Mobile Money ou carte Visa/Mastercard). L'argent arrive sur
                votre compte ScanLinkPay ; vous pouvez le retirer vers votre Mobile Money.
              </Text>
              <Text style={styles.texte}>Pas de compte ? Créez-le gratuitement.</Text>
              {reglages.urlScanLinkPay && (
                <BoutonPlein libelle="Créer mon compte ScanLinkPay" variante="secondaire" onPress={() => void ouvrirCreationCompte()} />
              )}
              {erreurLien && (
                <Text style={styles.erreur} accessibilityRole="alert">
                  {erreurLien}
                </Text>
              )}
            </View>

            <View style={styles.carte}>
              <Text style={styles.titreCarte} accessibilityRole="header">
                1. Votre compte ScanLinkPay
              </Text>
              <Text style={styles.libelle}>Numéro ScanLinkPay de votre hôtel</Text>
              <TextInput
                style={styles.champ}
                value={numero}
                onChangeText={(t) => {
                  setNumero(t);
                  setRetourCompte(null);
                }}
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder="SLP-…"
                placeholderTextColor={couleurs.encreFaible}
                maxLength={40}
                accessibilityLabel="Numéro ScanLinkPay de votre hôtel, commence par SLP"
              />
              {compteRelie && !modifieNumero && !retourCompte && (
                <View style={styles.ligneEtat}>
                  <CircleCheck size={18} color={couleurs.succes} />
                  <Text style={[styles.texte, styles.flex]}>
                    {reglages.nomScanLinkPay ? `Compte relié : ${reglages.nomScanLinkPay}` : "Compte relié."}
                  </Text>
                </View>
              )}
              {retourCompte && <Message retour={retourCompte} />}
              <BoutonPlein
                libelle="Vérifier et enregistrer"
                onPress={() => void verifierEtEnregistrerNumero()}
                occupe={enCours === "compte"}
                desactive={enCours === "regle" || numero.trim() === ""}
              />
              {compteRelie && <BoutonPlein libelle="Retirer ce compte" variante="secondaire" onPress={demanderRetraitCompte} desactive={enCours !== null} />}
            </View>

            <View style={styles.carte}>
              <Text style={styles.titreCarte} accessibilityRole="header">
                2. Acompte demandé aux clients
              </Text>
              {!compteRelie && pourcentageNombre !== null && pourcentageNombre > 0 && (
                <Text style={styles.avertissement}>Reliez d'abord votre compte ScanLinkPay (étape 1) : sans lui, vos clients ne pourront pas payer.</Text>
              )}
              <Text style={styles.libelle}>Pourcentage demandé à la réservation</Text>
              <View style={styles.ligneChamp}>
                <TextInput
                  style={[styles.champ, styles.champPourcentage, !pourcentageValide && styles.champErreur]}
                  value={pourcentage}
                  onChangeText={(t) => {
                    setPourcentage(chiffres(t));
                    setRetourRegle(null);
                  }}
                  keyboardType="number-pad"
                  maxLength={3}
                  selectTextOnFocus
                  accessibilityLabel="Pourcentage d'acompte demandé à la réservation, de 0 à 100. 0 veut dire désactivé."
                />
                <Text style={styles.texteGras}>%</Text>
              </View>
              <Text style={styles.aide}>De 0 à 100. Mettez 0 pour ne pas demander d'acompte en ligne.</Text>
              <Text style={[styles.exemple, !pourcentageValide && styles.erreur]} accessibilityLiveRegion="polite">
                {exemple}
              </Text>

              <View style={styles.ligneSwitch}>
                <View style={styles.flex}>
                  <Text style={styles.libelle}>Le client paie les frais ScanLinkPay en plus</Text>
                  <Text style={styles.aide}>
                    Activé : le client paie l'acompte plus les frais, et vous recevez l'acompte en entier. Éteint : les frais sont pris sur ce que vous recevez.
                  </Text>
                </View>
                <Switch
                  value={fraisClient}
                  onValueChange={(v) => {
                    setFraisClient(v);
                    setRetourRegle(null);
                  }}
                  accessibilityLabel="Le client paie les frais ScanLinkPay en plus de l'acompte"
                />
              </View>

              <Text style={styles.libelle}>Conditions d'annulation et de remboursement</Text>
              <TextInput
                style={[styles.champ, styles.champLong]}
                value={conditions}
                onChangeText={(t) => {
                  setConditions(t.slice(0, LONGUEUR_MAX_CONDITIONS));
                  setRetourRegle(null);
                }}
                multiline
                textAlignVertical="top"
                maxLength={LONGUEUR_MAX_CONDITIONS}
                placeholder="Exemple : l'acompte est rendu si vous annulez au moins 48 heures avant l'arrivée."
                placeholderTextColor={couleurs.encreFaible}
                accessibilityLabel="Conditions d'annulation et de remboursement, 1000 caractères au plus"
              />
              <Text style={styles.aide}>
                {conditions.length} / {LONGUEUR_MAX_CONDITIONS} caractères. Vos clients lisent ce texte avant de payer.
              </Text>

              {retourRegle && <Message retour={retourRegle} />}
              <BoutonPlein
                libelle="Enregistrer"
                onPress={() => void enregistrerRegle()}
                occupe={enCours === "regle"}
                desactive={enCours === "compte" || !pourcentageValide}
              />
            </View>

            <BlocAideAuto texte="Une question sur le compte ScanLinkPay ou sur les acomptes ? Écrivez-nous sur WhatsApp." />
          </>
        )}
      </ConteneurFormulaire>
    </View>
  );
}

function Message({ retour }: { retour: Retour }) {
  return (
    <View style={[styles.message, { backgroundColor: retour.ok ? couleurs.succesClair : couleurs.dangerClair }]} accessibilityRole={retour.ok ? "text" : "alert"} accessibilityLiveRegion="polite">
      {retour.ok ? <CircleCheck size={18} color={couleurs.succes} /> : <CircleAlert size={18} color={couleurs.danger} />}
      <Text style={[styles.messageTexte, { color: retour.ok ? couleurs.succes : couleurs.danger }]}>{retour.texte}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: couleurs.surface100 },
  contenu: { gap: espacements.s3 },
  flex: { flex: 1 },
  centre: { alignItems: "center", gap: espacements.s2, paddingVertical: espacements.s5 },
  carte: {
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espacements.s4,
    gap: espacements.s2,
  },
  carteVerrou: {
    backgroundColor: couleurs.alerteClair,
    borderRadius: rayons.lg,
    borderWidth: 1,
    borderColor: couleurs.alerte,
    padding: espacements.s4,
    gap: espacements.s3,
    alignItems: "center",
  },
  aideBleue: { backgroundColor: couleurs.infoClair, borderRadius: rayons.lg, padding: espacements.s4, gap: espacements.s3 },
  titreCarte: { fontSize: 16, fontWeight: "700", color: couleurs.navy },
  texte: { fontSize: 14, color: couleurs.encre, lineHeight: 20 },
  texteGras: { fontSize: 18, fontWeight: "700", color: couleurs.encre },
  libelle: { fontSize: 14, fontWeight: "600", color: couleurs.encre, marginTop: espacements.s1 },
  aide: { fontSize: 12, color: couleurs.encreAttenuee, lineHeight: 17 },
  exemple: { fontSize: 14, fontWeight: "600", color: couleurs.navy, backgroundColor: couleurs.bleuClair, borderRadius: rayons.md, padding: espacements.s3, lineHeight: 20 },
  erreur: { fontSize: 13, color: couleurs.danger, fontWeight: "600" },
  avertissement: { fontSize: 13, color: couleurs.alerte, fontWeight: "600", lineHeight: 18 },
  champ: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: rayons.sm,
    paddingHorizontal: espacements.s3,
    fontSize: 16,
    color: couleurs.encre,
    backgroundColor: couleurs.surface100,
  },
  champErreur: { borderColor: couleurs.danger },
  champPourcentage: { width: 96, textAlign: "center", fontWeight: "700" },
  champLong: { minHeight: 110, paddingTop: espacements.s3 },
  ligneChamp: { flexDirection: "row", alignItems: "center", gap: espacements.s2 },
  ligneSwitch: { flexDirection: "row", alignItems: "center", gap: espacements.s3, marginTop: espacements.s2 },
  ligneEtat: { flexDirection: "row", alignItems: "center", gap: espacements.s2 },
  message: { flexDirection: "row", alignItems: "flex-start", gap: espacements.s2, borderRadius: rayons.md, padding: espacements.s3 },
  messageTexte: { flex: 1, fontSize: 14, fontWeight: "600", lineHeight: 20 },
});
