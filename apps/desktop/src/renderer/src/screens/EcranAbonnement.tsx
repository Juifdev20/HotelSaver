import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ErreurApi } from "@hotel-chicago/api-client";
import type { ClientApi } from "@hotel-chicago/api-client";
import { SuiviPaiementAbonnement } from "@hotel-chicago/miroir-local";
import type { EtatSuiviPaiement } from "@hotel-chicago/miroir-local";
import {
  LISTE_OPERATEURS,
  OPERATEURS_MOBILE_MONEY,
  actualiserEtatAbonnement,
  dateAbonnement,
  masquerNumero,
  montantAbonnement,
  operateurDuNumero,
  problemeNumero,
  resumerAbonnement,
} from "@hotel-chicago/regles";
import { Role } from "@hotel-chicago/types";
import type {
  ApercuPaiement,
  EtatAbonnement,
  FormuleProposee,
  OperateurMobileMoney,
  PaiementAbonnementVue,
  ProfilConnecte,
  StatutPaiementAbonnement,
  VueAbonnement,
} from "@hotel-chicago/types";
import { Button, LogoOperateur, LogosMobileMoney, StatusBadge, useTitrePage } from "@hotel-chicago/ui";
import type { StatusTone } from "@hotel-chicago/ui";
import { AlertTriangle, BedDouble, CalendarClock, Check, CheckCircle2, CircleCheck, Crown, Gift, Info, Lock, Receipt, ShieldCheck, Smartphone, Sparkles, XCircle } from "lucide-react";
import { BlocAide } from "../components/BlocAide";
import "./abonnement.css";
import "./abonnement-pro.css";

// ---------------------------------------------------------------------------------------------------------------------------------
// Lecture de l'abonnement (état, formules, prix, historique) : toujours auprès du serveur, qui est la référence pour les prix.

export interface ErreurVueAbonnement {
  message: string;
  /** Aucune réponse du serveur : l'ordinateur n'est pas connecté à Internet. */
  horsLigne: boolean;
}

export interface LectureAbonnement {
  vue: VueAbonnement | null;
  erreur: ErreurVueAbonnement | null;
  chargement: boolean;
  recharger: () => void;
}

export function useVueAbonnement(client: ClientApi, horsLigne: boolean): LectureAbonnement {
  const [vue, setVue] = useState<VueAbonnement | null>(null);
  const [erreur, setErreur] = useState<ErreurVueAbonnement | null>(null);
  const [chargement, setChargement] = useState(!horsLigne);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (horsLigne) {
      setChargement(false);
      return;
    }
    let actif = true;
    setChargement(true);
    client
      .abonnement()
      .then((v) => {
        if (!actif) return;
        setVue(v);
        setErreur(null);
      })
      .catch((e: unknown) => {
        if (!actif) return;
        const coupure = e instanceof ErreurApi && e.statusCode === 0;
        setErreur({
          horsLigne: coupure,
          message: coupure ? "Connectez-vous à Internet pour renouveler." : "Impossible de lire votre abonnement pour le moment. Réessayez dans un instant.",
        });
      })
      .finally(() => {
        if (actif) setChargement(false);
      });
    return () => {
      actif = false;
    };
  }, [client, horsLigne, version]);

  return { vue, erreur, chargement, recharger: () => setVersion((v) => v + 1) };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Petits outils d'affichage

const duree = (mois: number) => `${mois} mois`;
const nomFormule = (code: string | null | undefined, formules?: FormuleProposee[]) =>
  code ? (formules?.find((f) => f.code === code)?.nom ?? code.charAt(0) + code.slice(1).toLowerCase()) : null;

