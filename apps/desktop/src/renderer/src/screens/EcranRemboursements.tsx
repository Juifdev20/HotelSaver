import * as React from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ErreurApi } from "@hotel-chicago/api-client";
import type { ClientApi } from "@hotel-chicago/api-client";
import { formaterTelephone, lienWhatsApp, lireMontant, montantAbonnement, numeroInternational } from "@hotel-chicago/regles";
import type { ModeRemboursement, MotifRemboursement, RemboursementVue } from "@hotel-chicago/types";
import { Button, StatusBadge, useTitrePage } from "@hotel-chicago/ui";
import { Check, Copy, HandCoins, MessageCircle } from "lucide-react";
import "./abonnement.css";
import "./paiement-en-ligne.css";

export interface EcranRemboursementsProps {
  client: ClientApi;
  /** Session ouverte sans Internet : on ne peut ni lire ni décider les remboursements. */
  horsLigne: boolean;
  /** Après chaque décision (ou chaque lecture) : l'application met à jour la pastille « à faire ». */
  onChangement: () => void;
  /** Ouvre la fiche de la réservation. */
  onOuvrirReservation?: (reservationId: string) => void;
}

export const LIBELLE_MOTIF: Record<MotifRemboursement, string> = {
  ANNULATION_CLIENT: "Le client a annulé",
  ANNULATION_HOTEL: "L'hôtel a annulé",
  NON_PRESENTATION: "Le client ne s'est pas présenté",
  CHAMBRE_INDISPONIBLE: "La chambre n'était plus disponible",
  AUTRE: "Autre raison",
};

const MODES: { id: ModeRemboursement; libelle: string }[] = [
  { id: "SCANLINKPAY", libelle: "Par ScanLinkPay" },
  { id: "MOBILE_MONEY", libelle: "Par Mobile Money" },
  { id: "ESPECES", libelle: "En espèces" },
  { id: "AUTRE", libelle: "Autrement" },
];
const LIBELLE_MODE: Record<ModeRemboursement, string> = { SCANLINKPAY: "par ScanLinkPay", MOBILE_MONEY: "par Mobile Money", ESPECES: "en espèces", AUTRE: "autrement" };

function dateLongue(iso: string | null): string {
  if (!iso) return "date inconnue";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "date inconnue" : new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(d);
}

/** Texte d'un montant dans la devise du remboursement. */
const argent = (montant: number, devise: "USD" | "CDF") => montantAbonnement(montant, devise);

/** Le montant tel qu'on le propose dans un champ de saisie (« 30 », « 24,5 »). */
const versSaisie = (montant: number) => String(montant).replace(".", ",");

type Onglet = "A_FAIRE" | "HISTORIQUE";

// ---------------------------------------------------------------------------------------------------------------------------------
// Où envoyer l'argent

interface Destination {
  type: "SCANLINKPAY" | "TELEPHONE" | "AUCUNE";
  /** Valeur à copier. */
  valeur: string;
  /** Valeur lisible. */
  affichage: string;
  intitule: string;
}

export function destinationDe(r: Pick<RemboursementVue, "destinataireScanLinkPay" | "destinataireTelephone">): Destination {
  if (r.destinataireScanLinkPay) {
    return { type: "SCANLINKPAY", valeur: r.destinataireScanLinkPay, affichage: r.destinataireScanLinkPay, intitule: "Numéro ScanLinkPay du client" };
  }
  if (r.destinataireTelephone) {
    const international = numeroInternational(r.destinataireTelephone);
    return {
      type: "TELEPHONE",
      valeur: international ?? r.destinataireTelephone,
      affichage: international ? formaterTelephone(international) : r.destinataireTelephone,
      intitule: "Téléphone du client",
    };
  }
  return { type: "AUCUNE", valeur: "", affichage: "", intitule: "" };
}

