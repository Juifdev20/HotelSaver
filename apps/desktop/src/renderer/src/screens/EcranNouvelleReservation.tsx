import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import type { Chambre, Reservation } from "@hotel-chicago/types";
import type { Client as ClientHotel } from "@hotel-chicago/types";
import { Button, formatMontant } from "@hotel-chicago/ui";
import { Check, CircleCheck, LogIn, CalendarDays, Search, UserPlus } from "lucide-react";
import { chambresIndisponibles, choixAcompteDe, montantAcompteRapide, typesDeChambres } from "@hotel-chicago/regles";
import type { ChoixAcompte } from "@hotel-chicago/regles";
import "../sejours/sejours.css";
import "../chambres/chambres.css";
import { lireMontant } from "@hotel-chicago/miroir-local";

import { ChampTypePiece } from "../components/ChampTypePiece";
export interface EcranNouvelleReservationProps {
  client: ClientApi;
  onRetour: () => void;
  onCreee: (reservationId: string) => void;
  /** Pré-remplissage depuis le planning (cellule chambre × jour). */
  chambreInitialeId?: string;
  dateArriveeInitiale?: string; // AAAA-MM-JJ
  /** « Enregistrer une arrivée » (depuis une chambre libre) : la case « le client est déjà là » est cochée d'avance. */
  arriveeImmediateParDefaut?: boolean;
}

