import * as React from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  BadgeCheck,
  CalendarClock,
  CircleAlert,
  CircleCheck,
  CircleX,
  Coins,
  Crown,
  Lock,
  LogOut,
  Mail,
  MessageCircle,
  Phone,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Zap,
} from "lucide-react";
import { ClientApi, ErreurApi, SuiviPaiement, connecterViaApi } from "@hotel-chicago/api-client";
import type { EtatSuivi } from "@hotel-chicago/api-client";
import {
  LISTE_OPERATEURS,
  OPERATEURS_MOBILE_MONEY,
  dateAbonnement,
  lienWhatsApp,
  montantAbonnement,
  operateurDuNumero,
  problemeNumero,
  resumerAbonnement,
} from "@hotel-chicago/regles";
import { Role, formaterSaisieRdc } from "@hotel-chicago/types";
import { ChampTelephone, telephoneDepuisSaisie } from "@hotel-chicago/ui";
import type { ApercuPaiement, DemandePaiementAbonnement, EtatAbonnement, FormuleProposee, OperateurMobileMoney, PaiementAbonnementVue, VueAbonnement } from "@hotel-chicago/types";
import { configuration } from "../config";
import { ChampAuth } from "../auth/ChampAuth";
import { PiedPage } from "../accueil/PiedPage";
import { CarteChoix } from "../paiement/CarteChoix";
import { LogoOperateur, LogosMobileMoney } from "../paiement/LogosPaiement";
import "../paiement/suivi.css";
import "./payer.css";

/**
 * « Payer mon abonnement » sur le site (refonte du 17/10/2026 : une vraie page, plus une carte dans un cadre). Le patron se connecte
 * avec son numéro et son mot de passe, choisit sa formule et paie par Mobile Money (ScanLinkPay). C'est la voie de paiement qui marche
 * partout — navigateur d'un téléphone, d'un ordinateur — et qui ne dépend d'aucun magasin d'applications. Le jeton de session reste EN
 * MÉMOIRE : fermer l'onglet déconnecte, rien n'est écrit sur l'appareil. Les prix, la commission et le montant débité viennent du
 * serveur ; ici on présente et on suit le paiement (SuiviPaiement). Moyens de paiement présentés comme l'acompte d'une réservation
 * (mêmes cartes à logos, `paiement/CarteChoix`, `paiement/suivi.css`).
 */

type DemandeSaisie = Omit<DemandePaiementAbonnement, "cleIdempotence">;
type Complement = EtatAbonnement;

const chronometre = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const libelleDuree = (mois: number) => (mois === 12 ? "1 an" : `${mois} mois`);

/** Courbe douce commune aux apparitions de la page. */
const EASE = [0.22, 1, 0.36, 1] as const;

interface Session {
  client: ClientApi;
  nom: string;
  hotelNom: string;
}

function messageConnexion(e: unknown): string {
  if (e instanceof ErreurApi && e.statusCode === 0) return "Impossible de joindre le serveur. Vérifiez votre connexion internet puis réessayez.";
  return e instanceof Error ? e.message : "Connexion impossible. Réessayez.";
}

/** Apparition douce (fondu + léger glissement), sans animation si l'utilisateur l'a demandé. */
function Entree({ children, delai = 0, className }: { children: React.ReactNode; delai?: number; className?: string }) {
  const reduit = useReducedMotion();
  if (reduit) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: delai, ease: EASE }}>
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------

