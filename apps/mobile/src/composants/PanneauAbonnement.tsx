import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AlertTriangle, BedDouble, CalendarClock, Check, CircleAlert, CircleCheck, Crown, Gift, Info, Lock, ShieldCheck, Smartphone, Sparkles, XCircle } from "lucide-react-native";
import { ErreurApi } from "@hotel-chicago/api-client";
import type { ClientApi } from "@hotel-chicago/api-client";
import { SuiviPaiementAbonnement, type EtatSuiviPaiement } from "@hotel-chicago/miroir-local";
import {
  LIBELLE_OPERATEUR,
  LISTE_OPERATEURS,
  OPERATEURS_MOBILE_MONEY,
  actualiserEtatAbonnement,
  dateAbonnement,
  montantAbonnement,
  numeroInternational,
  operateurDuNumero,
  problemeNumero,
  resumerAbonnement,
  type NiveauAbonnement,
} from "@hotel-chicago/regles";
import { Role } from "@hotel-chicago/types";
import type { ApercuPaiement, EtatAbonnement, FormuleProposee, OperateurMobileMoney, PaiementAbonnementVue, VueAbonnement } from "@hotel-chicago/types";
import { couleurs, espacements, rayons } from "../tokens";
import { AFFICHER_LIEN_PAIEMENT_SITE, PAIEMENT_DANS_APPLICATION, TEXTE_RENOUVELER_AILLEURS, URL_PAIEMENT_SITE_SECOURS } from "../configAbonnement";
import { ouvrirLienSur } from "../liens";
import { confirmerAction } from "../confirmer";
import { messageErreur } from "../messagesErreur";
import { BlocAide, choisirContactSupport, memoriserContactSupport } from "./AideSupport";
import { LogoOperateur, LogosMobileMoney } from "./LogosPaiement";

type ClientAbonnement = Pick<ClientApi, "abonnement" | "payerAbonnement" | "paiementAbonnement" | "apercuAbonnement">;
type Devise = "USD" | "CDF";

export interface PanneauAbonnementProps {
  client: ClientAbonnement;
  role: Role;
  /** État reçu à la connexion : affiché tel quel tant que (ou si) le serveur ne répond pas. */
  profilAbonnement?: EtatAbonnement;
  /** « ecran » : sous-écran de l'application. « bloque » : écran plein qui remplace l'application. */
  mode: "ecran" | "bloque";
  /** Appelé tout de suite quand un paiement est confirmé (mode écran : met le profil à jour en arrière-plan). */
  onPaiementConfirme?: () => Promise<void>;
  /** Bouton « Continuer » après un paiement réussi, ou quand l'abonnement s'avère déjà actif. */
  onContinuer: () => Promise<void> | void;
}

const NIVEAUX: Record<NiveauAbonnement, { fond: string; texte: string }> = {
  ok: { fond: couleurs.succesClair, texte: couleurs.succes },
  attention: { fond: couleurs.alerteClair, texte: couleurs.alerte },
  danger: { fond: couleurs.dangerClair, texte: couleurs.danger },
};

const STATUTS_PAIEMENT: Record<PaiementAbonnementVue["statut"], { libelle: string; fond: string; texte: string }> = {
  REUSSI: { libelle: "Payé", fond: couleurs.succesClair, texte: couleurs.succes },
  EN_ATTENTE: { libelle: "En attente", fond: couleurs.alerteClair, texte: couleurs.alerte },
  ECHEC: { libelle: "Échoué", fond: couleurs.dangerClair, texte: couleurs.danger },
  EXPIRE: { libelle: "Expiré", fond: couleurs.surface100, texte: couleurs.encre },
};

const CONSEILS_ATTENTE = [
  "Vérifiez que vous avez assez d'argent sur votre compte Mobile Money.",
  "Vérifiez que le téléphone a du réseau.",
  "Entrez bien votre code secret (PIN) quand il est demandé.",
  "Vérifiez que le numéro saisi est le bon.",
];

/** Arrondi au centime : évite « 0,1 + 0,2 = 0,30000000000000004 » dans un total affiché. */
function arrondiCentimes(valeur: number): number {
  return Math.round(valeur * 100) / 100;
}

function nomFormule(code: string | null | undefined, formules: FormuleProposee[] | undefined): string {
  if (!code) return "";
  return formules?.find((f) => f.code === code)?.nom ?? `${code.charAt(0)}${code.slice(1).toLowerCase()}`;
}

function formuleAccessible(f: FormuleProposee, chambres: number): boolean {
  return f.maxChambres === null || f.maxChambres >= chambres;
}

/** « +243 828 497 218 » à partir de ce que l'utilisateur a tapé ; null si le numéro n'est pas valide. */
function numeroLisible(telephone: string): string | null {
  const n = numeroInternational(telephone);
  return n ? `${n.slice(0, 4)} ${n.slice(4, 7)} ${n.slice(7, 10)} ${n.slice(10)}` : null;
}

