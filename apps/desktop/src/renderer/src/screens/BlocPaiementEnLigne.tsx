import * as React from "react";
import { useEffect, useId, useState } from "react";
import { ErreurApi } from "@hotel-chicago/api-client";
import type { ClientApi } from "@hotel-chicago/api-client";
import { montantAbonnement } from "@hotel-chicago/regles";
import type { ReglagesPaiementEnLigne } from "@hotel-chicago/types";
import { Button } from "@hotel-chicago/ui";
import { BadgeCheck, CreditCard, Lock } from "lucide-react";
import { BlocAide } from "../components/BlocAide";
import type { IdPage } from "../navigation";
import "./abonnement.css";
import "./paiement-en-ligne.css";

export interface BlocPaiementEnLigneProps {
  client: ClientApi;
  onNaviguer?: (page: IdPage) => void;
}

const MAX_CONDITIONS = 1000;
/** Exemple montré au patron : une chambre à 20 $ pendant 4 nuits. */
const EXEMPLE = { prixNuit: 20, nuits: 4 };
const FORMAT_NUMERO = /^[A-Za-z0-9-]{3,40}$/;

/** Acompte de l'exemple pour un pourcentage donné (arrondi au centime). */
export function acompteExemple(pourcentage: number): number {
  return Math.round(EXEMPLE.prixNuit * EXEMPLE.nuits * pourcentage) / 100;
}

function messageErreur(e: unknown): string {
  if (e instanceof ErreurApi && e.statusCode === 0) return "Connectez-vous à Internet pour régler le paiement en ligne.";
  return e instanceof Error ? e.message : "Une erreur est survenue. Réessayez.";
}

