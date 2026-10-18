import * as React from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ErreurApi, SuiviPaiement, apercuAcompte, lirePaiementAcompte, payerAcompte } from "@hotel-chicago/api-client";
import type { EtatSuivi } from "@hotel-chicago/api-client";
import { LISTE_OPERATEURS, OPERATEURS_MOBILE_MONEY, dateAbonnement, montantAbonnement, operateurDuNumero, problemeNumero } from "@hotel-chicago/regles";
import type {
  AcompteEnLigne as DonneesAcompte,
  ApercuPaiement,
  DemandePaiementReservation,
  ModeRemboursement,
  MoyenPaiementEnLigne,
  OperateurMobileMoney,
  PaiementReservationVue,
  StatutSuiviPublic,
} from "@hotel-chicago/types";
import { CircleCheck, CircleX, CreditCard, Lock, ShieldCheck, Smartphone, Wallet } from "lucide-react";
import { Captcha, captchaActif } from "./Captcha";
import { LogoOperateur, LogosCartes, LogosMobileMoney } from "./paiement/LogosPaiement";
import { CarteChoix } from "./paiement/CarteChoix";
import { configuration } from "./config";
import { lienHttps } from "./liensSurs";

/**
 * Bloc « Acompte en ligne » de la page « Ma réservation ». Le montant, les frais et le compte qui reçoit l'argent sont décidés par le
 * serveur : ici on présente, on recueille le moyen de paiement et on suit le déroulé (SuiviPaiement, même logique que les applications).
 *  - Mobile Money : le client confirme avec son code secret sur son téléphone, la page attend.
 *  - Carte : redirection du navigateur vers la page sécurisée (jamais d'iframe, aucune donnée de carte ne passe par ce site) ;
 *    au retour, le paiement est revérifié.
 */

type DemandeSaisie = Omit<DemandePaiementReservation, "sousDomaine" | "cleIdempotence">;

const MESSAGE_INDISPONIBLE = "Ce service n'est pas disponible pour cet hôtel.";

/** 404 sur une route d'hôtel = la formule de l'hôtel n'inclut pas la fonction : message neutre, jamais « Erreur 404 sur /public/… ». */
function neutre404(e: unknown): never {
  if (e instanceof ErreurApi && e.statusCode === 404) throw new ErreurApi(404, MESSAGE_INDISPONIBLE);
  throw e;
}

const LIBELLE_MODE: Record<ModeRemboursement, string> = {
  SCANLINKPAY: "ScanLinkPay",
  MOBILE_MONEY: "Mobile Money",
  ESPECES: "espèces",
  AUTRE: "un autre moyen",
};

const chronometre = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function libelleMoyen(p: PaiementReservationVue): string {
  if (p.moyen === "CARTE") return "carte bancaire";
  return p.operateur ? OPERATEURS_MOBILE_MONEY[p.operateur].libelle : "Mobile Money";
}

export interface AcompteEnLigneProps {
  sousDomaine: string;
  jeton: string;
  statutReservation: StatutSuiviPublic;
  acompte: DonneesAcompte;
  /** Relit la réservation (statut, montants, remboursement) après un paiement abouti ou refusé. */
  onRafraichir: () => Promise<void>;
}

