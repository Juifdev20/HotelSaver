import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import { DepartementRapport, Depense, Devise, ProfilConnecte, Role } from "@hotel-chicago/types";
import { Button, formatMontant } from "@hotel-chicago/ui";
import { FileDown, Plus, Wallet } from "lucide-react";

export interface EcranDepensesProps {
  client: ClientApi;
  utilisateur: ProfilConnecte;
}

const LIBELLE_DEPARTEMENT: Record<DepartementRapport, string> = { RECEPTION: "Réception", CAFETERIA: "Cafétaria" };

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function debutDuMois(): string {
  const d = new Date();
  return iso(new Date(d.getFullYear(), d.getMonth(), 1));
}

function jjmmaaaa(jour: string): string {
  return `${jour.slice(8, 10)}/${jour.slice(5, 7)}/${jour.slice(0, 4)}`;
}

function texteTotaux(depenses: Depense[]): string {
  const t = { usd: 0, cdf: 0 };
  for (const d of depenses) if (!d.annulee) t[d.devise === Devise.USD ? "usd" : "cdf"] += Number(d.montant);
  const morceaux: string[] = [];
  if (t.usd) morceaux.push(formatMontant(t.usd, Devise.USD));
  if (t.cdf) morceaux.push(formatMontant(t.cdf, Devise.CDF));
  return morceaux.length ? morceaux.join(" · ") : "—";
}

/**
 * Dépenses du département (demande du 07/10/2026) : la réception et la
 * cafétaria saisissent date, motif, montant et devise ; le patron consulte
 * les deux départements sans pouvoir saisir. Le PDF de la période s'ouvre
 * hors de la fenêtre (URL signée, comme les rapports mensuels). Aucune
 * suppression : une erreur se corrige ou s'annule (ligne barrée).
 */
