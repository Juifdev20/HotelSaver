import * as React from "react";
import { useId, useMemo, useState } from "react";
import { Button, useDialogue } from "@hotel-chicago/ui";
import { montantAbonnement, prixAbonnement, type FormuleAbonnement } from "@hotel-chicago/regles";
import type { DonneesFormule, FormuleAdminVue, ParametresPlateformeVue } from "@hotel-chicago/types";
import { DialogueConfirmation } from "./DialogueConfirmation";
import { FONCTIONS, LIBELLE_FONCTION, basculerFonction, type Fonction } from "./fonctions";

const MAX_AVANTAGES = 12;
const DUREES_APERCU = [1, 3, 6, 12] as const;
const MOTIF_CODE = /^[A-Z][A-Z0-9_]{1,29}$/;

export interface FormulaireFormuleProps {
  /** null = nouvelle formule. */
  formule: FormuleAdminVue | null;
  /** Les autres formules (pour proposer l'ordre suivant). */
  formules: FormuleAdminVue[];
  parametres: ParametresPlateformeVue | null;
  /** Rejette avec le message du serveur en cas d'échec : la fenêtre reste ouverte et l'affiche. */
  onEnregistrer: (dto: DonneesFormule & { code?: string }) => Promise<void>;
  onFermer: () => void;
}

function egales(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

/** Prix saisi → nombre valide (≥ 0,50 $, 2 décimales au plus) ou null. */
function lirePrix(saisie: string): number | null {
  const texte = saisie.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(texte)) return null;
  const n = Number(texte);
  return n >= 0.5 && n <= 100_000 ? n : null;
}

/**
 * Création / modification d'une formule. Les règles du serveur sont reflétées ici (code, prix, fonctions, avantages) ; les autres refus
 * (par exemple « au moins une formule active doit rester ») viennent du serveur et s'affichent tels quels.
 */
