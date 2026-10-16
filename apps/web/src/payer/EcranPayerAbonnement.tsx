import * as React from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Lock, Mail } from "lucide-react";
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
import { Role } from "@hotel-chicago/types";
import type { ApercuPaiement, DemandePaiementAbonnement, EtatAbonnement, FormuleProposee, OperateurMobileMoney, PaiementAbonnementVue, VueAbonnement } from "@hotel-chicago/types";
import { configuration } from "../config";
import { MiseEnPageAuth } from "../auth/MiseEnPageAuth";
import { ChampAuth } from "../auth/ChampAuth";
import "./payer.css";

/**
 * « Payer mon abonnement » sur le site : le patron se connecte avec son e-mail et son mot de passe, choisit sa formule et paie par Mobile
 * Money (ScanLinkPay). C'est la voie de paiement qui marche partout — navigateur d'un téléphone, d'un ordinateur — et qui ne dépend d'aucun
 * magasin d'applications. Le jeton de session reste EN MÉMOIRE : fermer l'onglet déconnecte, rien n'est écrit sur l'appareil.
 * Les prix, la commission et le montant débité viennent du serveur ; ici on présente et on suit le paiement (SuiviPaiement).
 */

type DemandeSaisie = Omit<DemandePaiementAbonnement, "cleIdempotence">;
type Complement = EtatAbonnement;

const chronometre = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const libelleDuree = (mois: number) => (mois === 12 ? "1 an" : `${mois} mois`);

interface Session {
  client: ClientApi;
  nom: string;
  hotelNom: string;
}

function messageConnexion(e: unknown): string {
  if (e instanceof ErreurApi && e.statusCode === 0) return "Impossible de joindre le serveur. Vérifiez votre connexion internet puis réessayez.";
  return e instanceof Error ? e.message : "Connexion impossible. Réessayez.";
}

// ---------------------------------------------------------------------------------------------------------------------------------

export function EcranPayerAbonnement() {
  const [params] = useSearchParams();
  const [session, setSession] = useState<Session | null>(null);
  const emailInitial = params.get("email") ?? "";

  return (
    <MiseEnPageAuth>
      {session ? (
        <PaiementAbonnement session={session} onDeconnexion={() => setSession(null)} />
      ) : (
        <Connexion emailInitial={emailInitial} onConnecte={setSession} />
      )}
    </MiseEnPageAuth>
  );
}

