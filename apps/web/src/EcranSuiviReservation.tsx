import * as React from "react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { annulerReservationPublique, obtenirSuiviReservation, preEnregistrerReservation } from "@hotel-chicago/api-client";
import { formatMontant } from "@hotel-chicago/ui";
import type { StatutSuiviPublic, SuiviReservationPublic, TypePiece } from "@hotel-chicago/types";
import { configuration } from "./config";

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

function dateLongue(iso: string): string {
  // Fuseau de l'hôtel : la date affichée ne dépend pas du pays d'où le client consulte la page.
  return new Date(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lubumbashi" });
}

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
      setErreurForm(err instanceof Error ? err.message : "Annulation impossible, contactez l'hôtel.");
    } finally {
      setEnCours(false);
    }
  }

  if (erreur) {
    return (
      <div className="hotel-section hotel-section--etroite">
        <div className="suivi-carte">
          <h1 className="suivi-titre">Réservation introuvable</h1>
          <p>Ce lien n'est pas valide ou a été mal copié. Vérifiez le lien reçu, ou contactez l'hôtel.</p>
        </div>
      </div>
    );
  }
  if (!suivi) return <div className="hotel-section hotel-section--etroite"><p>Chargement…</p></div>;

  const statut = STATUTS[suivi.statut];
  const pe = suivi.preEnregistrement;
  const contact = suivi.hotel.whatsapp ?? suivi.hotel.telephone;

  return (
    <div className="hotel-section hotel-section--etroite suivi">
      <header className="hotel-entete">
        <span>Ma réservation · {suivi.code}</span>
        <h2>Bonjour {suivi.client.nom}</h2>
      </header>

      <div className={`suivi-statut suivi-statut--${statut.ton}`} role="status">
        <strong>{statut.libelle}</strong>
        <p>{statut.texte}</p>
      </div>

      <div className="suivi-carte">
        <dl className="suivi-details">
          <div>
            <dt>Chambre</dt>
            <dd>
              {suivi.chambre.numero} · {suivi.chambre.type}
            </dd>
          </div>
          <div>
            <dt>Arrivée</dt>
            <dd>{dateLongue(suivi.dateArrivee)}</dd>
          </div>
          <div>
            <dt>Départ</dt>
            <dd>{dateLongue(suivi.dateDepart)}</dd>
          </div>
          <div>
            <dt>Séjour</dt>
            <dd>
              {suivi.nuits} nuit{suivi.nuits > 1 ? "s" : ""} · {formatMontant(suivi.totalEstime, suivi.devise)} (estimation)
            </dd>
          </div>
          {Number(suivi.acompte) > 0 && (
            <div>
              <dt>Acompte reçu</dt>
              <dd>{formatMontant(suivi.acompte, suivi.devise)}</dd>
            </div>
          )}
        </dl>
      </div>

      {suivi.reponseReception && (
        <div className="suivi-carte">
          <h3 className="suivi-sous-titre">Message de la réception</h3>
          <p className="suivi-texte">{suivi.reponseReception}</p>
        </div>
      )}

      {(suivi.peutPreEnregistrer || pe.fait) && (
        <div className="suivi-carte">
          <h3 className="suivi-sous-titre">Pré-enregistrement</h3>
          {pe.fait && !formulaireOuvert && (
            <>
              <p className="suivi-ok">✓ Pré-enregistrement reçu — votre arrivée sera plus rapide.</p>
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
              <p>Gagnez du temps à la réception : renseignez dès maintenant votre pièce d'identité et votre heure d'arrivée.</p>
              <button type="button" className="hotel-bouton hotel-bouton--primaire" onClick={() => setFormulaireOuvert(true)}>
                Me pré-enregistrer
              </button>
            </>
          )}
          {formulaireOuvert && (
            <form className="suivi-formulaire" onSubmit={envoyerPreEnregistrement}>
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
              <label className="label" htmlFor="heure-arrivee">
                Heure d'arrivée prévue
              </label>
              <input id="heure-arrivee" className="champ" type="time" value={heure} onChange={(e) => setHeure(e.target.value)} required />
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
        </div>
      )}

      <div className="suivi-actions">
        {contact && (
          <a
            className="hotel-bouton hotel-bouton--contour"
            href={lienWhatsApp(contact, `Bonjour, au sujet de ma réservation ${suivi.code} (${suivi.client.nom}).`)}
            target="_blank"
            rel="noreferrer"
          >
            Contacter l'hôtel sur WhatsApp
          </a>
        )}
        {suivi.peutAnnuler && !confirmationAnnulation && (
          <button type="button" className="hotel-bouton hotel-bouton--contour suivi-danger" onClick={() => setConfirmationAnnulation(true)}>
            Annuler ma réservation
          </button>
        )}
      </div>

      {confirmationAnnulation && (
        <div className="suivi-carte">
          <h3 className="suivi-sous-titre">Annuler la réservation ?</h3>
          <p>L'hôtel sera prévenu. Cette action est définitive.</p>
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
        </div>
      )}

      <p className="suivi-rappel">Gardez ce lien : il vous permet de suivre votre réservation à tout moment.</p>
    </div>
  );
}