function LienScanLinkPay({ url }: { url: string | null }) {
  if (!url || !/^https:\/\//i.test(url)) return <>Pas encore de compte ? Créez-le gratuitement dans l'application ScanLinkPay.</>;
  return (
    <>
      Pas encore de compte ?{" "}
      <a href={url} target="_blank" rel="noopener noreferrer" data-testid="lien-creer-scanlinkpay">
        Créez-le gratuitement<span className="visuellement-cache"> (s'ouvre dans une nouvelle fenêtre)</span>
      </a>
      .
    </>
  );
}

/**
 * Réglages → « Paiement en ligne des acomptes » (patron). Le patron relie son hôtel à son compte marchand ScanLinkPay et fixe le pourcentage
 * d'acompte demandé à la réservation : le client paie sur le site public, l'argent arrive directement sur le compte ScanLinkPay de l'hôtel.
 * Le serveur vérifie le numéro auprès de ScanLinkPay et renvoie le nom de l'entreprise : le patron voit tout de suite si c'est bien la sienne.
 */
export function BlocPaiementEnLigne({ client, onNaviguer }: BlocPaiementEnLigneProps) {
  const id = useId();
  const [reglages, setReglages] = useState<ReglagesPaiementEnLigne | null>(null);
  const [erreurLecture, setErreurLecture] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const [numero, setNumero] = useState("");
  const [verification, setVerification] = useState<{ enCours: boolean; erreur: string | null; trouve: string | null }>({ enCours: false, erreur: null, trouve: null });

  const [pourcentage, setPourcentage] = useState("0");
  const [fraisClient, setFraisClient] = useState(false);
  const [conditions, setConditions] = useState("");
  const [enregistrement, setEnregistrement] = useState<{ enCours: boolean; erreur: string | null; ok: boolean }>({ enCours: false, erreur: null, ok: false });

  useEffect(() => {
    let actif = true;
    client
      .reglagesPaiementEnLigne()
      .then((r) => {
        if (!actif) return;
        setReglages(r);
        setErreurLecture(null);
        setNumero(r.numeroScanLinkPay ?? "");
        setPourcentage(String(r.pourcentageAcompte));
        setFraisClient(r.fraisPayesParClient);
        setConditions(r.conditionsAnnulation ?? "");
      })
      .catch((e: unknown) => actif && setErreurLecture(messageErreur(e)));
    return () => {
      actif = false;
    };
  }, [client, version]);

  const pourcentageNombre = /^\d{1,3}$/.test(pourcentage.trim()) ? Number(pourcentage.trim()) : null;
  const pourcentageValide = pourcentageNombre !== null && pourcentageNombre <= 100;
  const numeroEnregistre = reglages?.numeroScanLinkPay ?? null;

  async function verifierEtEnregistrer(e: React.FormEvent) {
    e.preventDefault();
    const saisi = numero.trim();
    if (!FORMAT_NUMERO.test(saisi)) {
      setVerification({ enCours: false, erreur: "Numéro ScanLinkPay invalide (ex. SLP-000123).", trouve: null });
      return;
    }
    setVerification({ enCours: true, erreur: null, trouve: null });
    try {
      const r = await client.modifierReglagesPaiementEnLigne({ numeroScanLinkPay: saisi });
      setReglages(r);
      setNumero(r.numeroScanLinkPay ?? saisi);
      setVerification({ enCours: false, erreur: null, trouve: r.nomScanLinkPay ?? "nom non communiqué" });
    } catch (err) {
      setVerification({ enCours: false, erreur: messageErreur(err), trouve: null });
    }
  }

  async function retirerLeCompte() {
    if (!window.confirm("Retirer le compte ScanLinkPay ? Les clients ne pourront plus payer d'acompte en ligne.")) return;
    setVerification({ enCours: true, erreur: null, trouve: null });
    try {
      await client.modifierReglagesPaiementEnLigne({ numeroScanLinkPay: null });
      setVerification({ enCours: false, erreur: null, trouve: null });
      setVersion((v) => v + 1);
    } catch (err) {
      setVerification({ enCours: false, erreur: messageErreur(err), trouve: null });
    }
  }

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    setEnregistrement({ enCours: false, erreur: null, ok: false });
    if (!pourcentageValide || pourcentageNombre === null) {
      setEnregistrement({ enCours: false, erreur: "Le pourcentage est un nombre entier de 0 à 100.", ok: false });
      return;
    }
    if (pourcentageNombre > 0 && !numeroEnregistre) {
      setEnregistrement({ enCours: false, erreur: "Pour demander un acompte, enregistrez d'abord le numéro ScanLinkPay de votre hôtel (bouton « Vérifier et enregistrer »).", ok: false });
      return;
    }
    if (conditions.length > MAX_CONDITIONS) {
      setEnregistrement({ enCours: false, erreur: `Les conditions ne peuvent pas dépasser ${MAX_CONDITIONS} caractères.`, ok: false });
      return;
    }
    setEnregistrement({ enCours: true, erreur: null, ok: false });
    try {
      const r = await client.modifierReglagesPaiementEnLigne({ pourcentageAcompte: pourcentageNombre, fraisPayesParClient: fraisClient, conditionsAnnulation: conditions.trim() || null });
      setReglages(r);
      setPourcentage(String(r.pourcentageAcompte));
      setEnregistrement({ enCours: false, erreur: null, ok: true });
    } catch (err) {
      setEnregistrement({ enCours: false, erreur: messageErreur(err), ok: false });
    }
  }

  const entete = (
    <p className="hc-text-label texte-discret">Paiement en ligne des acomptes</p>
  );

  if (erreurLecture && !reglages) {
    return (
      <div className="carte-formulaire pel" data-testid="paiement-en-ligne">
        {entete}
        <p role="alert" className="hc-text-body texte-erreur">
          {erreurLecture}
        </p>
        <div>
          <Button type="button" variant="secondary" size="sm" onClick={() => setVersion((v) => v + 1)}>
            Réessayer
          </Button>
        </div>
      </div>
    );
  }
  if (!reglages) {
    return (
      <div className="carte-formulaire pel" data-testid="paiement-en-ligne">
        {entete}
        <p className="hc-text-body texte-discret">Chargement…</p>
      </div>
    );
  }

  // ---- Fonction non incluse dans la formule
  if (!reglages.fonctionIncluse) {
    return (
      <div className="carte-formulaire pel" data-testid="paiement-en-ligne">
        {entete}
        <div className="parametres-ligne">
          <span className="parametres-ligne__icone">
            <Lock size={18} aria-hidden="true" />
          </span>
          <span className="hc-text-body">Non inclus dans votre formule</span>
        </div>
        <p className="hc-text-body" data-testid="paiement-en-ligne-verrouille">
          Avec le paiement en ligne, vos clients paient leur acompte sur le site de l'hôtel (Mobile Money ou carte). L'argent arrive directement sur votre compte ScanLinkPay. Votre formule actuelle ne l'inclut pas.
        </p>
        {onNaviguer && (
          <div>
            <Button type="button" variant="secondary" onClick={() => onNaviguer("abonnement")}>
              Voir les formules
            </Button>
          </div>
        )}
      </div>
    );
  }

  const exempleAcompte = pourcentageValide && pourcentageNombre !== null ? acompteExemple(pourcentageNombre) : null;
  const total = EXEMPLE.prixNuit * EXEMPLE.nuits;

  return (
    <div className="carte-formulaire pel" data-testid="paiement-en-ligne">
      {entete}
      <p className="hc-text-body">
        Vos clients paient l'acompte de leur réservation sur le site de l'hôtel, par Mobile Money ou carte Visa/Mastercard. L'argent arrive sur votre compte ScanLinkPay ; vous pouvez ensuite le retirer vers votre Mobile Money.{" "}
        <LienScanLinkPay url={reglages.urlScanLinkPay} />
      </p>

      {!reglages.serveurRelie && (
        <p role="status" className="abo-message hc-text-body" data-testid="paiement-en-ligne-non-relie">
          Le paiement en ligne n'est pas encore activé sur le serveur, contactez le support.
        </p>
      )}

      {/* ---- 1. Le compte */}
      <form className="pel-groupe" onSubmit={(e) => void verifierEtEnregistrer(e)} aria-labelledby={`${id}-compte`} noValidate>
        <h3 id={`${id}-compte`} className="hc-text-body-strong">
          1. Votre compte ScanLinkPay
        </h3>
        <label className="hc-text-label" htmlFor={`${id}-numero`}>
          Numéro ScanLinkPay de votre hôtel
        </label>
        <input
          id={`${id}-numero`}
          className="pel-champ"
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="SLP-…"
          value={numero}
          onChange={(e) => {
            setNumero(e.target.value);
            setVerification({ enCours: false, erreur: null, trouve: null });
          }}
          aria-invalid={verification.erreur ? true : undefined}
          aria-describedby={`${id}-numero-aide`}
        />
        <p id={`${id}-numero-aide`} className="hc-text-caption texte-discret">
          Vous le trouvez dans l'application ScanLinkPay, dans le profil de votre entreprise.
        </p>
        <div className="pel-actions">
          <Button type="submit" variant="secondary" disabled={verification.enCours || numero.trim() === ""}>
            {verification.enCours ? "Vérification…" : "Vérifier et enregistrer"}
          </Button>
          {numeroEnregistre && (
            <Button type="button" variant="secondary" onClick={() => void retirerLeCompte()} disabled={verification.enCours}>
              Retirer le compte
            </Button>
          )}
        </div>
        <div role="status" aria-live="polite" aria-atomic="true">
          {verification.trouve ? (
            <p className="pel-succes hc-text-body" data-testid="scanlinkpay-compte-trouve">
              <BadgeCheck size={16} aria-hidden="true" /> Compte trouvé : {verification.trouve}
            </p>
          ) : !verification.erreur && numeroEnregistre ? (
            <p className="hc-text-body" data-testid="scanlinkpay-compte-relie">
              <BadgeCheck size={16} aria-hidden="true" /> Compte relié : {numeroEnregistre}
              {reglages.nomScanLinkPay ? ` (${reglages.nomScanLinkPay})` : ""}
            </p>
          ) : null}
        </div>
        {verification.erreur && (
          <p role="alert" className="hc-text-body texte-erreur" data-testid="scanlinkpay-erreur">
            {verification.erreur}
          </p>
        )}
      </form>

      {/* ---- 2. L'acompte */}
      <form className="pel-groupe" onSubmit={(e) => void enregistrer(e)} aria-labelledby={`${id}-acompte`} noValidate>
        <h3 id={`${id}-acompte`} className="hc-text-body-strong">
          2. L'acompte demandé
        </h3>
        <label className="hc-text-label" htmlFor={`${id}-pourcentage`}>
          Pourcentage demandé à la réservation (0 = pas de paiement en ligne)
        </label>
        <div className="pel-pourcentage">
          <input
            id={`${id}-pourcentage`}
            className="pel-champ pel-champ--court"
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            step={1}
            value={pourcentage}
            onChange={(e) => setPourcentage(e.target.value)}
            aria-invalid={pourcentageValide ? undefined : true}
            aria-describedby={`${id}-exemple`}
          />
          <span className="hc-text-body" aria-hidden="true">
            %
          </span>
        </div>
        <p id={`${id}-exemple`} className="pel-exemple hc-text-body" aria-live="polite" data-testid="acompte-exemple">
          {!pourcentageValide || pourcentageNombre === null
            ? "Entrez un nombre entier de 0 à 100."
            : pourcentageNombre === 0
              ? "Aucun acompte demandé : vos clients ne peuvent pas payer en ligne."
              : `Chambre ${montantAbonnement(EXEMPLE.prixNuit, "USD")} × ${EXEMPLE.nuits} nuits = ${montantAbonnement(total, "USD")} → acompte ${pourcentageNombre} % = ${montantAbonnement(exempleAcompte ?? 0, "USD")}`}
        </p>

        <label className="pel-interrupteur">
          <input type="checkbox" role="switch" checked={fraisClient} onChange={(e) => setFraisClient(e.target.checked)} aria-describedby={`${id}-frais-aide`} />
          <span className="hc-text-body">Le client paie les frais ScanLinkPay en plus de l'acompte</span>
        </label>
        <p id={`${id}-frais-aide`} className="hc-text-caption texte-discret">
          {fraisClient
            ? "Activé : le client paie l'acompte plus les frais. Vous recevez l'acompte entier."
            : "Désactivé : la commission ScanLinkPay est retenue sur ce que vous recevez."}
        </p>

        <label className="hc-text-label" htmlFor={`${id}-conditions`}>
          Conditions d'annulation et de remboursement
        </label>
        <textarea
          id={`${id}-conditions`}
          className="pel-champ"
          rows={4}
          maxLength={MAX_CONDITIONS}
          value={conditions}
          onChange={(e) => setConditions(e.target.value)}
          aria-describedby={`${id}-conditions-aide`}
          placeholder="Ex. Annulation gratuite jusqu'à 48 h avant l'arrivée."
        />
        <p id={`${id}-conditions-aide`} className="hc-text-caption texte-discret">
          Le client les lit avant de payer. {conditions.length}/{MAX_CONDITIONS} caractères.
        </p>

        <div className="pel-actions">
          <Button type="submit" disabled={enregistrement.enCours}>
            {enregistrement.enCours ? "Enregistrement…" : "Enregistrer les réglages"}
          </Button>
        </div>
        <div role="status" aria-live="polite">
          {enregistrement.ok && (
            <p className="pel-succes hc-text-body" data-testid="paiement-en-ligne-enregistre">
              <BadgeCheck size={16} aria-hidden="true" /> Réglages enregistrés.
            </p>
          )}
        </div>
        {enregistrement.erreur && (
          <p role="alert" className="hc-text-body texte-erreur" data-testid="paiement-en-ligne-erreur">
            {enregistrement.erreur}
          </p>
        )}
      </form>

      <p className="hc-text-caption texte-discret pel-securise">
        <CreditCard size={14} aria-hidden="true" /> Paiement sécurisé par ScanLinkPay
      </p>
      {!reglages.serveurRelie && <BlocAide message="Bonjour, le paiement en ligne n'est pas activé sur mon serveur HotelSaver." />}
    </div>
  );
}