export function FormulaireFormule({ formule, formules, parametres, onEnregistrer, onFermer }: FormulaireFormuleProps) {
  const creation = formule === null;
  const [code, setCode] = useState(formule?.code ?? "");
  const [nom, setNom] = useState(formule?.nom ?? "");
  const [description, setDescription] = useState(formule?.description ?? "");
  const [prix, setPrix] = useState(formule ? String(formule.prixMensuelUsd).replace(".", ",") : "");
  const [illimite, setIllimite] = useState(formule ? formule.maxChambres === null : false);
  const [maxChambres, setMaxChambres] = useState(formule?.maxChambres != null ? String(formule.maxChambres) : "");
  const [fonctions, setFonctions] = useState<Fonction[]>(formule ? [...formule.fonctions] : ["RECEPTION"]);
  const [avantages, setAvantages] = useState<string[]>(formule ? [...formule.avantages] : []);
  const [recommandee, setRecommandee] = useState(formule?.recommandee ?? false);
  const [actif, setActif] = useState(formule?.actif ?? true);
  const [ordre, setOrdre] = useState(String(formule?.ordre ?? Math.max(0, ...formules.map((f) => f.ordre)) + 1));
  const [erreurLocale, setErreurLocale] = useState<string | null>(null);
  const [erreurServeur, setErreurServeur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [aConfirmer, setAConfirmer] = useState<(DonneesFormule & { code?: string }) | null>(null);
  const idTitre = useId();
  const idCode = useId();
  const idAideCode = useId();
  const idErreur = useId();
  const refDialogue = useDialogue<HTMLFormElement>({ onEchap: () => !aConfirmer && !enCours && onFermer() });

  const prixValide = lirePrix(prix);

  // Aperçu en direct : le même calcul que le serveur et les applications (`prixAbonnement`), avec les réglages courants.
  const apercu = useMemo(() => {
    if (prixValide === null) return null;
    const temporaire: FormuleAbonnement = {
      code: "APERCU",
      nom: nom || "Aperçu",
      prixMensuelUsd: prixValide,
      maxChambres: null,
      description: "",
      fonctions: [],
      avantages: [],
    };
    return DUREES_APERCU.map((mois) => {
      const base = { formule: "APERCU", mois, tauxCdf: parametres?.tauxCdf, formules: [temporaire], moisOffertsAnnuel: parametres?.moisOffertsAnnuel };
      return { mois, usd: prixAbonnement({ ...base, devise: "USD" }), cdf: prixAbonnement({ ...base, devise: "CDF" }) };
    });
  }, [prixValide, nom, parametres?.tauxCdf, parametres?.moisOffertsAnnuel]);

  function majAvantage(index: number, valeur: string) {
    setAvantages((l) => l.map((a, i) => (i === index ? valeur : a)));
  }

  /** Construit le corps à envoyer, ou renvoie un message d'erreur. */
  function construire(): { dto: DonneesFormule & { code?: string } } | { erreur: string } {
    if (creation && !MOTIF_CODE.test(code)) {
      return { erreur: "Le code doit faire 2 à 30 caractères : lettres MAJUSCULES, chiffres ou _, en commençant par une lettre (ex. PRO)." };
    }
    if (!nom.trim()) return { erreur: "Le nom est obligatoire." };
    if (nom.trim().length > 40) return { erreur: "Le nom ne doit pas dépasser 40 caractères." };
    if (description.length > 200) return { erreur: "La description ne doit pas dépasser 200 caractères." };
    if (prixValide === null) return { erreur: "Le prix mensuel doit être d'au moins 0,50 $, avec 2 décimales au plus." };
    let plafond: number | null = null;
    if (!illimite) {
      const n = Number(maxChambres.trim());
      if (!/^\d+$/.test(maxChambres.trim()) || n < 1 || n > 100_000) {
        return { erreur: "Indiquez un nombre entier de chambres (1 ou plus), ou cochez « Illimité »." };
      }
      plafond = n;
    }
    if (fonctions.length === 0) return { erreur: "Cochez au moins une fonction." };
    const lignes = avantages.map((a) => a.trim()).filter(Boolean);
    if (lignes.length > MAX_AVANTAGES) return { erreur: `Au plus ${MAX_AVANTAGES} avantages.` };
    if (lignes.some((a) => a.length > 120)) return { erreur: "Chaque avantage doit faire 120 caractères au plus." };
    const ordreNombre = Number(ordre.trim());
    if (!/^\d+$/.test(ordre.trim()) || ordreNombre > 1000) return { erreur: "L'ordre doit être un nombre entier entre 0 et 1000." };
    return {
      dto: {
        ...(creation ? { code } : {}),
        nom: nom.trim(),
        description: description.trim(),
        prixMensuelUsd: prixValide,
        maxChambres: plafond,
        fonctions,
        avantages: lignes,
        recommandee,
        actif,
        ordre: ordreNombre,
      },
    };
  }

  async function envoyer(dto: DonneesFormule & { code?: string }) {
    setEnCours(true);
    setErreurServeur(null);
    try {
      await onEnregistrer(dto);
    } catch (e) {
      setErreurServeur(e instanceof Error ? e.message : "L'enregistrement a échoué. Réessayez.");
    } finally {
      setEnCours(false);
      setAConfirmer(null);
    }
  }

  function soumettre(e: React.FormEvent) {
    e.preventDefault();
    const resultat = construire();
    if ("erreur" in resultat) {
      setErreurLocale(resultat.erreur);
      return;
    }
    setErreurLocale(null);
    const { dto } = resultat;
    // Changer les fonctions ou le plafond s'applique TOUT DE SUITE aux hôtels abonnés : on le dit avant d'enregistrer.
    if (formule && formule.hotelsAbonnes > 0 && (!egales(formule.fonctions, dto.fonctions) || formule.maxChambres !== (dto.maxChambres ?? null))) {
      setAConfirmer(dto);
      return;
    }
    void envoyer(dto);
  }

  const message = erreurLocale ?? erreurServeur;

  return (
    <div className="fond-modale" onMouseDown={(e) => e.target === e.currentTarget && !enCours && onFermer()}>
      <form ref={refDialogue} className="carte carte--large" role="dialog" aria-modal="true" aria-labelledby={idTitre} onSubmit={soumettre} noValidate>
        <h2 id={idTitre} className="titre">
          {creation ? "Nouvelle formule" : `Modifier la formule « ${formule.nom} »`}
        </h2>
        <p className="sous-titre">
          {creation
            ? "Choisissez ce que cette formule coûte et ce qu'elle ouvre à l'hôtel."
            : `${formule.hotelsAbonnes} ${formule.hotelsAbonnes > 1 ? "hôtels abonnés" : "hôtel abonné"} à cette formule.`}
        </p>

        <div className="grille-formulaire">
          <div>
            <label className="label" htmlFor={idCode}>
              Code
            </label>
            <input
              id={idCode}
              className="champ champ--mono"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s+/g, "_"))}
              maxLength={30}
              readOnly={!creation}
              aria-readonly={!creation}
              aria-describedby={idAideCode}
              placeholder="PRO"
              autoComplete="off"
              data-autofocus={creation ? true : undefined}
            />
            <p id={idAideCode} className="aide-champ">
              {creation ? "Lettres MAJUSCULES, chiffres ou _ (2 à 30). Impossible à modifier ensuite." : "Le code ne peut plus être modifié."}
            </p>
          </div>
          <div>
            <label className="label" htmlFor="formule-nom">
              Nom affiché
            </label>
            <input id="formule-nom" className="champ" value={nom} onChange={(e) => setNom(e.target.value)} maxLength={40} placeholder="Pro" data-autofocus={creation ? undefined : true} />
          </div>
        </div>

        <label className="label" htmlFor="formule-description">
          Description (optionnelle)
        </label>
        <input id="formule-description" className="champ" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} placeholder="Pour un hôtel avec cafétaria…" />

        <div className="grille-formulaire">
          <div>
            <label className="label" htmlFor="formule-prix">
              Prix mensuel (USD)
            </label>
            <input id="formule-prix" className="champ" inputMode="decimal" value={prix} onChange={(e) => setPrix(e.target.value)} placeholder="59" />
            <p className="aide-champ">Au moins 0,50 $. Changer un prix n'affecte jamais une période déjà payée.</p>
          </div>
          <div>
            <label className="label" htmlFor="formule-chambres">
              Plafond de chambres
            </label>
            <input
              id="formule-chambres"
              className="champ"
              inputMode="numeric"
              value={illimite ? "" : maxChambres}
              onChange={(e) => setMaxChambres(e.target.value)}
              disabled={illimite}
              placeholder={illimite ? "Illimité" : "40"}
            />
            <label className="case">
              <input type="checkbox" checked={illimite} onChange={(e) => setIllimite(e.target.checked)} /> Illimité
            </label>
          </div>
        </div>

        <fieldset className="groupe-cases">
          <legend className="label">Fonctions incluses</legend>
          {FONCTIONS.map((f) => (
            <label key={f} className="case">
              <input type="checkbox" checked={fonctions.includes(f)} onChange={() => setFonctions((l) => basculerFonction(l, f))} /> {LIBELLE_FONCTION[f]}
            </label>
          ))}
          <p className="aide-champ">Les applications masquent automatiquement les fonctions non cochées.</p>
        </fieldset>

        <fieldset className="groupe-cases">
          <legend className="label">
            Avantages affichés sur la page des tarifs ({avantages.length}/{MAX_AVANTAGES})
          </legend>
          {avantages.map((a, i) => (
            <div key={i} className="ligne-avantage">
              <input className="champ" aria-label={`Avantage ${i + 1}`} value={a} onChange={(e) => majAvantage(i, e.target.value)} maxLength={120} />
              <Button type="button" variant="secondary" size="sm" aria-label={`Retirer l'avantage ${i + 1}`} onClick={() => setAvantages((l) => l.filter((_, k) => k !== i))}>
                Retirer
              </Button>
            </div>
          ))}
          <Button type="button" variant="secondary" size="sm" disabled={avantages.length >= MAX_AVANTAGES} onClick={() => setAvantages((l) => [...l, ""])}>
            Ajouter un avantage
          </Button>
        </fieldset>

        <div className="grille-formulaire">
          <div>
            <label className="label" htmlFor="formule-ordre">
              Ordre d'affichage
            </label>
            <input id="formule-ordre" className="champ" inputMode="numeric" value={ordre} onChange={(e) => setOrdre(e.target.value)} />
            <p className="aide-champ">Le plus petit s'affiche en premier.</p>
          </div>
          <div className="groupe-cases groupe-cases--seul">
            <label className="case">
              <input type="checkbox" checked={recommandee} onChange={(e) => setRecommandee(e.target.checked)} /> Formule recommandée
            </label>
            <p className="aide-champ">Une seule à la fois : cocher celle-ci décoche la précédente.</p>
            <label className="case">
              <input type="checkbox" checked={actif} onChange={(e) => setActif(e.target.checked)} /> Proposée à la vente
            </label>
            <p className="aide-champ">Décochée, elle n'est plus vendue ; les hôtels qui l'ont la gardent.</p>
          </div>
        </div>

        <section className="apercu" aria-labelledby={`${idTitre}-apercu`}>
          <h3 id={`${idTitre}-apercu`} className="apercu__titre">
            Aperçu des prix
          </h3>
          {apercu ? (
            <table className="tableau tableau--compact">
              <caption className="visuellement-cache">Prix de la formule selon la durée payée, en dollars et en francs congolais</caption>
              <thead>
                <tr>
                  <th scope="col">Durée</th>
                  <th scope="col">USD</th>
                  <th scope="col">FC</th>
                </tr>
              </thead>
              <tbody>
                {apercu.map((l) => (
                  <tr key={l.mois}>
                    <th scope="row">
                      {l.mois} mois
                      {l.mois === 12 && parametres && parametres.moisOffertsAnnuel > 0 && <span className="cellule-hotel__sous">{parametres.moisOffertsAnnuel} mois offerts</span>}
                    </th>
                    <td className="nombre">{montantAbonnement(l.usd, "USD")}</td>
                    <td className="nombre">{montantAbonnement(l.cdf, "CDF")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="aide-champ">Saisissez un prix valide pour voir l'aperçu.</p>
          )}
          <p className="aide-champ">
            {parametres ? `Calculé au taux de ${parametres.tauxCdf.toLocaleString("fr-FR")} FC pour 1 $.` : "Taux de la plateforme non chargé : taux par défaut utilisé."}
          </p>
        </section>

        {formule && formule.hotelsAbonnes > 0 && (
          <p className="avertissement-bloc">
            Si vous changez les fonctions ou le plafond de chambres, le changement s'applique tout de suite aux {formule.hotelsAbonnes} hôtel(s) abonné(s).
          </p>
        )}

        <p id={idErreur} className={message ? "erreur" : "visuellement-cache"} role="alert">
          {message ?? ""}
        </p>

        <div className="actions-confirmation">
          <Button type="button" variant="secondary" onClick={onFermer} disabled={enCours}>
            Annuler
          </Button>
          <Button type="submit" disabled={enCours}>
            {enCours ? "Enregistrement…" : creation ? "Créer la formule" : "Enregistrer"}
          </Button>
        </div>
      </form>

      {aConfirmer && formule && (
        <DialogueConfirmation
          titre={`Appliquer ces changements à la formule « ${formule.nom} » ?`}
          message={
            <>
              <p className="avertissement">
                {formule.hotelsAbonnes} {formule.hotelsAbonnes > 1 ? "hôtels sont abonnés" : "hôtel est abonné"} à cette formule. Les nouvelles fonctions et le nouveau plafond de chambres
                s'appliquent tout de suite à {formule.hotelsAbonnes > 1 ? "eux" : "lui"}, même pour une période déjà payée.
              </p>
              {!egales(formule.fonctions, aConfirmer.fonctions) && <p>Une fonction retirée disparaît immédiatement de leurs applications.</p>}
              {formule.maxChambres !== (aConfirmer.maxChambres ?? null) && <p>Vérifiez que les hôtels concernés tiennent dans le nouveau plafond.</p>}
            </>
          }
          libelleConfirmer="Enregistrer les changements"
          enCours={enCours}
          onConfirmer={() => void envoyer(aConfirmer)}
          onAnnuler={() => setAConfirmer(null)}
        />
      )}
    </div>
  );
}
