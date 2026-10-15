import * as React from "react";
import { useEffect, useId, useState } from "react";
import { Button } from "@hotel-chicago/ui";
import { formaterTelephone, lienWhatsApp } from "@hotel-chicago/regles";
import type { ParametresPlateformeVue } from "@hotel-chicago/types";
import { FONCTIONS, LIBELLE_FONCTION, basculerFonction, type Fonction } from "./fonctions";

/** Même motif que le serveur. */
const MOTIF_TELEPHONE = /^\+?[0-9 ]{8,20}$/;

export interface ReglagesPlateformeProps {
  parametres: ParametresPlateformeVue;
  /** Rejette avec le message du serveur en cas d'échec. */
  onEnregistrer: (partiel: Partial<ParametresPlateformeVue>) => Promise<void>;
}

function entier(saisie: string, min: number, max: number): number | null {
  const texte = saisie.trim().replace(/\s/g, "");
  if (!/^\d+$/.test(texte)) return null;
  const n = Number(texte);
  return n >= min && n <= max ? n : null;
}

/** Réglages de la plateforme : taux, mois offerts, essai, grâce, fonctions d'essai, frais ScanLinkPay, contact du support. */
export function ReglagesPlateforme({ parametres, onEnregistrer }: ReglagesPlateformeProps) {
  const [taux, setTaux] = useState(String(parametres.tauxCdf));
  const [moisOfferts, setMoisOfferts] = useState(String(parametres.moisOffertsAnnuel));
  const [joursEssai, setJoursEssai] = useState(String(parametres.joursEssai));
  const [joursGrace, setJoursGrace] = useState(String(parametres.joursGrace));
  const [fonctionsEssai, setFonctionsEssai] = useState<Fonction[]>(parametres.fonctionsEssai as Fonction[]);
  const [fraisClient, setFraisClient] = useState(parametres.fraisAbonnementPayesParClient);
  const [telephone, setTelephone] = useState(parametres.contactTelephone);
  const [whatsapp, setWhatsapp] = useState(parametres.contactWhatsapp);
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const id = useId();

  // Quand les réglages sont rechargés depuis le serveur, le formulaire repart de ces valeurs.
  useEffect(() => {
    setTaux(String(parametres.tauxCdf));
    setMoisOfferts(String(parametres.moisOffertsAnnuel));
    setJoursEssai(String(parametres.joursEssai));
    setJoursGrace(String(parametres.joursGrace));
    setFonctionsEssai(parametres.fonctionsEssai as Fonction[]);
    setFraisClient(parametres.fraisAbonnementPayesParClient);
    setTelephone(parametres.contactTelephone);
    setWhatsapp(parametres.contactWhatsapp);
  }, [parametres]);

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    setConfirmation(null);
    const t = entier(taux, 500, 20_000);
    if (t === null) return setErreur("Le taux doit être compris entre 500 et 20 000 FC pour 1 $ (nombre entier).");
    const mo = entier(moisOfferts, 0, 6);
    if (mo === null) return setErreur("Les mois offerts pour 12 mois doivent être un nombre entier de 0 à 6.");
    const je = entier(joursEssai, 0, 90);
    if (je === null) return setErreur("La durée d'essai doit être un nombre entier de jours, de 0 à 90.");
    const jg = entier(joursGrace, 0, 30);
    if (jg === null) return setErreur("Le délai de grâce doit être un nombre entier de jours, de 0 à 30.");
    if (!MOTIF_TELEPHONE.test(telephone.trim())) return setErreur("Numéro de téléphone invalide. Exemple : +243 828 497 218.");
    if (!MOTIF_TELEPHONE.test(whatsapp.trim())) return setErreur("Numéro WhatsApp invalide. Exemple : +243 828 497 218.");
    setErreur(null);
    setEnCours(true);
    try {
      await onEnregistrer({
        tauxCdf: t,
        moisOffertsAnnuel: mo,
        joursEssai: je,
        joursGrace: jg,
        fonctionsEssai,
        fraisAbonnementPayesParClient: fraisClient,
        contactTelephone: telephone.trim(),
        contactWhatsapp: whatsapp.trim(),
      });
      setConfirmation("Réglages enregistrés. Les applications les reprennent à leur prochain chargement.");
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "L'enregistrement a échoué. Réessayez.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <form className="carte carte--reglages" onSubmit={(e) => void soumettre(e)} noValidate aria-labelledby={`${id}-titre`}>
      <h2 id={`${id}-titre`} className="titre-section">
        Réglages de la plateforme
      </h2>

      <div className="grille-formulaire grille-formulaire--4">
        <div>
          <label className="label" htmlFor={`${id}-taux`}>
            Taux (FC pour 1 $)
          </label>
          <input id={`${id}-taux`} className="champ" inputMode="numeric" value={taux} onChange={(e) => setTaux(e.target.value)} />
          <p className="aide-champ">Entre 500 et 20 000. Sert à calculer les prix en francs.</p>
        </div>
        <div>
          <label className="label" htmlFor={`${id}-mois`}>
            Mois offerts pour 12 mois
          </label>
          <input id={`${id}-mois`} className="champ" inputMode="numeric" value={moisOfferts} onChange={(e) => setMoisOfferts(e.target.value)} />
          <p className="aide-champ">De 0 à 6. Un an payé d'un coup = 12 moins ce nombre de mois facturés.</p>
        </div>
        <div>
          <label className="label" htmlFor={`${id}-essai`}>
            Durée d'essai (jours)
          </label>
          <input id={`${id}-essai`} className="champ" inputMode="numeric" value={joursEssai} onChange={(e) => setJoursEssai(e.target.value)} />
          <p className="aide-champ">De 0 à 90 jours.</p>
        </div>
        <div>
          <label className="label" htmlFor={`${id}-grace`}>
            Délai de grâce (jours)
          </label>
          <input id={`${id}-grace`} className="champ" inputMode="numeric" value={joursGrace} onChange={(e) => setJoursGrace(e.target.value)} />
          <p className="aide-champ">De 0 à 30. L'hôtel travaille encore après l'échéance, avec une alerte.</p>
        </div>
      </div>

      <fieldset className="groupe-cases">
        <legend className="label">Fonctions ouvertes pendant l'essai</legend>
        {FONCTIONS.map((f) => (
          <label key={f} className="case">
            <input type="checkbox" checked={fonctionsEssai.includes(f)} onChange={() => setFonctionsEssai((l) => basculerFonction(l, f))} /> {LIBELLE_FONCTION[f]}
          </label>
        ))}
      </fieldset>

      <div className="interrupteur-ligne">
        <label className="case case--interrupteur" htmlFor={`${id}-frais`}>
          <input id={`${id}-frais`} type="checkbox" role="switch" aria-describedby={`${id}-frais-aide`} checked={fraisClient} onChange={(e) => setFraisClient(e.target.checked)} />
          <span>Les frais ScanLinkPay des abonnements sont payés par le patron en plus du prix</span>
        </label>
        <p id={`${id}-frais-aide`} className="aide-champ">
          {fraisClient
            ? "Activé : le patron de l'hôtel paie le prix de la formule plus la commission ScanLinkPay. Vous recevez le prix plein."
            : "Désactivé : le patron paie le prix de la formule seulement. La commission ScanLinkPay est retenue de votre côté, vous recevez donc un peu moins."}
        </p>
      </div>

      <div className="grille-formulaire">
        <div>
          <label className="label" htmlFor={`${id}-tel`}>
            Téléphone du support
          </label>
          <input id={`${id}-tel`} className="champ" type="tel" value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder="+243 828 497 218" autoComplete="off" />
          {MOTIF_TELEPHONE.test(telephone.trim()) && <p className="aide-champ">Affiché : {formaterTelephone(telephone.replace(/\s/g, ""))}</p>}
        </div>
        <div>
          <label className="label" htmlFor={`${id}-wa`}>
            WhatsApp du support
          </label>
          <input id={`${id}-wa`} className="champ" type="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+243 828 497 218" autoComplete="off" />
          {MOTIF_TELEPHONE.test(whatsapp.trim()) && (
            <p className="aide-champ">
              Lien : <a href={lienWhatsApp(whatsapp)} target="_blank" rel="noopener noreferrer">{lienWhatsApp(whatsapp)}</a>
            </p>
          )}
        </div>
      </div>
      <p className="aide-champ">Ces numéros sont affichés dans toutes les applications (abonnement, aide, page des tarifs).</p>

      {erreur && (
        <p className="erreur" role="alert">
          {erreur}
        </p>
      )}
      {confirmation && (
        <p className="succes" role="status">
          {confirmation}
        </p>
      )}

      <div className="actions-formulaire">
        <Button type="submit" disabled={enCours}>
          {enCours ? "Enregistrement…" : "Enregistrer les réglages"}
        </Button>
      </div>
    </form>
  );
}
