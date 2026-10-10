import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ClientApi, ClientAvecSejours } from "@hotel-chicago/api-client";
import { Devise } from "@hotel-chicago/types";
import { Button, StatusBadge, formatMontant } from "@hotel-chicago/ui";
import { Pencil, Search, Users } from "lucide-react";
import { LABEL_STATUT, TONE_STATUT, dateCourte } from "./EcranReservations";

export interface EcranClientsProps {
  client: ClientApi;
}

/**
 * Répertoire des clients de l'hôtel (GET /clients, Phase 16) : recherche
 * par nom/téléphone ; la fiche affiche les séjours embarqués par l'API
 * (`reservations` inclus dans la réponse, voir clients.service.ts) et
 * s'édite (pièce d'identité, notes — PATCH /clients/:id).
 */
export function EcranClients({ client }: EcranClientsProps) {
  const [clients, setClients] = useState<ClientAvecSejours[] | null>(null);
  const [recherche, setRecherche] = useState("");
  const [clientChoisi, setClientChoisi] = useState<ClientAvecSejours | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [edition, setEdition] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [saisie, setSaisie] = useState({ nom: "", telephone: "", email: "", typePiece: "", numeroPiece: "", notes: "" });

  const charger = useCallback(() => {
    client
      .listerClients()
      .then(setClients)
      .catch((e: Error) => setErreur(e.message));
  }, [client]);

  useEffect(charger, [charger]);

  const liste = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    return (clients ?? []).filter(
      (c) => !terme || c.nom.toLowerCase().includes(terme) || (c.telephone ?? "").includes(recherche.trim())
    );
  }, [clients, recherche]);

  const sejoursDuClient = useMemo(
    () => [...(clientChoisi?.reservations ?? [])].sort((a, b) => new Date(b.dateArrivee).getTime() - new Date(a.dateArrivee).getTime()),
    [clientChoisi]
  );

  /** Total encaissé sur les séjours facturés (factures non annulées). */
  const totalDepense = useMemo(() => {
    let usd = 0;
    let cdf = 0;
    for (const r of clientChoisi?.reservations ?? []) {
      if (r.facture && !r.facture.annuleLe) {
        usd += Number(r.facture.montantTotalUSD);
        cdf += Number(r.facture.montantTotalCDF);
      }
    }
    return { usd, cdf };
  }, [clientChoisi]);

  function ouvrirEdition() {
    if (!clientChoisi) return;
    setSaisie({
      nom: clientChoisi.nom,
      telephone: clientChoisi.telephone ?? "",
      email: clientChoisi.email ?? "",
      typePiece: clientChoisi.typePiece ?? "",
      numeroPiece: clientChoisi.numeroPiece ?? "",
      notes: clientChoisi.notes ?? "",
    });
    setErreur(null);
    setEdition(true);
  }

  async function enregistrerFiche() {
    if (!clientChoisi || !saisie.nom.trim()) return;
    setEnCours(true);
    setErreur(null);
    try {
      const modifie = await client.modifierClient(clientChoisi.id, {
        nom: saisie.nom.trim(),
        telephone: saisie.telephone.trim(),
        email: saisie.email.trim(),
        typePiece: saisie.typePiece.trim(),
        numeroPiece: saisie.numeroPiece.trim(),
        notes: saisie.notes.trim(),
      });
      setClientChoisi(modifie);
      setEdition(false);
      charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Impossible d'enregistrer la fiche.");
    } finally {
      setEnCours(false);
    }
  }

  if (clientChoisi) {
    return (
      <div className="page">
        <header className="page__entete">
          <div>
            <h1 className="hc-text-display-md page__titre">{clientChoisi.nom}</h1>
            <p className="hc-text-body page__sous-titre">Fiche client</p>
          </div>
        </header>

        <div className="carte-formulaire">
          <p className="hc-text-label texte-discret">Coordonnées</p>
          {clientChoisi.telephone && <p className="hc-text-body">{clientChoisi.telephone}</p>}
          {clientChoisi.email && <p className="hc-text-body">{clientChoisi.email}</p>}
          {!clientChoisi.telephone && !clientChoisi.email && (
            <p className="hc-text-body texte-discret">Aucune coordonnée enregistrée.</p>
          )}
        </div>

        <div className="carte-formulaire">
          <div className="parametres-ligne">
            <p className="hc-text-label texte-discret">Pièce d'identité et notes</p>
            <Button type="button" variant="secondary" onClick={ouvrirEdition}>
              <Pencil size={14} aria-hidden="true" /> Compléter la fiche
            </Button>
          </div>
          {clientChoisi.typePiece || clientChoisi.numeroPiece ? (
            <p className="hc-text-body">
              {[clientChoisi.typePiece, clientChoisi.numeroPiece].filter(Boolean).join(" · ")}
            </p>
          ) : (
            <p className="hc-text-body texte-discret">Aucune pièce enregistrée (registre de police).</p>
          )}
          {clientChoisi.notes && <p className="hc-text-body texte-discret" style={{ fontStyle: "italic" }}>{clientChoisi.notes}</p>}
          {(totalDepense.usd > 0 || totalDepense.cdf > 0) && (
            <p className="hc-text-body">
              Total dépensé : <strong>{formatMontant(totalDepense.usd, Devise.USD)}</strong>
              {totalDepense.cdf > 0 ? ` + ${formatMontant(totalDepense.cdf, Devise.CDF)}` : ""}
            </p>
          )}
        </div>

        {edition && (
          <div className="carte-formulaire formulaire">
            <p className="hc-text-label texte-discret">Compléter la fiche</p>
            {erreur && <p role="alert" className="hc-text-body texte-erreur">{erreur}</p>}
            <label className="hc-text-label" htmlFor="cl-nom">Nom</label>
            <input id="cl-nom" type="text" value={saisie.nom} onChange={(e) => setSaisie({ ...saisie, nom: e.target.value })} />
            <label className="hc-text-label" htmlFor="cl-tel">Téléphone</label>
            <input id="cl-tel" type="tel" value={saisie.telephone} onChange={(e) => setSaisie({ ...saisie, telephone: e.target.value })} />
            <label className="hc-text-label" htmlFor="cl-email">Email</label>
            <input id="cl-email" type="email" value={saisie.email} onChange={(e) => setSaisie({ ...saisie, email: e.target.value })} />
            <label className="hc-text-label" htmlFor="cl-type-piece">Type de pièce</label>
            <input id="cl-type-piece" type="text" value={saisie.typePiece} onChange={(e) => setSaisie({ ...saisie, typePiece: e.target.value })} placeholder="CNI, passeport, permis…" />
            <label className="hc-text-label" htmlFor="cl-num-piece">N° de pièce</label>
            <input id="cl-num-piece" type="text" value={saisie.numeroPiece} onChange={(e) => setSaisie({ ...saisie, numeroPiece: e.target.value })} placeholder="Numéro de la pièce" />
            <label className="hc-text-label" htmlFor="cl-notes">Notes (suivi interne)</label>
            <textarea id="cl-notes" value={saisie.notes} onChange={(e) => setSaisie({ ...saisie, notes: e.target.value })} placeholder="VIP, habitudes, restrictions…" rows={3} />
            <div style={{ display: "flex", gap: "var(--hc-space-2)" }}>
              <Button type="button" onClick={enregistrerFiche} disabled={enCours}>{enCours ? "…" : "Enregistrer"}</Button>
              <Button type="button" variant="secondary" onClick={() => setEdition(false)}>Annuler</Button>
            </div>
          </div>
        )}

        <p className="hc-text-label texte-discret">Séjours ({sejoursDuClient.length})</p>
        {sejoursDuClient.length === 0 && <p className="hc-text-body texte-discret">Aucun séjour enregistré.</p>}
        {sejoursDuClient.length > 0 && (
          <div className="carte-tableau">
            <table className="tableau">
              <thead>
                <tr>
                  <th>Chambre</th>
                  <th>Arrivée</th>
                  <th>Départ</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {sejoursDuClient.map((r) => (
                  <tr key={r.id}>
                    <td className="hc-text-body-strong">{r.chambre.numero}</td>
                    <td className="texte-discret">{dateCourte(r.dateArrivee)}</td>
                    <td className="texte-discret">{dateCourte(r.dateDepart)}</td>
                    <td>
                      <StatusBadge tone={TONE_STATUT[r.statut]} label={LABEL_STATUT[r.statut]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div>
          <button type="button" className="puce" onClick={() => setClientChoisi(null)}>
            ‹ Retour à la liste
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page__entete">
        <div>
          <h1 className="hc-text-display-md page__titre">Clients</h1>
          <p className="hc-text-body page__sous-titre">
            {clients ? `${liste.length} client${liste.length > 1 ? "s" : ""}` : "Chargement…"}
          </p>
        </div>
      </header>

      {erreur && (
        <p role="alert" className="hc-text-body texte-erreur">
          {erreur}
        </p>
      )}

      <div className="barre-filtres">
        <label className="champ-recherche">
          <Search size={18} aria-hidden="true" />
          <span className="visuellement-cache">Rechercher</span>
          <input
            type="search"
            placeholder="Rechercher par nom ou téléphone…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />
        </label>
      </div>

      {clients === null && !erreur && <p className="hc-text-body texte-discret">Chargement…</p>}

      {clients?.length === 0 && (
        <div className="etat-vide">
          <Users size={32} strokeWidth={1.5} aria-hidden="true" />
          <p className="hc-text-subheading">Aucun client enregistré</p>
          <p className="hc-text-body texte-discret">Les clients sont créés à la première réservation.</p>
        </div>
      )}

      {liste.length > 0 && (
        <div className="carte-tableau" data-testid="tableau-clients">
          <table className="tableau">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Téléphone</th>
                <th>Email</th>
              </tr>
            </thead>
            <tbody>
              {liste.map((c) => (
                <tr key={c.id} className="ligne-cliquable" onClick={() => setClientChoisi(c)}>
                  <td className="hc-text-body-strong">
                    <button
                      type="button"
                      className="lien-ligne"
                      aria-label={`Ouvrir la fiche de ${c.nom}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setClientChoisi(c);
                      }}
                    >
                      {c.nom}
                    </button>
                  </td>
                  <td className="texte-discret">{c.telephone ?? "—"}</td>
                  <td className="texte-discret">{c.email ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