function minutesSecondes(total: number): string {
  const s = Math.max(0, Math.floor(total));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Compteur d'attente : suit l'horloge chaque seconde (le suivi, lui, n'interroge le serveur que toutes les 4 s). */
function useSecondesEcoulees(actif: boolean, secondesSuivi: number): number {
  const debut = useRef<number | null>(null);
  const [, redessiner] = useState(0);
  useEffect(() => {
    if (!actif) {
      debut.current = null;
      return;
    }
    debut.current = Date.now() - secondesSuivi * 1000;
    redessiner((n) => n + 1);
    const minuteur = setInterval(() => redessiner((n) => n + 1), 1000);
    return () => clearInterval(minuteur);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actif]);
  return debut.current === null ? secondesSuivi : Math.max(secondesSuivi, Math.floor((Date.now() - debut.current) / 1000));
}

/**
 * Tout le contenu de l'abonnement : état, choix de la formule, paiement Mobile Money, attente de la confirmation, résultat, historique.
 * Partagé par l'écran « Abonnement » (sous-écran) et par l'écran d'abonnement expiré (plein écran). Le déroulement du paiement
 * (clé d'idempotence, sondage, pannes réseau) est celui de SuiviPaiementAbonnement, partagé avec le bureau.
 */
export function PanneauAbonnement({ client, role, profilAbonnement, mode, onPaiementConfirme, onContinuer }: PanneauAbonnementProps) {
  const estPatron = role === Role.PATRON;
  const suivi = useMemo(() => new SuiviPaiementAbonnement(client), [client]);
  const [suiviEtat, setSuiviEtat] = useState<EtatSuiviPaiement>(suivi.etat());
  const monte = useRef(true);
  const premiereCharge = useRef(true);

  const [vue, setVue] = useState<VueAbonnement | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreurSite, setErreurSite] = useState<string | null>(null);
  const [erreurVue, setErreurVue] = useState<{ texte: string; horsLigne: boolean } | null>(null);

  const [formule, setFormule] = useState<FormuleProposee["code"] | null>(null);
  const [mois, setMois] = useState(1);
  const [devise, setDevise] = useState<Devise>("USD");
  const [operateur, setOperateur] = useState<OperateurMobileMoney | null>(null);
  const [telephone, setTelephone] = useState("");

  // Aperçu du coût réel (prix + frais ScanLinkPay) : rangé AVEC la clé « formule|durée|devise » qu'il décrit, pour ne jamais afficher le total d'une
  // autre combinaison quand le patron change vite de choix.
  const [apercu, setApercu] = useState<{ cle: string; resultat: ApercuPaiement | "echec" } | null>(null);

  const [continuerEnCours, setContinuerEnCours] = useState(false);
  const [erreurContinuer, setErreurContinuer] = useState<string | null>(null);

  useEffect(() => {
    monte.current = true;
    return () => {
      monte.current = false;
    };
  }, []);

  // Le suivi du paiement : abonné tant que l'écran existe, ARRÊTÉ à la fermeture (plus aucune interrogation du serveur).
  useEffect(() => {
    const retirer = suivi.onChangement((e) => {
      if (monte.current) setSuiviEtat(e);
    });
    return () => {
      retirer();
      suivi.arreter();
    };
  }, [suivi]);

  const choisirParDefaut = useCallback((v: VueAbonnement) => {
    const choix =
      v.formules.find((f) => f.code === v.formuleActuelle && formuleAccessible(f, v.nombreChambres)) ??
      v.formules.find((f) => f.recommandee && formuleAccessible(f, v.nombreChambres)) ??
      v.formules.find((f) => formuleAccessible(f, v.nombreChambres));
    setFormule((courante) => (courante && v.formules.some((f) => f.code === courante && formuleAccessible(f, v.nombreChambres)) ? courante : (choix?.code ?? null)));
  }, []);

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const v = await client.abonnement();
      if (!monte.current) return;
      memoriserContactSupport(v.contactSupport);
      setVue(v);
      setErreurVue(null);
      choisirParDefaut(v);
      // Une demande de paiement attend déjà la confirmation du téléphone (écran fermé puis rouvert) : on reprend l'attente, une seule fois.
      if (premiereCharge.current) {
        premiereCharge.current = false;
        if (v.paiementEnCours && PAIEMENT_DANS_APPLICATION && estPatron && suivi.etat().phase === "saisie") suivi.reprendre(v.paiementEnCours);
      }
    } catch (e) {
      if (!monte.current) return;
      setErreurVue({
        texte: messageErreur(e, "L'abonnement n'a pas pu être chargé. Réessayez."),
        horsLigne: e instanceof ErreurApi && e.statusCode === 0,
      });
    } finally {
      if (monte.current) setChargement(false);
    }
  }, [client, suivi, estPatron, choisirParDefaut]);

  useEffect(() => {
    void charger();
  }, [charger]);

  // Retour au premier plan (le patron a peut-être payé ailleurs) : on relit l'abonnement, sans toucher à la saisie.
  useEffect(() => {
    const abonnement = AppState.addEventListener("change", (etat) => {
      if (etat === "active" && suivi.etat().phase === "saisie") void charger();
    });
    return () => abonnement.remove();
  }, [suivi, charger]);

  // Paiement confirmé : on relit l'abonnement (carte, historique) et, en mode écran, on met le profil à jour tout de suite.
  const auPaiementConfirme = useRef(onPaiementConfirme);
  auPaiementConfirme.current = onPaiementConfirme;
  const phase = suiviEtat.phase;
  useEffect(() => {
    if (phase !== "reussi") return;
    void charger();
    if (mode === "ecran") void auPaiementConfirme.current?.().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const secondes = useSecondesEcoulees(phase === "attente", suiviEtat.secondes);

  const formuleChoisie = vue?.formules.find((f) => f.code === formule) ?? null;
  const duree = formuleChoisie?.durees.find((d) => d.mois === mois) ?? formuleChoisie?.durees[0] ?? null;
  const montant = duree ? (devise === "USD" ? duree.prixUsd : duree.prixCdf) : null;
  const texteMontant = montant !== null ? montantAbonnement(montant, devise) : "";
  const probleme = telephone.trim() ? problemeNumero(operateur, telephone) : null;
  const formulaireValide = !!formuleChoisie && !!duree && montant !== null && montant > 0 && !!operateur && telephone.trim() !== "" && problemeNumero(operateur, telephone) === null;

  function saisirNumero(texte: string) {
    setTelephone(texte);
    const reseau = operateurDuNumero(texte);
    if (reseau) setOperateur(reseau); // un numéro congolais appartient à un seul réseau : on le présélectionne
  }

  function demanderPaiement() {
    if (!formuleChoisie || !duree || !operateur || montant === null) return;
    const numero = numeroInternational(telephone);
    if (!numero) return;
    if (calculFraisEnCours) return; // le total n'est pas encore connu : on n'invente pas un montant
    confirmerAction({
      titre: `Payer ${texteTotal} ?`,
      message: `Formule ${formuleChoisie.nom}, ${duree.mois} mois.${fraisPayeur > 0 ? ` Prix ${texteMontant} + frais ScanLinkPay ${texteFrais}.` : ""} Une demande de confirmation va arriver sur le ${numeroLisible(telephone)}. Entrez ensuite votre code secret ${OPERATEURS_MOBILE_MONEY[operateur].libelle}.`,
      libelleConfirmer: "Payer",
      onConfirmer: () => suivi.payer({ formule: formuleChoisie.code, mois: duree.mois, devise, operateur, telephone: numero }),
    });
  }

  async function continuer() {
    setContinuerEnCours(true);
    setErreurContinuer(null);
    try {
      await onContinuer();
    } catch (e) {
      if (monte.current) setErreurContinuer(messageErreur(e, "Impossible de vérifier votre abonnement pour le moment. Vérifiez la connexion puis réessayez."));
    } finally {
      if (monte.current) setContinuerEnCours(false);
    }
  }

  const etat: EtatAbonnement | null = vue?.etat ?? (profilAbonnement ? actualiserEtatAbonnement(profilAbonnement) : null);

  // Le formulaire de paiement est-il affiché ? (patron, paiement dans l'application autorisé, accès renouvelable, serveur relié à ScanLinkPay)
  const formulaireAffiche =
    estPatron && PAIEMENT_DANS_APPLICATION && etat?.renouvelable !== false && !!vue && vue.paiementEnLigne && !(mode === "bloque" && !vue.etat.bloque);
  const codeFormuleChoisie = formuleChoisie?.code ?? null;
  const moisChoisi = duree?.mois ?? null;
  const cleApercu = formulaireAffiche && codeFormuleChoisie !== null && moisChoisi !== null && montant !== null ? `${codeFormuleChoisie}|${moisChoisi}|${devise}` : null;

  // Aperçu des frais à chaque changement de formule, de durée ou de devise ; une réponse arrivée après un autre choix est ignorée.
  useEffect(() => {
    if (cleApercu === null || codeFormuleChoisie === null || moisChoisi === null) return;
    let perime = false;
    client
      .apercuAbonnement(codeFormuleChoisie, moisChoisi, devise)
      .then((resultat) => {
        if (!perime && monte.current) setApercu({ cle: cleApercu, resultat });
      })
      .catch(() => {
        if (!perime && monte.current) setApercu({ cle: cleApercu, resultat: "echec" });
      });
    return () => {
      perime = true;
    };
  }, [cleApercu, codeFormuleChoisie, moisChoisi, devise, client]);

  const apercuCourant = cleApercu !== null && apercu?.cle === cleApercu ? apercu.resultat : null;
  const calculFraisEnCours = cleApercu !== null && apercuCourant === null;
  // Frais à la charge du payeur : seulement si ScanLinkPay a répondu et que le total dépasse le prix (commission payée en plus, ou à moitié).
  const fraisPayeur =
    apercuCourant && apercuCourant !== "echec" && apercuCourant.disponible && montant !== null && Number.isFinite(apercuCourant.total) ? arrondiCentimes(apercuCourant.total - montant) : 0;
  const totalAPayer = montant !== null && apercuCourant && apercuCourant !== "echec" && fraisPayeur > 0 ? apercuCourant.total : montant;
  const texteFrais = fraisPayeur > 0 ? montantAbonnement(fraisPayeur, devise) : "";
  const texteTotal = totalAPayer !== null ? montantAbonnement(totalAPayer, devise) : "";

  // ------------------------------------------------------------------------------------------------ phases du paiement

  if (phase === "envoi" || phase === "attente") {
    const p = suiviEtat.paiement;
    const reseau = p?.operateur ?? operateur;
    return (
      <View style={styles.carte}>
        <View style={styles.centre}>
          <View accessible accessibilityLabel={phase === "envoi" ? "Envoi de la demande de paiement en cours" : "Attente de la confirmation du paiement sur votre téléphone"}>
            <Pulsation>{reseau ? <LogoOperateur operateur={reseau} taille={52} /> : <Smartphone size={36} color={couleurs.bleu} />}</Pulsation>
          </View>
          {phase === "envoi" || !p ? (
            <>
              <Text style={styles.titrePhase} accessibilityRole="header" accessibilityLiveRegion="polite">Envoi de la demande…</Text>
              <Text style={styles.textePhase}>Un instant, ne fermez pas l'application.</Text>
            </>
          ) : (
            <>
              <Text style={styles.titrePhase} accessibilityRole="header" accessibilityLiveRegion="polite">Confirmez le paiement sur votre téléphone…</Text>
              <Text style={styles.textePhase}>
                Une demande de {montantAbonnement(p.montant, p.devise)} a été envoyée{p.telephoneMasque ? ` au ${p.telephoneMasque}` : ""}
                {p.operateur ? ` (${LIBELLE_OPERATEUR[p.operateur] ?? p.operateur})` : ""}. Entrez votre code secret Mobile Money pour confirmer.
              </Text>
              <Text style={styles.compteur}>Attente : {minutesSecondes(secondes)}</Text>
            </>
          )}
        </View>

        <View style={styles.progression}>
          <EtapeProgression etat="fait" numero={1} libelle="Demande envoyée" />
          <EtapeProgression etat={phase === "attente" ? "encours" : "avenir"} numero={2} libelle="Code secret sur le téléphone" />
          <EtapeProgression etat="avenir" numero={3} libelle="Abonnement activé" />
        </View>

        {phase === "attente" && suiviEtat.lent && (
          <View style={styles.encadreInfo}>
            <Text style={styles.encadreTitre}>Rien ne s'affiche ? Vérifiez :</Text>
            {CONSEILS_ATTENTE.map((c) => (
              <Text key={c} style={styles.encadreTexte}>
                {"•  "}
                {c}
              </Text>
            ))}
          </View>
        )}

        {phase === "attente" && suiviEtat.peutReessayer && (
          <View style={styles.bloc}>
            <Text style={styles.textePhase}>Vous pouvez fermer cet écran : l'abonnement s'activera tout seul dès que vous aurez confirmé le paiement.</Text>
            <Bouton libelle="Réessayer" variante="secondaire" onPress={() => suivi.reinitialiser()} />
          </View>
        )}
      </View>
    );
  }

  if (phase === "reussi") {
    const fin = suiviEtat.paiement?.periodeCouverteJusquau ?? suiviEtat.etatAbonnement?.valideJusquau ?? null;
    const p = suiviEtat.paiement;
    return (
      <View style={styles.carte}>
        <View style={styles.centre}>
          <View style={[styles.resultat, { backgroundColor: couleurs.succesClair }]}>
            <CircleCheck size={44} color={couleurs.succes} />
          </View>
          <Text style={styles.titrePhase} accessibilityRole="header" accessibilityLiveRegion="polite">Merci !</Text>
          <Text style={styles.textePhase}>{fin ? `Abonnement actif jusqu'au ${dateAbonnement(fin)}.` : "Votre abonnement est actif."}</Text>
        </View>
        {p && (
          <View style={styles.recu}>
            <LigneRecap libelle="Montant payé" valeur={montantAbonnement(p.total ?? p.montant, p.devise)} fort />
            {p.operateur && <LigneRecap libelle="Payé avec" valeur={LIBELLE_OPERATEUR[p.operateur] ?? p.operateur} operateur={p.operateur} />}
            {fin && <LigneRecap libelle="Valable jusqu'au" valeur={dateAbonnement(fin)} />}
          </View>
        )}
        {erreurContinuer && <Text style={styles.erreur} accessibilityRole="alert">{erreurContinuer}</Text>}
        <Bouton libelle="Continuer" onPress={() => void continuer()} occupe={continuerEnCours} />
      </View>
    );
  }

  if (phase === "echec") {
    return (
      <View style={styles.carte}>
        <View style={styles.centre}>
          <View style={[styles.resultat, { backgroundColor: couleurs.dangerClair }]}>
            <XCircle size={44} color={couleurs.danger} />
          </View>
          <Text style={styles.titrePhase} accessibilityRole="header" accessibilityLiveRegion="polite">Le paiement n'a pas abouti</Text>
          <Text style={styles.textePhase}>{messageErreur(suiviEtat.message, "Le paiement n'a pas abouti.")}</Text>
          <Text style={styles.petit}>Vous n'avez rien payé si l'argent n'a pas quitté votre compte Mobile Money.</Text>
        </View>
        <Bouton libelle="Réessayer" onPress={() => suivi.reinitialiser()} />
        <BlocAide contact={choisirContactSupport(vue?.contactSupport)} />
      </View>
    );
  }

  // ------------------------------------------------------------------------------------------------ saisie / lecture

  const resume = etat ? resumerAbonnement(etat, vue?.formuleActuelle ?? null) : null;
  const peutPayer = estPatron && PAIEMENT_DANS_APPLICATION;
  const nonRenouvelable = etat?.renouvelable === false;
  const dejaActif = mode === "bloque" && vue !== null && !vue.etat.bloque;

  return (
    <View style={styles.colonne}>
      {resume && etat && (
        <View style={[styles.hero, { borderLeftColor: NIVEAUX[resume.niveau].texte }]}>
          <View style={styles.heroHaut}>
            <View style={[styles.heroIcone, { backgroundColor: NIVEAUX[resume.niveau].fond }]}>
              {resume.niveau === "ok" ? (
                <CircleCheck size={22} color={NIVEAUX[resume.niveau].texte} />
              ) : resume.niveau === "attention" ? (
                <AlertTriangle size={22} color={NIVEAUX[resume.niveau].texte} />
              ) : (
                <XCircle size={22} color={NIVEAUX[resume.niveau].texte} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.surtitre}>VOTRE ABONNEMENT</Text>
              <Text style={styles.etatTitre} accessibilityRole="header">
                {resume.titre}
              </Text>
            </View>
            {etat.joursRestants > 0 && etat.statut !== "SUSPENDU" && etat.statut !== "RESILIE" && (
              <View style={styles.heroCompte} accessible accessibilityLabel={`${etat.joursRestants} jours restants`}>
                <Text style={[styles.heroCompteChiffre, { color: NIVEAUX[resume.niveau].texte }]}>{etat.joursRestants}</Text>
                <Text style={styles.heroCompteTexte}>{etat.joursRestants > 1 ? "jours" : "jour"}</Text>
              </View>
            )}
          </View>
          <Text style={styles.etatDetail}>{resume.detail}</Text>
          <View style={styles.faits}>
            <Fait icone={<Crown size={13} color={couleurs.encreAttenuee} />} libelle="Formule" valeur={vue?.formuleActuelle ? nomFormule(vue.formuleActuelle, vue.formules) : etat.statut === "ESSAI" ? "Essai gratuit" : "Aucune"} />
            {vue && <Fait icone={<BedDouble size={13} color={couleurs.encreAttenuee} />} libelle="Chambres" valeur={String(vue.nombreChambres)} />}
            <Fait icone={<CalendarClock size={13} color={couleurs.encreAttenuee} />} libelle="Jusqu'au" valeur={dateAbonnement(etat.valideJusquau)} />
          </View>
        </View>
      )}

      {!estPatron && (
        <Message>
          {nonRenouvelable
            ? "Prévenez le patron : l'accès doit être rouvert par le support HotelSaver."
            : resume && resume.niveau !== "ok"
              ? "Demandez au patron de renouveler."
              : "Seul le patron peut renouveler l'abonnement."}
        </Message>
      )}

      {estPatron && !PAIEMENT_DANS_APPLICATION && !nonRenouvelable && (
        <View style={styles.carte}>
          <Text style={styles.encadreTexte}>{TEXTE_RENOUVELER_AILLEURS}</Text>
          {etat?.statut === "ESSAI" && <Text style={styles.aide}>Si vous payez pendant l'essai, aucun jour d'essai n'est perdu : ils s'ajoutent à votre abonnement.</Text>}
          {AFFICHER_LIEN_PAIEMENT_SITE && (vue?.urlPaiementSite ?? URL_PAIEMENT_SITE_SECOURS) && (
            <>
              <Bouton
                libelle="Payer sur le site HotelSaver"
                onPress={() => {
                  setErreurSite(null);
                  ouvrirLienSur(vue?.urlPaiementSite ?? URL_PAIEMENT_SITE_SECOURS).catch(() => setErreurSite("Le navigateur ne s'est pas ouvert. Contactez le support HotelSaver."));
                }}
              />
              <Text style={styles.aide}>Le site s'ouvre dans votre navigateur. Connectez-vous avec le compte du patron, puis payez par Mobile Money.</Text>
              {erreurSite && (
                <Text style={styles.erreur} accessibilityRole="alert">
                  {erreurSite}
                </Text>
              )}
            </>
          )}
        </View>
      )}
      {estPatron && !PAIEMENT_DANS_APPLICATION && nonRenouvelable && <Message>Contactez le support HotelSaver pour rouvrir l'accès de votre hôtel.</Message>}

      {peutPayer && nonRenouvelable && <Message>Contactez le support HotelSaver pour rouvrir l'accès de votre hôtel.</Message>}

      {peutPayer && !nonRenouvelable && chargement && !vue && (
        <View style={styles.centre}>
          <ActivityIndicator color={couleurs.bleu} accessibilityLabel="Chargement de l'abonnement" />
          <Text style={styles.textePhase}>Chargement…</Text>
        </View>
      )}

      {peutPayer && !nonRenouvelable && !vue && erreurVue && (
        <View style={styles.carte}>
          <Text style={styles.erreur} accessibilityRole="alert">
            {erreurVue.horsLigne ? "Connectez-vous à Internet pour renouveler." : erreurVue.texte}
          </Text>
          <Bouton libelle="Réessayer" variante="secondaire" onPress={() => void charger()} occupe={chargement} />
        </View>
      )}

      {peutPayer && !nonRenouvelable && dejaActif && (
        <View style={styles.carte}>
          <View style={styles.centre}>
            <CircleCheck size={40} color={couleurs.succes} />
            <Text style={styles.titrePhase} accessibilityRole="header">Votre abonnement est actif</Text>
            <Text style={styles.textePhase}>L'application peut de nouveau s'ouvrir.</Text>
          </View>
          {erreurContinuer && <Text style={styles.erreur} accessibilityRole="alert">{erreurContinuer}</Text>}
          <Bouton libelle="Continuer" onPress={() => void continuer()} occupe={continuerEnCours} />
        </View>
      )}

      {peutPayer && !nonRenouvelable && vue && !dejaActif && !vue.paiementEnLigne && <Message>Le paiement en ligne n'est pas encore disponible, contactez le support HotelSaver.</Message>}

      {peutPayer && !nonRenouvelable && vue && !dejaActif && vue.paiementEnLigne && (
        <>
          {etat?.statut === "ESSAI" && mode !== "bloque" && (
            <View style={styles.astuce}>
              <Gift size={16} color={couleurs.succes} />
              <Text style={styles.astuceTexte}>Vous payez avant la fin de l'essai ? Aucun jour n'est perdu : ils s'ajoutent à votre abonnement.</Text>
            </View>
          )}

          <Section numero={1} titre="Choisissez votre formule">
            <View accessibilityRole="radiogroup" style={styles.colonne}>
              {vue.formules.map((f) => {
                const accessible = formuleAccessible(f, vue.nombreChambres);
                const choisie = f.code === formule;
                const mensuel = devise === "CDF" ? (f.durees.find((d) => d.mois === 1)?.prixCdf ?? null) : null;
                const prixMois = mensuel !== null ? montantAbonnement(mensuel, "CDF") : montantAbonnement(f.prixMensuelUsd, "USD");
                const plafond = f.maxChambres === null ? "Chambres illimitées" : `Jusqu'à ${f.maxChambres} chambres`;
                const raison = accessible ? null : `Trop petite pour vos ${vue.nombreChambres} chambres (maximum ${f.maxChambres}).`;
                return (
                  <Pressable
                    key={f.code}
                    style={({ pressed }) => [styles.formule, choisie && styles.formuleChoisie, !accessible && styles.formuleGrisee, pressed && accessible && styles.presse]}
                    onPress={() => accessible && setFormule(f.code)}
                    disabled={!accessible}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: choisie, disabled: !accessible }}
                    accessibilityLabel={`Formule ${f.nom}, ${prixMois} par mois, ${plafond}${f.recommandee ? ", le plus choisi" : ""}${raison ? `. ${raison}` : ""}`}
                  >
                    {(f.recommandee || vue.formuleActuelle === f.code) && (
                      <View style={styles.formuleEtiquettes}>
                        {f.recommandee && (
                          <View style={styles.pastilleBleue}>
                            <Sparkles size={11} color="#fff" />
                            <Text style={styles.pastilleBleueTexte}>Le plus choisi</Text>
                          </View>
                        )}
                        {vue.formuleActuelle === f.code && (
                          <View style={styles.pastilleNeutre}>
                            <Text style={styles.pastilleNeutreTexte}>Votre formule</Text>
                          </View>
                        )}
                      </View>
                    )}
                    <View style={styles.formuleEntete}>
                      <Text style={styles.formuleNom}>{f.nom}</Text>
                      <Coche active={choisie} />
                    </View>
                    <Text style={styles.formulePrix}>
                      {prixMois}
                      <Text style={styles.formulePrixUnite}> / mois</Text>
                    </Text>
                    <View style={styles.formulePlafondLigne}>
                      <BedDouble size={14} color={couleurs.encre} />
                      <Text style={styles.formulePlafond}>{plafond}</Text>
                    </View>
                    {raison && <Text style={styles.formuleRaison}>{raison}</Text>}
                    {/* Inclus : dépliés pour la formule choisie seulement, pour garder la liste courte à l'écran. */}
                    {choisie && (
                      <View style={styles.formuleInclus}>
                        {f.inclus
                          .filter((ligne) => !/^(jusqu'à \d+ chambres|chambres illimitées)$/i.test(ligne.trim()))
                          .map((ligne) => (
                            <View key={ligne} style={styles.inclus}>
                              <Check size={14} color={couleurs.succes} />
                              <Text style={styles.inclusTexte}>{ligne}</Text>
                            </View>
                          ))}
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </Section>

          {formuleChoisie && (
            <Section numero={2} titre="Combien de temps ?">
              <View accessibilityRole="radiogroup" style={styles.grille}>
                {formuleChoisie.durees.map((d) => {
                  const actif = duree?.mois === d.mois;
                  const valeur = devise === "USD" ? d.prixUsd : d.prixCdf;
                  const prix = montantAbonnement(valeur, devise);
                  return (
                    <Pressable
                      key={d.mois}
                      style={({ pressed }) => [styles.tuile, actif && styles.tuileActive, pressed && styles.presse]}
                      onPress={() => setMois(d.mois)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: actif }}
                      accessibilityLabel={`${d.mois} mois, ${prix}${d.moisOfferts > 0 ? `, dont ${d.moisOfferts} mois offerts` : ""}`}
                    >
                      <Text style={styles.tuileTitre}>{d.mois} mois</Text>
                      <Text style={styles.tuilePrix}>{prix}</Text>
                      {d.mois > 1 && <Text style={styles.tuileSous}>soit {montantAbonnement(arrondiCentimes(valeur / d.mois), devise)} / mois</Text>}
                      {d.moisOfferts > 0 && (
                        <View style={styles.offert}>
                          <Gift size={11} color={couleurs.succes} />
                          <Text style={styles.offertTexte}>{d.moisOfferts} mois offerts</Text>
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </Section>
          )}

          <Section numero={3} titre="Monnaie">
            <View accessibilityRole="radiogroup" style={styles.segment}>
              {(["USD", "CDF"] as const).map((d) => {
                const actif = devise === d;
                return (
                  <Pressable
                    key={d}
                    style={[styles.segmentOption, actif && styles.segmentOptionActive]}
                    onPress={() => setDevise(d)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: actif }}
                    accessibilityLabel={d === "USD" ? "Payer en dollars" : "Payer en francs congolais"}
                  >
                    <Text style={[styles.segmentTexte, actif && styles.segmentTexteActif]}>{d === "USD" ? "$  Dollars" : "FC  Francs congolais"}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Section>

          <Section numero={4} titre="Payer avec Mobile Money">
            <View accessibilityRole="radiogroup" style={styles.grille}>
              {LISTE_OPERATEURS.map((o) => {
                const actif = operateur === o;
                return (
                  <Pressable
                    key={o}
                    style={({ pressed }) => [styles.reseau, actif && styles.reseauActif, pressed && styles.presse]}
                    onPress={() => setOperateur(o)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: actif }}
                    accessibilityLabel={OPERATEURS_MOBILE_MONEY[o].libelle}
                  >
                    <LogoOperateur operateur={o} taille={36} />
                    {/* « M-Pesa (Vodacom) » : la marque en gras, l'opérateur dessous — tient dans une demi-largeur d'écran. */}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reseauNom} numberOfLines={2}>
                        {OPERATEURS_MOBILE_MONEY[o].libelle.split(" (")[0]}
                      </Text>
                      {OPERATEURS_MOBILE_MONEY[o].libelle.includes(" (") && <Text style={styles.reseauSous}>{OPERATEURS_MOBILE_MONEY[o].libelle.split(" (")[1].replace(")", "")}</Text>}
                    </View>
                    <Coche active={actif} />
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.libelle, { marginTop: espacements.s3 }]}>Numéro Mobile Money</Text>
            <View style={[styles.champBoite, probleme ? styles.champErreur : null]}>
              {operateurDuNumero(telephone) ? <LogoOperateur operateur={operateurDuNumero(telephone)!} taille={26} /> : <Smartphone size={18} color={couleurs.encreAttenuee} />}
              <TextInput
                style={styles.champ}
                value={telephone}
                onChangeText={saisirNumero}
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                placeholder="Exemple : 0828 497 218"
                placeholderTextColor={couleurs.encreFaible}
                maxLength={20}
                accessibilityLabel="Numéro Mobile Money qui recevra la demande de paiement"
              />
            </View>
            {probleme ? (
              <View style={styles.erreurLigne}>
                <AlertTriangle size={14} color={couleurs.danger} />
                <Text style={[styles.erreur, { flex: 1 }]} accessibilityRole="alert">
                  {probleme}
                </Text>
              </View>
            ) : (
              <Text style={styles.aide}>
                {operateurDuNumero(telephone) ? `Réseau reconnu : ${OPERATEURS_MOBILE_MONEY[operateurDuNumero(telephone)!].libelle}. ` : ""}C'est sur ce numéro que vous recevrez la demande de paiement.
              </Text>
            )}
          </Section>

          {formuleChoisie && duree && montant !== null && (
            <View style={styles.commande} accessibilityRole="summary">
              <Text style={styles.surtitre}>VOTRE COMMANDE</Text>
              <LigneRecap libelle={`Formule ${formuleChoisie.nom}`} valeur={texteMontant} fort />
              <LigneRecap libelle="Durée" valeur={`${duree.mois} mois${duree.moisOfferts > 0 ? ` (dont ${duree.moisOfferts} offerts)` : ""}`} />
              {fraisPayeur > 0 && <LigneRecap libelle="Frais ScanLinkPay" valeur={texteFrais} />}
              {operateur && <LigneRecap libelle="Payé avec" valeur={OPERATEURS_MOBILE_MONEY[operateur].libelle} operateur={operateur} />}
              <View style={styles.total} accessibilityLiveRegion="polite">
                <Text style={styles.totalLibelle}>Total à payer</Text>
                <Text style={styles.totalMontant}>{calculFraisEnCours ? "…" : texteTotal}</Text>
              </View>
              {calculFraisEnCours && <Text style={styles.aide}>Calcul des frais ScanLinkPay…</Text>}
              <Text style={styles.recapTexte}>
                Une demande de confirmation va arriver sur {numeroLisible(telephone) ? `le ${numeroLisible(telephone)}` : "le numéro saisi"}. Entrez votre code secret Mobile Money pour confirmer : rien n'est débité sans lui.
              </Text>

              {suiviEtat.message && <Text style={styles.erreur} accessibilityRole="alert">{messageErreur(suiviEtat.message, "Le paiement n'a pas pu être lancé. Réessayez.")}</Text>}

              <Bouton
                libelle={calculFraisEnCours ? "Calcul du total…" : texteTotal ? `Payer ${texteTotal}` : "Payer"}
                onPress={demanderPaiement}
                desactive={!formulaireValide || calculFraisEnCours}
                icone={<Lock size={16} color="#fff" />}
              />
              {!formulaireValide && <Text style={[styles.aide, { textAlign: "center" }]}>{!operateur ? "Choisissez votre réseau Mobile Money pour continuer." : "Saisissez un numéro Mobile Money valide pour continuer."}</Text>}
              <View style={styles.securise} accessible accessibilityLabel="Paiement sécurisé par ScanLinkPay">
                <ShieldCheck size={13} color={couleurs.encreAttenuee} />
                <Text style={styles.securiseTexte}>Paiement sécurisé par ScanLinkPay</Text>
              </View>
              <View style={{ alignItems: "center" }}>
                <LogosMobileMoney taille={22} />
              </View>
            </View>
          )}
        </>
      )}

      {mode === "bloque" && !dejaActif && (
        <Bouton libelle="Vérifier mon abonnement" variante="secondaire" onPress={() => void charger()} occupe={chargement} />
      )}

      <BlocAide contact={choisirContactSupport(vue?.contactSupport)} />

      {vue && estPatron && (
        <Section titre="Paiements précédents">
          {vue.historique.length === 0 ? (
            <Text style={styles.aide}>Aucun paiement pour le moment.</Text>
          ) : (
            vue.historique.map((p) => <LignePaiement key={p.id} paiement={p} />)
          )}
        </Section>
      )}
    </View>
  );
}

function Section({ titre, numero, children }: { titre: string; numero?: number; children: React.ReactNode }) {
  return (
    <View style={[styles.section, numero !== undefined && styles.sectionCarte]}>
      <View style={styles.sectionEntete}>
        {numero !== undefined && (
          <View style={styles.sectionNumero}>
            <Text style={styles.sectionNumeroTexte}>{numero}</Text>
          </View>
        )}
        <Text style={styles.sectionTitre} accessibilityRole="header" accessibilityLabel={numero !== undefined ? `Étape ${numero} : ${titre}` : titre}>
          {titre}
        </Text>
      </View>
      {children}
    </View>
  );
}

/** Pastille ronde cochée / vide (formules, réseaux). */
function Coche({ active }: { active: boolean }) {
  return <View style={[styles.coche, active && styles.cocheActive]}>{active && <Check size={13} color="#fff" />}</View>;
}

/** Logo du réseau entouré d'une onde qui bat pendant l'attente de la confirmation. */
function Pulsation({ children }: { children: React.ReactNode }) {
  const onde = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const boucle = Animated.loop(Animated.timing(onde, { toValue: 1, duration: 1600, easing: Easing.out(Easing.ease), useNativeDriver: true }));
    boucle.start();
    return () => boucle.stop();
  }, [onde]);
  return (
    <View style={styles.pulsation}>
      <Animated.View
        style={[
          styles.pulsationOnde,
          { opacity: onde.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }), transform: [{ scale: onde.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.25] }) }] },
        ]}
      />
      <View style={styles.pulsationCentre}>{children}</View>
    </View>
  );
}

function EtapeProgression({ etat, numero, libelle }: { etat: "fait" | "encours" | "avenir"; numero: number; libelle: string }) {
  const couleur = etat === "fait" ? couleurs.succes : etat === "encours" ? couleurs.bleu : couleurs.encreFaible;
  return (
    <View style={styles.etapeProgression} accessible accessibilityLabel={`${libelle}${etat === "fait" ? ", fait" : etat === "encours" ? ", en cours" : ""}`}>
      <View style={[styles.etapePoint, { borderColor: couleur }, etat === "fait" && { backgroundColor: couleur }]}>
        {etat === "fait" ? <Check size={12} color="#fff" /> : <Text style={[styles.etapePointTexte, { color: couleur }]}>{numero}</Text>}
      </View>
      <Text style={[styles.etapeTexte, { color: etat === "avenir" ? couleurs.encreAttenuee : couleur }]}>{libelle}</Text>
    </View>
  );
}

function LigneRecap({ libelle, valeur, fort, operateur }: { libelle: string; valeur: string; fort?: boolean; operateur?: OperateurMobileMoney }) {
  return (
    <View style={styles.ligneRecap}>
      <Text style={[styles.ligneRecapLibelle, fort && styles.ligneRecapFort]}>{libelle}</Text>
      <View style={styles.ligneRecapValeur}>
        {operateur && <LogoOperateur operateur={operateur} taille={20} />}
        <Text style={[styles.ligneRecapTexte, fort && styles.ligneRecapFort]}>{valeur}</Text>
      </View>
    </View>
  );
}

function Fait({ icone, libelle, valeur }: { icone: React.ReactNode; libelle: string; valeur: string }) {
  return (
    <View style={styles.fait} accessible accessibilityLabel={`${libelle} : ${valeur}`}>
      <View style={styles.faitLibelle}>
        {icone}
        <Text style={styles.faitLibelleTexte}>{libelle}</Text>
      </View>
      <Text style={styles.faitValeur}>{valeur}</Text>
    </View>
  );
}

function Message({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.encadreInfo}>
      <Info size={18} color={couleurs.info} />
      <Text style={[styles.encadreTexte, { flex: 1 }]}>{children}</Text>
    </View>
  );
}

function Bouton({ libelle, onPress, desactive, occupe, variante = "principal", icone }: { libelle: string; onPress: () => void; desactive?: boolean; occupe?: boolean; variante?: "principal" | "secondaire"; icone?: React.ReactNode }) {
  const inactif = !!desactive || !!occupe;
  return (
    <Pressable
      style={[styles.bouton, variante === "secondaire" && styles.boutonSecondaire, inactif && styles.boutonInactif]}
      onPress={onPress}
      disabled={inactif}
      accessibilityRole="button"
      accessibilityLabel={libelle}
      accessibilityState={{ disabled: inactif, busy: !!occupe }}
    >
      {occupe ? (
        <ActivityIndicator color={variante === "secondaire" ? couleurs.bleu : "#fff"} />
      ) : (
        <View style={styles.boutonContenu}>
          {icone}
          <Text style={[styles.boutonTexte, variante === "secondaire" && styles.boutonTexteSecondaire]}>{libelle}</Text>
        </View>
      )}
    </Pressable>
  );
}

function LignePaiement({ paiement: p }: { paiement: PaiementAbonnementVue }) {
  const statut = STATUTS_PAIEMENT[p.statut];
  const moyen =
    p.source === "SUPPORT"
      ? "Enregistré par le support"
      : `${p.operateur ? (LIBELLE_OPERATEUR[p.operateur] ?? p.operateur) : "Mobile Money"}${p.telephoneMasque ? ` · ${p.telephoneMasque}` : ""}`;
  const montant = montantAbonnement(p.montant, p.devise);
  // Frais ScanLinkPay payés en plus du prix, quand ils sont connus (paiement en ligne réussi).
  const frais = typeof p.commission === "number" && typeof p.total === "number" && p.commission > 0 ? montantAbonnement(p.commission, p.devise) : null;
  const total = frais !== null && typeof p.total === "number" ? montantAbonnement(p.total, p.devise) : null;
  const detailFrais = frais !== null && total !== null ? `Prix ${montant} + frais ScanLinkPay ${frais} = ${total}` : null;
  return (
    <View style={styles.ligne} accessible accessibilityLabel={`${dateAbonnement(p.createdAt)}, ${detailFrais ?? montant}, ${p.mois > 0 ? `${p.mois} mois` : "paiement manuel"}, ${moyen}, ${statut.libelle}`}>
      <View style={{ flex: 1 }}>
        <Text style={styles.ligneMontant}>{total ?? montant}</Text>
        {detailFrais && <Text style={styles.ligneDetail}>{detailFrais}</Text>}
        <Text style={styles.ligneDetail}>
          {dateAbonnement(p.createdAt)}
          {p.mois > 0 ? ` · ${p.mois} mois` : " · Paiement manuel"}
        </Text>
        <Text style={styles.ligneDetail}>{moyen}</Text>
      </View>
      <View style={[styles.statut, { backgroundColor: statut.fond }]}>
        <Text style={[styles.statutTexte, { color: statut.texte }]}>{statut.libelle}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  colonne: { gap: espacements.s3 },
  carte: {
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espacements.s4,
    gap: espacements.s3,
  },
  bloc: { gap: espacements.s3 },
  centre: { alignItems: "center", gap: espacements.s2, paddingVertical: espacements.s3 },
  etatTitre: { fontSize: 18, fontWeight: "800", color: couleurs.navy },
  etatDetail: { fontSize: 14, color: couleurs.encre, lineHeight: 20 },
  faits: { flexDirection: "row", flexWrap: "wrap", gap: espacements.s2 },
  fait: { flexGrow: 1, gap: 2, paddingVertical: espacements.s2, paddingHorizontal: espacements.s3, borderRadius: rayons.md, backgroundColor: couleurs.surface100, borderWidth: 1, borderColor: couleurs.bordure },
  titrePhase: { fontSize: 18, fontWeight: "700", color: couleurs.navy, textAlign: "center" },
  textePhase: { fontSize: 14, color: couleurs.encre, textAlign: "center", lineHeight: 20 },
  petit: { fontSize: 12, color: couleurs.encreAttenuee, textAlign: "center" },
  compteur: { fontSize: 22, fontWeight: "700", color: couleurs.navy },
  encadreInfo: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    gap: espacements.s2,
    backgroundColor: couleurs.infoClair,
    borderRadius: rayons.md,
    padding: espacements.s3,
  },
  encadreTitre: { width: "100%", fontSize: 14, fontWeight: "700", color: couleurs.encre },
  encadreTexte: { fontSize: 14, color: couleurs.encre, lineHeight: 20 },
  section: { gap: espacements.s2, marginTop: espacements.s2 },
  sectionTitre: { fontSize: 16, fontWeight: "700", color: couleurs.navy },
  libelle: { fontSize: 13, fontWeight: "600", color: couleurs.encre },
  aide: { fontSize: 12, color: couleurs.encreAttenuee },
  erreur: { fontSize: 13, color: couleurs.danger, fontWeight: "600" },
  rangee: { flexDirection: "row", flexWrap: "wrap", gap: espacements.s2 },
  choix: {
    minHeight: 48,
    minWidth: 44,
    paddingHorizontal: espacements.s4,
    paddingVertical: espacements.s2,
    borderRadius: rayons.md,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.surface200,
    alignItems: "center",
    justifyContent: "center",
  },
  choixDuree: { minWidth: 96, gap: 2 },
  choixActif: { backgroundColor: couleurs.bleu, borderColor: couleurs.bleu },
  choixTexte: { fontSize: 14, fontWeight: "700", color: couleurs.encre, textAlign: "center" },
  choixTexteActif: { color: "#fff" },
  choixSous: { fontSize: 12, color: couleurs.encre, textAlign: "center" },
  choixOffre: { fontSize: 11, fontWeight: "700", color: couleurs.succes, textAlign: "center" },
  formule: {
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg,
    borderWidth: 2,
    borderColor: couleurs.bordure,
    padding: espacements.s4,
    gap: espacements.s1,
    minHeight: 44,
  },
  formuleChoisie: { borderColor: couleurs.bleu, backgroundColor: couleurs.bleuClair },
  formuleGrisee: { opacity: 0.6 },
  formuleEntete: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: espacements.s2 },
  formuleNom: { fontSize: 18, fontWeight: "700", color: couleurs.navy },
  formulePrix: { fontSize: 20, fontWeight: "700", color: couleurs.encre },
  formulePrixUnite: { fontSize: 13, fontWeight: "400", color: couleurs.encreAttenuee },
  formulePlafond: { fontSize: 13, fontWeight: "600", color: couleurs.encre },
  formuleRaison: { fontSize: 13, fontWeight: "600", color: couleurs.danger },
  inclus: { flexDirection: "row", alignItems: "flex-start", gap: espacements.s2 },
  inclusTexte: { flex: 1, fontSize: 13, color: couleurs.encre },
  pastilleBleue: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: couleurs.bleu, borderRadius: rayons.pill, paddingHorizontal: espacements.s2, paddingVertical: 2 },
  pastilleBleueTexte: { color: "#fff", fontSize: 11, fontWeight: "700" },
  pastilleNeutre: { backgroundColor: couleurs.surface100, borderWidth: 1, borderColor: couleurs.bordure, borderRadius: rayons.pill, paddingHorizontal: espacements.s2, paddingVertical: 2 },
  pastilleNeutreTexte: { color: couleurs.encre, fontSize: 11, fontWeight: "700" },
  champ: { flex: 1, minHeight: 48, fontSize: 17, letterSpacing: 0.5, color: couleurs.encre },
  champErreur: { borderColor: couleurs.danger },
  recap: { backgroundColor: couleurs.bleuClair, borderRadius: rayons.md, padding: espacements.s3, gap: espacements.s1 },
  recapTitre: { fontSize: 15, fontWeight: "700", color: couleurs.navy },
  recapTexte: { fontSize: 14, color: couleurs.encre, lineHeight: 20 },
  recapDetail: { fontSize: 14, fontWeight: "600", color: couleurs.encre, lineHeight: 20 },
  securise: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: espacements.s1 },
  securiseTexte: { fontSize: 12, color: couleurs.encreAttenuee },
  bouton: {
    minHeight: 52,
    borderRadius: rayons.md,
    backgroundColor: couleurs.bleu,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: espacements.s4,
  },
  boutonSecondaire: { backgroundColor: couleurs.surface200, borderWidth: 1, borderColor: couleurs.bleu },
  boutonInactif: { opacity: 0.5 },
  boutonTexte: { color: "#fff", fontSize: 16, fontWeight: "700" },
  boutonTexteSecondaire: { color: couleurs.bleu },
  ligne: {
    flexDirection: "row",
    alignItems: "center",
    gap: espacements.s3,
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.md,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espacements.s3,
    minHeight: 44,
  },
  ligneMontant: { fontSize: 15, fontWeight: "700", color: couleurs.encre },
  ligneDetail: { fontSize: 12, color: couleurs.encreAttenuee },
  statut: { borderRadius: rayons.pill, paddingHorizontal: espacements.s3, paddingVertical: 4 },
  statutTexte: { fontSize: 12, fontWeight: "700" },
  hero: {
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderLeftWidth: 5,
    padding: espacements.s4,
    gap: espacements.s3,
  },
  heroHaut: { flexDirection: "row", alignItems: "center", gap: espacements.s3 },
  heroIcone: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  surtitre: { fontSize: 11, fontWeight: "700", letterSpacing: 1, color: couleurs.encreAttenuee },
  heroCompte: {
    alignItems: "center",
    minWidth: 58,
    paddingVertical: espacements.s1,
    paddingHorizontal: espacements.s2,
    borderRadius: rayons.md,
    backgroundColor: couleurs.surface100,
    borderWidth: 1,
    borderColor: couleurs.bordure,
  },
  heroCompteChiffre: { fontSize: 24, fontWeight: "800", lineHeight: 28 },
  heroCompteTexte: { fontSize: 11, color: couleurs.encreAttenuee },
  faitLibelle: { flexDirection: "row", alignItems: "center", gap: 4 },
  faitLibelleTexte: { fontSize: 11, color: couleurs.encreAttenuee },
  faitValeur: { fontSize: 13, fontWeight: "700", color: couleurs.navy },
  astuce: { flexDirection: "row", gap: espacements.s2, backgroundColor: couleurs.succesClair, borderRadius: rayons.md, padding: espacements.s3 },
  astuceTexte: { flex: 1, fontSize: 13, fontWeight: "600", color: couleurs.succes, lineHeight: 19 },
  sectionCarte: {
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espacements.s4,
    gap: espacements.s3,
    marginTop: 0,
  },
  sectionEntete: { flexDirection: "row", alignItems: "center", gap: espacements.s2 },
  sectionNumero: { width: 26, height: 26, borderRadius: 13, backgroundColor: couleurs.bleu, alignItems: "center", justifyContent: "center" },
  sectionNumeroTexte: { color: "#fff", fontSize: 13, fontWeight: "800" },
  presse: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  formuleEtiquettes: { flexDirection: "row", flexWrap: "wrap", gap: espacements.s2, marginBottom: 2 },
  formulePlafondLigne: { flexDirection: "row", alignItems: "center", gap: 6 },
  formuleInclus: { gap: 6, marginTop: espacements.s2, paddingTop: espacements.s2, borderTopWidth: 1, borderTopColor: couleurs.bordure, borderStyle: "dashed" },
  grille: { flexDirection: "row", flexWrap: "wrap", gap: espacements.s2 },
  tuile: {
    flexBasis: "47%",
    flexGrow: 1,
    minHeight: 64,
    padding: espacements.s3,
    borderRadius: rayons.md,
    borderWidth: 2,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.surface100,
    gap: 2,
  },
  tuileActive: { borderColor: couleurs.bleu, backgroundColor: couleurs.bleuClair },
  tuileTitre: { fontSize: 14, fontWeight: "800", color: couleurs.navy },
  tuilePrix: { fontSize: 17, fontWeight: "700", color: couleurs.encre },
  tuileSous: { fontSize: 11, color: couleurs.encreAttenuee },
  offert: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", marginTop: 4, backgroundColor: couleurs.succesClair, borderRadius: rayons.pill, paddingHorizontal: 8, paddingVertical: 2 },
  offertTexte: { fontSize: 11, fontWeight: "700", color: couleurs.succes },
  segment: { flexDirection: "row", gap: 4, padding: 4, borderRadius: rayons.pill, backgroundColor: couleurs.surface100, borderWidth: 1, borderColor: couleurs.bordure },
  segmentOption: { flex: 1, minHeight: 44, borderRadius: rayons.pill, alignItems: "center", justifyContent: "center", paddingHorizontal: espacements.s2 },
  segmentOptionActive: { backgroundColor: couleurs.surface200, elevation: 2, shadowColor: "#0F2742", shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  segmentTexte: { fontSize: 13, fontWeight: "600", color: couleurs.encreAttenuee, textAlign: "center" },
  segmentTexteActif: { color: couleurs.navy, fontWeight: "800" },
  reseau: {
    flexBasis: "47%",
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: espacements.s2,
    minHeight: 60,
    padding: espacements.s2,
    borderRadius: rayons.md,
    borderWidth: 2,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.surface100,
  },
  reseauActif: { borderColor: couleurs.bleu, backgroundColor: couleurs.bleuClair },
  reseauNom: { fontSize: 13, fontWeight: "700", color: couleurs.encre },
  reseauSous: { fontSize: 11, color: couleurs.encreAttenuee },
  champBoite: {
    flexDirection: "row",
    alignItems: "center",
    gap: espacements.s2,
    minHeight: 52,
    borderWidth: 2,
    borderColor: couleurs.bordure,
    borderRadius: rayons.md,
    paddingHorizontal: espacements.s3,
    backgroundColor: couleurs.surface100,
  },
  erreurLigne: { flexDirection: "row", alignItems: "center", gap: 6 },
  commande: {
    backgroundColor: couleurs.surface200,
    borderRadius: rayons.lg,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    padding: espacements.s4,
    gap: espacements.s2,
    elevation: 3,
    shadowColor: "#0F2742",
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  total: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingTop: espacements.s2, marginTop: espacements.s1, borderTopWidth: 1, borderTopColor: couleurs.bordure, borderStyle: "dashed" },
  totalLibelle: { fontSize: 15, fontWeight: "700", color: couleurs.navy },
  totalMontant: { fontSize: 26, fontWeight: "800", color: couleurs.navy },
  coche: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: couleurs.bordure, alignItems: "center", justifyContent: "center" },
  cocheActive: { backgroundColor: couleurs.bleu, borderColor: couleurs.bleu },
  pulsation: { width: 104, height: 104, alignItems: "center", justifyContent: "center" },
  pulsationOnde: { position: "absolute", width: 104, height: 104, borderRadius: 52, borderWidth: 3, borderColor: couleurs.bleu },
  pulsationCentre: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: couleurs.surface100,
    borderWidth: 1,
    borderColor: couleurs.bordure,
  },
  progression: { gap: espacements.s2, alignSelf: "center" },
  etapeProgression: { flexDirection: "row", alignItems: "center", gap: espacements.s2 },
  etapePoint: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  etapePointTexte: { fontSize: 12, fontWeight: "700" },
  etapeTexte: { fontSize: 13, fontWeight: "600" },
  ligneRecap: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: espacements.s3 },
  ligneRecapLibelle: { fontSize: 13, color: couleurs.encreAttenuee, flexShrink: 1 },
  ligneRecapValeur: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  ligneRecapTexte: { fontSize: 13, fontWeight: "600", color: couleurs.encre, textAlign: "right" },
  ligneRecapFort: { fontSize: 14, fontWeight: "700", color: couleurs.encre },
  resultat: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  recu: { gap: espacements.s2, backgroundColor: couleurs.surface100, borderRadius: rayons.md, borderWidth: 1, borderColor: couleurs.bordure, padding: espacements.s3 },
  boutonContenu: { flexDirection: "row", alignItems: "center", gap: espacements.s2 },
});
