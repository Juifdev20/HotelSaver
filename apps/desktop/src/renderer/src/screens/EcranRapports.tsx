import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import { DepartementRapport, peutOperer, ProfilConnecte, RapportMensuel, Role } from "@hotel-chicago/types";
import { Button } from "@hotel-chicago/ui";
import { CircleCheck, Coffee, BedDouble, FileWarning, FileText, RefreshCw } from "lucide-react";

export interface EcranRapportsProps {
  client: ClientApi;
  utilisateur: ProfilConnecte;
}

/** Les 12 derniers mois « AAAA-MM » (fuseau Africa/Lubumbashi, UTC+2). */
function moisDisponibles(): { valeur: string; libelle: string }[] {
  const noms = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  const maintenant = new Date(Date.now() + 2 * 3600_000); // instant à Lubumbashi
  const liste: { valeur: string; libelle: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth() - i, 1));
    const valeur = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    liste.push({ valeur, libelle: `${noms[d.getUTCMonth()]} ${d.getUTCFullYear()}` });
  }
  return liste;
}

/** Le rapport d'un mois se remet le 1er du mois suivant : mois écoulé par défaut. */
function moisParDefaut(): string {
  return moisDisponibles()[1]?.valeur ?? moisDisponibles()[0].valeur;
}

/** Départements visibles par rôle : le patron voit tout, le personnel le sien. */
function departementsDu(role: Role): DepartementRapport[] {
  if (role === Role.RECEPTIONNISTE) return ["RECEPTION"];
  if (role === Role.CAFETARIA) return ["CAFETERIA"];
  return ["CAFETERIA", "RECEPTION"];
}

/** Qui peut GÉNÉRER : le personnel de son département ; le patron seulement
 * si l'hôtel a activé « le patron peut aussi opérer » (même règle que l'API). */
function peutGenerer(utilisateur: ProfilConnecte, departement: DepartementRapport): boolean {
  if (utilisateur.role === Role.RECEPTIONNISTE) return departement === "RECEPTION";
  if (utilisateur.role === Role.CAFETARIA) return departement === "CAFETERIA";
  return peutOperer(utilisateur);
}

const LIBELLES: Record<DepartementRapport, string> = { CAFETERIA: "Cafétaria", RECEPTION: "Réception" };
const ICONES: Record<DepartementRapport, React.ReactNode> = {
  CAFETERIA: <Coffee size={20} strokeWidth={1.8} aria-hidden="true" />,
  RECEPTION: <BedDouble size={20} strokeWidth={1.8} aria-hidden="true" />,
};