export function AcompteEnLigne({ sousDomaine, jeton, statutReservation, acompte, onRafraichir }: AcompteEnLigneProps) {
  const idBase = useId();
  const config = useMemo(() => ({ url: configuration.apiUrl }), []);
  const devise = acompte.devise;
  const fmt = (n: number) => montantAbonnement(n, devise);

  // --- Déroulé du paiement ---------------------------------------------------------------------------------------------------
  const suiviPaiement = useMemo(
    () =>
      new SuiviPaiement<PaiementReservationVue, DemandeSaisie>({
        lancer: (demande, cle) => payerAcompte(config, jeton, { ...demande, sousDomaine, cleIdempotence: cle }).catch(neutre404),
        lire: async (id) => ({ paiement: await lirePaiementAcompte(config, sousDomaine, jeton, id).catch(neutre404) }),
      }),
    [config, sousDomaine, jeton]
  );
  const [etat, setEtat] = useState<EtatSuivi<PaiementReservationVue>>(suiviPaiement.etat());

  useEffect(() => {
    const quitter = suiviPaiement.onChangement(setEtat);
    return () => {
      quitter();
      suiviPaiement.arreter();
    };
  }, [suiviPaiement]);

  // Page rouverte (ou retour de la page de la banque) pendant qu'un paiement attend : on reprend l'attente là où elle en était.
  const enAttenteServeur = acompte.paiementEnCours && acompte.paiementEnCours.statut === "EN_ATTENTE" ? acompte.paiementEnCours : null;
  useEffect(() => {
    if (!enAttenteServeur) return;
    const phase = suiviPaiement.etat().phase;
    if (phase === "envoi" || phase === "reussi" || phase === "echec") return;
    suiviPaiement.reprendre(enAttenteServeur);
    // Seul l'identifiant compte : un rafraîchissement du suivi ne doit pas relancer l'attente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enAttenteServeur?.id, suiviPaiement]);

  // Carte : dès que le paiement est créé, direction la page sécurisée (https uniquement). Seulement pour un paiement lancé ICI :
  // au retour, la page ne renvoie pas le client à la banque toute seule.
  const lanceIci = useRef(false);
  const [redirigeVers, setRedirigeVers] = useState<string | null>(null);
  useEffect(() => {
    const p = etat.paiement;
    if (!lanceIci.current || etat.phase !== "attente" || !p || p.moyen !== "CARTE") return;
    const url = lienHttps(p.urlPaiement);
    if (!url) return;
    lanceIci.current = false;
    setRedirigeVers(url);
    window.location.assign(url);
  }, [etat]);

  // Fin du paiement (réussi ou refusé) : on relit la réservation, une seule fois par paiement.
  const dejaRelu = useRef<string | null>(null);
  useEffect(() => {
    const id = etat.paiement?.id;
    if ((etat.phase === "reussi" || etat.phase === "echec") && id && dejaRelu.current !== id) {
      dejaRelu.current = id;
      void onRafraichir();
    }
  }, [etat.phase, etat.paiement?.id, onRafraichir]);

  // Le focus suit l'écran quand le client vient d'agir (jamais volé au chargement de la page).
  const panneau = useRef<HTMLDivElement>(null);
  const aAgi = useRef(false);
  const phasePrecedente = useRef(etat.phase);
  useEffect(() => {
    if (aAgi.current && phasePrecedente.current !== etat.phase && (etat.phase === "attente" || etat.phase === "reussi" || etat.phase === "echec")) {
      panneau.current?.focus();
    }
    phasePrecedente.current = etat.phase;
  }, [etat.phase]);

  // --- Formulaire ------------------------------------------------------------------------------------------------------------
  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const moyensDispos: MoyenPaiementEnLigne[] = [
    ...(acompte.moyens.mobileMoney ? (["MOBILE_MONEY"] as const) : []),
    ...(acompte.moyens.carte ? (["CARTE"] as const) : []),
  ];
  const [moyen, setMoyen] = useState<MoyenPaiementEnLigne>(moyensDispos[0] ?? "MOBILE_MONEY");
  const moyenActif: MoyenPaiementEnLigne = moyensDispos.includes(moyen) ? moyen : (moyensDispos[0] ?? "MOBILE_MONEY");
  const [operateur, setOperateur] = useState<OperateurMobileMoney | null>(null);
  const [operateurChoisiAMain, setOperateurChoisiAMain] = useState(false);
  const [telephone, setTelephone] = useState("");
  const [touche, setTouche] = useState(false);
  const [numeroScanLinkPay, setNumeroScanLinkPay] = useState("");
  const [jetonCaptcha, setJetonCaptcha] = useState<string | undefined>(undefined);
  const [cleCaptcha, setCleCaptcha] = useState(0);
  const [erreurLocale, setErreurLocale] = useState<string | null>(null);
  const titreFormulaire = useRef<HTMLHeadingElement>(null);
  const champTelephone = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (formulaireOuvert && aAgi.current) titreFormulaire.current?.focus();
  }, [formulaireOuvert]);

  function surTelephone(valeur: string) {
    setTelephone(valeur);
    const reconnu = operateurDuNumero(valeur);
    if (reconnu && !operateurChoisiAMain) setOperateur(reconnu);
  }

  const chiffresTapes = telephone.replace(/\D/g, "").length;
  const problemeTel = moyenActif === "MOBILE_MONEY" ? problemeNumero(operateur, telephone) : null;
  const autreReseau = problemeTel !== null && operateurDuNumero(telephone) !== null;
  const afficherProbleme = problemeTel !== null && (touche || (telephone.trim() !== "" && (chiffresTapes >= 9 || autreReseau)));

  // --- Aperçu des frais, AVANT de payer --------------------------------------------------------------------------------------
  const [apercu, setApercu] = useState<ApercuPaiement | null>(null);
  const [apercuCharge, setApercuCharge] = useState(false);
  useEffect(() => {
    if (!formulaireOuvert || !acompte.disponible) return;
    let annule = false;
    setApercuCharge(false);
    apercuAcompte(config, sousDomaine, jeton)
      .then((a) => !annule && setApercu(a))
      .catch(() => !annule && setApercu(null))
      .finally(() => !annule && setApercuCharge(true));
    return () => {
      annule = true;
    };
  }, [formulaireOuvert, acompte.disponible, acompte.reste, config, sousDomaine, jeton]);

  // Si ScanLinkPay n'a pas pu calculer les frais (`disponible` faux), on montre le montant seul.
  const apercuUtile = apercu && apercu.disponible ? apercu : null;
  const montantAPayer = apercuUtile ? apercuUtile.montant : acompte.reste;
  const totalAPayer = apercuUtile ? apercuUtile.total : acompte.reste;
  const fraisClient = apercuUtile ? Math.max(0, Math.round((apercuUtile.total - apercuUtile.montant) * 100) / 100) : 0;

  function ouvrirFormulaire() {
    aAgi.current = true;
    setErreurLocale(null);
    setFormulaireOuvert(true);
  }

  function envoyer(e: React.FormEvent) {
    e.preventDefault();
    setErreurLocale(null);
    if (moyenActif === "MOBILE_MONEY") {
      if (!operateur) return setErreurLocale("Choisissez votre réseau Mobile Money.");
      if (problemeNumero(operateur, telephone)) {
        setTouche(true);
        champTelephone.current?.focus();
        return;
      }
    }
    if (captchaActif && !jetonCaptcha) return setErreurLocale("Terminez d'abord la vérification anti-robot.");

    aAgi.current = true;
    lanceIci.current = moyenActif === "CARTE";
    setRedirigeVers(null);
    void suiviPaiement.payer({
      moyen: moyenActif,
      ...(moyenActif === "MOBILE_MONEY" ? { operateur: operateur ?? undefined, telephone: telephone.trim() } : {}),
      numeroScanLinkPay: numeroScanLinkPay.trim() || undefined,
      captchaToken: jetonCaptcha,
    });
    // Un jeton anti-robot ne sert qu'une fois : un nouveau sera demandé si le paiement doit être relancé.
    setJetonCaptcha(undefined);
    setCleCaptcha((k) => k + 1);
  }

  function reessayer() {
    aAgi.current = true;
    lanceIci.current = false;
    setRedirigeVers(null);
    suiviPaiement.reinitialiser();
    setFormulaireOuvert(true);
  }

  // --- Affichage -------------------------------------------------------------------------------------------------------------
  const lienCreation = lienHttps(acompte.urlScanLinkPay) ?? configuration.urlScanLinkPay;
  const paiementsReussis = acompte.paiements.filter((p) => p.statut === "REUSSI");
  const remboursement = acompte.remboursement;
  const urlCarte = lienHttps(etat.paiement?.urlPaiement ?? enAttenteServeur?.urlPaiement);
  const attenteCarte = (etat.paiement ?? enAttenteServeur)?.moyen === "CARTE";
  const montantPaye = etat.paiement ? fmt(etat.paiement.montant) : fmt(acompte.dejaPaye);

  const idTitre = `${idBase}-titre`;
  const idTitreForm = `${idBase}-form`;
  const idMoyen = `${idBase}-moyen`;
  const idReseau = `${idBase}-reseau`;
  const idTel = `${idBase}-tel`;
  const idTelAide = `${idBase}-tel-aide`;
  const idSlp = `${idBase}-slp`;
  const idSlpAide = `${idBase}-slp-aide`;

  const formulaireVisible = etat.phase === "saisie" && formulaireOuvert && acompte.disponible;

  const progression = acompte.objectif > 0 ? Math.min(100, Math.round((acompte.dejaPaye / acompte.objectif) * 100)) : 0;
  const operateurDetecte = moyenActif === "MOBILE_MONEY" ? operateur : null;

  return (
    <section className="suivi-carte acompte" aria-labelledby={idTitre}>
      <div className="acompte-tete">
        <span className="acompte-tete__icone" aria-hidden="true">
          <Wallet size={22} />
        </span>
        <div>
          <h2 id={idTitre} className="acompte-tete__titre">
            Acompte
          </h2>
          <p>
            L'hôtel demande <strong>{acompte.pourcentage} %</strong> du séjour pour garantir votre chambre.
          </p>
        </div>
      </div>

      <div className="acompte-progression">
        <div className="acompte-progression__chiffres">
          <div>
            <span>Déjà payé</span>
            <strong>{fmt(acompte.dejaPaye)}</strong>
          </div>
          <div className="acompte-progression__reste">
            <span>Reste à payer</span>
            <strong>{fmt(acompte.reste)}</strong>
          </div>
        </div>
        <div
          className="acompte-progression__barre"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progression}
          aria-label={`Acompte payé à ${progression} %`}
        >
          <span style={{ width: `${progression}%` }} />
        </div>
        <p className="acompte-progression__objectif">Acompte demandé : {fmt(acompte.objectif)}</p>
      </div>

      {acompte.nomMarchand && (
        <p className="acompte-marchand">
          <ShieldCheck size={17} aria-hidden="true" />
          <span>
            Vous payez à <strong>{acompte.nomMarchand}</strong>, en toute sécurité via ScanLinkPay.
          </span>
        </p>
      )}

      {acompte.conditionsAnnulation && (
        <details className="acompte-conditions">
          <summary>Conditions d'annulation et de remboursement</summary>
          <p>{acompte.conditionsAnnulation}</p>
        </details>
      )}

      {paiementsReussis.length > 0 && (
        <ul className="acompte-historique" aria-label="Paiements reçus">
          {paiementsReussis.map((p) => (
            <li key={p.id}>
              <CircleCheck size={17} aria-hidden="true" />
              <span>
                <strong>{fmt(p.montant)}</strong> reçus{p.confirmeLe ? ` le ${dateAbonnement(p.confirmeLe)}` : ""} · {libelleMoyen(p)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {remboursement && (
        <div className={`acompte-remboursement acompte-remboursement--${remboursement.statut.toLowerCase()}`}>
          {remboursement.statut === "EN_COURS" && (
            <>
              <strong>Remboursement en cours : {montantAbonnement(remboursement.montant, remboursement.devise)}</strong>
              <p>
                {remboursement.mode === "SCANLINKPAY"
                  ? "Il arrivera sur votre compte ScanLinkPay."
                  : "L'hôtel vous contactera pour vous rembourser."}
              </p>
            </>
          )}
          {remboursement.statut === "EFFECTUE" && (
            <strong>
              Remboursement effectué : {montantAbonnement(remboursement.montant, remboursement.devise)}
              {remboursement.mode ? ` par ${LIBELLE_MODE[remboursement.mode]}` : ""}
              {remboursement.le ? ` le ${dateAbonnement(remboursement.le)}` : ""}
            </strong>
          )}
          {remboursement.statut === "CONSERVE" && (
            <>
              <strong>Acompte conservé par l'hôtel : {montantAbonnement(remboursement.montant, remboursement.devise)}</strong>
              <p>Selon les conditions d'annulation de l'hôtel, cet acompte n'est pas remboursé.</p>
            </>
          )}
        </div>
      )}

      {/* Écran du paiement : zone annoncée aux lecteurs d'écran à chaque changement, et le focus y est ramené à chaque étape (attente, réussite, échec). */}
      <div ref={panneau} tabIndex={-1} className="acompte-panneau" aria-live="polite">
        {etat.phase === "envoi" && (
          <div className="acompte-etat acompte-etat--attente">
            <span className="acompte-etat__rond" aria-hidden="true">
              <span className="acompte-spinner" />
            </span>
            <p>Envoi de votre demande de paiement…</p>
          </div>
        )}

        {etat.phase === "attente" && !attenteCarte && (
          <div className="acompte-etat acompte-etat--attente">
            <span className="acompte-etat__rond" aria-hidden="true">
              <Smartphone size={26} />
            </span>
            <h3>Confirmez le paiement sur votre téléphone</h3>
            <p>
              Une demande de <strong>{etat.paiement ? fmt(etat.paiement.total ?? etat.paiement.montant) : fmt(acompte.reste)}</strong> a été
              envoyée{etat.paiement?.telephoneMasque ? ` au ${etat.paiement.telephoneMasque}` : " à votre téléphone"}. Saisissez votre code secret
              Mobile Money pour valider. Ne quittez pas cette page.
            </p>
            <p className="acompte-chrono" aria-hidden="true">
              <span className="acompte-spinner acompte-spinner--petit" /> En attente depuis {chronometre(etat.secondes)}
            </p>
            {etat.lent && (
              <div className="acompte-conseils">
                <p>
                  <strong>Toujours rien ?</strong> Quelques vérifications :
                </p>
                <ul>
                  <li>Votre téléphone est allumé et capte le réseau.</li>
                  <li>Votre compte Mobile Money a assez d'argent, frais compris.</li>
                  <li>Vous avez bien saisi votre code secret (et non le code de votre carte SIM).</li>
                </ul>
                <p>Vous pouvez fermer cette page : votre acompte sera pris en compte dès confirmation.</p>
              </div>
            )}
            {etat.peutReessayer && (
              <button type="button" className="hotel-bouton hotel-bouton--contour" onClick={reessayer}>
                Réessayer
              </button>
            )}
          </div>
        )}

        {etat.phase === "attente" && attenteCarte && (
          <div className="acompte-etat acompte-etat--attente">
            <span className="acompte-etat__rond" aria-hidden="true">
              <CreditCard size={26} />
            </span>
            {redirigeVers ? (
              <>
                <h3>Redirection vers la page de paiement sécurisée…</h3>
                <p>
                  Vous allez saisir votre carte sur la page sécurisée de paiement. <a href={redirigeVers}>Cliquez ici si rien ne se passe</a>.
                </p>
              </>
            ) : (
              <>
                <h3>Vérification de votre paiement…</h3>
                <p>Nous attendons la confirmation de votre banque. Cela ne prend généralement que quelques instants.</p>
                {urlCarte && (
                  <p>
                    <a className="hotel-bouton hotel-bouton--primaire" href={urlCarte}>
                      Reprendre le paiement par carte
                    </a>
                  </p>
                )}
                {etat.lent && <p>Vous pouvez fermer cette page : votre acompte sera pris en compte dès confirmation.</p>}
                {etat.peutReessayer && (
                  <button type="button" className="hotel-bouton hotel-bouton--contour" onClick={reessayer}>
                    Payer autrement
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {etat.phase === "reussi" && (
          <div className="acompte-etat acompte-etat--succes">
            <span className="acompte-etat__rond" aria-hidden="true">
              <CircleCheck size={28} />
            </span>
            <h3>Merci, votre acompte est bien reçu !</h3>
            <p>
              Nous avons bien reçu {montantPaye}.{" "}
              {statutReservation === "CONFIRMEE" ? "Votre réservation est confirmée." : "L'hôtel est prévenu et vous confirmera votre réservation."}
            </p>
          </div>
        )}

        {etat.phase === "echec" && (
          <div className="acompte-etat acompte-etat--echec">
            <span className="acompte-etat__rond" aria-hidden="true">
              <CircleX size={28} />
            </span>
            <h3>Le paiement n'a pas abouti</h3>
            <p>{etat.message ?? "Le paiement n'a pas abouti."} Rien n'a été débité si le paiement n'a pas été confirmé.</p>
            <button type="button" className="hotel-bouton hotel-bouton--primaire" onClick={reessayer}>
              Réessayer
            </button>
          </div>
        )}

        {etat.phase === "saisie" && !formulaireVisible && (
          <>
            {acompte.disponible ? (
              <div className="acompte-appel">
                <button type="button" className="acompte-bouton-payer" onClick={ouvrirFormulaire}>
                  <Lock size={18} aria-hidden="true" />
                  Payer l'acompte · {fmt(acompte.reste)}
                </button>
                <div className="acompte-appel__moyens">
                  {acompte.moyens.mobileMoney && <LogosMobileMoney taille={24} />}
                  {acompte.moyens.carte && <LogosCartes taille={24} />}
                </div>
              </div>
            ) : (
              acompte.indisponibleRaison && <p className="acompte-indisponible">{acompte.indisponibleRaison}</p>
            )}
          </>
        )}
      </div>

      {formulaireVisible && (
        <form className="acompte-formulaire" onSubmit={envoyer} noValidate aria-labelledby={idTitreForm}>
          <h3 id={idTitreForm} ref={titreFormulaire} tabIndex={-1} className="acompte-formulaire__titre">
            Payer l'acompte
          </h3>

          {moyensDispos.length > 1 ? (
            <fieldset className="acompte-groupe" role="radiogroup" aria-labelledby={idMoyen}>
              <legend id={idMoyen}>1. Comment voulez-vous payer ?</legend>
              <div className="acompte-moyens">
                {acompte.moyens.mobileMoney && (
                  <CarteChoix
                    name={idMoyen}
                    value="MOBILE_MONEY"
                    checked={moyenActif === "MOBILE_MONEY"}
                    onChange={() => setMoyen("MOBILE_MONEY")}
                    titre="Mobile Money"
                    detail="M-Pesa, Airtel Money, Orange Money, Africell"
                    visuel={<LogosMobileMoney taille={26} />}
                  />
                )}
                {acompte.moyens.carte && (
                  <CarteChoix
                    name={idMoyen}
                    value="CARTE"
                    checked={moyenActif === "CARTE"}
                    onChange={() => setMoyen("CARTE")}
                    titre="Carte bancaire"
                    detail="Visa, Mastercard"
                    visuel={<LogosCartes taille={26} />}
                  />
                )}
              </div>
            </fieldset>
          ) : (
            <p className="acompte-moyen-unique">
              {moyenActif === "CARTE" ? <LogosCartes taille={24} /> : <LogosMobileMoney taille={24} />}
              <span>
                Paiement par <strong>{moyenActif === "CARTE" ? "carte bancaire (Visa, Mastercard)" : "Mobile Money"}</strong>
              </span>
            </p>
          )}

          {moyenActif === "MOBILE_MONEY" && (
            <>
              <fieldset className="acompte-groupe" role="radiogroup" aria-labelledby={idReseau}>
                <legend id={idReseau}>{moyensDispos.length > 1 ? "2. " : ""}Votre réseau Mobile Money</legend>
                <div className="acompte-reseaux">
                  {LISTE_OPERATEURS.map((op) => (
                    <CarteChoix
                      key={op}
                      name={idReseau}
                      value={op}
                      checked={operateur === op}
                      onChange={() => {
                        setOperateur(op);
                        setOperateurChoisiAMain(true);
                      }}
                      titre={OPERATEURS_MOBILE_MONEY[op].libelle}
                      visuel={<LogoOperateur operateur={op} taille={40} />}
                      compact
                    />
                  ))}
                </div>
              </fieldset>

              <label className="label acompte-label" htmlFor={idTel}>
                {moyensDispos.length > 1 ? "3. " : ""}Votre numéro Mobile Money
              </label>
              <div className={`acompte-tel ${afficherProbleme ? "acompte-tel--erreur" : ""}`}>
                <span className="acompte-tel__prefixe" aria-hidden="true">
                  {operateurDetecte ? <LogoOperateur operateur={operateurDetecte} taille={26} /> : <Smartphone size={20} />}
                  <span>+243</span>
                </span>
                <input
                  id={idTel}
                  ref={champTelephone}
                  className="acompte-tel__saisie"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder="0828 497 218"
                  value={telephone}
                  onChange={(e) => surTelephone(e.target.value)}
                  onBlur={() => telephone.trim() !== "" && setTouche(true)}
                  aria-invalid={afficherProbleme}
                  aria-describedby={idTelAide}
                />
              </div>
              <p id={idTelAide} className={afficherProbleme ? "erreur acompte-aide" : "acompte-aide"} role={afficherProbleme ? "alert" : undefined}>
                {afficherProbleme ? problemeTel : "C'est sur ce numéro que vous recevrez la demande de confirmation."}
              </p>
            </>
          )}

          {moyenActif === "CARTE" && (
            <p className="acompte-info">
              <Lock size={16} aria-hidden="true" />
              <span>
                Vous serez dirigé vers la page de paiement sécurisée pour saisir votre carte Visa ou Mastercard. Vos informations de carte ne
                passent jamais par ce site.
              </span>
            </p>
          )}

          <details className="acompte-slp">
            <summary>Être remboursé sur ScanLinkPay en cas d'annulation (facultatif)</summary>
            <label className="label" htmlFor={idSlp}>
              Votre numéro ScanLinkPay
            </label>
            <input
              id={idSlp}
              className="champ"
              type="tel"
              inputMode="numeric"
              autoComplete="off"
              maxLength={20}
              placeholder="SLP-…"
              value={numeroScanLinkPay}
              onChange={(e) => setNumeroScanLinkPay(e.target.value)}
              aria-describedby={idSlpAide}
            />
            <p id={idSlpAide} className="acompte-aide">
              Le remboursement arrive alors directement sur votre compte. Vous n'en avez pas ?{" "}
              {lienCreation ? (
                <a href={lienCreation} target="_blank" rel="noopener noreferrer">
                  Créez-le gratuitement<span className="visuellement-cache"> (s'ouvre dans un nouvel onglet)</span>
                </a>
              ) : (
                "Vous pourrez le créer gratuitement dans l'application ScanLinkPay."
              )}
            </p>
          </details>

          <div className="acompte-recap" aria-live="polite">
            {!apercuCharge ? (
              <p className="acompte-recap__calcul">
                <span className="acompte-spinner acompte-spinner--petit" aria-hidden="true" /> Calcul des frais…
              </p>
            ) : (
              <dl>
                <div>
                  <dt>Acompte</dt>
                  <dd>{fmt(montantAPayer)}</dd>
                </div>
                {fraisClient > 0 && (
                  <div>
                    <dt>Frais ScanLinkPay</dt>
                    <dd>{fmt(fraisClient)}</dd>
                  </div>
                )}
                <div className="acompte-recap__total">
                  <dt>Total à payer</dt>
                  <dd>{fmt(totalAPayer)}</dd>
                </div>
              </dl>
            )}
          </div>

          <Captcha key={cleCaptcha} onJeton={setJetonCaptcha} />

          {(erreurLocale || etat.message) && (
            <p className="erreur acompte-erreur" role="alert">
              {erreurLocale ?? etat.message}
            </p>
          )}

          <button type="submit" className="acompte-bouton-payer" disabled={!apercuCharge || (captchaActif && !jetonCaptcha)}>
            <Lock size={18} aria-hidden="true" />
            {apercuCharge ? `Payer ${fmt(totalAPayer)}` : "Payer l'acompte"}
          </button>
          <p className="acompte-securite">
            <ShieldCheck size={15} aria-hidden="true" /> Paiement sécurisé par ScanLinkPay.
            {moyenActif === "MOBILE_MONEY" ? " Vous validez avec votre code secret, sur votre téléphone." : ""}
          </p>
          <button type="button" className="acompte-retour" onClick={() => setFormulaireOuvert(false)}>
            Retour
          </button>
        </form>
      )}

      <aside className="acompte-promo" aria-label="À propos de ScanLinkPay">
        <p>
          <strong>ScanLinkPay</strong> réunit Mobile Money et carte, et rembourse directement sur votre compte.
          {lienCreation && (
            <>
              {" "}
              <a href={lienCreation} target="_blank" rel="noopener noreferrer">
                Créer mon compte gratuit<span className="visuellement-cache"> (s'ouvre dans un nouvel onglet)</span>
              </a>
            </>
          )}
        </p>
      </aside>
    </section>
  );
}