function BoutonCopier({ valeur, libelle }: { valeur: string; libelle: string }) {
  const [etat, setEtat] = useState<"repos" | "copie" | "echec">("repos");
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (minuteur.current && clearTimeout(minuteur.current)), []);
  async function copier() {
    try {
      await navigator.clipboard.writeText(valeur);
      setEtat("copie");
    } catch {
      setEtat("echec");
    }
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => setEtat("repos"), 3000);
  }
  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => void copier()} aria-label={`Copier ${libelle}`}>
        {etat === "copie" ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
        {etat === "copie" ? "Copié" : "Copier"}
      </Button>
      <span className="visuellement-cache" role="status" aria-live="polite">
        {etat === "copie" ? `${libelle} copié.` : etat === "echec" ? "Copie impossible : sélectionnez le texte à la main." : ""}
      </span>
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Une carte « à faire »

interface CarteAFaireProps {
  client: ClientApi;
  r: RemboursementVue;
  urlScanLinkPay: string | null;
  onTraite: (message: string) => void;
  onOuvrirReservation?: (reservationId: string) => void;
}

function CarteAFaire({ client, r, urlScanLinkPay, onTraite, onOuvrirReservation }: CarteAFaireProps) {
  const id = useId();
  const [montantSaisi, setMontantSaisi] = useState(versSaisie(r.montantARembourser));
  const [volet, setVolet] = useState<"rembourse" | "conserve" | null>(null);
  const [mode, setMode] = useState<ModeRemboursement>(r.destinataireScanLinkPay ? "SCANLINKPAY" : "MOBILE_MONEY");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [confirme, setConfirme] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const titreVolet = useRef<HTMLHeadingElement>(null);

  const destination = destinationDe(r);
  const lu = lireMontant(montantSaisi, r.devise);
  const probleme = !lu.ok ? lu.message : lu.valeur > r.montantPaye + 1e-9 ? `On ne peut pas rendre plus que ce que le client a payé (${argent(r.montantPaye, r.devise)}).` : null;
  const montantARendre = lu.ok ? lu.valeur : null;

  useEffect(() => {
    if (volet) titreVolet.current?.focus();
  }, [volet]);

  const messageInvitation = `Bonjour ${r.clientNom}, nous allons vous rembourser votre acompte${urlScanLinkPay ? `. Pour le recevoir tout de suite, créez gratuitement votre compte ScanLinkPay : ${urlScanLinkPay}` : "."}`;
  const telephoneInvitation = r.destinataireTelephone ? (numeroInternational(r.destinataireTelephone) ?? r.destinataireTelephone) : null;

  function ouvrir(v: "rembourse" | "conserve") {
    setErreur(null);
    setConfirme(false);
    if (v === "rembourse" && probleme) {
      setErreur(probleme);
      return;
    }
    setVolet(v);
  }

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    if (!confirme) {
      setErreur("Cochez la case pour confirmer.");
      return;
    }
    setEnCours(true);
    setErreur(null);
    try {
      if (volet === "rembourse") {
        if (montantARendre === null || probleme) throw new Error(probleme ?? "Montant invalide.");
        await client.traiterRemboursement(r.id, { action: "EFFECTUE", montant: montantARendre, mode, reference: reference.trim() || undefined, note: note.trim() || undefined });
        onTraite(`Remboursement enregistré : ${argent(montantARendre, r.devise)} rendus à ${r.clientNom}.`);
      } else {
        await client.traiterRemboursement(r.id, { action: "CONSERVE", note: note.trim() || undefined });
        onTraite(`Acompte conservé : ${argent(r.montantPaye, r.devise)} de ${r.clientNom} restent à l'hôtel.`);
      }
    } catch (err) {
      if (err instanceof ErreurApi && err.statusCode === 409) {
        onTraite("Ce remboursement avait déjà été traité par quelqu'un d'autre. La liste est à jour.");
        return;
      }
      setErreur(err instanceof Error ? err.message : "Impossible d'enregistrer. Réessayez.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <article className="remb-carte" aria-labelledby={`${id}-client`} data-testid="remboursement-carte">
      <header className="remb-carte__entete">
        <div>
          <h3 id={`${id}-client`} className="hc-text-heading">
            {r.clientNom}
          </h3>
          <p className="hc-text-body texte-discret">
            {r.chambreNumero ? `Chambre ${r.chambreNumero}` : "Chambre inconnue"} · arrivée le {dateLongue(r.dateArrivee)}
          </p>
        </div>
        <StatusBadge tone="warning" label="À faire" />
      </header>

      <p className="hc-text-body">
        <strong>Raison :</strong> {LIBELLE_MOTIF[r.motif]}.
      </p>

      <dl className="remb-montants">
        <div>
          <dt>Payé en ligne</dt>
          <dd data-testid="remboursement-paye">{argent(r.montantPaye, r.devise)}</dd>
        </div>
        <div>
          <dt>
            <label htmlFor={`${id}-montant`}>Montant à rendre ({r.devise === "USD" ? "$" : "FC"})</label>
          </dt>
          <dd>
            <input
              id={`${id}-montant`}
              className="remb-montant-champ"
              type="text"
              inputMode="decimal"
              value={montantSaisi}
              onChange={(e) => setMontantSaisi(e.target.value)}
              aria-invalid={probleme ? true : undefined}
              aria-describedby={`${id}-montant-aide`}
              disabled={volet !== null}
            />
          </dd>
        </div>
      </dl>
      <p id={`${id}-montant-aide`} className={`hc-text-caption ${probleme ? "texte-erreur" : "texte-discret"}`} role={probleme ? "alert" : undefined}>
        {probleme ?? "Proposé : tout l'acompte. Vous pouvez rendre moins (par exemple si le client a annulé trop tard)."}
      </p>

      <section className="remb-destination" aria-label="Où envoyer l'argent" data-testid="remboursement-destination">
        <p className="hc-text-label texte-discret">Où envoyer l'argent</p>
        {destination.type === "AUCUNE" ? (
          <p className="hc-text-body texte-erreur">Le client n'a laissé ni numéro ScanLinkPay ni téléphone. Contactez-le autrement pour savoir où envoyer l'argent.</p>
        ) : (
          <>
            <p className="hc-text-body texte-discret">{destination.intitule}</p>
            <div className="remb-destination__ligne">
              <strong className="remb-destination__valeur" data-testid="remboursement-numero">
                {destination.affichage}
              </strong>
              <BoutonCopier valeur={destination.valeur} libelle={destination.intitule.toLowerCase()} />
            </div>
          </>
        )}
        <p className="hc-text-caption texte-discret">Dans l'application ScanLinkPay : Envoyer → numéro du client.</p>
        {destination.type === "TELEPHONE" && telephoneInvitation && (
          <a
            className="remb-lien"
            href={lienWhatsApp(telephoneInvitation, messageInvitation)}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="remboursement-inviter"
          >
            <MessageCircle size={16} aria-hidden="true" />
            Inviter ce client sur ScanLinkPay
            <span className="visuellement-cache"> (ouvre WhatsApp dans une nouvelle fenêtre)</span>
          </a>
        )}
      </section>

      {erreur && volet === null && (
        <p role="alert" className="hc-text-body texte-erreur">
          {erreur}
        </p>
      )}

      {volet === null ? (
        <div className="remb-actions">
          <Button type="button" onClick={() => ouvrir("rembourse")}>
            J'ai remboursé
          </Button>
          <Button type="button" variant="secondary" onClick={() => ouvrir("conserve")}>
            Conserver l'acompte
          </Button>
          {onOuvrirReservation && (
            <Button type="button" variant="secondary" onClick={() => onOuvrirReservation(r.reservationId)}>
              Voir la réservation
            </Button>
          )}
        </div>
      ) : (
        <form className="remb-volet" onSubmit={(e) => void envoyer(e)} aria-labelledby={`${id}-volet`} noValidate>
          <h4 id={`${id}-volet`} className="hc-text-body-strong" tabIndex={-1} ref={titreVolet}>
            {volet === "rembourse" ? "Confirmer le remboursement" : "Conserver l'acompte"}
          </h4>

          {volet === "rembourse" ? (
            <>
              <fieldset className="remb-modes">
                <legend className="hc-text-label">Comment avez-vous remboursé ?</legend>
                {MODES.map((m) => (
                  <label key={m.id} className={`remb-mode${mode === m.id ? " remb-mode--actif" : ""}`}>
                    <input type="radio" name={`${id}-mode`} value={m.id} checked={mode === m.id} onChange={() => setMode(m.id)} />
                    {m.libelle}
                  </label>
                ))}
              </fieldset>
              <label className="hc-text-label" htmlFor={`${id}-ref`}>
                Référence de l'envoi (facultatif)
              </label>
              <input id={`${id}-ref`} type="text" maxLength={120} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ex. numéro de transaction" />
            </>
          ) : (
            <p className="hc-text-body">Le client ne sera pas remboursé. L'acompte de {argent(r.montantPaye, r.devise)} reste à l'hôtel.</p>
          )}

          <label className="hc-text-label" htmlFor={`${id}-note`}>
            Note (facultatif)
          </label>
          <textarea id={`${id}-note`} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder={volet === "conserve" ? "Ex. Conditions : non-présentation = acompte conservé" : "Ex. Remboursement partiel : annulation tardive"} />

          <label className="remb-confirmation hc-text-body">
            <input type="checkbox" checked={confirme} onChange={(e) => setConfirme(e.target.checked)} />
            <span>
              {volet === "rembourse" && montantARendre !== null
                ? `Je confirme avoir rendu ${argent(montantARendre, r.devise)} à ${r.clientNom} ${LIBELLE_MODE[mode]}.`
                : `Je confirme garder l'acompte de ${argent(r.montantPaye, r.devise)}.`}
            </span>
          </label>

          {erreur && (
            <p role="alert" className="hc-text-body texte-erreur">
              {erreur}
            </p>
          )}
          <div className="remb-actions">
            <Button type="submit" disabled={enCours}>
              {enCours ? "Enregistrement…" : volet === "rembourse" ? "Confirmer le remboursement" : "Conserver l'acompte"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={enCours}
              onClick={() => {
                setVolet(null);
                setErreur(null);
              }}
            >
              Retour
            </Button>
          </div>
        </form>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Une carte de l'historique

function CarteHistorique({ r, onOuvrirReservation }: { r: RemboursementVue; onOuvrirReservation?: (reservationId: string) => void }) {
  const id = useId();
  const rembourse = r.statut === "EFFECTUE";
  return (
    <article className="remb-carte remb-carte--fait" aria-labelledby={`${id}-client`} data-testid="remboursement-historique-carte">
      <header className="remb-carte__entete">
        <div>
          <h3 id={`${id}-client`} className="hc-text-heading">
            {r.clientNom}
          </h3>
          <p className="hc-text-body texte-discret">
            {r.chambreNumero ? `Chambre ${r.chambreNumero}` : "Chambre inconnue"} · arrivée le {dateLongue(r.dateArrivee)}
          </p>
        </div>
        <StatusBadge tone={rembourse ? "success" : "neutral"} label={rembourse ? "Remboursé" : "Acompte conservé"} />
      </header>
      <p className="hc-text-body">
        <strong>Raison :</strong> {LIBELLE_MOTIF[r.motif]}. Payé en ligne : {argent(r.montantPaye, r.devise)}.
      </p>
      <p className="hc-text-body">
        {rembourse
          ? `Rendu : ${argent(r.montantARembourser, r.devise)}${r.mode ? ` ${LIBELLE_MODE[r.mode]}` : ""}${r.traiteLe ? `, le ${dateLongue(r.traiteLe)}` : ""}.`
          : `Conservé par l'hôtel${r.traiteLe ? `, le ${dateLongue(r.traiteLe)}` : ""}.`}
      </p>
      {r.reference && <p className="hc-text-body texte-discret">Référence : {r.reference}</p>}
      {r.note && <p className="hc-text-body texte-discret">Note : {r.note}</p>}
      {onOuvrirReservation && (
        <div className="remb-actions">
          <Button type="button" variant="secondary" size="sm" onClick={() => onOuvrirReservation(r.reservationId)}>
            Voir la réservation
          </Button>
        </div>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Écran

export function EcranRemboursements({ client, horsLigne, onChangement, onOuvrirReservation }: EcranRemboursementsProps) {
  useTitrePage("Remboursements");
  const [liste, setListe] = useState<RemboursementVue[] | null>(null);
  const [erreur, setErreur] = useState<{ message: string; horsLigne: boolean } | null>(null);
  const [onglet, setOnglet] = useState<Onglet>("A_FAIRE");
  const [message, setMessage] = useState<string | null>(null);
  const [urlScanLinkPay, setUrlScanLinkPay] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const changementRef = useRef(onChangement);
  changementRef.current = onChangement;
  const idOnglets = useId();
  const refOnglets = useRef<Record<Onglet, HTMLButtonElement | null>>({ A_FAIRE: null, HISTORIQUE: null });

  const charger = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (horsLigne) return;
    let actif = true;
    client
      .listerRemboursements()
      .then((l) => {
        if (!actif) return;
        setListe(l);
        setErreur(null);
        changementRef.current();
      })
      .catch((e: unknown) => {
        if (!actif) return;
        const coupure = e instanceof ErreurApi && e.statusCode === 0;
        setErreur({ horsLigne: coupure, message: coupure ? "Connectez-vous à Internet pour voir les remboursements." : e instanceof Error ? e.message : "Impossible de lire les remboursements." });
      });
    return () => {
      actif = false;
    };
  }, [client, horsLigne, version]);

  // Adresse de ScanLinkPay (pour inviter un client à créer son compte) : facultative, jamais bloquante.
  useEffect(() => {
    if (horsLigne) return;
    let actif = true;
    client
      .reglagesPaiementEnLigne()
      .then((r) => actif && setUrlScanLinkPay(r.urlScanLinkPay))
      .catch(() => undefined);
    return () => {
      actif = false;
    };
  }, [client, horsLigne]);

  const aFaire = (liste ?? []).filter((r) => r.statut === "A_FAIRE");
  const historique = (liste ?? []).filter((r) => r.statut !== "A_FAIRE");

  function surToucheOnglet(e: React.KeyboardEvent) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const suivant: Onglet = e.key === "Home" ? "A_FAIRE" : e.key === "End" ? "HISTORIQUE" : onglet === "A_FAIRE" ? "HISTORIQUE" : "A_FAIRE";
    setOnglet(suivant);
    refOnglets.current[suivant]?.focus();
  }

  const corps = (() => {
    if (horsLigne || erreur?.horsLigne) {
      return (
        <p className="abo-message hc-text-body" role="status" data-testid="remboursements-hors-ligne">
          Connectez-vous à Internet pour voir les remboursements et les décider.
        </p>
      );
    }
    if (erreur && !liste) {
      return (
        <div className="abo-message abo-message--erreur" role="alert">
          <p className="hc-text-body">{erreur.message}</p>
          <Button type="button" variant="secondary" size="sm" onClick={charger}>
            Réessayer
          </Button>
        </div>
      );
    }
    if (!liste) return <p className="hc-text-body texte-discret">Chargement des remboursements…</p>;
    if (onglet === "A_FAIRE") {
      return aFaire.length === 0 ? (
        <div className="etat-vide" data-testid="remboursements-vide">
          <HandCoins size={30} strokeWidth={1.5} aria-hidden="true" />
          <p className="hc-text-subheading">Aucun remboursement à faire</p>
          <p className="hc-text-body">Quand un client qui a payé son acompte en ligne annule, vous le verrez ici.</p>
        </div>
      ) : (
        <div className="remb-liste">
          {aFaire.map((r) => (
            <CarteAFaire
              key={r.id}
              client={client}
              r={r}
              urlScanLinkPay={urlScanLinkPay}
              onOuvrirReservation={onOuvrirReservation}
              onTraite={(m) => {
                setMessage(m);
                charger();
              }}
            />
          ))}
        </div>
      );
    }
    return historique.length === 0 ? (
      <div className="etat-vide" data-testid="remboursements-historique-vide">
        <HandCoins size={30} strokeWidth={1.5} aria-hidden="true" />
        <p className="hc-text-subheading">Rien dans l'historique</p>
        <p className="hc-text-body">Les remboursements faits et les acomptes conservés apparaîtront ici.</p>
      </div>
    ) : (
      <div className="remb-liste">
        {historique.map((r) => (
          <CarteHistorique key={r.id} r={r} onOuvrirReservation={onOuvrirReservation} />
        ))}
      </div>
    );
  })();

  return (
    <div className="page">
      <header className="page__entete">
        <div>
          <h1 className="hc-text-display-md page__titre">Remboursements</h1>
          <p className="hc-text-body page__sous-titre">Les acomptes payés en ligne par des clients dont la réservation est annulée. C'est vous qui décidez.</p>
        </div>
      </header>

      <div role="status" aria-live="polite" data-testid="remboursements-message">
        {message && <p className="remb-succes hc-text-body">{message}</p>}
      </div>

      <div className="remb-onglets" role="tablist" aria-label="Remboursements" onKeyDown={surToucheOnglet}>
        {(
          [
            ["A_FAIRE", liste ? `À faire (${aFaire.length})` : "À faire"],
            ["HISTORIQUE", "Historique"],
          ] as const
        ).map(([cle, libelle]) => (
          <button
            key={cle}
            ref={(el) => {
              refOnglets.current[cle] = el;
            }}
            type="button"
            role="tab"
            id={`${idOnglets}-${cle}`}
            aria-selected={onglet === cle}
            aria-controls={`${idOnglets}-panneau`}
            tabIndex={onglet === cle ? 0 : -1}
            className={`remb-onglet${onglet === cle ? " remb-onglet--actif" : ""}`}
            onClick={() => setOnglet(cle)}
          >
            {libelle}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${idOnglets}-panneau`} aria-labelledby={`${idOnglets}-${onglet}`} className="remb-panneau">
        {corps}
      </div>
    </div>
  );
}