function dateHeure(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * Rapports mensuels PDF par département (demande du patron 01/10) : chaque
 * mois, la cafétaria et la réception génèrent leur rapport officiel ; le
 * patron les consulte tous. Régénérer crée une nouvelle version — les
 * anciennes restent listées, jamais écrasées.
 */
export function EcranRapports({ client, utilisateur }: EcranRapportsProps) {
  const mois = useMemo(moisDisponibles, []);
  const [moisChoisi, setMoisChoisi] = useState(moisParDefaut);
  const [rapports, setRapports] = useState<RapportMensuel[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null); // departement en cours de génération/ouverture

  const charger = useCallback(() => {
    client
      .listerRapports(moisChoisi)
      .then(setRapports)
      .catch((e: Error) => setErreur(e.message));
  }, [client, moisChoisi]);

  useEffect(charger, [charger]);

  async function generer(departement: DepartementRapport) {
    setEnCours(departement);
    setErreur(null);
    try {
      await client.genererRapport(departement, moisChoisi);
      charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnCours(null);
    }
  }

  async function ouvrir(id: string) {
    setEnCours(`ouverture-${id}`);
    setErreur(null);
    try {
      const { url } = await client.urlRapport(id);
      // setWindowOpenHandler → shell.openExternal : le PDF s'ouvre dans le
      // lecteur/navigateur du poste, hors de la fenêtre Electron.
      window.open(url, "_blank");
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnCours(null);
    }
  }

  const departements = departementsDu(utilisateur.role);
  const libelleMoisChoisi = mois.find((m) => m.valeur === moisChoisi)?.libelle ?? moisChoisi;

  return (
    <div className="page">
      <header className="page__entete">
        <div>
          <h1 className="hc-text-display-md page__titre">Rapports mensuels</h1>
          <p className="hc-text-body page__sous-titre">
            Rapport PDF officiel de chaque département, à remettre au patron — comparé au tableau de bord du mois.
          </p>
        </div>
        <label className="hc-text-label">
          Mois{" "}
          <select value={moisChoisi} onChange={(e) => setMoisChoisi(e.target.value)} aria-label="Mois du rapport">
            {mois.map((m) => (
              <option key={m.valeur} value={m.valeur}>
                {m.libelle}
              </option>
            ))}
          </select>
        </label>
      </header>

      {erreur && (
        <p role="alert" className="hc-text-body texte-erreur">
          {erreur}
        </p>
      )}

      {rapports === null && !erreur && <p className="hc-text-body texte-discret">Chargement…</p>}

      {rapports && (
        <div className="page__bloc">
          {departements.map((departement) => {
            const duMois = rapports.filter((r) => r.departement === departement);
            const actif = duMois.find((r) => r.statut === "ACTIF");
            const remplaces = duMois.filter((r) => r.statut === "REMPLACE");
            return (
              <section key={departement} className="carte-simple" data-testid={`rapport-${departement}`}>
                <div className="carte-simple__entete">
                  {ICONES[departement]}
                  <h2 className="hc-text-subheading">Rapport {LIBELLES[departement]} — {libelleMoisChoisi}</h2>
                </div>

                {actif ? (
                  <>
                    <p className="hc-text-body">
                      N° {actif.numero} · généré par {actif.genereParNom} le {dateHeure(actif.genereLe)}
                    </p>
                    <p className="hc-text-caption texte-discret" style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      {actif.concordant ? (
                        <span style={{ color: "var(--hc-success)", display: "inline-flex", gap: 4 }}>
                          <CircleCheck size={14} aria-hidden="true" /> Concordant avec le tableau de bord
                        </span>
                      ) : (
                        <span style={{ color: "var(--hc-danger)", display: "inline-flex", gap: 4 }}>
                          <FileWarning size={14} aria-hidden="true" /> Écart avec le tableau de bord
                        </span>
                      )}
                      {actif.provisoire && <span className="puce">Provisoire</span>}
                    </p>
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <Button type="button" onClick={() => ouvrir(actif.id)} disabled={enCours !== null}>
                        <FileText size={16} aria-hidden="true" /> Ouvrir le PDF
                      </Button>
                      {peutGenerer(utilisateur, departement) && (
                        <Button type="button" variant="secondary" onClick={() => generer(departement)} disabled={enCours !== null}>
                          <RefreshCw size={16} aria-hidden="true" /> Régénérer
                        </Button>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="hc-text-body texte-discret">Aucun rapport pour ce mois.</p>
                    {peutGenerer(utilisateur, departement) && (
                      <Button type="button" onClick={() => generer(departement)} disabled={enCours !== null} style={{ marginTop: 8 }}>
                        {enCours === departement ? "Génération…" : "Générer le rapport"}
                      </Button>
                    )}
                  </>
                )}

                {remplaces.length > 0 && (
                  <details style={{ marginTop: 12 }}>
                    <summary className="hc-text-caption">Révisions précédentes ({remplaces.length})</summary>
                    <ul className="hc-text-caption texte-discret" style={{ marginTop: 6 }}>
                      {remplaces.map((r) => (
                        <li key={r.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          {r.numero} — {r.genereParNom}, {dateHeure(r.genereLe)}
                          <button type="button" className="puce" onClick={() => ouvrir(r.id)} disabled={enCours !== null}>
                            Ouvrir
                          </button>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
