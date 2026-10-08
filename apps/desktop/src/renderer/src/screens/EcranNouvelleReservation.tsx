import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import type { Chambre, Reservation } from "@hotel-chicago/types";
import type { Client as ClientHotel } from "@hotel-chicago/types";
import { Button, formatMontant } from "@hotel-chicago/ui";

export interface EcranNouvelleReservationProps {
  client: ClientApi;
  onRetour: () => void;
  onCreee: (reservationId: string) => void;
  /** Pré-remplissage depuis le planning (cellule chambre × jour). */
  chambreInitialeId?: string;
  dateArriveeInitiale?: string; // AAAA-MM-JJ
}

const STATUTS_OCCUPANTS = new Set(["CONFIRMEE", "EN_COURS"]); // reservations.service.ts

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
export function EcranNouvelleReservation({ client, onRetour, onCreee, chambreInitialeId, dateArriveeInitiale }: EcranNouvelleReservationProps) {
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
  const [checkInImmediat, setCheckInImmediat] = useState(false);

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

  const chambresOccupees = useMemo(() => {
    const a = new Date(arrivee + "T12:00:00").toISOString();
    const d = new Date(depart + "T12:00:00").toISOString();
    const occupees = new Set<string>();
    for (const r of reservations) {
      if (!STATUTS_OCCUPANTS.has(r.statut)) continue;
      if (r.dateArrivee < d && r.dateDepart > a) occupees.add(r.chambreId);
    }
    return occupees;
  }, [reservations, arrivee, depart]);

  const clientsFiltres = useMemo(() => {
    const terme = rechercheClient.trim().toLowerCase();
    return clients.filter(
      (c) => !terme || c.nom.toLowerCase().includes(terme) || (c.telephone ?? "").includes(rechercheClient.trim())
    );
  }, [clients, rechercheClient]);

  const chambreChoisie = chambres.find((c) => c.id === chambreId) ?? null;
  const acompte = acompteSaisi.trim() ? Number(acompteSaisi.replace(",", ".")) : 0;
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
    if (acompteSaisi.trim() && (Number.isNaN(acompte) || acompte < 0)) {
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

  return (
    <div className="page">
      <header className="page__entete">
        <div>
          <h1 className="hc-text-display-md page__titre">Nouvelle réservation</h1>
        </div>
        <Button type="button" variant="secondary" onClick={onRetour}>
          Retour
        </Button>
      </header>

      {erreur && (
        <p role="alert" className="hc-text-body texte-erreur">
          {erreur}
        </p>
      )}
      {chargement && <p className="hc-text-body texte-discret">Chargement…</p>}

      {!chargement && (
        <>
          <div className="carte-formulaire formulaire">
            <p className="hc-text-label texte-discret">Séjour</p>
            <label className="hc-text-label" htmlFor="arrivee">
              Arrivée
            </label>
            <input id="arrivee" type="date" value={arrivee} onChange={(e) => setArrivee(e.target.value)} />
            <label className="hc-text-label" htmlFor="nuits">
              Nuits
            </label>
            <input
              id="nuits"
              type="number"
              min={1}
              max={60}
              value={nuits}
              onChange={(e) => setNuits(Math.max(1, Number(e.target.value) || 1))}
            />
            <p className="hc-text-caption texte-discret">Départ le {depart.split("-").reverse().join("/")}</p>
          </div>

          <div className="carte-formulaire formulaire">
            <p className="hc-text-label texte-discret">Chambre</p>
            <select id="chambre" value={chambreId} onChange={(e) => setChambreId(e.target.value)} aria-label="Chambre">
              <option value="">— Choisir —</option>
              {chambres.map((c) => (
                <option key={c.id} value={c.id} disabled={chambresOccupees.has(c.id)}>
                  {c.numero} · {c.type} · {formatMontant(c.prixParNuit, c.devise)}
                  {chambresOccupees.has(c.id) ? " · occupée sur la période" : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="carte-formulaire formulaire">
            <p className="hc-text-label texte-discret">Client</p>
            <div className="puces" role="group" aria-label="Type de client">
              {(["nouveau", "existant"] as const).map((m) => (
                <button key={m} type="button" className="puce" aria-pressed={modeClient === m} onClick={() => setModeClient(m)}>
                  {m === "nouveau" ? "Nouveau client" : "Client existant"}
                </button>
              ))}
            </div>

            {modeClient === "nouveau" ? (
              <>
                <label className="hc-text-label" htmlFor="nom">
                  Nom (obligatoire)
                </label>
                <input id="nom" type="text" value={nom} onChange={(e) => setNom(e.target.value)} />
                <label className="hc-text-label" htmlFor="tel">
                  Téléphone
                </label>
                <input id="tel" type="tel" value={telephone} onChange={(e) => setTelephone(e.target.value)} />
                <label className="hc-text-label" htmlFor="email">
                  Email
                </label>
                <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                <label className="hc-text-label" htmlFor="type-piece">
                  Type de pièce (optionnel)
                </label>
                <input id="type-piece" type="text" value={typePiece} onChange={(e) => setTypePiece(e.target.value)} placeholder="CNI, passeport, permis…" />
                <label className="hc-text-label" htmlFor="numero-piece">
                  N° de pièce (optionnel)
                </label>
                <input id="numero-piece" type="text" value={numeroPiece} onChange={(e) => setNumeroPiece(e.target.value)} placeholder="Numéro de la pièce d'identité" />
              </>
            ) : (
              <>
                <label className="hc-text-label" htmlFor="recherche-client">
                  Rechercher
                </label>
                <input
                  id="recherche-client"
                  type="search"
                  value={rechercheClient}
                  onChange={(e) => setRechercheClient(e.target.value)}
                  placeholder="Nom ou téléphone"
                />
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
          </div>

          <div className="carte-formulaire formulaire">
            <p className="hc-text-label texte-discret">Demandes spéciales (optionnel)</p>
            <textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Lit bébé, étage élevé, régime alimentaire…"
              rows={3}
            />
          </div>

          <div className="carte-formulaire formulaire">
            <p className="hc-text-label texte-discret">Paiement initial</p>
            <label className="hc-text-label" htmlFor="acompte">
              Acompte versé{chambreChoisie ? ` (${chambreChoisie.devise})` : ""}
            </label>
            <input
              id="acompte"
              type="text"
              inputMode="decimal"
              value={acompteSaisi}
              onChange={(e) => setAcompteSaisi(e.target.value)}
              placeholder="0"
            />
            {chambreChoisie && (
              <>
                <div className="parametres-ligne">
                  <span className="hc-text-body">Total séjour</span>
                  <span className="hc-text-price">{formatMontant(total, chambreChoisie.devise)}</span>
                </div>
                <div className="parametres-ligne">
                  <span className="hc-text-body">Reste à payer à l'arrivée</span>
                  <span className="hc-text-price">{formatMontant(Math.max(0, total - acompte), chambreChoisie.devise)}</span>
                </div>
              </>
            )}
            <label style={{ display: "flex", gap: "var(--hc-space-2)", alignItems: "center", marginTop: "var(--hc-space-2)" }}>
              <input
                type="checkbox"
                checked={checkInImmediat}
                onChange={(e) => setCheckInImmediat(e.target.checked)}
              />
              <span className="hc-text-body">Le client est déjà là — enregistrer l'arrivée (check-in immédiat)</span>
            </label>
          </div>

          <div>
            <Button type="button" onClick={creer} disabled={enCours}>
              {enCours ? "…" : checkInImmediat ? "Créer et enregistrer l'arrivée" : "Créer la réservation"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