function Connexion({ emailInitial, onConnecte }: { emailInitial: string; onConnecte: (s: Session) => void }) {
  const [email, setEmail] = useState(emailInitial);
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErreur("Saisissez une adresse e-mail valide.");
    if (!motDePasse) return setErreur("Saisissez votre mot de passe.");
    setErreur(null);
    setEnCours(true);
    try {
      const jeton = await connecterViaApi([configuration.apiUrl], email.trim(), motDePasse);
      const client = new ClientApi(configuration.apiUrl, () => jeton.accessToken);
      const profil = await client.moi();
      if (profil.role !== Role.PATRON) {
        setErreur("Seul le patron de l'hôtel peut payer l'abonnement. Connectez-vous avec le compte du patron.");
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
    <div className="carte-auth">
      <img className="carte-auth__logo" src="/logo-hotelsaver.png" alt="" />
      <div className="carte-auth__marque">HotelSaver</div>
      <h1 className="carte-auth__titre">Payer mon abonnement</h1>
      <p className="carte-auth__sous-titre">
        Connectez-vous avec le compte du patron pour choisir votre formule et payer par Mobile Money (M-Pesa, Airtel Money, Orange Money, Africell).
      </p>
      <form onSubmit={envoyer} noValidate>
        <ChampAuth id="payer-email" libelle="Adresse e-mail" icone={Mail} type="email" autoComplete="email" valeur={email} onChange={setEmail} />
        <ChampAuth
          id="payer-mdp"
          libelle="Mot de passe"
          icone={Lock}
          type="password"
          autoComplete="current-password"
          valeur={motDePasse}
          onChange={setMotDePasse}
        />
        {erreur && (
          <p className="auth-erreur" role="alert">
            {erreur}
          </p>
        )}
        <button type="submit" className="bouton-auth" disabled={enCours}>
          {enCours ? "Connexion…" : "Continuer"}
        </button>
      </form>
      <Link to="/mot-de-passe-oublie" className="lien-auth">
        <strong>Mot de passe oublié ?</strong>
      </Link>
      <Link to="/inscription" className="lien-auth lien-auth--sans-marge">
        Pas encore de compte ? <strong>Créer le compte de mon hôtel</strong>
      </Link>
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

  return (
    <div className="carte-auth payer">
      <img className="carte-auth__logo" src="/logo-hotelsaver.png" alt="" />
      <div className="carte-auth__marque">HotelSaver</div>
      <h1 className="carte-auth__titre">Abonnement de {session.hotelNom}</h1>
      <p className="payer__session">
        Connecté : {session.nom}.{" "}
        <button type="button" className="payer__lien" onClick={onDeconnexion}>
          Se déconnecter
        </button>
      </p>

      {erreur && (
        <p className="auth-erreur" role="alert">
          {erreur}{" "}
          <button type="button" className="payer__lien" onClick={() => void charger()}>
            Réessayer
          </button>
        </p>
      )}
      {!vue && !erreur && (
        <p role="status" className="payer__chargement">
          Chargement…
        </p>
      )}
      {vue && <Formulaire client={client} vue={vue} onActualise={charger} />}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------

function Formulaire({ client, vue, onActualise }: { client: ClientApi; vue: VueAbonnement; onActualise: () => Promise<void> }) {
  const idBase = useId();
  const resume = resumerAbonnement(vue.etat, vue.formuleActuelle);

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

  return (
    <>
      <section className={`payer__etat payer__etat--${resume.niveau}`} aria-live="polite">
        <strong>{resume.titre}</strong>
        <span>{resume.detail}</span>
      </section>

      {vue.etat.statut === "ESSAI" && peutPayer && (
        <p className="payer__info">Vous payez avant la fin de l'essai ? Aucun jour d'essai n'est perdu : ils s'ajoutent à votre abonnement.</p>
      )}

      {vue.etat.renouvelable === false && <p className="payer__info">Contactez le support HotelSaver pour rouvrir l'accès de votre hôtel.</p>}
      {vue.etat.renouvelable !== false && !vue.paiementEnLigne && (
        <p className="payer__info">Le paiement en ligne n'est pas encore disponible. Contactez le support HotelSaver pour payer.</p>
      )}

      {etat.phase === "envoi" && (
        <p className="payer__attente" role="status">
          Envoi de votre demande de paiement…
        </p>
      )}

      {etat.phase === "attente" && (
        <div className="payer__attente" role="status">
          <h2>Confirmez le paiement sur votre téléphone</h2>
          <p>
            Une demande de <strong>{etat.paiement ? montantAbonnement(etat.paiement.total ?? etat.paiement.montant, etat.paiement.devise) : ""}</strong>{" "}
            a été envoyée{etat.paiement?.telephoneMasque ? ` au ${etat.paiement.telephoneMasque}` : " à votre téléphone"}. Saisissez votre code secret
            Mobile Money pour valider. Ne quittez pas cette page.
          </p>
          <p className="payer__chrono" aria-hidden="true">
            En attente depuis {chronometre(etat.secondes)}
          </p>
          {etat.lent && (
            <div className="payer__conseils">
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
            <button type="button" className="bouton-auth bouton-auth--lien" onClick={() => suivi.reinitialiser()}>
              Réessayer
            </button>
          )}
        </div>
      )}

      {etat.phase === "reussi" && (
        <div className="payer__succes" role="status">
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
        <div className="payer__echec" role="alert">
          <h2>Le paiement n'a pas abouti</h2>
          <p>{etat.message ?? "Le paiement n'a pas abouti."} Rien n'a été débité si le paiement n'a pas été confirmé.</p>
          <button type="button" className="bouton-auth" onClick={() => suivi.reinitialiser()}>
            Réessayer
          </button>
        </div>
      )}

      {peutPayer && etat.phase === "saisie" && formule && (
        <form className="payer__form" onSubmit={payer} noValidate>
          <fieldset className="payer__groupe">
            <legend>1. Choisissez votre formule</legend>
            <div className="payer__liste">
              {vue.formules.map((f) => {
                const trop = !convient(f);
                const mensuel = devise === "USD" ? f.prixMensuelUsd : f.durees.find((d) => d.mois === 1)?.prixCdf ?? 0;
                return (
                  <label key={f.code} className={`payer__choix${f.code === formuleCode ? " payer__choix--actif" : ""}${trop ? " payer__choix--inactif" : ""}`}>
                    <input type="radio" name={`${idBase}-formule`} value={f.code} checked={f.code === formuleCode} disabled={trop} onChange={() => setFormuleCode(f.code)} />
                    <span className="payer__choix-titre">
                      {f.nom} {f.recommandee && <em>Le plus choisi</em>}
                    </span>
                    <span className="payer__choix-prix">
                      {montant(mensuel)} <small>par mois</small>
                    </span>
                    <span className="payer__choix-detail">{f.description}</span>
                    <ul>
                      {f.inclus.map((l) => (
                        <li key={l}>{l}</li>
                      ))}
                    </ul>
                    {trop && <span className="payer__choix-detail">Votre hôtel a {nombreChambres} chambres : cette formule en accepte {f.maxChambres} au maximum.</span>}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="payer__groupe">
            <legend>2. Combien de temps ?</legend>
            <div className="payer__liste payer__liste--ligne">
              {formule.durees.map((d) => (
                <label key={d.mois} className={`payer__choix${d.mois === duree?.mois ? " payer__choix--actif" : ""}`}>
                  <input type="radio" name={`${idBase}-duree`} value={d.mois} checked={d.mois === duree?.mois} onChange={() => setMois(d.mois)} />
                  <span className="payer__choix-titre">{libelleDuree(d.mois)}</span>
                  <span className="payer__choix-prix">{montant(devise === "USD" ? d.prixUsd : d.prixCdf)}</span>
                  {d.moisOfferts > 0 && <em>{d.moisOfferts} mois offerts</em>}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="payer__groupe">
            <legend>3. Dans quelle monnaie ?</legend>
            <div className="payer__liste payer__liste--ligne">
              {(
                [
                  ["USD", "Dollars (USD)"],
                  ["CDF", "Francs congolais (FC)"],
                ] as const
              ).map(([code, libelle]) => (
                <label key={code} className={`payer__choix${devise === code ? " payer__choix--actif" : ""}`}>
                  <input type="radio" name={`${idBase}-devise`} value={code} checked={devise === code} onChange={() => setDevise(code)} />
                  <span className="payer__choix-titre">{libelle}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="payer__groupe">
            <legend>4. Payer avec Mobile Money</legend>
            <div className="payer__liste payer__liste--ligne">
              {LISTE_OPERATEURS.map((op) => (
                <label key={op} className={`payer__choix${operateur === op ? " payer__choix--actif" : ""}`}>
                  <input
                    type="radio"
                    name={`${idBase}-operateur`}
                    value={op}
                    checked={operateur === op}
                    onChange={() => {
                      setOperateur(op);
                      setOperateurAMain(true);
                    }}
                  />
                  <span className="payer__choix-titre">{OPERATEURS_MOBILE_MONEY[op].libelle}</span>
                </label>
              ))}
            </div>
            <label className="payer__etiquette" htmlFor={`${idBase}-tel`}>
              Votre numéro Mobile Money
            </label>
            <input
              id={`${idBase}-tel`}
              ref={champTel}
              className="payer__champ"
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
            <p id={`${idBase}-tel-aide`} className={afficherProbleme ? "auth-erreur" : "payer__aide"} role={afficherProbleme ? "alert" : undefined}>
              {afficherProbleme ? problemeTel : "C'est sur ce numéro que vous recevrez la demande de confirmation."}
            </p>
          </fieldset>

          <div className="payer__total" aria-live="polite">
            {prix === null ? null : !apercuCharge ? (
              <p>Calcul des frais…</p>
            ) : frais > 0 ? (
              <p>
                Abonnement {montant(prix)} + frais ScanLinkPay {montant(frais)} = <strong>{montant(total ?? prix)}</strong> à payer
              </p>
            ) : (
              <p>
                À payer : <strong>{montant(total ?? prix)}</strong>
              </p>
            )}
          </div>

          {etat.message && (
            <p className="auth-erreur" role="alert">
              {etat.message}
            </p>
          )}
          <button type="submit" className="bouton-auth" disabled={!apercuCharge || !operateur || prix === null}>
            {apercuCharge && total !== null ? `Payer ${montant(total)}` : "Payer"}
          </button>
        </form>
      )}

      {vue.historique.length > 0 && (
        <section className="payer__historique" aria-label="Derniers paiements">
          <h2>Derniers paiements</h2>
          <ul>
            {vue.historique.slice(0, 5).map((p) => (
              <li key={p.id}>
                {dateAbonnement(p.createdAt)} · {montantAbonnement(p.montant, p.devise)} · {p.statut === "REUSSI" ? "payé" : p.statut === "EN_ATTENTE" ? "en attente" : "non abouti"}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="payer__aide-support">
        Une question ? Appelez ou écrivez sur WhatsApp au{" "}
        <a href={`tel:${support.telephone}`}>{support.telephone}</a> ·{" "}
        <a href={lienWhatsApp(support.whatsapp, "Bonjour, j'ai besoin d'aide pour payer mon abonnement HotelSaver.")} target="_blank" rel="noopener noreferrer">
          WhatsApp<span className="visuellement-cache"> (s'ouvre dans un nouvel onglet)</span>
        </a>
      </p>
    </>
  );
}
