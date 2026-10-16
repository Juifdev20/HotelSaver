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
import { Button, StatusBadge, useTitrePage } from "@hotel-chicago/ui";
import type { StatusTone } from "@hotel-chicago/ui";
import { AlertTriangle, CheckCircle2, CircleCheck, Info, ShieldCheck, XCircle } from "lucide-react";
import { BlocAide } from "../components/BlocAide";
import "./abonnement.css";

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
  return (
    <section className={`abo-carte abo-etat abo-etat--${resume.niveau}`} aria-labelledby="abo-etat-titre" data-testid="abonnement-etat">
      <span className="abo-etat__icone">
        <IconeNiveau niveau={resume.niveau} />
      </span>
      <div className="abo-etat__corps">
        <h2 id="abo-etat-titre" className="hc-text-heading">
          {resume.titre}
        </h2>
        <p className="hc-text-body">{resume.detail}</p>
        <dl className="abo-faits hc-text-body">
          <div>
            <dt>Formule actuelle</dt>
            <dd>{nomFormule(vue?.formuleActuelle, vue?.formules) ?? (etat.statut === "ESSAI" ? "Essai gratuit" : "Aucune")}</dd>
          </div>
          {vue && (
            <div>
              <dt>Nombre de chambres</dt>
              <dd>{vue.nombreChambres}</dd>
            </div>
          )}
          <div>
            <dt>Valable jusqu'au</dt>
            <dd>{dateAbonnement(etat.valideJusquau)}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Historique des paiements

function Historique({ historique, formules }: { historique: PaiementAbonnementVue[]; formules: FormuleProposee[] }) {
  if (historique.length === 0) return null;
  return (
    <section className="abo-carte" aria-label="Historique des paiements" data-testid="abonnement-historique">
      <div className="abo-historique-scroll">
        <table className="abo-historique">
          <caption>Historique des paiements</caption>
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
                    {nomFormule(p.formule, formules)} · {duree(p.mois)}
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
                    {p.source === "SUPPORT" ? "Enregistré par le support" : `${p.operateur ? OPERATEURS_MOBILE_MONEY[p.operateur].libelle : "Mobile Money"}${p.telephoneMasque ? ` · ${p.telephoneMasque}` : ""}`}
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
    return (
      <section className="abo-carte" aria-labelledby="abo-etape-titre" data-testid="abonnement-attente">
        {annonce}
        <div className="abo-etape">
          <div className="abo-spinner" role="img" aria-label="Chargement en cours" />
          <h2 id="abo-etape-titre" className="hc-text-heading" tabIndex={-1} ref={titreEtape}>
            {etat.phase === "envoi" ? "Envoi de la demande…" : "Confirmez le paiement sur votre téléphone…"}
          </h2>
          {p && (
            <p className="hc-text-body">
              Une demande de {montantAbonnement(p.montant, p.devise)} a été envoyée{p.telephoneMasque ? ` au ${p.telephoneMasque}` : " à votre téléphone"}. Entrez votre code secret Mobile Money pour valider.
            </p>
          )}
          {etat.phase === "attente" && <Chrono secondes={etat.secondes} />}
          {etat.lent && (
            <div className="abo-conseils" data-testid="abonnement-conseils">
              <p className="hc-text-body-strong">Cela prend plus de temps que prévu. Vérifiez ceci :</p>
              <ul className="hc-text-body" style={{ margin: 0, paddingLeft: 18 }}>
                <li>Votre solde Mobile Money est suffisant.</li>
                <li>Votre téléphone a du réseau.</li>
                <li>Vous avez bien entré votre code secret (code PIN) quand la demande est apparue.</li>
                <li>Le numéro est le bon{p?.telephoneMasque ? ` (${p.telephoneMasque})` : ""}.</li>
              </ul>
            </div>
          )}
          {etat.peutReessayer && (
            <>
              <p className="hc-text-body">Vous pouvez fermer cet écran : votre abonnement s'activera tout seul dès que le paiement sera confirmé.</p>
              <Button type="button" variant="secondary" onClick={() => suivi.reinitialiser()}>
                Réessayer
              </Button>
            </>
          )}
        </div>
      </section>
    );
  }

  // ---- Paiement réussi
  if (etat.phase === "reussi") {
    const fin = etat.paiement?.periodeCouverteJusquau ?? etat.etatAbonnement?.valideJusquau ?? null;
    return (
      <section className="abo-carte" aria-labelledby="abo-etape-titre" data-testid="abonnement-succes">
        {annonce}
        <div className="abo-etape">
          <span className="abo-etape__icone abo-etape__icone--ok">
            <CheckCircle2 size={34} aria-hidden="true" />
          </span>
          <h2 id="abo-etape-titre" className="hc-text-heading" tabIndex={-1} ref={titreEtape}>
            Merci ! Abonnement actif{fin ? ` jusqu'au ${dateAbonnement(fin)}` : ""}.
          </h2>
          <p className="hc-text-body">Votre paiement est confirmé. Vous pouvez continuer à travailler.</p>
          {suite.erreur && (
            <p role="alert" className="hc-text-body texte-erreur">
              {suite.erreur}
            </p>
          )}
          <Button type="button" onClick={() => void continuer()} disabled={suite.enCours}>
            {suite.enCours ? "Chargement…" : "Continuer"}
          </Button>
        </div>
      </section>
    );
  }

  // ---- Paiement refusé, expiré ou annulé
  if (etat.phase === "echec") {
    return (
      <section className="abo-carte" aria-labelledby="abo-etape-titre" data-testid="abonnement-echec">
        {annonce}
        <div className="abo-etape">
          <span className="abo-etape__icone abo-etape__icone--danger">
            <XCircle size={34} aria-hidden="true" />
          </span>
          <h2 id="abo-etape-titre" className="hc-text-heading" tabIndex={-1} ref={titreEtape}>
            Le paiement n'a pas abouti
          </h2>
          <p className="hc-text-body">{etat.message ?? "Vous n'avez pas été débité. Vous pouvez réessayer."}</p>
          <p className="hc-text-body texte-discret">Si de l'argent a quitté votre compte Mobile Money, il sera crédité automatiquement dès que le paiement sera confirmé.</p>
          <Button type="button" onClick={() => suivi.reinitialiser()}>
            Réessayer
          </Button>
        </div>
      </section>
    );
  }

  // ---- Saisie
  const titre = mode === "bloque" ? "Renouveler l'abonnement" : vue.etat.statut === "ESSAI" ? "Choisir une formule" : "Renouveler l'abonnement";
  const descriptionTel = ["abo-tel-aide", afficherProbleme && probleme ? "abo-tel-erreur" : null].filter(Boolean).join(" ");

  return (
    <form className="abo-carte abo-form" onSubmit={(e) => void payer(e)} noValidate aria-labelledby="abo-form-titre" data-testid="abonnement-formulaire">
      {annonce}
      <h2 id="abo-form-titre" className="hc-text-heading" tabIndex={-1} ref={titreEtape}>
        {titre}
      </h2>
      {mode !== "bloque" && vue.etat.statut === "ESSAI" && (
        <p className="abo-message hc-text-body">Vous payez avant la fin de l'essai ? Aucun jour d'essai n'est perdu : ils s'ajoutent à votre abonnement.</p>
      )}

      {etat.message && (
        <p role="alert" className="abo-message abo-message--erreur hc-text-body" data-testid="abonnement-erreur-envoi">
          {etat.message}
        </p>
      )}

      <fieldset className="abo-groupe">
        <legend>1. Choisissez une formule</legend>
        <div className="abo-choix-liste abo-choix-liste--formules">
          {vue.formules.map((f) => {
            const trop = !convient(f);
            const choisi = f.code === formuleCode;
            const mensuel = f.durees.find((d) => d.mois === 1);
            const prixMensuel = mensuel ? (devise === "USD" ? mensuel.prixUsd : mensuel.prixCdf) : f.prixMensuelUsd;
            const idAide = `abo-formule-${f.code}-aide`;
            const idNom = `abo-formule-${f.code}-nom`;
            const idDetail = `abo-formule-${f.code}-detail`;
            return (
              <label key={f.code} className={`abo-choix${choisi ? " abo-choix--actif" : ""}${trop ? " abo-choix--inactif" : ""}`}>
                <input
                  type="radio"
                  name="abo-formule"
                  value={f.code}
                  checked={choisi}
                  disabled={trop}
                  onChange={() => setFormuleCode(f.code)}
                  aria-labelledby={idNom}
                  aria-describedby={[idDetail, f.code === vue.formuleActuelle ? `abo-formule-${f.code}-actuelle` : null, trop ? idAide : null].filter(Boolean).join(" ")}
                />
                {(f.recommandee || f.code === vue.formuleActuelle) && (
                  <span className="abo-etiquettes">
                    {f.code === vue.formuleActuelle && (
                      <span id={`abo-formule-${f.code}-actuelle`} className="abo-etiquette abo-etiquette--actuelle" data-testid="abonnement-formule-actuelle">
                        Votre formule
                      </span>
                    )}
                    {f.recommandee && <span className="abo-etiquette">Le plus choisi</span>}
                  </span>
                )}
                <span className="abo-choix__titre">
                  <span className="abo-choix__marque" aria-hidden="true" />
                  <span id={idNom} className="hc-text-heading">
                    {f.nom}
                  </span>
                </span>
                <span id={idDetail} className="abo-choix__detail-groupe">
                  <span className="abo-choix__prix">
                    {montantAbonnement(prixMensuel, devise)} <small>par mois</small>
                  </span>
                  <span className="abo-choix__detail">{f.maxChambres === null ? "Chambres illimitées" : `Jusqu'à ${f.maxChambres} chambres`}</span>
                  <span className="abo-choix__detail">{f.description}</span>
                </span>
                <ul>
                  {f.inclus.filter((ligne) => !estLignePlafond(ligne)).map((ligne) => (
                    <li key={ligne}>{ligne}</li>
                  ))}
                </ul>
                {trop && (
                  <span id={idAide} className="abo-choix__detail texte-erreur">
                    Votre hôtel a {nombreChambres} chambres : cette formule en accepte {f.maxChambres} au maximum.
                  </span>
                )}
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="abo-groupe">
        <legend>2. Choisissez la durée</legend>
        <div className="abo-choix-liste">
          {(formule?.durees ?? []).map((d) => {
            const choisi = d.mois === dureeChoisie?.mois;
            const p = devise === "USD" ? d.prixUsd : d.prixCdf;
            return (
              <label key={d.mois} className={`abo-choix${choisi ? " abo-choix--actif" : ""}`}>
                <input type="radio" name="abo-duree" value={d.mois} checked={choisi} onChange={() => setMois(d.mois)} />
                <span className="abo-choix__titre">
                  <span className="abo-choix__marque" aria-hidden="true" />
                  {duree(d.mois)}
                </span>
                <span className="abo-choix__prix">{montantAbonnement(p, devise)}</span>
                {d.moisOfferts > 0 && <span className="abo-offert">{d.moisOfferts} mois offerts</span>}
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="abo-groupe">
        <legend>3. Choisissez la monnaie</legend>
        <div className="abo-choix-liste">
          {(
            [
              ["USD", "Dollars (USD)"],
              ["CDF", "Francs congolais (FC)"],
            ] as const
          ).map(([code, libelle]) => (
            <label key={code} className={`abo-choix${devise === code ? " abo-choix--actif" : ""}`}>
              <input type="radio" name="abo-devise" value={code} checked={devise === code} onChange={() => setDevise(code)} />
              <span className="abo-choix__titre">
                <span className="abo-choix__marque" aria-hidden="true" />
                {libelle}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="abo-groupe">
        <legend>4. Payer avec Mobile Money</legend>
        <div className="abo-choix-liste">
          {LISTE_OPERATEURS.map((o) => (
            <label key={o} className={`abo-choix${operateur === o ? " abo-choix--actif" : ""}`}>
              <input type="radio" name="abo-operateur" value={o} checked={operateur === o} onChange={() => setOperateur(o)} />
              <span className="abo-choix__titre">
                <span className="abo-choix__marque" aria-hidden="true" />
                {OPERATEURS_MOBILE_MONEY[o].libelle}
              </span>
            </label>
          ))}
        </div>
        <div className="abo-champ">
          <label className="hc-text-label" htmlFor="abo-telephone">
            Numéro de téléphone Mobile Money
          </label>
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
          <p id="abo-tel-aide" className="hc-text-caption texte-discret">
            C'est ce numéro qui recevra la demande de confirmation.
          </p>
          <div aria-live="polite">
            {afficherProbleme && probleme && (
              <p id="abo-tel-erreur" className="hc-text-body texte-erreur" data-testid="abonnement-erreur-numero">
                {probleme}
              </p>
            )}
          </div>
        </div>
      </fieldset>

      {formule && dureeChoisie && montant && (
        <div className="abo-recap" data-testid="abonnement-recap">
          <div aria-live="polite" aria-atomic="true" className="abo-recap__prix">
            {calculEnCours ? (
              <p className="hc-text-body texte-discret" data-testid="abonnement-calcul-frais">
                Calcul des frais ScanLinkPay…
              </p>
            ) : fraisAjoutes && apercuValable ? (
              <p className="hc-text-body" data-testid="abonnement-detail-prix">
                Prix {montant} + frais ScanLinkPay {montantAbonnement(apercuValable.commission, devise)} = <strong>{aPayer}</strong> à payer
              </p>
            ) : (
              <p className="hc-text-body" data-testid="abonnement-detail-prix">
                Prix : <strong>{montant}</strong>
              </p>
            )}
          </div>
          <p className="hc-text-body">
            Vous allez payer <strong>{aPayer}</strong> pour {duree(dureeChoisie.mois)} de la formule {formule.nom}. Une demande de confirmation va arriver sur le téléphone ; entrez votre code secret Mobile Money.
          </p>
          <div>
            <Button type="submit" size="lg" disabled={calculEnCours} aria-busy={calculEnCours || undefined}>
              {calculEnCours ? "Payer" : `Payer ${aPayer}`}
            </Button>
          </div>
          <p className="hc-text-caption texte-discret abo-securise" data-testid="abonnement-securise">
            <ShieldCheck size={14} aria-hidden="true" /> Paiement sécurisé par ScanLinkPay
          </p>
        </div>
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

      <div className="abo">
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
