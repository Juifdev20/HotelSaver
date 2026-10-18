import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ErreurApi, annulerReservationPublique, obtenirSuiviReservation, preEnregistrerReservation } from "@hotel-chicago/api-client";
import { formatMontant } from "@hotel-chicago/ui";
import type { StatutSuiviPublic, SuiviReservationPublic, TypePiece } from "@hotel-chicago/types";
import {
  BedDouble,
  Check,
  CircleAlert,
  CircleCheck,
  CircleX,
  Copy,
  Hourglass,
  IdCard,
  MessageCircle,
  Moon,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { configuration } from "./config";
import { AcompteEnLigne } from "./AcompteEnLigne";
import { PartageLien, useCopie } from "./paiement/PartageLien";
import "./paiement/suivi.css";

const STATUTS: Record<StatutSuiviPublic, { libelle: string; texte: string; ton: "attente" | "ok" | "info" | "fin" }> = {
  EN_ATTENTE: {
    libelle: "En attente de confirmation",
    texte: "L'hôtel a bien reçu votre demande. La réception vous confirmera la réservation très bientôt.",
    ton: "attente",
  },
  CONFIRMEE: { libelle: "Réservation confirmée", texte: "Votre chambre vous attend. À bientôt !", ton: "ok" },
  EN_COURS: { libelle: "Séjour en cours", texte: "Bon séjour parmi nous.", ton: "info" },
  TERMINEE: { libelle: "Séjour terminé", texte: "Merci de votre visite, au plaisir de vous revoir.", ton: "fin" },
  ANNULEE: { libelle: "Réservation annulée", texte: "Vous avez annulé cette réservation.", ton: "fin" },
  NON_RETENUE: {
    libelle: "Réservation non retenue",
    texte: "L'hôtel n'a pas pu retenir cette réservation. Contactez-le pour trouver une autre solution.",
    ton: "fin",
  },
};

const PIECES: { valeur: TypePiece; libelle: string }[] = [
  { valeur: "CNI", libelle: "Carte d'identité" },
  { valeur: "PASSEPORT", libelle: "Passeport" },
  { valeur: "PERMIS", libelle: "Permis de conduire" },
  { valeur: "AUTRE", libelle: "Autre" },
];

/** « 18 oct. » — date de l'arrivée / du départ, fuseau de l'hôtel. */
function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "Africa/Lubumbashi" });
}

/** « samedi 2026 » — complète la date courte (jour de la semaine et année). */
function jourSemaine(iso: string): string {
  const d = new Date(iso);
  const jour = d.toLocaleDateString("fr-FR", { weekday: "long", timeZone: "Africa/Lubumbashi" });
  const annee = d.toLocaleDateString("fr-FR", { year: "numeric", timeZone: "Africa/Lubumbashi" });
  return `${jour} ${annee}`;
}

const ICONE_TON: Record<"attente" | "ok" | "info" | "fin", LucideIcon> = {
  attente: Hourglass,
  ok: CircleCheck,
  info: Sparkles,
  fin: CircleX,
};

/** Avancement affiché sous le statut (absent pour une réservation annulée ou non retenue). */
const ETAPES: { libelle: string; statuts: StatutSuiviPublic[] }[] = [
  { libelle: "Demande envoyée", statuts: ["EN_ATTENTE"] },
  { libelle: "Confirmée", statuts: ["CONFIRMEE"] },
  { libelle: "Séjour", statuts: ["EN_COURS"] },
  { libelle: "Terminé", statuts: ["TERMINEE"] },
];

function lienWhatsApp(numero: string, texte: string): string {
  return `https://wa.me/${numero.replace(/\D/g, "")}?text=${encodeURIComponent(texte)}`;
}

/**
 * Page « Ma réservation » (07/10/2026) : le client suit sa demande avec le
 * lien secret reçu après sa demande ou par WhatsApp, se pré-enregistre avant
 * d'arriver (pièce, heure d'arrivée, demandes) ou annule lui-même. Aucune
 * donnée sensible n'est relue : le numéro de pièce n'est jamais renvoyé.
 */