function aujourdhuiInput(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function jourSuivant(input: string, nuits: number): string {
  const d = new Date(input + "T12:00:00");
  d.setDate(d.getDate() + nuits);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Création d'une réservation à la réception (appel direct API — le desktop
 * n'a pas de mode hors-ligne). « Check-in immédiat » enchaîne la création
 * et le check-in pour un walk-in du jour ; si le check-in échoue la
 * réservation reste créée (CONFIRMEE), signalé à l'écran.
 */
export function EcranNouvelleReservation({ client, onRetour, onCreee, chambreInitialeId, dateArriveeInitiale, arriveeImmediateParDefaut = false }: EcranNouvelleReservationProps) {
  const [chambres, setChambres] = useState<Chambre[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [clients, setClients] = useState<ClientHotel[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const [arrivee, setArrivee] = useState(dateArriveeInitiale ?? aujourdhuiInput());
  const [nuits, setNuits] = useState(1);
  const [chambreId, setChambreId] = useState(chambreInitialeId ?? "");
  const [modeClient, setModeClient] = useState<"nouveau" | "existant">("nouveau");
  const [clientId, setClientId] = useState("");
  const [rechercheClient, setRechercheClient] = useState("");
  const [nom, setNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [email, setEmail] = useState("");
  const [typePiece, setTypePiece] = useState("");
  const [numeroPiece, setNumeroPiece] = useState("");
  const [note, setNote] = useState("");
  const [acompteSaisi, setAcompteSaisi] = useState("");
  const [checkInImmediat, setCheckInImmediat] = useState(arriveeImmediateParDefaut);

  useEffect(() => {
    Promise.all([client.listerChambres(), client.listerReservations(), client.listerClients()])
      .then(([c, r, cl]) => {
        setChambres(c);
        setReservations(r);
        setClients(cl);
        setChargement(false);
      })
      .catch((e: Error) => setErreur(e.message));
  }, [client]);

  const depart = jourSuivant(arrivee, nuits);

  // Sans connexion, la disponibilité est celle de la dernière synchronisation : un client a pu payer sa chambre en ligne entre-temps.
  const [enLigne, setEnLigne] = useState(() => navigator.onLine);
  useEffect(() => {
    const maj = () => setEnLigne(navigator.onLine);
    window.addEventListener("online", maj);
    window.addEventListener("offline", maj);
    return () => {
      window.removeEventListener("online", maj);
      window.removeEventListener("offline", maj);
    };
  }, []);

  const indisponibles = useMemo(
    () => chambresIndisponibles(reservations, new Date(arrivee + "T12:00:00").toISOString(), new Date(depart + "T12:00:00").toISOString()),
    [reservations, arrivee, depart]
  );
  const [filtreType, setFiltreType] = useState<string | null>(null);
  const typesDispo = useMemo(() => typesDeChambres(chambres.filter((c) => !indisponibles.has(c.id))), [chambres, indisponibles]);
  const nbLibres = chambres.filter((c) => !indisponibles.has(c.id)).length;
  const chambresAffichees = chambres.filter((c) => !filtreType || c.type.trim() === filtreType);
  // Si les dates changent et que la chambre choisie n'est plus libre, on la désélectionne : on ne laisse pas partir une réservation en conflit.
  useEffect(() => {
    if (chambreId && indisponibles.has(chambreId)) setChambreId("");
  }, [indisponibles, chambreId]);

  const clientsFiltres = useMemo(() => {
    const terme = rechercheClient.trim().toLowerCase();
    return clients.filter(
      (c) => !terme || c.nom.toLowerCase().includes(terme) || (c.telephone ?? "").includes(rechercheClient.trim())
    );
  }, [clients, rechercheClient]);

  const chambreChoisie = chambres.find((c) => c.id === chambreId) ?? null;
  const acompteLu = acompteSaisi.trim()
    ? lireMontant(acompteSaisi, chambreChoisie?.devise ?? "USD", { autoriserZero: true, max: 100_000_000 })
    : ({ ok: true, valeur: 0 } as const);
  const acompte = acompteLu.ok ? acompteLu.valeur : NaN;
  const total = chambreChoisie ? Number(chambreChoisie.prixParNuit) * nuits : 0;

  async function creer() {
    setErreur(null);
    if (!chambreChoisie) {
      setErreur("Choisissez une chambre.");
      return;
    }
    if (modeClient === "existant" && !clientId) {
      setErreur("Choisissez un client existant ou passez en « Nouveau client ».");
      return;
    }
    if (modeClient === "nouveau" && !nom.trim()) {
      setErreur("Le nom du client est obligatoire.");
      return;
    }
    if (!acompteLu.ok) {
      setErreur("Acompte invalide.");
      return;
    }

    setEnCours(true);
    try {
      // Arrivée express : `installerImmediatement` fait le check-in dans la
      // même transaction que la création (chambre OCCUPEE immédiatement) —
      // plus de deuxième appel qui pouvait échouer après un create réussi.
      const creee = await client.creerReservation({
        chambreId: chambreChoisie.id,
        ...(modeClient === "existant"
          ? { clientId }
          : {
              client: {
                nom: nom.trim(),
                telephone: telephone.trim() || undefined,
                email: email.trim() || undefined,
                typePiece: typePiece.trim() || undefined,
                numeroPiece: numeroPiece.trim() || undefined,
              },
            }),
        dateArrivee: new Date(arrivee + "T12:00:00").toISOString(),
        dateDepart: new Date(depart + "T12:00:00").toISOString(),
        acompte: acompte || undefined,
        note: note.trim() || undefined,
        installerImmediatement: checkInImmediat || undefined,
      });
      onCreee(creee.id);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur inconnue.");
      setEnCours(false);
    }
  }

  const maintenant = checkInImmediat;
  const devise = chambreChoisie?.devise ?? "USD";
  const acompteValeur = Number.isNaN(acompte) ? 0 : acompte;
  const choixActif = acompteLu.ok ? choixAcompteDe(total, acompteValeur) : null;
  const clientChoisiFiche = modeClient === "existant" ? clients.find((c) => c.id === clientId) : undefined;
  const nomRecap = modeClient === "existant" ? (clientChoisiFiche?.nom ?? "") : nom.trim();
  const telRecap = modeClient === "existant" ? (clientChoisiFiche?.telephone ?? "") : telephone.trim();
  const sejourOk = Boolean(arrivee) && nuits >= 1;
  const chambreOk = chambreChoisie !== null;
  const clientOk = nomRecap !== "";
  const FORMAT_COURT = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
  const FORMAT_LONG = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const dateArr = new Date(arrivee + "T12:00:00");
  const dateDep = new Date(depart + "T12:00:00");

  function choisirMode(m: "maintenant" | "plus-tard") {
    if (m === "maintenant") {
      setArrivee(aujourdhuiInput());
      setCheckInImmediat(true);
    } else {
      setCheckInImmediat(false);
    }
  }
  function choisirAcompte(choix: ChoixAcompte) {
    const montant = montantAcompteRapide(total, choix);
    setAcompteSaisi(montant > 0 ? String(montant) : "");
  }
  const Numero = ({ n, fait }: { n: number; fait: boolean }) => (
    <span className={`arrivee-bloc__numero${fait ? " arrivee-bloc__numero--fait" : ""}`} aria-hidden="true">
      {fait ? <Check size={17} strokeWidth={3} /> : n}
    </span>
  );

  return (
    <div className="page">
      <header className="page__entete">
        <div>
          <h1 className="hc-text-display-md page__titre">{maintenant ? "Enregistrer une arrivée" : "Nouvelle réservation"}</h1>
        </div>
        <div style={{ display: "flex", gap: "var(--hc-space-3)", alignItems: "center", flexWrap: "wrap" }}>
          <div className="arrivee-bascule" role="group" aria-label="Quand arrive le client ?">
            <button type="button" aria-pressed={maintenant} onClick={() => choisirMode("maintenant")}>
              <LogIn size={17} aria-hidden="true" /> Il arrive maintenant
            </button>
            <button type="button" aria-pressed={!maintenant} onClick={() => choisirMode("plus-tard")}>
              <CalendarDays size={17} aria-hidden="true" /> Réservation pour plus tard
            </button>
          </div>
          <Button type="button" variant="secondary" onClick={onRetour}>
            Retour
          </Button>
        </div>
      </header>

      {erreur && (
        <p role="alert" className="hc-text-body texte-erreur">
          {erreur}
        </p>
      )}
      {chargement && <p className="hc-text-body texte-discret">Chargement…</p>}
      {!enLigne && !chargement && (
        <p role="note" className="hc-text-body" data-testid="avis-hors-ligne-reservation">
          Vous êtes sans connexion : les chambres affichées sont celles de la dernière synchronisation. Si un client en a payé une en ligne entre-temps, votre
          réservation sera refusée à la reconnexion et vous serez prévenu pour proposer une autre chambre.
        </p>
      )}

      {!chargement && (
        <div className="reservation-colonnes">
          <div className="reservation-colonnes__principal">
            <section className="carte-formulaire formulaire" aria-labelledby="bloc-sejour">
              <h2 id="bloc-sejour" className="arrivee-bloc__titre">
                <Numero n={1} fait={sejourOk} /> Séjour
              </h2>
              <div className="champs-grille">
                <div className="champ">
                  <label className="hc-text-label" htmlFor="arrivee">
                    Arrivée
                  </label>
                  <input id="arrivee" type="date" value={arrivee} disabled={maintenant} onChange={(e) => setArrivee(e.target.value)} />
                  {maintenant && <span className="hc-text-caption texte-discret">Aujourd'hui</span>}
                </div>
                <div className="champ">
                  <span className="hc-text-label" id="etiquette-nuits">
                    Nuits
                  </span>
                  <div className="arrivee-nuits" role="group" aria-labelledby="etiquette-nuits">
                    <button type="button" aria-label="Une nuit de moins" onClick={() => setNuits(Math.max(1, nuits - 1))} disabled={nuits <= 1}>
                      −
                    </button>
                    <strong aria-live="polite" aria-label={`${nuits} nuit${nuits > 1 ? "s" : ""}`}>
                      {nuits}
                    </strong>
                    <button type="button" aria-label="Une nuit de plus" onClick={() => setNuits(Math.min(60, nuits + 1))} disabled={nuits >= 60}>
                      +
                    </button>
                  </div>
                </div>
              </div>
              <p className="hc-text-caption texte-discret">
                Départ prévu le <strong>{FORMAT_LONG.format(dateDep)}</strong>
              </p>
            </section>

            <section className="carte-formulaire formulaire" aria-labelledby="bloc-chambre">
              <h2 id="bloc-chambre" className="arrivee-bloc__titre">
                <Numero n={2} fait={chambreOk} /> Chambre{" "}
                <span className="arrivee-bloc__aide">
                  libres du {FORMAT_COURT.format(dateArr)} au {FORMAT_COURT.format(dateDep)}
                </span>
              </h2>
              {typesDispo.length > 1 && (
                <div className="arrivee-types" role="group" aria-label="Filtrer par type de chambre">
                  <button type="button" className="chambre-type" aria-pressed={!filtreType} onClick={() => setFiltreType(null)}>
                    Toutes · {nbLibres}
                  </button>
                  {typesDispo.map(({ type, nombre }) => (
                    <button key={type} type="button" className="chambre-type" aria-pressed={filtreType === type} onClick={() => setFiltreType(filtreType === type ? null : type)}>
                      {type} · {nombre}
                    </button>
                  ))}
                </div>
              )}
              {nbLibres === 0 && <p className="hc-text-body texte-discret">Aucune chambre libre sur ces dates. Changez les dates ou le nombre de nuits.</p>}
              <div className="arrivee-grille" role="radiogroup" aria-label="Chambre">
                {chambresAffichees.map((c) => {
                  const motif = indisponibles.get(c.id);
                  const choisie = chambreId === c.id;
                  const anettoyer = !motif && c.statut === "NETTOYAGE";
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="radio"
                      aria-checked={choisie}
                      className="arrivee-chambre"
                      disabled={!!motif}
                      onClick={() => {
                        setChambreId(c.id);
                        setErreur(null);
                      }}
                      aria-label={`Chambre ${c.numero}, ${c.type}, ${formatMontant(c.prixParNuit, c.devise)} par nuit${motif ? (motif === "occupee" ? ", occupée sur ces dates" : ", déjà réservée sur ces dates") : anettoyer ? ", à nettoyer" : ""}`}
                    >
                      {choisie && (
                        <span className="arrivee-chambre__coche" aria-hidden="true">
                          <Check size={14} strokeWidth={3} />
                        </span>
                      )}
                      <span className="arrivee-chambre__numero">{c.numero}</span>
                      <span className="arrivee-chambre__type">{c.type}</span>
                      {motif && <span className="arrivee-chambre__motif">{motif === "occupee" ? "Occupée" : "Réservée"}</span>}
                      {anettoyer && <span className="arrivee-chambre__motif arrivee-chambre__motif--nettoyage">À nettoyer</span>}
                      <span className="arrivee-chambre__prix">{formatMontant(c.prixParNuit, c.devise)} / nuit</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="carte-formulaire formulaire" aria-labelledby="bloc-client">
              <h2 id="bloc-client" className="arrivee-bloc__titre">
                <Numero n={3} fait={clientOk} /> Client
              </h2>
              <div className="puces" role="group" aria-label="Type de client">
                {(["nouveau", "existant"] as const).map((m) => (
                  <button key={m} type="button" className="puce" aria-pressed={modeClient === m} onClick={() => setModeClient(m)}>
                    {m === "nouveau" ? (
                      <UserPlus size={15} aria-hidden="true" style={{ verticalAlign: "-2px", marginRight: 6 }} />
                    ) : (
                      <Search size={15} aria-hidden="true" style={{ verticalAlign: "-2px", marginRight: 6 }} />
                    )}
                    {m === "nouveau" ? "Nouveau client" : "Client déjà venu"}
                  </button>
                ))}
              </div>

              {modeClient === "nouveau" ? (
                <div className="champs-grille">
                  <div className="champ champ--large">
                    <label className="hc-text-label" htmlFor="nom">
                      Nom et prénom (obligatoire)
                    </label>
                    <input id="nom" type="text" value={nom} onChange={(e) => setNom(e.target.value)} />
                  </div>
                  <div className="champ">
                    <label className="hc-text-label" htmlFor="tel">
                      Téléphone
                    </label>
                    <input id="tel" type="tel" value={telephone} onChange={(e) => setTelephone(e.target.value)} />
                  </div>
                  <div className="champ">
                    <label className="hc-text-label" htmlFor="email">
                      E-mail (facultatif)
                    </label>
                    <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Pour envoyer le reçu" />
                  </div>
                  <ChampTypePiece id="type-piece" valeur={typePiece} onChange={setTypePiece} />
                  <div className="champ">
                    <label className="hc-text-label" htmlFor="numero-piece">
                      Numéro de la pièce (facultatif)
                    </label>
                    <input id="numero-piece" type="text" value={numeroPiece} onChange={(e) => setNumeroPiece(e.target.value)} placeholder="Numéro de la pièce" />
                  </div>
                  <p className="hc-text-caption texte-discret champ--large">La pièce d'identité reste facultative : elle est inscrite au registre de l'hôtel si vous la renseignez.</p>
                </div>
              ) : (
                <>
                  <label className="hc-text-label" htmlFor="recherche-client">
                    Rechercher
                  </label>
                  <input id="recherche-client" type="search" value={rechercheClient} onChange={(e) => setRechercheClient(e.target.value)} placeholder="Nom ou téléphone" />
                  <label className="hc-text-label" htmlFor="client-existant">
                    Client
                  </label>
                  <select id="client-existant" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                    <option value="">— Choisir —</option>
                    {clientsFiltres.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nom}
                        {c.telephone ? ` · ${c.telephone}` : ""}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </section>

            <section className="carte-formulaire formulaire" aria-labelledby="bloc-paiement">
              <h2 id="bloc-paiement" className="arrivee-bloc__titre">
                <Numero n={4} fait={false} /> Paiement et demandes
              </h2>
              <div className="champs-grille">
                <div className="champ">
                  <span className="hc-text-label" id="etiquette-acompte">
                    Acompte versé ({devise})
                  </span>
                  <div className="arrivee-acompte" role="group" aria-labelledby="etiquette-acompte">
                    {(
                      [
                        ["aucun", "0"],
                        ["moitie", "50 %"],
                        ["tout", "Tout payer"],
                      ] as const
                    ).map(([choix, libelle]) => (
                      <button key={choix} type="button" className="arrivee-acompte__choix" aria-pressed={choixActif === choix} onClick={() => choisirAcompte(choix)}>
                        {libelle}
                      </button>
                    ))}
                    <input
                      id="acompte"
                      type="text"
                      inputMode="decimal"
                      aria-label={`Montant de l'acompte en ${devise}`}
                      value={acompteSaisi}
                      onChange={(e) => setAcompteSaisi(e.target.value)}
                      placeholder="0"
                      style={{ width: 110 }}
                    />
                  </div>
                </div>
                <div className="champ">
                  <label className="hc-text-label" htmlFor="note">
                    Demandes spéciales (facultatif)
                  </label>
                  <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Lit bébé, étage élevé, régime alimentaire…" rows={2} />
                </div>
              </div>
            </section>
          </div>

          <div className="reservation-colonnes__lateral">
            <aside className="carte-formulaire arrivee-recap" aria-label="Récapitulatif">
              <h2 className="hc-text-subheading">Récapitulatif</h2>
              <div className="arrivee-recap__client">
                <span className="sejour-avatar" aria-hidden="true">
                  {nomRecap ? nomRecap.split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]).join("").toUpperCase() : "?"}
                </span>
                <div>
                  <strong>{nomRecap || "Client à renseigner"}</strong>
                  {telRecap && <span className="sejour-ligne__sous">{telRecap}</span>}
                </div>
              </div>
              <div className="arrivee-recap__ligne">
                <span>Chambre</span>
                <span>{chambreChoisie ? `${chambreChoisie.numero} · ${chambreChoisie.type}` : "—"}</span>
              </div>
              <div className="arrivee-recap__ligne">
                <span>Séjour</span>
                <span>
                  {FORMAT_COURT.format(dateArr)} → {FORMAT_COURT.format(dateDep)} · {nuits} nuit{nuits > 1 ? "s" : ""}
                </span>
              </div>
              {chambreChoisie && (
                <div className="arrivee-recap__ligne">
                  <span>
                    {nuits} nuit{nuits > 1 ? "s" : ""} × {formatMontant(chambreChoisie.prixParNuit, devise)}
                  </span>
                  <span>{formatMontant(total, devise)}</span>
                </div>
              )}
              <div className="arrivee-recap__ligne arrivee-recap__total">
                <span>Total du séjour</span>
                <span>{formatMontant(total, devise)}</span>
              </div>
              <div className="arrivee-recap__ligne">
                <span>Acompte versé</span>
                <span>{formatMontant(acompteValeur, devise)}</span>
              </div>
              <div className="arrivee-recap__reste">
                <span>Reste à payer {maintenant ? "au départ" : "à l'arrivée"}</span>
                <span>{formatMontant(Math.max(0, total - acompteValeur), devise)}</span>
              </div>
              <button type="button" className={`arrivee-recap__bouton${maintenant ? " arrivee-recap__bouton--final" : ""}`} onClick={creer} disabled={enCours}>
                <CircleCheck size={20} aria-hidden="true" />
                {enCours ? "…" : maintenant ? "Enregistrer l'arrivée" : "Créer la réservation"}
              </button>
              {maintenant && chambreChoisie && <p className="arrivee-recap__note">Le client est installé tout de suite : la chambre {chambreChoisie.numero} passe en « Occupée ».</p>}
            </aside>
          </div>
        </div>
      )}
    </div>
  );
}
