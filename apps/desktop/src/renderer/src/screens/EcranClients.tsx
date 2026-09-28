import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ClientApi, ClientAvecSejours } from "@hotel-chicago/api-client";
import { StatusBadge } from "@hotel-chicago/ui";
import { Search, Users } from "lucide-react";
import { LABEL_STATUT, TONE_STATUT, dateCourte } from "./EcranReservations";

export interface EcranClientsProps {
  client: ClientApi;
}

/**
 * Répertoire des clients de l'hôtel (GET /clients, Phase 16) : recherche
 * par nom/téléphone ; la fiche affiche les séjours embarqués par l'API
 * (`reservations` inclus dans la réponse, voir clients.service.ts).
 */
export function EcranClients({ client }: EcranClientsProps) {
  const [clients, setClients] = useState<ClientAvecSejours[] | null>(null);
  const [recherche, setRecherche] = useState("");
  const [clientChoisi, setClientChoisi] = useState<ClientAvecSejours | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

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
                  <td className="hc-text-body-strong">{c.nom}</td>
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