export function EcranSuiviReservation({ sousDomaine }: { sousDomaine: string }) {
  const { jeton = "" } = useParams();
  const [suivi, setSuivi] = useState<SuiviReservationPublic | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const [typePiece, setTypePiece] = useState<TypePiece>("CNI");
  const [numeroPiece, setNumeroPiece] = useState("");
  const [heure, setHeure] = useState("14:00");
  const [demande, setDemande] = useState("");
  const [erreurForm, setErreurForm] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [confirmationAnnulation, setConfirmationAnnulation] = useState(false);
  const [motifAnnulation, setMotifAnnulation] = useState("");
  const [copie, copier] = useCopie();

  useEffect(() => {
    let annule = false;
    obtenirSuiviReservation({ url: configuration.apiUrl }, sousDomaine, jeton)
      .then((s) => {
        if (annule) return;
        setSuivi(s);
        if (s.preEnregistrement.heureArriveePrevue) setHeure(s.preEnregistrement.heureArriveePrevue);
        if (s.preEnregistrement.demandeClient) setDemande(s.preEnregistrement.demandeClient);
      })
      .catch((e: Error) => !annule && setErreur(e.message));
    return () => {
      annule = true;
    };
  }, [sousDomaine, jeton]);

  /** Relit la réservation (après un paiement d'acompte) sans jamais casser la page si le réseau flanche. */
  const rafraichir = useCallback(async () => {
    try {
      setSuivi(await obtenirSuiviReservation({ url: configuration.apiUrl }, sousDomaine, jeton));
    } catch {
      // On garde l'affichage actuel ; le prochain chargement de la page remettra tout à jour.
    }
  }, [sousDomaine, jeton]);

  async function envoyerPreEnregistrement(e: React.FormEvent) {
    e.preventDefault();
    if (numeroPiece.trim().length < 3) return setErreurForm("Indiquez le numéro de votre pièce d'identité.");
    setEnCours(true);
    setErreurForm(null);
    try {
      const misAJour = await preEnregistrerReservation({ url: configuration.apiUrl }, sousDomaine, jeton, {
        typePiece,
        numeroPiece: numeroPiece.trim(),
        heureArriveePrevue: heure,
        demandeClient: demande.trim() || undefined,
      });
      setSuivi(misAJour);
      setNumeroPiece("");
      setFormulaireOuvert(false);
    } catch (err) {
      setErreurForm(err instanceof Error ? err.message : "Envoi impossible, réessayez.");
    } finally {
      setEnCours(false);
    }
  }

  async function annuler() {
    setEnCours(true);
    setErreurForm(null);
    try {
      setSuivi(await annulerReservationPublique({ url: configuration.apiUrl }, sousDomaine, jeton, motifAnnulation.trim() || undefined));
      setConfirmationAnnulation(false);
    } catch (err) {
      setErreurForm(
        err instanceof ErreurApi && err.statusCode === 404
          ? "Ce service n'est pas disponible pour cet hôtel."
          : err instanceof Error
            ? err.message
            : "Annulation impossible, contactez l'hôtel."
      );
    } finally {
      setEnCours(false);
    }
  }


  if (erreur) {
    return (
      <div className="suivi suivi--seul">
        <section className="suivi-carte suivi-vide">
          <span className="suivi-vide__icone" aria-hidden="true">
            <CircleAlert size={28} />
          </span>
          <h1 className="suivi-titre">Réservation introuvable</h1>
          <p>Ce lien n'est pas valide ou a été mal copié. Vérifiez le lien reçu, ou contactez l'hôtel.</p>
        </section>
      </div>
    );
  }
  if (!suivi) {
    return (
      <div className="suivi suivi--seul" aria-busy="true">
        <div className="suivi-squelette suivi-squelette--hero" />
        <div className="suivi-squelette" />
        <div className="suivi-squelette" />
        <p className="visuellement-cache" role="status">
          Chargement de votre réservation…
        </p>
      </div>
    );
  }

  const statut = STATUTS[suivi.statut];
  const acompteEnLigne = suivi.acompteEnLigne;
  const aPayeEnLigne = Boolean(acompteEnLigne && acompteEnLigne.dejaPaye > 0);
  const texteStatut =
    suivi.statut === "ANNULEE" && aPayeEnLigne && !acompteEnLigne?.remboursement
      ? `${statut.texte} Votre acompte sera étudié pour remboursement selon les conditions de l'hôtel.`
      : statut.texte;
  const pe = suivi.preEnregistrement;
  const contact = suivi.hotel.whatsapp ?? suivi.hotel.telephone;
  const IconeStatut = ICONE_TON[statut.ton];
  const etapeActuelle = ETAPES.findIndex((e) => e.statuts.includes(suivi.statut));

  return (
    <div className="suivi">
      {/* En-tête : qui, quel statut, où en est la réservation. */}
      <section className={`suivi-hero suivi-hero--${statut.ton}`} aria-labelledby="suivi-bonjour">
        <div className="suivi-hero__haut">
          <span className="suivi-hero__surtitre">Ma réservation · {suivi.hotel.nom}</span>
          <button
            type="button"
            className="suivi-code"
            onClick={() => copier("code", suivi.code)}
            aria-label={`Code de réservation ${suivi.code}, copier`}
          >
            <span>{suivi.code}</span>
            {copie === "code" ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
          </button>
        </div>
        <h1 id="suivi-bonjour" className="suivi-hero__titre">
          Bonjour {suivi.client.nom}
        </h1>
        <div className="suivi-badge" role="status">
          <IconeStatut size={18} aria-hidden="true" />
          <strong>{statut.libelle}</strong>
        </div>
        <p className="suivi-hero__texte">{texteStatut}</p>

        {etapeActuelle >= 0 && (
          <ol className="suivi-etapes" aria-label="Avancement de la réservation">
            {ETAPES.map((etape, i) => {
              const etat = i < etapeActuelle ? "fait" : i === etapeActuelle ? "actuel" : "avenir";
              return (
                <li key={etape.libelle} className={`suivi-etape suivi-etape--${etat}`} aria-current={etat === "actuel" ? "step" : undefined}>
                  <span className="suivi-etape__point" aria-hidden="true">
                    {etat === "fait" ? <Check size={13} /> : i + 1}
                  </span>
                  <span className="suivi-etape__libelle">{etape.libelle}</span>
                </li>
              );
            })}
          </ol>
        )}
        <p className="visuellement-cache" role="status" aria-live="polite">
          {copie === "code" ? "Code copié." : ""}
        </p>
      </section>

      <PartageLien code={suivi.code} nomHotel={suivi.hotel.nom} />

      <div className="suivi-grille">
        <div className="suivi-principal">
          {acompteEnLigne && (
            <AcompteEnLigne
              sousDomaine={sousDomaine}
              jeton={jeton}
              statutReservation={suivi.statut}
              acompte={acompteEnLigne}
              onRafraichir={rafraichir}
            />
          )}

          {suivi.reponseReception && (
            <section className="suivi-carte suivi-message" aria-labelledby="suivi-message-titre">
              <h2 id="suivi-message-titre" className="suivi-sous-titre">
                <MessageCircle size={19} aria-hidden="true" /> Message de la réception
              </h2>
              <p className="suivi-texte">{suivi.reponseReception}</p>
            </section>
          )}

          {(suivi.peutPreEnregistrer || pe.fait) && (
            <section className="suivi-carte" aria-labelledby="suivi-pre-titre">
              <h2 id="suivi-pre-titre" className="suivi-sous-titre">
                <IdCard size={19} aria-hidden="true" /> Pré-enregistrement
              </h2>
              {pe.fait && !formulaireOuvert && (
                <>
                  <p className="suivi-ok">
                    <CircleCheck size={18} aria-hidden="true" /> Pré-enregistrement reçu — votre arrivée sera plus rapide.
                  </p>
                  <ul className="suivi-liste">
                    {pe.heureArriveePrevue && <li>Arrivée prévue vers {pe.heureArriveePrevue}</li>}
                    {pe.pieceRenseignee && <li>Pièce d'identité renseignée</li>}
                    {pe.demandeClient && <li>Vos demandes : {pe.demandeClient}</li>}
                  </ul>
                  {suivi.peutPreEnregistrer && (
                    <button type="button" className="hotel-bouton hotel-bouton--contour" onClick={() => setFormulaireOuvert(true)}>
                      Modifier
                    </button>
                  )}
                </>
              )}
              {!pe.fait && !formulaireOuvert && suivi.peutPreEnregistrer && (
                <>
                  <p className="suivi-texte">Gagnez du temps à la réception : renseignez dès maintenant votre pièce d'identité et votre heure d'arrivée.</p>
                  <button type="button" className="hotel-bouton hotel-bouton--primaire" onClick={() => setFormulaireOuvert(true)}>
                    Me pré-enregistrer
                  </button>
                </>
              )}
              {formulaireOuvert && (
                <form className="suivi-formulaire" onSubmit={envoyerPreEnregistrement}>
                  <div className="suivi-champs">
                    <div className="suivi-champ">
                      <label className="label" htmlFor="type-piece">
                        Pièce d'identité
                      </label>
                      <select id="type-piece" className="champ" value={typePiece} onChange={(e) => setTypePiece(e.target.value as TypePiece)}>
                        {PIECES.map((p) => (
                          <option key={p.valeur} value={p.valeur}>
                            {p.libelle}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="suivi-champ">
                      <label className="label" htmlFor="numero-piece">
                        Numéro de la pièce
                      </label>
                      <input
                        id="numero-piece"
                        className="champ"
                        value={numeroPiece}
                        onChange={(e) => setNumeroPiece(e.target.value)}
                        autoComplete="off"
                        maxLength={40}
                        placeholder={pe.pieceRenseignee ? "Déjà renseigné — ressaisir pour le modifier" : ""}
                      />
                    </div>
                    <div className="suivi-champ">
                      <label className="label" htmlFor="heure-arrivee">
                        Heure d'arrivée prévue
                      </label>
                      <input id="heure-arrivee" className="champ" type="time" value={heure} onChange={(e) => setHeure(e.target.value)} required />
                    </div>
                  </div>
                  <label className="label" htmlFor="demande-client">
                    Demandes spéciales (facultatif)
                  </label>
                  <textarea
                    id="demande-client"
                    className="champ"
                    rows={3}
                    maxLength={500}
                    value={demande}
                    onChange={(e) => setDemande(e.target.value)}
                    placeholder="Lit bébé, étage élevé, arrivée tardive…"
                  />
                  {erreurForm && (
                    <p className="erreur" role="alert">
                      {erreurForm}
                    </p>
                  )}
                  <div className="suivi-actions">
                    <button type="submit" className="hotel-bouton hotel-bouton--primaire" disabled={enCours}>
                      {enCours ? "Envoi…" : "Envoyer"}
                    </button>
                    <button type="button" className="hotel-bouton hotel-bouton--contour" onClick={() => setFormulaireOuvert(false)} disabled={enCours}>
                      Retour
                    </button>
                  </div>
                </form>
              )}
            </section>
          )}

          {confirmationAnnulation && (
            <section className="suivi-carte suivi-annulation" aria-labelledby="suivi-annul-titre">
              <h2 id="suivi-annul-titre" className="suivi-sous-titre">
                <TriangleAlert size={19} aria-hidden="true" /> Annuler la réservation ?
              </h2>
              <p className="suivi-texte">L'hôtel sera prévenu. Cette action est définitive.</p>
              {aPayeEnLigne && (
                <p className="suivi-ok-info">
                  Votre acompte sera étudié pour remboursement selon les conditions de l'hôtel
                  {acompteEnLigne?.conditionsAnnulation ? " (rappelées dans le bloc « Acompte »)" : ""}.
                </p>
              )}
              <label className="label" htmlFor="motif-annulation">
                Raison (facultatif)
              </label>
              <input id="motif-annulation" className="champ" maxLength={300} value={motifAnnulation} onChange={(e) => setMotifAnnulation(e.target.value)} />
              {erreurForm && (
                <p className="erreur" role="alert">
                  {erreurForm}
                </p>
              )}
              <div className="suivi-actions">
                <button type="button" className="hotel-bouton hotel-bouton--primaire suivi-danger-plein" onClick={annuler} disabled={enCours}>
                  {enCours ? "Annulation…" : "Oui, annuler"}
                </button>
                <button type="button" className="hotel-bouton hotel-bouton--contour" onClick={() => setConfirmationAnnulation(false)} disabled={enCours}>
                  Garder ma réservation
                </button>
              </div>
            </section>
          )}
        </div>

        {/* Récapitulatif du séjour : colonne de droite collante sur ordinateur, juste sous l'en-tête sur téléphone. */}
        <aside className="suivi-cote" aria-label="Votre séjour">
          <section className="suivi-carte suivi-recap">
            <h2 className="suivi-sous-titre">Votre séjour</h2>
            <div className="suivi-recap__chambre">
              <span className="suivi-recap__icone" aria-hidden="true">
                <BedDouble size={22} />
              </span>
              <div>
                <strong>Chambre {suivi.chambre.numero}</strong>
                <span>{suivi.chambre.type}</span>
              </div>
            </div>
            <div className="suivi-recap__dates">
              <div>
                <span className="suivi-recap__libelle">Arrivée</span>
                <strong>{dateCourte(suivi.dateArrivee)}</strong>
                <span>{jourSemaine(suivi.dateArrivee)}</span>
              </div>
              <span className="suivi-recap__nuits" aria-label={`${suivi.nuits} nuit${suivi.nuits > 1 ? "s" : ""}`}>
                <Moon size={14} aria-hidden="true" /> {suivi.nuits}
              </span>
              <div>
                <span className="suivi-recap__libelle">Départ</span>
                <strong>{dateCourte(suivi.dateDepart)}</strong>
                <span>{jourSemaine(suivi.dateDepart)}</span>
              </div>
            </div>
            <dl className="suivi-recap__montants">
              <div>
                <dt>
                  {suivi.nuits} nuit{suivi.nuits > 1 ? "s" : ""} (estimation)
                </dt>
                <dd>{formatMontant(suivi.totalEstime, suivi.devise)}</dd>
              </div>
              {Number(suivi.acompte) > 0 && (
                <div className="suivi-recap__acompte">
                  <dt>Acompte reçu</dt>
                  <dd>{formatMontant(suivi.acompte, suivi.devise)}</dd>
                </div>
              )}
            </dl>
          </section>

          <section className="suivi-carte suivi-aide" aria-label="Besoin d'aide ?">
            {contact && (
              <a
                className="suivi-aide__whatsapp"
                href={lienWhatsApp(contact, `Bonjour, au sujet de ma réservation ${suivi.code} (${suivi.client.nom}).`)}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle size={19} aria-hidden="true" />
                <span>
                  <strong>Contacter l'hôtel</strong>
                  <small>sur WhatsApp</small>
                </span>
                <span className="visuellement-cache"> (s'ouvre dans un nouvel onglet)</span>
              </a>
            )}
            {suivi.peutAnnuler && !confirmationAnnulation && (
              <button type="button" className="suivi-aide__annuler" onClick={() => setConfirmationAnnulation(true)}>
                Annuler ma réservation
              </button>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