export function EcranDepenses({ client, utilisateur }: EcranDepensesProps) {
  const departementPersonnel: DepartementRapport | null =
    utilisateur.role === Role.RECEPTIONNISTE ? "RECEPTION" : utilisateur.role === Role.CAFETARIA ? "CAFETERIA" : null;
  const peutSaisir = departementPersonnel !== null;

  const [du, setDu] = useState(debutDuMois);
  const [au, setAu] = useState(() => iso(new Date()));
  const [departementFiltre, setDepartementFiltre] = useState<DepartementRapport | "">("");
  const [depenses, setDepenses] = useState<Depense[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [telechargement, setTelechargement] = useState(false);

  // Formulaire (création si `edition` vaut null, correction sinon).
  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const [edition, setEdition] = useState<Depense | null>(null);
  const [date, setDate] = useState(() => iso(new Date()));
  const [motif, setMotif] = useState("");
  const [montant, setMontant] = useState("");
  const [devise, setDevise] = useState<Devise>(Devise.USD);
  const [erreurForm, setErreurForm] = useState<string | null>(null);
  const [enEnvoi, setEnEnvoi] = useState(false);

  const periodeValide = Boolean(du && au && du <= au);
  const filtres = useMemo(
    () => ({ du, au, departement: departementFiltre || undefined }),
    [du, au, departementFiltre]
  );

  const charger = useCallback(() => {
    if (!periodeValide) return;
    setErreur(null);
    client
      .listerDepenses(filtres)
      .then(setDepenses)
      .catch((e: Error) => setErreur(e.message));
  }, [client, filtres, periodeValide]);

  useEffect(charger, [charger]);

  function ouvrirCreation() {
    setEdition(null);
    setDate(iso(new Date()));
    setMotif("");
    setMontant("");
    setDevise(Devise.USD);
    setErreurForm(null);
    setFormulaireOuvert(true);
  }

  function ouvrirCorrection(depense: Depense) {
    setEdition(depense);
    setDate(depense.date);
    setMotif(depense.motif);
    setMontant(String(Number(depense.montant)));
    setDevise(depense.devise);
    setErreurForm(null);
    setFormulaireOuvert(true);
  }

  async function enregistrer() {
    const motifTrim = motif.trim();
    const valeur = Number(montant.replace(",", "."));
    if (!date) return setErreurForm("Choisissez la date de la dépense.");
    if (date > iso(new Date())) return setErreurForm("Une dépense ne peut pas être datée dans le futur.");
    if (motifTrim.length < 3) return setErreurForm("Le motif doit faire au moins 3 caractères.");
    if (!Number.isFinite(valeur) || valeur <= 0) return setErreurForm("Le montant doit être supérieur à zéro.");
    const montantArrondi = Math.round(valeur * 100) / 100;

    setEnEnvoi(true);
    setErreurForm(null);
    try {
      if (edition) {
        await client.modifierDepense(edition.id, { date, motif: motifTrim, montant: montantArrondi, devise });
      } else {
        await client.creerDepense({ date, motif: motifTrim, montant: montantArrondi, devise });
      }
      setFormulaireOuvert(false);
      charger();
    } catch (e) {
      setErreurForm(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnEnvoi(false);
    }
  }

  async function annuler(depense: Depense) {
    const ok = window.confirm(
      `Annuler la dépense « ${depense.motif} » (${formatMontant(depense.montant, depense.devise)}) ?\n\nElle restera visible, barrée, et ne comptera plus dans les totaux. C'est définitif.`
    );
    if (!ok) return;
    setEnEnvoi(true);
    try {
      await client.modifierDepense(depense.id, { annulee: true });
      setFormulaireOuvert(false);
      charger();
    } catch (e) {
      setErreurForm(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnEnvoi(false);
    }
  }

  async function telechargerPdf() {
    setTelechargement(true);
    setErreur(null);
    try {
      const { url } = await client.urlPdfDepenses(filtres);
      // setWindowOpenHandler → shell.openExternal : le PDF s'ouvre dans le
      // lecteur/navigateur du poste, hors de la fenêtre Electron.
      window.open(url, "_blank");
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Impossible d'ouvrir le PDF.");
    } finally {
      setTelechargement(false);
    }
  }

  const actives = (depenses ?? []).filter((d) => !d.annulee);

  return (
    <div className="page">
      <header className="page__entete">
        <div>
          <h1 className="hc-text-display-md page__titre">Dépenses</h1>
          <p className="hc-text-body page__sous-titre">
            {departementPersonnel
              ? `Dépenses de la ${LIBELLE_DEPARTEMENT[departementPersonnel].toLowerCase()} : date, motif et montant.`
              : "Dépenses saisies par la réception et la cafétaria."}
          </p>
        </div>
        <div style={{ display: "flex", gap: "var(--hc-space-2)" }}>
          <Button type="button" variant="secondary" onClick={telechargerPdf} disabled={telechargement || !periodeValide}>
            <FileDown size={16} aria-hidden="true" /> {telechargement ? "Préparation…" : "Télécharger le PDF"}
          </Button>
          {peutSaisir && (
            <Button type="button" onClick={ouvrirCreation}>
              <Plus size={16} aria-hidden="true" /> Nouvelle dépense
            </Button>
          )}
        </div>
      </header>

      <div className="formulaire" style={{ display: "flex", gap: "var(--hc-space-3)", alignItems: "flex-end", flexWrap: "wrap" }}>
        <label className="hc-text-label">
          Du{" "}
          <input type="date" value={du} max={au || undefined} onChange={(e) => setDu(e.target.value)} />
        </label>
        <label className="hc-text-label">
          Au{" "}
          <input type="date" value={au} min={du || undefined} onChange={(e) => setAu(e.target.value)} />
        </label>
        {!departementPersonnel && (
          <div className="puces" role="group" aria-label="Département">
            {(
              [
                ["", "Tous"],
                ["RECEPTION", "Réception"],
                ["CAFETERIA", "Cafétaria"],
              ] as const
            ).map(([valeur, libelle]) => (
              <button key={libelle} type="button" className="puce" aria-pressed={departementFiltre === valeur} onClick={() => setDepartementFiltre(valeur)}>
                {libelle}
              </button>
            ))}
          </div>
        )}
        <p className="hc-text-body-strong" style={{ marginLeft: "auto" }}>
          Total ({actives.length}) : {texteTotaux(depenses ?? [])}
        </p>
      </div>
      {!periodeValide && <p className="hc-text-body texte-erreur">La date de fin doit suivre la date de début.</p>}

      {formulaireOuvert && (
        <div className="carte-formulaire formulaire">
          <p className="hc-text-label texte-discret">{edition ? "Corriger la dépense" : "Nouvelle dépense"}</p>

          <label className="hc-text-label" htmlFor="champ-date-depense">Date</label>
          <input id="champ-date-depense" type="date" value={date} max={iso(new Date())} onChange={(e) => setDate(e.target.value)} />

          <label className="hc-text-label" htmlFor="champ-motif-depense">Motif</label>
          <input
            id="champ-motif-depense"
            value={motif}
            maxLength={200}
            onChange={(e) => setMotif(e.target.value)}
            placeholder="Ex. carburant du groupe électrogène"
          />

          <label className="hc-text-label" htmlFor="champ-montant-depense">Montant</label>
          <div style={{ display: "flex", gap: "var(--hc-space-2)", alignItems: "center" }}>
            <input
              id="champ-montant-depense"
              type="number"
              step="0.01"
              min="0.01"
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              placeholder="0"
              style={{ flex: 1 }}
            />
            <div className="puces" role="group" aria-label="Devise">
              {[Devise.USD, Devise.CDF].map((d) => (
                <button key={d} type="button" className="puce" aria-pressed={devise === d} onClick={() => setDevise(d)}>
                  {d === Devise.USD ? "USD $" : "CDF FC"}
                </button>
              ))}
            </div>
          </div>

          {erreurForm && <p role="alert" className="hc-text-body texte-erreur">{erreurForm}</p>}

          <div style={{ display: "flex", gap: "var(--hc-space-2)", marginTop: "var(--hc-space-2)" }}>
            <Button type="button" onClick={enregistrer} disabled={enEnvoi}>
              {enEnvoi ? "Enregistrement…" : "Enregistrer"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setFormulaireOuvert(false)} disabled={enEnvoi}>
              Fermer
            </Button>
            {edition && (
              <Button type="button" variant="secondary" onClick={() => annuler(edition)} disabled={enEnvoi} style={{ marginLeft: "auto", color: "var(--hc-danger)" }}>
                Annuler cette dépense
              </Button>
            )}
          </div>
        </div>
      )}

      {erreur && (
        <p role="alert" className="hc-text-body texte-erreur">
          {erreur}
        </p>
      )}

      {depenses === null && !erreur && <p className="hc-text-body texte-discret">Chargement…</p>}

      {depenses && depenses.length === 0 && (
        <div className="etat-vide">
          <Wallet size={32} strokeWidth={1.5} aria-hidden="true" />
          <p className="hc-text-subheading">Aucune dépense sur la période.</p>
        </div>
      )}

      {depenses && depenses.length > 0 && (
        <div className="carte-tableau">
          <table className="tableau">
            <thead>
              <tr>
                <th>Date</th>
                {!departementPersonnel && <th>Département</th>}
                <th>Motif</th>
                <th style={{ textAlign: "right" }}>Montant</th>
                <th>Saisi par</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {depenses.map((d) => {
                const barre = d.annulee ? { textDecoration: "line-through" } : undefined;
                return (
                  <tr key={d.id} className={d.annulee ? "texte-discret" : ""}>
                    <td style={barre}>{jjmmaaaa(d.date)}</td>
                    {!departementPersonnel && <td>{LIBELLE_DEPARTEMENT[d.departement]}</td>}
                    <td style={barre}>{d.motif}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", ...barre }}>{formatMontant(d.montant, d.devise)}</td>
                    <td>
                      {d.creeParNom}
                      {d.annulee && <span className="puce" style={{ marginLeft: 8 }}>Annulée</span>}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {peutSaisir && !d.annulee && (
                        <button type="button" className="puce" onClick={() => ouvrirCorrection(d)}>
                          Corriger
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