/** Les lignes « Jusqu'à N chambres » / « Chambres illimitées » sont déjà montrées à part sur la carte. */
const estLignePlafond = (ligne: string) => /^(jusqu'à \d+ chambres|chambres illimitées)$/i.test(ligne.trim());

const TON_STATUT: Record<StatutPaiementAbonnement, { ton: StatusTone; libelle: string }> = {
  REUSSI: { ton: "success", libelle: "Payé" },
  EN_ATTENTE: { ton: "warning", libelle: "En attente" },
  ECHEC: { ton: "danger", libelle: "Échoué" },
  EXPIRE: { ton: "neutral", libelle: "Expiré" },
};

function IconeNiveau({ niveau }: { niveau: "ok" | "attention" | "danger" }) {
  if (niveau === "ok") return <CircleCheck size={22} aria-hidden="true" />;
  if (niveau === "attention") return <AlertTriangle size={22} aria-hidden="true" />;
  return <XCircle size={22} aria-hidden="true" />;
}

/** Temps écoulé qui avance chaque seconde entre deux réponses du serveur (le suivi ne le met à jour qu'à chaque interrogation). */
function Chrono({ secondes }: { secondes: number }) {
  const repere = useRef({ secondes, le: Date.now() });
  if (repere.current.secondes !== secondes) repere.current = { secondes, le: Date.now() };
  const [, setTic] = useState(0);
  useEffect(() => {
    const minuteur = setInterval(() => setTic((t) => t + 1), 1000);
    return () => clearInterval(minuteur);
  }, []);
  const total = repere.current.secondes + Math.floor((Date.now() - repere.current.le) / 1000);
  const mm = Math.floor(total / 60);
  const ss = String(total % 60).padStart(2, "0");
  return (
    <p className="hc-text-body texte-discret" data-testid="abonnement-chrono">
      Temps écoulé : {mm}:{ss}
    </p>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Carte « Votre abonnement »

function CarteEtat({ etat, vue }: { etat: EtatAbonnement; vue: VueAbonnement | null }) {
  const resume = resumerAbonnement(etat, vue?.formuleActuelle ?? null);
  // Compte à rebours seulement quand il a un sens (période en cours) ; suspendu, résilié ou expiré : le titre suffit.
  const compte = etat.joursRestants > 0 && etat.statut !== "SUSPENDU" && etat.statut !== "RESILIE";
  return (
    <section className={`ap-hero ap-hero--${resume.niveau}`} aria-labelledby="abo-etat-titre" data-testid="abonnement-etat">
      <div className="ap-hero__haut">
        <span className="ap-hero__icone">
          <IconeNiveau niveau={resume.niveau} />
        </span>
        <div className="ap-hero__textes">
          <p className="ap-surtitre">Votre abonnement</p>
          <h2 id="abo-etat-titre" className="ap-hero__titre">
            {resume.titre}
          </h2>
          <p className="ap-hero__detail">{resume.detail}</p>
        </div>
        {compte && (
          <p className="ap-hero__compte" aria-label={`${etat.joursRestants} jours restants`}>
            <strong>{etat.joursRestants}</strong>
            <span>{etat.joursRestants > 1 ? "jours restants" : "jour restant"}</span>
          </p>
        )}
      </div>
      <dl className="ap-hero__faits">
        <div>
          <dt>
            <Crown size={14} aria-hidden="true" /> Formule actuelle
          </dt>
          <dd>{nomFormule(vue?.formuleActuelle, vue?.formules) ?? (etat.statut === "ESSAI" ? "Essai gratuit" : "Aucune")}</dd>
        </div>
        {vue && (
          <div>
            <dt>
              <BedDouble size={14} aria-hidden="true" /> Nombre de chambres
            </dt>
            <dd>{vue.nombreChambres}</dd>
          </div>
        )}
        <div>
          <dt>
            <CalendarClock size={14} aria-hidden="true" /> Valable jusqu'au
          </dt>
          <dd>{dateAbonnement(etat.valideJusquau)}</dd>
        </div>
      </dl>
    </section>
  );
}

/** Logo du réseau, décoratif : le nom du réseau est toujours écrit à côté (lecteurs d'écran compris). */
function MarqueReseau({ operateur, taille = 32 }: { operateur: OperateurMobileMoney; taille?: number }) {
  return (
    <span className="ap-marque" aria-hidden="true">
      <LogoOperateur operateur={operateur} taille={taille} />
    </span>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Historique des paiements

function Historique({ historique, formules }: { historique: PaiementAbonnementVue[]; formules: FormuleProposee[] }) {
  if (historique.length === 0) return null;
  return (
    <section className="ap-carte" aria-label="Historique des paiements" data-testid="abonnement-historique">
      <div className="ap-carte__entete">
        <span className="ap-carte__icone">
          <Receipt size={18} aria-hidden="true" />
        </span>
        <div>
          <h2 className="ap-carte__titre">Historique des paiements</h2>
          <p className="ap-carte__sous-titre">Chaque paiement, réussi ou non, avec son moyen de paiement.</p>
        </div>
      </div>
      <div className="abo-historique-scroll">
        <table className="abo-historique ap-historique">
          <caption className="visuellement-cache">Historique des paiements</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Formule</th>
              <th scope="col">Montant</th>
              <th scope="col">Payé par</th>
              <th scope="col">Statut</th>
            </tr>
          </thead>
          <tbody>
            {historique.map((p) => {
              const statut = TON_STATUT[p.statut];
              return (
                <tr key={p.id}>
                  <td>{dateAbonnement(p.createdAt)}</td>
                  <td>
                    {/* Saisie du support sans formule ni durée (paiement reçu par un autre canal) : pas de « · 0 mois ». */}
                    {[nomFormule(p.formule, formules), p.mois > 0 ? duree(p.mois) : null].filter(Boolean).join(" · ") || "Paiement manuel"}
                  </td>
                  <td>
                    {montantAbonnement(p.montant, p.devise)}
                    {p.commission != null && p.commission > 0 && p.total != null && (
                      <small className="abo-historique__frais" data-testid="abonnement-historique-frais">
                        + frais ScanLinkPay {montantAbonnement(p.commission, p.devise)} = {montantAbonnement(p.total, p.devise)}
                      </small>
                    )}
                  </td>
                  <td>
                    <span className="ap-historique__moyen">
                      {p.source !== "SUPPORT" && p.operateur && <MarqueReseau operateur={p.operateur} taille={24} />}
                      {p.source === "SUPPORT" ? "Enregistré par le support" : `${p.operateur ? OPERATEURS_MOBILE_MONEY[p.operateur].libelle : "Mobile Money"}${p.telephoneMasque ? ` · ${p.telephoneMasque}` : ""}`}
                    </span>
                  </td>
                  <td>
                    <StatusBadge tone={statut.ton} label={statut.libelle} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Formulaire de paiement (patron) : formule, durée, devise, opérateur, numéro → attente → réussite | échec

interface FormulairePaiementProps {
  client: ClientApi;
  vue: VueAbonnement;
  mode: "page" | "bloque";
  onPaiementReussi: () => Promise<void>;
  recharger: () => void;
}

function annonceDe(etat: EtatSuiviPaiement): string {
  switch (etat.phase) {
    case "envoi":
      return "Envoi de la demande de paiement…";
    case "attente":
      return etat.lent ? "La confirmation tarde. Vérifiez votre téléphone." : "Confirmez le paiement sur votre téléphone.";
    case "reussi":
      return "Paiement confirmé. Merci !";
    case "echec":
      return `Le paiement n'a pas abouti. ${etat.message ?? ""}`;
    default:
      return "";
  }
}

function FormulairePaiement({ client, vue, mode, onPaiementReussi, recharger }: FormulairePaiementProps) {
  const suivi = useMemo(() => new SuiviPaiementAbonnement(client), [client]);
  const [etat, setEtat] = useState<EtatSuiviPaiement>(() => suivi.etat());
  useEffect(() => {
    const arreterEcoute = suivi.onChangement(setEtat);
    return () => {
      arreterEcoute();
      suivi.arreter();
    };
  }, [suivi]);

  // Une demande est déjà partie (écran fermé puis rouvert) : on reprend l'attente au lieu de proposer un second paiement.
  const reprisId = useRef<string | null>(null);
  useEffect(() => {
    const enCours = vue.paiementEnCours;
    if (!enCours || reprisId.current === enCours.id || suivi.etat().phase !== "saisie") return;
    reprisId.current = enCours.id;
    suivi.reprendre(enCours);
  }, [vue.paiementEnCours, suivi]);

  const nombreChambres = vue.nombreChambres;
  const convient = (f: FormuleProposee) => f.maxChambres === null || f.maxChambres >= nombreChambres;
  const formulesPossibles = vue.formules.filter(convient);

  const [formuleCode, setFormuleCode] = useState<FormuleProposee["code"] | undefined>(() => {
    const actuelle = formulesPossibles.find((f) => f.code === vue.formuleActuelle);
    return (actuelle ?? formulesPossibles.find((f) => f.recommandee) ?? formulesPossibles[0] ?? vue.formules[0])?.code;
  });
  const [mois, setMois] = useState(1);
  const [devise, setDevise] = useState<"USD" | "CDF">("USD");
  const [operateur, setOperateur] = useState<OperateurMobileMoney | null>(null);
  const [telephone, setTelephone] = useState("");
  const [touche, setTouche] = useState(false);
  const [suite, setSuite] = useState<{ enCours: boolean; erreur: string | null }>({ enCours: false, erreur: null });

  const formule = vue.formules.find((f) => f.code === formuleCode);
  const dureeChoisie = formule?.durees.find((d) => d.mois === mois) ?? formule?.durees[0];
  const prix = dureeChoisie ? (devise === "USD" ? dureeChoisie.prixUsd : dureeChoisie.prixCdf) : null;
  const montant = prix !== null ? montantAbonnement(prix, devise) : null;

  // Aperçu des frais ScanLinkPay AVANT de payer : redemandé à chaque changement de formule, de durée ou de monnaie. Une réponse arrivée trop
  // tard (l'utilisateur a déjà changé de choix) est ignorée, jamais affichée à la place de la bonne.
  const cleApercu = formule && dureeChoisie ? `${formule.code}|${dureeChoisie.mois}|${devise}` : null;
  const [apercu, setApercu] = useState<{ cle: string; valeur: ApercuPaiement | null } | null>(null);
  useEffect(() => {
    if (!formule || !dureeChoisie || !cleApercu) return;
    let actif = true;
    client
      .apercuAbonnement(formule.code, dureeChoisie.mois, devise)
      .then((valeur) => actif && setApercu({ cle: cleApercu, valeur }))
      // Aperçu impossible : on montre le prix seul, le paiement reste possible.
      .catch(() => actif && setApercu({ cle: cleApercu, valeur: null }));
    return () => {
      actif = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, cleApercu]);
  const calculEnCours = cleApercu !== null && apercu?.cle !== cleApercu;
  const apercuValable = apercu && apercu.cle === cleApercu ? apercu.valeur : null;
  const fraisAjoutes = apercuValable !== null && apercuValable.disponible && apercuValable.commissionPayeePar === "PAYEUR";
  const aPayer = fraisAjoutes && apercuValable ? montantAbonnement(apercuValable.total, devise) : montant;

  const chiffresTapes = telephone.replace(/\D/g, "").length;
  const problemeTel = problemeNumero(operateur, telephone);
  const problemeOperateur = !operateur && !problemeTel ? "Choisissez votre opérateur Mobile Money." : null;
  const probleme = problemeTel ?? problemeOperateur;
  // Pas de reproche à la première touche tapée : on parle quand le numéro est complet, quand il appartient à un autre réseau, ou après avoir quitté le champ.
  const autreReseau = problemeTel !== null && operateurDuNumero(telephone) !== null;
  const afficherProbleme = probleme !== null && (touche || (telephone.trim() !== "" && (chiffresTapes >= 9 || autreReseau)));

  // Focus : à chaque changement d'étape (attente, réussite, échec, retour à la saisie) le titre de l'étape reçoit le focus, pour qu'un lecteur d'écran
  // et le clavier suivent. Pas au premier affichage (Coquille gère déjà le focus de la page).
  const titreEtape = useRef<HTMLHeadingElement>(null);
  const phasePrecedente = useRef(etat.phase);
  useEffect(() => {
    if (phasePrecedente.current === etat.phase) return;
    phasePrecedente.current = etat.phase;
    titreEtape.current?.focus();
  }, [etat.phase]);
  const champTelephone = useRef<HTMLInputElement>(null);

  function surTelephone(valeur: string) {
    setTelephone(valeur);
    const detecte = operateurDuNumero(valeur);
    if (detecte) setOperateur(detecte);
  }

  async function payer(evenement: React.FormEvent) {
    evenement.preventDefault();
    setTouche(true);
    if (probleme || !formule || !operateur || !dureeChoisie) {
      champTelephone.current?.focus();
      return;
    }
    await suivi.payer({ formule: formule.code, mois: dureeChoisie.mois, devise, operateur, telephone: telephone.trim() });
  }

  async function continuer() {
    setSuite({ enCours: true, erreur: null });
    try {
      await onPaiementReussi();
      if (mode === "page") {
        suivi.reinitialiser();
        recharger();
      }
      setSuite({ enCours: false, erreur: null });
    } catch (e) {
      setSuite({ enCours: false, erreur: e instanceof Error ? e.message : "Impossible de continuer pour le moment. Réessayez." });
    }
  }

  const annonce = (
    <div className="visuellement-cache" role="status" aria-live="polite" data-testid="abonnement-annonce">
      {annonceDe(etat)}
    </div>
  );

  // ---- Envoi / attente de la confirmation sur le téléphone
  if (etat.phase === "envoi" || etat.phase === "attente") {
    const p = etat.paiement;
    const reseau = p?.operateur ?? operateur;
    return (
      <section className="ap-carte ap-phase" aria-labelledby="abo-etape-titre" data-testid="abonnement-attente">
        {annonce}
        <div className="ap-phase__visuel" aria-hidden="true">
          <span className="ap-pulsation" />
          <span className="ap-phase__telephone">{reseau ? <LogoOperateur operateur={reseau} taille={56} /> : <Smartphone size={40} />}</span>
        </div>
        <h2 id="abo-etape-titre" className="ap-phase__titre" tabIndex={-1} ref={titreEtape}>
          {etat.phase === "envoi" ? "Envoi de la demande…" : "Confirmez le paiement sur votre téléphone…"}
        </h2>
        {p && (
          <p className="ap-phase__texte">
            Une demande de <strong>{montantAbonnement(p.montant, p.devise)}</strong> a été envoyée{p.telephoneMasque ? ` au ${p.telephoneMasque}` : " à votre téléphone"}. Entrez votre code secret Mobile Money pour valider.
          </p>
        )}
        <ol className="ap-progression" aria-label="Étapes du paiement">
          <li className="ap-progression__etape ap-progression__etape--fait">
            <span className="ap-progression__point">
              <Check size={14} aria-hidden="true" />
            </span>
            Demande envoyée
          </li>
          <li className={`ap-progression__etape${etat.phase === "attente" ? " ap-progression__etape--encours" : ""}`}>
            <span className="ap-progression__point">2</span>
            Code secret sur le téléphone
          </li>
          <li className="ap-progression__etape">
            <span className="ap-progression__point">3</span>
            Abonnement activé
          </li>
        </ol>
        {etat.phase === "attente" && <Chrono secondes={etat.secondes} />}
        {etat.lent && (
          <div className="abo-conseils ap-conseils" data-testid="abonnement-conseils">
            <p className="hc-text-body-strong">Cela prend plus de temps que prévu. Vérifiez ceci :</p>
            <ul className="hc-text-body">
              <li>Votre solde Mobile Money est suffisant.</li>
              <li>Votre téléphone a du réseau.</li>
              <li>Vous avez bien entré votre code secret (code PIN) quand la demande est apparue.</li>
              <li>Le numéro est le bon{p?.telephoneMasque ? ` (${p.telephoneMasque})` : ""}.</li>
            </ul>
          </div>
        )}
        {etat.peutReessayer && (
          <>
            <p className="ap-phase__note">Vous pouvez fermer cet écran : votre abonnement s'activera tout seul dès que le paiement sera confirmé.</p>
            <Button type="button" variant="secondary" onClick={() => suivi.reinitialiser()}>
              Réessayer
            </Button>
          </>
        )}
      </section>
    );
  }

  // ---- Paiement réussi
  if (etat.phase === "reussi") {
    const fin = etat.paiement?.periodeCouverteJusquau ?? etat.etatAbonnement?.valideJusquau ?? null;
    const p = etat.paiement;
    return (
      <section className="ap-carte ap-phase" aria-labelledby="abo-etape-titre" data-testid="abonnement-succes">
        {annonce}
        <span className="ap-phase__resultat ap-phase__resultat--ok">
          <CheckCircle2 size={44} aria-hidden="true" />
        </span>
        <h2 id="abo-etape-titre" className="ap-phase__titre" tabIndex={-1} ref={titreEtape}>
          Merci ! Abonnement actif{fin ? ` jusqu'au ${dateAbonnement(fin)}` : ""}.
        </h2>
        <p className="ap-phase__texte">Votre paiement est confirmé. Vous pouvez continuer à travailler.</p>
        {p && (
          <dl className="ap-recu">
            <div>
              <dt>Montant payé</dt>
              <dd>{montantAbonnement(p.total ?? p.montant, p.devise)}</dd>
            </div>
            {p.operateur && (
              <div>
                <dt>Payé avec</dt>
                <dd className="ap-recu__reseau">
                  <MarqueReseau operateur={p.operateur} taille={22} />
                  {OPERATEURS_MOBILE_MONEY[p.operateur].libelle}
                </dd>
              </div>
            )}
            {fin && (
              <div>
                <dt>Valable jusqu'au</dt>
                <dd>{dateAbonnement(fin)}</dd>
              </div>
            )}
          </dl>
        )}
        {suite.erreur && (
          <p role="alert" className="hc-text-body texte-erreur">
            {suite.erreur}
          </p>
        )}
        <Button type="button" size="lg" onClick={() => void continuer()} disabled={suite.enCours}>
          {suite.enCours ? "Chargement…" : "Continuer"}
        </Button>
      </section>
    );
  }

  // ---- Paiement refusé, expiré ou annulé
  if (etat.phase === "echec") {
    return (
      <section className="ap-carte ap-phase" aria-labelledby="abo-etape-titre" data-testid="abonnement-echec">
        {annonce}
        <span className="ap-phase__resultat ap-phase__resultat--danger">
          <XCircle size={44} aria-hidden="true" />
        </span>
        <h2 id="abo-etape-titre" className="ap-phase__titre" tabIndex={-1} ref={titreEtape}>
          Le paiement n'a pas abouti
        </h2>
        <p className="ap-phase__texte">{etat.message ?? "Vous n'avez pas été débité. Vous pouvez réessayer."}</p>
        <p className="ap-phase__note">Si de l'argent a quitté votre compte Mobile Money, il sera crédité automatiquement dès que le paiement sera confirmé.</p>
        <Button type="button" size="lg" onClick={() => suivi.reinitialiser()}>
          Réessayer
        </Button>
      </section>
    );
  }

  // ---- Saisie
  const titre = mode === "bloque" ? "Renouveler l'abonnement" : vue.etat.statut === "ESSAI" ? "Choisir une formule" : "Renouveler l'abonnement";
  const descriptionTel = ["abo-tel-aide", afficherProbleme && probleme ? "abo-tel-erreur" : null].filter(Boolean).join(" ");
  const reseauDetecte = operateurDuNumero(telephone);

  return (
    <form className="ap-paiement" onSubmit={(e) => void payer(e)} noValidate aria-labelledby="abo-form-titre" data-testid="abonnement-formulaire">
      {annonce}
      <div className="ap-paiement__etapes">
        <div className="ap-paiement__entete">
          <h2 id="abo-form-titre" className="ap-paiement__titre" tabIndex={-1} ref={titreEtape}>
            {titre}
          </h2>
          <p className="ap-paiement__sous-titre">Quatre étapes, moins d'une minute. Vous confirmez avec votre code secret Mobile Money : rien n'est débité sans lui.</p>
        </div>
        {mode !== "bloque" && vue.etat.statut === "ESSAI" && (
          <p className="ap-astuce">
            <Gift size={16} aria-hidden="true" /> Vous payez avant la fin de l'essai ? Aucun jour d'essai n'est perdu : ils s'ajoutent à votre abonnement.
          </p>
        )}

        {etat.message && (
          <p role="alert" className="abo-message abo-message--erreur hc-text-body" data-testid="abonnement-erreur-envoi">
            {etat.message}
          </p>
        )}

        <fieldset className="ap-etape">
          <legend className="ap-etape__legende">
            <span className="ap-etape__numero">1</span> Choisissez une formule
          </legend>
          <div className="ap-formules">
            {vue.formules.map((f) => {
              const trop = !convient(f);
              const choisi = f.code === formuleCode;
              const mensuel = f.durees.find((d) => d.mois === 1);
              const prixMensuel = mensuel ? (devise === "USD" ? mensuel.prixUsd : mensuel.prixCdf) : f.prixMensuelUsd;
              const idAide = `abo-formule-${f.code}-aide`;
              const idNom = `abo-formule-${f.code}-nom`;
              const idDetail = `abo-formule-${f.code}-detail`;
              return (
                <label key={f.code} className={`ap-formule${choisi ? " ap-formule--active" : ""}${trop ? " ap-formule--inactive" : ""}${f.recommandee ? " ap-formule--recommandee" : ""}`}>
                  <input
                    type="radio"
                    className="ap-radio"
                    name="abo-formule"
                    value={f.code}
                    checked={choisi}
                    disabled={trop}
                    onChange={() => setFormuleCode(f.code)}
                    aria-labelledby={idNom}
                    aria-describedby={[idDetail, f.code === vue.formuleActuelle ? `abo-formule-${f.code}-actuelle` : null, trop ? idAide : null].filter(Boolean).join(" ")}
                  />
                  {(f.recommandee || f.code === vue.formuleActuelle) && (
                    <span className="ap-formule__etiquettes">
                      {f.recommandee && (
                        <span className="ap-etiquette ap-etiquette--vedette">
                          <Sparkles size={12} aria-hidden="true" /> Le plus choisi
                        </span>
                      )}
                      {f.code === vue.formuleActuelle && (
                        <span id={`abo-formule-${f.code}-actuelle`} className="ap-etiquette" data-testid="abonnement-formule-actuelle">
                          Votre formule
                        </span>
                      )}
                    </span>
                  )}
                  <span className="ap-formule__tete">
                    <span id={idNom} className="ap-formule__nom">
                      {f.nom}
                    </span>
                    <span className="ap-coche" aria-hidden="true">
                      <Check size={14} />
                    </span>
                  </span>
                  <span id={idDetail} className="ap-formule__detail">
                    <span className="ap-formule__prix">
                      {montantAbonnement(prixMensuel, devise)} <small>/ mois</small>
                    </span>
                    <span className="ap-formule__plafond">
                      <BedDouble size={14} aria-hidden="true" /> {f.maxChambres === null ? "Chambres illimitées" : `Jusqu'à ${f.maxChambres} chambres`}
                    </span>
                    <span className="ap-formule__description">{f.description}</span>
                  </span>
                  <ul className="ap-formule__inclus">
                    {f.inclus.filter((ligne) => !estLignePlafond(ligne)).map((ligne) => (
                      <li key={ligne}>
                        <Check size={14} aria-hidden="true" />
                        {ligne}
                      </li>
                    ))}
                  </ul>
                  {trop && (
                    <span id={idAide} className="ap-formule__trop texte-erreur">
                      Votre hôtel a {nombreChambres} chambres : cette formule en accepte {f.maxChambres} au maximum.
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="ap-etape">
          <legend className="ap-etape__legende">
            <span className="ap-etape__numero">2</span> Choisissez la durée
          </legend>
          <div className="ap-durees">
            {(formule?.durees ?? []).map((d) => {
              const choisi = d.mois === dureeChoisie?.mois;
              const p = devise === "USD" ? d.prixUsd : d.prixCdf;
              return (
                <label key={d.mois} className={`ap-tuile${choisi ? " ap-tuile--active" : ""}`}>
                  <input type="radio" className="ap-radio" name="abo-duree" value={d.mois} checked={choisi} onChange={() => setMois(d.mois)} />
                  <span className="ap-tuile__titre">{duree(d.mois)}</span>
                  <span className="ap-tuile__prix">{montantAbonnement(p, devise)}</span>
                  {d.mois > 1 && <span className="ap-tuile__sous">soit {montantAbonnement(Math.round((p / d.mois) * 100) / 100, devise)} / mois</span>}
                  {d.moisOfferts > 0 && (
                    <span className="ap-tuile__offert">
                      <Gift size={12} aria-hidden="true" /> {d.moisOfferts} mois offerts
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="ap-etape">
          <legend className="ap-etape__legende">
            <span className="ap-etape__numero">3</span> Choisissez la monnaie
          </legend>
          <div className="ap-segment">
            {(
              [
                ["USD", "Dollars (USD)", "$"],
                ["CDF", "Francs congolais (FC)", "FC"],
              ] as const
            ).map(([code, libelle, symbole]) => (
              <label key={code} className={`ap-segment__option${devise === code ? " ap-segment__option--active" : ""}`}>
                <input type="radio" className="ap-radio" name="abo-devise" value={code} checked={devise === code} onChange={() => setDevise(code)} />
                <span className="ap-segment__symbole" aria-hidden="true">
                  {symbole}
                </span>
                {libelle}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="ap-etape">
          <legend className="ap-etape__legende">
            <span className="ap-etape__numero">4</span> Payer avec Mobile Money
          </legend>
          <div className="ap-reseaux">
            {LISTE_OPERATEURS.map((o) => (
              <label key={o} className={`ap-reseau${operateur === o ? " ap-reseau--actif" : ""}`}>
                <input type="radio" className="ap-radio" name="abo-operateur" value={o} checked={operateur === o} onChange={() => setOperateur(o)} />
                <MarqueReseau operateur={o} taille={40} />
                <span className="ap-reseau__nom">{OPERATEURS_MOBILE_MONEY[o].libelle}</span>
                <span className="ap-coche" aria-hidden="true">
                  <Check size={14} />
                </span>
              </label>
            ))}
          </div>
          <div className="ap-champ">
            <label className="ap-champ__libelle" htmlFor="abo-telephone">
              Numéro de téléphone Mobile Money
            </label>
            <div className={`ap-champ__boite${afficherProbleme && probleme ? " ap-champ__boite--erreur" : ""}`}>
              <span className="ap-champ__prefixe" aria-hidden="true">
                {reseauDetecte ? <LogoOperateur operateur={reseauDetecte} taille={26} /> : <Smartphone size={18} />}
              </span>
              <input
                id="abo-telephone"
                ref={champTelephone}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="Ex. 0828 497 218"
                value={telephone}
                onChange={(e) => surTelephone(e.target.value)}
                onBlur={() => telephone.trim() !== "" && setTouche(true)}
                aria-invalid={afficherProbleme && probleme ? true : undefined}
                aria-describedby={descriptionTel}
              />
            </div>
            <p id="abo-tel-aide" className="ap-champ__aide">
              {reseauDetecte && !problemeTel ? `Réseau reconnu : ${OPERATEURS_MOBILE_MONEY[reseauDetecte].libelle}. ` : ""}C'est ce numéro qui recevra la demande de confirmation.
            </p>
            <div aria-live="polite">
              {afficherProbleme && probleme && (
                <p id="abo-tel-erreur" className="ap-champ__erreur" data-testid="abonnement-erreur-numero">
                  <AlertTriangle size={14} aria-hidden="true" /> {probleme}
                </p>
              )}
            </div>
          </div>
        </fieldset>
      </div>

      {formule && dureeChoisie && montant && (
        <aside className="ap-commande" aria-label="Votre commande" data-testid="abonnement-recap">
          <p className="ap-surtitre">Votre commande</p>
          <div className="ap-commande__ligne">
            <span>
              Formule <strong>{formule.nom}</strong>
            </span>
            <span>{montant}</span>
          </div>
          <div className="ap-commande__ligne ap-commande__ligne--discrete">
            <span>Durée</span>
            <span>
              {duree(dureeChoisie.mois)}
              {dureeChoisie.moisOfferts > 0 ? ` (dont ${dureeChoisie.moisOfferts} offerts)` : ""}
            </span>
          </div>
          {operateur && (
            <div className="ap-commande__ligne ap-commande__ligne--discrete">
              <span>Payé avec</span>
              <span className="ap-commande__reseau">
                <MarqueReseau operateur={operateur} taille={20} />
                {OPERATEURS_MOBILE_MONEY[operateur].libelle}
              </span>
            </div>
          )}
          <div className="ap-commande__total" aria-live="polite" aria-atomic="true">
            <span>Total à payer</span>
            <strong>{calculEnCours ? "…" : aPayer}</strong>
          </div>
          <div aria-live="polite" aria-atomic="true" className="ap-commande__detail">
            {calculEnCours ? (
              <p data-testid="abonnement-calcul-frais">Calcul des frais ScanLinkPay…</p>
            ) : fraisAjoutes && apercuValable ? (
              <p data-testid="abonnement-detail-prix">
                Prix {montant} + frais ScanLinkPay {montantAbonnement(apercuValable.commission, devise)} = <strong>{aPayer}</strong> à payer
              </p>
            ) : (
              <p data-testid="abonnement-detail-prix">
                Prix : <strong>{montant}</strong>
              </p>
            )}
          </div>
          <p className="ap-commande__phrase">
            Vous allez payer <strong>{aPayer}</strong> pour {duree(dureeChoisie.mois)} de la formule {formule.nom}. Une demande de confirmation va arriver sur le téléphone ; entrez votre code secret Mobile Money.
          </p>
          <Button type="submit" size="lg" className="ap-commande__bouton" disabled={calculEnCours} aria-busy={calculEnCours || undefined}>
            <Lock size={16} aria-hidden="true" />
            {calculEnCours ? "Payer" : `Payer ${aPayer}`}
          </Button>
          <p className="ap-commande__securise abo-securise" data-testid="abonnement-securise">
            <ShieldCheck size={14} aria-hidden="true" /> Paiement sécurisé par ScanLinkPay
          </p>
          <div className="ap-commande__logos">
            <LogosMobileMoney taille={24} />
          </div>
        </aside>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Zone de paiement : qui peut payer, et quand

export interface ZonePaiementProps {
  client: ClientApi;
  utilisateur: ProfilConnecte;
  etat: EtatAbonnement | null;
  lecture: LectureAbonnement;
  horsLigne: boolean;
  mode: "page" | "bloque";
  onPaiementReussi: () => Promise<void>;
}

export function ZonePaiement({ client, utilisateur, etat, lecture, horsLigne, mode, onPaiementReussi }: ZonePaiementProps) {
  const { vue, erreur, chargement, recharger } = lecture;
  const note = (texte: string, testid: string, erreurNote = false) => (
    <p className={`abo-message hc-text-body${erreurNote ? " abo-message--erreur" : ""}`} role="status" data-testid={testid}>
      <Info size={16} aria-hidden="true" style={{ verticalAlign: "-3px", marginRight: 8 }} />
      {texte}
    </p>
  );

  // Suspendu à la main ou résilié : aucun formulaire, quel que soit le rôle.
  if (etat && !etat.renouvelable) return note("Contactez le support HotelSaver pour rouvrir l'accès de votre hôtel.", "abonnement-support");
  if (utilisateur.role !== Role.PATRON) {
    return note(
      mode === "bloque"
        ? "Demandez au patron de renouveler l'abonnement de l'hôtel. Seul le patron peut le payer."
        : "Seul le patron peut payer l'abonnement. Demandez au patron de renouveler si besoin.",
      "abonnement-patron-seulement"
    );
  }
  if (horsLigne || erreur?.horsLigne) return note("Connectez-vous à Internet pour renouveler.", "abonnement-hors-ligne");
  if (erreur && !vue) {
    return (
      <div className="abo-message abo-message--erreur" role="alert">
        <p className="hc-text-body">{erreur.message}</p>
        <Button type="button" variant="secondary" size="sm" onClick={recharger}>
          Réessayer
        </Button>
      </div>
    );
  }
  if (!vue) return <p className="hc-text-body texte-discret">{chargement ? "Chargement de votre abonnement…" : ""}</p>;
  if (!vue.etat.renouvelable) return note("Contactez le support HotelSaver pour rouvrir l'accès de votre hôtel.", "abonnement-support");
  if (!vue.paiementEnLigne) return note("Le paiement en ligne n'est pas encore disponible. Contactez le support HotelSaver.", "abonnement-pas-de-paiement-en-ligne");

  return <FormulairePaiement client={client} vue={vue} mode={mode} onPaiementReussi={onPaiementReussi} recharger={recharger} />;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Écran « Abonnement » dans l'application

export interface EcranAbonnementProps {
  client: ClientApi;
  utilisateur: ProfilConnecte;
  /** Session ouverte sans Internet : on montre l'état connu, sans formulaire. */
  horsLigne: boolean;
  /** Après un paiement réussi : relit le profil et relance la synchronisation. */
  onPaiementReussi: () => Promise<void>;
  onRetour?: () => void;
}

export function EcranAbonnement({ client, utilisateur, horsLigne, onPaiementReussi, onRetour }: EcranAbonnementProps) {
  useTitrePage("Abonnement");
  const lecture = useVueAbonnement(client, horsLigne);
  const brut = lecture.vue?.etat ?? utilisateur.abonnement ?? null;
  const etat = brut ? actualiserEtatAbonnement(brut) : null;

  return (
    <div className="page">
      <header className="page__entete">
        <div>
          <h1 className="hc-text-display-md page__titre">Abonnement</h1>
          <p className="hc-text-body page__sous-titre">Votre formule, vos paiements et le renouvellement.</p>
        </div>
        {onRetour && (
          <Button type="button" variant="secondary" onClick={onRetour}>
            Retour
          </Button>
        )}
      </header>

      <div className="abo ap">
        {etat ? <CarteEtat etat={etat} vue={lecture.vue} /> : <p className="abo-message hc-text-body">L'état de votre abonnement n'est pas encore connu. Connectez-vous à Internet pour le lire.</p>}
        <ZonePaiement client={client} utilisateur={utilisateur} etat={etat} lecture={lecture} horsLigne={horsLigne} mode="page" onPaiementReussi={onPaiementReussi} />
        {utilisateur.role === Role.PATRON && lecture.vue && <Historique historique={lecture.vue.historique} formules={lecture.vue.formules} />}
        <BlocAide contact={lecture.vue?.contactSupport} message="Bonjour, j'ai une question sur mon abonnement HotelSaver." />
        <p className="hc-text-caption texte-discret abo-securise">
          <ShieldCheck size={14} aria-hidden="true" /> Paiement sécurisé par ScanLinkPay
        </p>
      </div>
    </div>
  );
}