export function EcranPayerAbonnement() {
  const [params] = useSearchParams();
  const [session, setSession] = useState<Session | null>(null);
  // Le numéro est l'identifiant de connexion (15/10/2026) ; `?email=` reste lu pour un ancien compte.
  const telephoneInitial = params.get("telephone") ?? "";
  const emailInitial = params.get("email") ?? "";

  return (
    <div className="pay">
      <div className="pay__fond" aria-hidden="true" />
      <main className="pay__contenu">
        {session ? (
          <PaiementAbonnement session={session} onDeconnexion={() => setSession(null)} />
        ) : (
          <Connexion telephoneInitial={telephoneInitial} emailInitial={emailInitial} onConnecte={setSession} />
        )}
      </main>
      <PiedPage />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------

const ETAPES_INTRO = [
  { icone: Lock, titre: "Connectez-vous", texte: "Avec le numéro et le mot de passe du patron de l'hôtel." },
  { icone: Crown, titre: "Choisissez votre formule", texte: "Mensuelle ou annuelle, en dollars ou en francs congolais." },
  { icone: Smartphone, titre: "Validez sur votre téléphone", texte: "Votre code secret Mobile Money, et l'hôtel reste ouvert sans coupure." },
];

function Connexion({ telephoneInitial, emailInitial, onConnecte }: { telephoneInitial: string; emailInitial: string; onConnecte: (s: Session) => void }) {
  const [parEmail, setParEmail] = useState(Boolean(emailInitial) && !telephoneInitial);
  const [telephone, setTelephone] = useState(() => formaterSaisieRdc(telephoneInitial.replace(/^\+?243/, "")));
  const [email, setEmail] = useState(emailInitial);
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    let identifiant: string;
    if (parEmail) {
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErreur("Saisissez une adresse e-mail valide.");
      identifiant = email.trim();
    } else {
      const numero = telephoneDepuisSaisie(telephone);
      if (!numero) return setErreur("Numéro invalide : 9 chiffres commençant par 8 ou 9 (ex. 970 000 000).");
      identifiant = numero;
    }
    if (!motDePasse) return setErreur("Saisissez votre mot de passe.");
    setErreur(null);
    setEnCours(true);
    try {
      const jeton = await connecterViaApi([configuration.apiUrl], identifiant, motDePasse);
      const client = new ClientApi(configuration.apiUrl, () => jeton.accessToken);
      const profil = await client.moi();
      if (profil.role !== Role.PATRON) {
        setErreur("Seul le patron de l'hôtel peut payer l'abonnement. Connectez-vous avec le numéro du patron.");
        return;
      }
      onConnecte({ client, nom: profil.nom, hotelNom: profil.hotelNom });
    } catch (err) {
      setErreur(messageConnexion(err));
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="pay-intro">
      <Entree className="pay-intro__texte">
        <span className="pay-pastille">
          <ShieldCheck size={15} aria-hidden="true" /> Paiement sécurisé par ScanLinkPay
        </span>
        <h1 className="pay-intro__titre">
          Payez votre abonnement <span>en deux minutes</span>
        </h1>
        <p className="pay-intro__sous-titre">Par Mobile Money, depuis votre téléphone ou votre ordinateur. Votre hôtel reste ouvert sans interruption.</p>
        <ol className="pay-intro__etapes">
          {ETAPES_INTRO.map(({ icone: Icone, titre, texte }, i) => (
            <li key={titre}>
              <span className="pay-intro__numero" aria-hidden="true">
                <Icone size={18} />
              </span>
              <span>
                <strong>
                  {i + 1}. {titre}
                </strong>
                <small>{texte}</small>
              </span>
            </li>
          ))}
        </ol>
        <div className="pay-intro__logos">
          <LogosMobileMoney taille={34} />
          <span>M-Pesa · Airtel Money · Orange Money · Africell</span>
        </div>
      </Entree>

      <Entree className="pay-carte pay-connexion" delai={0.1}>
        <div className="pay-connexion__tete">
          <img src="/logo-hotelsaver.png" alt="" width="48" height="48" />
          <div>
            <h2>Connexion du patron</h2>
            <p>Pour accéder à l'abonnement de votre hôtel.</p>
          </div>
        </div>
        <form onSubmit={envoyer} noValidate className="pay-connexion__form">
          {parEmail ? (
            <ChampAuth id="payer-email" libelle="Adresse e-mail" icone={Mail} type="email" autoComplete="email" valeur={email} onChange={setEmail} />
          ) : (
            <div className="champ-auth">
              <label htmlFor="payer-telephone">Numéro de téléphone</label>
              <ChampTelephone id="payer-telephone" value={telephone} onChange={setTelephone} required />
            </div>
          )}
          <button type="button" className="pay-lien pay-lien--discret" onClick={() => setParEmail((v) => !v)}>
            {parEmail ? "Utiliser mon numéro de téléphone" : "Ancien compte ? Utiliser mon e-mail"}
          </button>
          <ChampAuth id="payer-mdp" libelle="Mot de passe" icone={Lock} type="password" autoComplete="current-password" valeur={motDePasse} onChange={setMotDePasse} />
          <AnimatePresence>
            {erreur && (
              <motion.p className="pay-erreur" role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                <CircleAlert size={17} aria-hidden="true" /> {erreur}
              </motion.p>
            )}
          </AnimatePresence>
          <button type="submit" className="acompte-bouton-payer pay-bouton-plein" disabled={enCours}>
            {enCours ? <span className="acompte-spinner acompte-spinner--petit pay-spinner-blanc" aria-hidden="true" /> : <Lock size={18} aria-hidden="true" />}
            {enCours ? "Connexion…" : "Continuer"}
          </button>
        </form>
        <div className="pay-connexion__liens">
          <Link to="/mot-de-passe-oublie" className="pay-lien">
            Mot de passe oublié ?
          </Link>
          <Link to="/inscription" className="pay-lien pay-lien--discret">
            Pas encore de compte ? <strong>Créer le compte de mon hôtel</strong>
          </Link>
        </div>
      </Entree>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------

function PaiementAbonnement({ session, onDeconnexion }: { session: Session; onDeconnexion: () => void }) {
  const { client } = session;
  const [vue, setVue] = useState<VueAbonnement | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function charger() {
    try {
      setVue(await client.abonnement());
      setErreur(null);
    } catch (e) {
      // Session expirée : retour à la connexion plutôt qu'une erreur incompréhensible.
      if (e instanceof ErreurApi && e.statusCode === 401) return onDeconnexion();
      setErreur(e instanceof Error ? e.message : "L'abonnement n'a pas pu être chargé. Réessayez.");
    }
  }

  useEffect(() => {
    void charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resume = vue ? resumerAbonnement(vue.etat, vue.formuleActuelle) : null;

  return (
    <div className="pay-page">
      <Entree className={`pay-tete pay-tete--${resume?.niveau ?? "ok"}`}>
        <div className="pay-tete__haut">
          <span className="pay-tete__surtitre">Abonnement HotelSaver</span>
          <button type="button" className="pay-tete__deconnexion" onClick={onDeconnexion}>
            <LogOut size={15} aria-hidden="true" /> Se déconnecter
          </button>
        </div>
        <h1 className="pay-tete__titre">{session.hotelNom}</h1>
        <p className="pay-tete__session">Connecté : {session.nom}</p>
        {resume && (
          <div className="pay-tete__etat" aria-live="polite">
            <span className="pay-tete__badge">
              {resume.niveau === "ok" ? <BadgeCheck size={17} aria-hidden="true" /> : <CircleAlert size={17} aria-hidden="true" />}
              <strong>{resume.titre}</strong>
            </span>
            <span className="pay-tete__detail">{resume.detail}</span>
          </div>
        )}
      </Entree>

      {erreur && (
        <p className="pay-erreur" role="alert">
          <CircleAlert size={17} aria-hidden="true" /> {erreur}{" "}
          <button type="button" className="pay-lien" onClick={() => void charger()}>
            Réessayer
          </button>
        </p>
      )}
      {!vue && !erreur && (
        <div className="pay-squelettes" aria-busy="true">
          <div className="suivi-squelette" />
          <div className="suivi-squelette" />
          <p className="visuellement-cache" role="status">
            Chargement de votre abonnement…
          </p>
        </div>
      )}
      {vue && <Formulaire client={client} vue={vue} onActualise={charger} />}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------

function Formulaire({ client, vue, onActualise }: { client: ClientApi; vue: VueAbonnement; onActualise: () => Promise<void> }) {
  const idBase = useId();
  const idForm = `${idBase}-form`;
  const reduit = useReducedMotion();

  // --- Déroulé du paiement ---
  const suivi = useMemo(
    () =>
      new SuiviPaiement<PaiementAbonnementVue, DemandeSaisie, Complement>({
        lancer: (demande, cle) => client.payerAbonnement({ ...demande, cleIdempotence: cle }),
        lire: async (id) => {
          const r = await client.paiementAbonnement(id);
          return { paiement: r.paiement, complement: r.etat };
        },
      }),
    [client]
  );
  const [etat, setEtat] = useState<EtatSuivi<PaiementAbonnementVue, Complement>>(suivi.etat());
  useEffect(() => {
    const quitter = suivi.onChangement(setEtat);
    return () => {
      quitter();
      suivi.arreter();
    };
  }, [suivi]);

  // Page rouverte pendant qu'une demande attend sur le téléphone : on reprend l'attente.
  const repris = useRef<string | null>(null);
  useEffect(() => {
    const enCours = vue.paiementEnCours;
    if (!enCours || enCours.statut !== "EN_ATTENTE" || repris.current === enCours.id) return;
    if (suivi.etat().phase !== "saisie") return;
    repris.current = enCours.id;
    suivi.reprendre(enCours);
  }, [vue.paiementEnCours, suivi]);

  // Fin du paiement : on relit l'abonnement (une seule fois par paiement).
  const dejaRelu = useRef<string | null>(null);
  useEffect(() => {
    const id = etat.paiement?.id;
    if ((etat.phase === "reussi" || etat.phase === "echec") && id && dejaRelu.current !== id) {
      dejaRelu.current = id;
      void onActualise();
    }
  }, [etat.phase, etat.paiement?.id, onActualise]);

  // --- Choix ---
  const nombreChambres = vue.nombreChambres;
  const convient = (f: FormuleProposee) => f.maxChambres === null || f.maxChambres >= nombreChambres;
  const possibles = vue.formules.filter(convient);
  const [formuleCode, setFormuleCode] = useState<string | undefined>(() => (possibles.find((f) => f.code === vue.formuleActuelle) ?? possibles.find((f) => f.recommandee) ?? possibles[0] ?? vue.formules[0])?.code);
  const [mois, setMois] = useState(1);
  const [devise, setDevise] = useState<"USD" | "CDF">("USD");
  const [operateur, setOperateur] = useState<OperateurMobileMoney | null>(null);
  const [operateurAMain, setOperateurAMain] = useState(false);
  const [telephone, setTelephone] = useState("");
  const [touche, setTouche] = useState(false);
  const champTel = useRef<HTMLInputElement>(null);

  const formule = vue.formules.find((f) => f.code === formuleCode);
  const duree = formule?.durees.find((d) => d.mois === mois) ?? formule?.durees[0];
  const prix = duree ? (devise === "USD" ? duree.prixUsd : duree.prixCdf) : null;

  const cle = formule && duree ? `${formule.code}|${duree.mois}|${devise}` : null;
  const [apercu, setApercu] = useState<{ cle: string; valeur: ApercuPaiement | null } | null>(null);
  useEffect(() => {
    if (!formule || !duree || !cle) return;
    let actif = true;
    client
      .apercuAbonnement(formule.code, duree.mois, devise)
      .then((valeur) => actif && setApercu({ cle, valeur }))
      .catch(() => actif && setApercu({ cle, valeur: null }));
    return () => {
      actif = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle, client]);
  const apercuCharge = apercu !== null && apercu.cle === cle;
  const apercuUtile = apercuCharge && apercu?.valeur?.disponible ? apercu.valeur : null;
  const total = apercuUtile ? apercuUtile.total : prix;
  const frais = apercuUtile ? Math.max(0, Math.round((apercuUtile.total - apercuUtile.montant) * 100) / 100) : 0;

  function surTelephone(v: string) {
    setTelephone(v);
    const reconnu = operateurDuNumero(v);
    if (reconnu && !operateurAMain) setOperateur(reconnu);
  }
  const chiffres = telephone.replace(/\D/g, "").length;
  const problemeTel = problemeNumero(operateur, telephone);
  const afficherProbleme = problemeTel !== null && (touche || (telephone.trim() !== "" && (chiffres >= 9 || operateurDuNumero(telephone) !== null)));

  function payer(e: React.FormEvent) {
    e.preventDefault();
    if (!formule || !duree) return;
    if (!operateur) return;
    if (problemeNumero(operateur, telephone)) {
      setTouche(true);
      champTel.current?.focus();
      return;
    }
    void suivi.payer({ formule: formule.code, mois: duree.mois, devise, operateur, telephone: telephone.trim() });
  }

  const peutPayer = vue.paiementEnLigne && vue.etat.renouvelable !== false;
  const montant = (n: number) => montantAbonnement(n, devise);
  const support = vue.contactSupport;
  const enSaisie = etat.phase === "saisie";
  const mensuelUsd = (d: { mois: number; prixUsd: number }) => d.prixUsd / d.mois;

  const lienSupport = lienWhatsApp(support.whatsapp, "Bonjour, j'ai besoin d'aide pour payer mon abonnement HotelSaver.");

  const blocSupport = (
    <div className="pay-support">
      <span>Une question ?</span>
      <a href={`tel:${support.telephone}`}>
        <Phone size={15} aria-hidden="true" /> {support.telephone}
      </a>
      <a href={lienSupport} target="_blank" rel="noopener noreferrer" className="pay-support__whatsapp">
        <MessageCircle size={15} aria-hidden="true" /> WhatsApp<span className="visuellement-cache"> (s'ouvre dans un nouvel onglet)</span>
      </a>
    </div>
  );

  return (
    <>
      {vue.etat.statut === "ESSAI" && peutPayer && (
        <p className="pay-note">
          <Sparkles size={17} aria-hidden="true" /> Vous payez avant la fin de l'essai ? Aucun jour d'essai n'est perdu : ils s'ajoutent à votre abonnement.
        </p>
      )}
      {vue.etat.renouvelable === false && (
        <p className="pay-note pay-note--alerte">
          <CircleAlert size={17} aria-hidden="true" /> Contactez le support HotelSaver pour rouvrir l'accès de votre hôtel.
        </p>
      )}
      {vue.etat.renouvelable !== false && !vue.paiementEnLigne && (
        <p className="pay-note pay-note--alerte">
          <CircleAlert size={17} aria-hidden="true" /> Le paiement en ligne n'est pas encore disponible. Contactez le support HotelSaver pour payer.
        </p>
      )}

      {/* États du paiement : remplacent le formulaire, avec une transition douce. */}
      <AnimatePresence mode="wait">
        {!enSaisie && (
          <motion.section
            key={etat.phase}
            className="pay-carte pay-etat-carte"
            initial={reduit ? false : { opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduit ? undefined : { opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.35, ease: EASE }}
            aria-live="polite"
          >
            {etat.phase === "envoi" && (
              <div className="acompte-etat acompte-etat--attente">
                <span className="acompte-etat__rond" aria-hidden="true">
                  <span className="acompte-spinner" />
                </span>
                <h2>Envoi de votre demande de paiement…</h2>
              </div>
            )}

            {etat.phase === "attente" && (
              <div className="acompte-etat acompte-etat--attente" role="status">
                <span className="acompte-etat__rond pay-pulse" aria-hidden="true">
                  <Smartphone size={28} />
                </span>
                <h2>Confirmez le paiement sur votre téléphone</h2>
                <p>
                  Une demande de <strong>{etat.paiement ? montantAbonnement(etat.paiement.total ?? etat.paiement.montant, etat.paiement.devise) : ""}</strong> a été
                  envoyée{etat.paiement?.telephoneMasque ? ` au ${etat.paiement.telephoneMasque}` : " à votre téléphone"}. Saisissez votre code secret
                  Mobile Money pour valider. Ne quittez pas cette page.
                </p>
                <p className="acompte-chrono" aria-hidden="true">
                  <span className="acompte-spinner acompte-spinner--petit" /> En attente depuis {chronometre(etat.secondes)}
                </p>
                {etat.lent && (
                  <div className="acompte-conseils">
                    <p>
                      <strong>Toujours rien ?</strong>
                    </p>
                    <ul>
                      <li>Votre téléphone est allumé et capte le réseau.</li>
                      <li>Votre compte Mobile Money a assez d'argent, frais compris.</li>
                      <li>Vous avez saisi votre code secret Mobile Money (pas le code de la carte SIM).</li>
                    </ul>
                    <p>Vous pouvez fermer cette page : votre abonnement sera prolongé dès la confirmation.</p>
                  </div>
                )}
                {etat.peutReessayer && (
                  <button type="button" className="hotel-bouton hotel-bouton--contour pay-bouton-contour" onClick={() => suivi.reinitialiser()}>
                    Réessayer
                  </button>
                )}
              </div>
            )}

            {etat.phase === "reussi" && (
              <div className="acompte-etat acompte-etat--succes" role="status">
                <motion.span
                  className="acompte-etat__rond"
                  aria-hidden="true"
                  initial={reduit ? false : { scale: 0.4, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 320, damping: 16 }}
                >
                  <CircleCheck size={30} />
                </motion.span>
                <h2>Merci, votre abonnement est payé !</h2>
                <p>
                  {etat.paiement?.periodeCouverteJusquau ?? etat.complement?.valideJusquau
                    ? `Votre hôtel est ouvert jusqu'au ${dateAbonnement((etat.paiement?.periodeCouverteJusquau ?? etat.complement?.valideJusquau) as string)}.`
                    : "Votre hôtel est ouvert."}{" "}
                  Ouvrez l'application HotelSaver : elle se met à jour toute seule.
                </p>
              </div>
            )}

            {etat.phase === "echec" && (
              <div className="acompte-etat acompte-etat--echec" role="alert">
                <span className="acompte-etat__rond" aria-hidden="true">
                  <CircleX size={30} />
                </span>
                <h2>Le paiement n'a pas abouti</h2>
                <p>{etat.message ?? "Le paiement n'a pas abouti."} Rien n'a été débité si le paiement n'a pas été confirmé.</p>
                <button type="button" className="acompte-bouton-payer pay-bouton-auto" onClick={() => suivi.reinitialiser()}>
                  Réessayer
                </button>
              </div>
            )}
            {blocSupport}
          </motion.section>
        )}
      </AnimatePresence>

      {peutPayer && enSaisie && formule && (
        <div className="pay-grille">
          <form id={idForm} className="pay-etapes" onSubmit={payer} noValidate>
            {/* 1. Formule */}
            <Entree className="pay-carte pay-etape" delai={0.05}>
              <h2 className="pay-etape__titre">
                <span className="pay-etape__numero">1</span> Choisissez votre formule
              </h2>
              <div className="pay-formules" role="radiogroup" aria-label="Formule">
                {vue.formules.map((f) => {
                  const trop = !convient(f);
                  const mensuel = devise === "USD" ? f.prixMensuelUsd : f.durees.find((d) => d.mois === 1)?.prixCdf ?? 0;
                  const actif = f.code === formuleCode;
                  return (
                    <label key={f.code} className={`pay-formule${actif ? " pay-formule--actif" : ""}${trop ? " pay-formule--inactif" : ""}${f.recommandee ? " pay-formule--recommandee" : ""}`}>
                      <input
                        type="radio"
                        className="pay-formule__radio"
                        name={`${idBase}-formule`}
                        value={f.code}
                        checked={actif}
                        disabled={trop}
                        onChange={() => setFormuleCode(f.code)}
                      />
                      {f.recommandee && (
                        <span className="pay-formule__ruban">
                          <Zap size={12} aria-hidden="true" /> Le plus choisi
                        </span>
                      )}
                      <span className="pay-formule__nom">{f.nom}</span>
                      <span className="pay-formule__prix">
                        {montant(mensuel)} <small>/ mois</small>
                      </span>
                      <span className="pay-formule__description">{f.description}</span>
                      <ul className="pay-formule__inclus">
                        {/* Sans doublon : une même ligne peut venir du plafond et des fonctions de la formule. */}
                        {[...new Set(f.inclus)].map((l) => (
                          <li key={l}>
                            <CircleCheck size={15} aria-hidden="true" /> {l}
                          </li>
                        ))}
                      </ul>
                      {trop && (
                        <span className="pay-formule__trop">
                          Votre hôtel a {nombreChambres} chambres : cette formule en accepte {f.maxChambres} au maximum.
                        </span>
                      )}
                      <span className="pay-formule__coche" aria-hidden="true">
                        <CircleCheck size={20} />
                      </span>
                    </label>
                  );
                })}
              </div>
            </Entree>

            {/* 2. Durée et monnaie */}
            <Entree className="pay-carte pay-etape" delai={0.1}>
              <h2 className="pay-etape__titre">
                <span className="pay-etape__numero">2</span> Durée et monnaie
              </h2>
              <p className="pay-etape__libelle">
                <CalendarClock size={16} aria-hidden="true" /> Pour combien de temps ?
              </p>
              <div className="pay-pilules" role="radiogroup" aria-label="Durée">
                {formule.durees.map((d) => {
                  const actif = d.mois === duree?.mois;
                  const economie = formule.durees[0] && d.mois > 1 ? Math.round((1 - mensuelUsd(d) / mensuelUsd(formule.durees[0])) * 100) : 0;
                  return (
                    <label key={d.mois} className={`pay-pilule${actif ? " pay-pilule--actif" : ""}`}>
                      <input type="radio" className="pay-formule__radio" name={`${idBase}-duree`} value={d.mois} checked={actif} onChange={() => setMois(d.mois)} />
                      <span className="pay-pilule__duree">{libelleDuree(d.mois)}</span>
                      <span className="pay-pilule__prix">{montant(devise === "USD" ? d.prixUsd : d.prixCdf)}</span>
                      {d.moisOfferts > 0 ? (
                        <span className="pay-pilule__bonus">{d.moisOfferts} mois offerts</span>
                      ) : economie > 0 ? (
                        <span className="pay-pilule__bonus">−{economie} %</span>
                      ) : null}
                    </label>
                  );
                })}
              </div>
              <p className="pay-etape__libelle">
                <Coins size={16} aria-hidden="true" /> Dans quelle monnaie ?
              </p>
              <div className="pay-bascule" role="radiogroup" aria-label="Monnaie">
                {(
                  [
                    ["USD", "Dollars", "USD"],
                    ["CDF", "Francs congolais", "FC"],
                  ] as const
                ).map(([code, libelle, sigle]) => (
                  <label key={code} className={`pay-bascule__option${devise === code ? " pay-bascule__option--actif" : ""}`}>
                    <input type="radio" className="pay-formule__radio" name={`${idBase}-devise`} value={code} checked={devise === code} onChange={() => setDevise(code)} />
                    <strong>{sigle}</strong> {libelle}
                  </label>
                ))}
              </div>
            </Entree>

            {/* 3. Paiement Mobile Money — mêmes cartes à logos que l'acompte d'une réservation. */}
            <Entree className="pay-carte pay-etape" delai={0.15}>
              <h2 className="pay-etape__titre">
                <span className="pay-etape__numero">3</span> Payer avec Mobile Money
              </h2>
              <fieldset className="acompte-groupe" role="radiogroup" aria-labelledby={`${idBase}-reseau`}>
                <legend id={`${idBase}-reseau`}>Votre réseau Mobile Money</legend>
                <div className="acompte-reseaux">
                  {LISTE_OPERATEURS.map((op) => (
                    <CarteChoix
                      key={op}
                      name={`${idBase}-operateur`}
                      value={op}
                      checked={operateur === op}
                      onChange={() => {
                        setOperateur(op);
                        setOperateurAMain(true);
                      }}
                      titre={OPERATEURS_MOBILE_MONEY[op].libelle}
                      visuel={<LogoOperateur operateur={op} taille={40} />}
                      compact
                    />
                  ))}
                </div>
              </fieldset>

              <label className="label acompte-label" htmlFor={`${idBase}-tel`}>
                Votre numéro Mobile Money
              </label>
              <div className={`acompte-tel ${afficherProbleme ? "acompte-tel--erreur" : ""}`}>
                <span className="acompte-tel__prefixe" aria-hidden="true">
                  {operateur ? <LogoOperateur operateur={operateur} taille={26} /> : <Smartphone size={20} />}
                  <span>+243</span>
                </span>
                <input
                  id={`${idBase}-tel`}
                  ref={champTel}
                  className="acompte-tel__saisie"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder="0828 497 218"
                  value={telephone}
                  onChange={(e) => surTelephone(e.target.value)}
                  onBlur={() => telephone.trim() !== "" && setTouche(true)}
                  aria-invalid={afficherProbleme}
                  aria-describedby={`${idBase}-tel-aide`}
                />
              </div>
              <p id={`${idBase}-tel-aide`} className={afficherProbleme ? "erreur acompte-aide" : "acompte-aide"} role={afficherProbleme ? "alert" : undefined}>
                {afficherProbleme ? problemeTel : "C'est sur ce numéro que vous recevrez la demande de confirmation."}
              </p>
            </Entree>
          </form>

          {/* Récapitulatif : colonne collante sur ordinateur, sous les étapes sur téléphone. */}
          <Entree className="pay-recap-colonne" delai={0.2}>
            <aside className="pay-carte pay-recap" aria-label="Récapitulatif">
              <h2 className="pay-recap__titre">Récapitulatif</h2>
              <div className="pay-recap__formule">
                <span className="pay-recap__icone" aria-hidden="true">
                  <Crown size={20} />
                </span>
                <div>
                  <strong>Formule {formule.nom}</strong>
                  <span>
                    {duree ? libelleDuree(duree.mois) : ""} · {devise === "USD" ? "en dollars" : "en francs congolais"}
                  </span>
                </div>
              </div>
              <div className="acompte-recap" aria-live="polite">
                {prix === null ? null : !apercuCharge ? (
                  <p className="acompte-recap__calcul">
                    <span className="acompte-spinner acompte-spinner--petit" aria-hidden="true" /> Calcul des frais…
                  </p>
                ) : (
                  <dl>
                    <div>
                      <dt>Abonnement</dt>
                      <dd>{montant(prix)}</dd>
                    </div>
                    {frais > 0 && (
                      <div>
                        <dt>Frais ScanLinkPay</dt>
                        <dd>{montant(frais)}</dd>
                      </div>
                    )}
                    <div className="acompte-recap__total">
                      <dt>Total à payer</dt>
                      <dd>{montant(total ?? prix)}</dd>
                    </div>
                  </dl>
                )}
              </div>

              <AnimatePresence>
                {etat.message && (
                  <motion.p className="pay-erreur" role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                    <CircleAlert size={17} aria-hidden="true" /> {etat.message}
                  </motion.p>
                )}
              </AnimatePresence>

              <button type="submit" form={idForm} className="acompte-bouton-payer pay-bouton-plein" disabled={!apercuCharge || !operateur || prix === null}>
                <Lock size={18} aria-hidden="true" />
                {apercuCharge && total !== null ? `Payer ${montant(total)}` : "Payer"}
              </button>
              {!operateur && <p className="pay-recap__indice">Choisissez votre réseau et saisissez votre numéro pour payer.</p>}
              <p className="acompte-securite">
                <ShieldCheck size={15} aria-hidden="true" /> Paiement sécurisé par ScanLinkPay. Vous validez avec votre code secret, sur votre téléphone.
              </p>
              {blocSupport}
            </aside>
          </Entree>
        </div>
      )}

      {vue.historique.length > 0 && (
        <Entree className="pay-carte pay-historique" delai={0.25}>
          <h2 className="pay-etape__titre pay-historique__titre">Derniers paiements</h2>
          <ul>
            {vue.historique.slice(0, 5).map((p) => {
              const ok = p.statut === "REUSSI";
              const attente = p.statut === "EN_ATTENTE";
              return (
                <li key={p.id}>
                  <span className={`pay-historique__point pay-historique__point--${ok ? "ok" : attente ? "attente" : "ko"}`} aria-hidden="true">
                    {ok ? <CircleCheck size={16} /> : attente ? <CalendarClock size={16} /> : <CircleX size={16} />}
                  </span>
                  <span className="pay-historique__date">{dateAbonnement(p.createdAt)}</span>
                  <span className="pay-historique__montant">{montantAbonnement(p.montant, p.devise)}</span>
                  <span className={`pay-historique__statut pay-historique__statut--${ok ? "ok" : attente ? "attente" : "ko"}`}>
                    {ok ? "Payé" : attente ? "En attente" : "Non abouti"}
                  </span>
                </li>
              );
            })}
          </ul>
        </Entree>
      )}

      {!(peutPayer && enSaisie && formule) && enSaisie && blocSupport}
    </>
  );
}
