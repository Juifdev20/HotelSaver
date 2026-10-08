import { useEffect, useState } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import type { InventairePhysique, LignePreparationInventaire, UtilisateurAuthentifie } from "@hotel-chicago/types";
import { Button, formatMontant } from "@hotel-chicago/ui";
import { CheckCircle, ClipboardList, Clock, ExternalLink, RefreshCw } from "lucide-react";

export interface EcranInventaireProps {
  client: ClientApi;
  utilisateur: UtilisateurAuthentifie;
}

type Onglet = "wizard" | "historique";
type Etape  = 1 | 2 | 3;

interface SaisieItem {
  produitId:      string;
  stockPhysique:  string; // saisie libre, validée au submit
  note:           string;
}

function formatDateFR(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function nbEcarts(inv: InventairePhysique): number {
  return inv.items.filter((i) => Number(i.ecart) !== 0).length;
}

export function EcranInventaire({ client, utilisateur: _utilisateur }: EcranInventaireProps) {
  const [onglet, setOnglet]           = useState<Onglet>("wizard");
  const [etape,  setEtape]            = useState<Etape>(1);

  // Étape 1 — période
  const today  = new Date().toISOString().slice(0, 10);
  const debut1 = new Date(); debut1.setDate(1);
  const [dateDebut, setDateDebut] = useState(debut1.toISOString().slice(0, 10));
  const [dateFin,   setDateFin]   = useState(today);
  const [chargement1, setChargement1] = useState(false);
  const [erreur1, setErreur1]         = useState<string | null>(null);

  // Étape 2 — saisie physique
  const [lignes, setLignes]     = useState<LignePreparationInventaire[]>([]);
  const [saisies, setSaisies]   = useState<SaisieItem[]>([]);
  const [titreInv, setTitreInv] = useState("");
  const [enEnvoi,  setEnEnvoi]  = useState(false);
  const [erreur2,  setErreur2]  = useState<string | null>(null);

  // Étape 3 — résultat
  const [inventaire, setInventaire] = useState<InventairePhysique | null>(null);

  // Historique
  const [historique, setHistorique]       = useState<InventairePhysique[]>([]);
  const [chargHistorique, setChargHistorique] = useState(false);

  useEffect(() => {
    if (onglet === "historique") chargerHistorique();
  }, [onglet]);

  function chargerHistorique() {
    setChargHistorique(true);
    client.listerInventaires()
      .then(setHistorique)
      .catch((e: Error) => console.error(e))
      .finally(() => setChargHistorique(false));
  }

  async function lancerEvaluation() {
    if (!dateDebut || !dateFin || dateDebut > dateFin) {
      setErreur1("Choisissez une période valide (début ≤ fin).");
      return;
    }
    setErreur1(null);
    setChargement1(true);
    try {
      const data = await client.preparerInventaire(dateDebut, dateFin);
      setLignes(data);
      setSaisies(data.map((l) => ({ produitId: l.produitId, stockPhysique: "", note: "" })));
      setEtape(2);
    } catch (e) {
      setErreur1(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setChargement1(false);
    }
  }

  function setSaisie(produitId: string, champ: "stockPhysique" | "note", valeur: string) {
    setSaisies((prev) => prev.map((s) => s.produitId === produitId ? { ...s, [champ]: valeur } : s));
  }

  const nbSaisis = saisies.filter((s) => s.stockPhysique.trim() !== "").length;

  async function validerInventaire() {
    // Vérifier que tout est saisi
    const manquants = saisies.filter((s) => s.stockPhysique.trim() === "");
    if (manquants.length > 0) {
      setErreur2(`${manquants.length} produit(s) sans saisie physique. Saisissez 0 si le produit est absent.`);
      return;
    }
    // Vérifier notes sur les écarts
    const ecartsSansNote = saisies.filter((s) => {
      const ligne = lignes.find((l) => l.produitId === s.produitId);
      if (!ligne) return false;
      const physique = Number(s.stockPhysique);
      return physique !== ligne.stockTheorique && !s.note.trim();
    });
    if (ecartsSansNote.length > 0) {
      setErreur2(`${ecartsSansNote.length} écart(s) sans justification. Expliquez chaque écart dans le champ Note.`);
      return;
    }
    setErreur2(null);
    setEnEnvoi(true);
    try {
      const result = await client.creerInventaire({
        dateDebut,
        dateFin,
        titre: titreInv.trim() || undefined,
        items: saisies.map((s) => ({
          produitId:     s.produitId,
          stockPhysique: Number(s.stockPhysique),
          note:          s.note.trim() || undefined,
        })),
      });
      setInventaire(result);
      setEtape(3);
    } catch (e) {
      setErreur2(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnEnvoi(false);
    }
  }

  async function ouvrirPdf() {
    if (!inventaire) return;
    try {
      const { url } = await client.urlInventaire(inventaire.id);
      window.open(url, "_blank");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Impossible d'obtenir le lien PDF.");
    }
  }

  async function ouvrirPdfHistorique(inv: InventairePhysique) {
    try {
      const { url } = await client.urlInventaire(inv.id);
      window.open(url, "_blank");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Impossible d'obtenir le lien PDF.");
    }
  }

  function recommencer() {
    setEtape(1);
    setLignes([]);
    setSaisies([]);
    setInventaire(null);
    setErreur1(null);
    setErreur2(null);
    setTitreInv("");
  }

  return (
    <div className="page">
      <header className="page__entete">
        <div>
          <h1 className="hc-text-display-md page__titre">Inventaire physique</h1>
          <p className="hc-text-body page__sous-titre">Évaluez le stock réel et comparez au stock théorique.</p>
        </div>
      </header>

      {/* Onglets principaux */}
      <div className="puces" role="group" aria-label="Section">
        <button type="button" className="puce" aria-pressed={onglet === "wizard"} onClick={() => setOnglet("wizard")}>
          Nouvel inventaire
        </button>
        <button type="button" className="puce" aria-pressed={onglet === "historique"} onClick={() => setOnglet("historique")}>
          Historique
        </button>
      </div>

      {/* ── WIZARD ───────────────────────────────────────────────────── */}
      {onglet === "wizard" && (
        <>
          {/* Indicateur d'étape */}
          <div className="inv-etapes">
            {([1, 2, 3] as const).map((n) => (
              <div key={n} className={`inv-etape ${etape === n ? "inv-etape--actif" : etape > n ? "inv-etape--fait" : ""}`}>
                <span className="inv-etape__numero">{n}</span>
                <span className="inv-etape__libelle">
                  {n === 1 ? "Période" : n === 2 ? "Saisie physique" : "Résultat"}
                </span>
              </div>
            ))}
          </div>

          {/* ── Étape 1 ── */}
          {etape === 1 && (
            <div className="carte-formulaire formulaire">
              <p className="hc-text-subheading" style={{ marginBottom: "var(--hc-space-3)" }}>
                Choisissez la période à évaluer
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--hc-space-3)" }}>
                <div>
                  <label className="hc-text-label" htmlFor="inv-date-debut">Date de début</label>
                  <input id="inv-date-debut" type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} />
                </div>
                <div>
                  <label className="hc-text-label" htmlFor="inv-date-fin">Date de fin</label>
                  <input id="inv-date-fin" type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} />
                </div>
              </div>

              <label className="hc-text-label" htmlFor="inv-titre" style={{ marginTop: "var(--hc-space-3)" }}>
                Titre de l'inventaire (optionnel)
              </label>
              <input
                id="inv-titre"
                value={titreInv}
                onChange={(e) => setTitreInv(e.target.value)}
                placeholder="Ex. Inventaire de fin de mois — octobre 2026"
              />

              {erreur1 && <p role="alert" className="hc-text-body texte-erreur">{erreur1}</p>}

              <div style={{ marginTop: "var(--hc-space-3)" }}>
                <Button type="button" onClick={lancerEvaluation} disabled={chargement1}>
                  {chargement1 ? "Chargement…" : "Lancer l'évaluation →"}
                </Button>
              </div>
            </div>
          )}

          {/* ── Étape 2 ── */}
          {etape === 2 && (
            <>
              <div className="inv-barre-etat">
                <span className="hc-text-caption texte-discret">
                  Période : {formatDateFR(dateDebut)} – {formatDateFR(dateFin)}
                </span>
                <span className="hc-text-caption texte-discret">
                  {nbSaisis}/{lignes.length} produits saisis
                </span>
              </div>

              <div className="carte-tableau" style={{ overflowX: "auto", maxHeight: "55vh", overflowY: "auto" }}>
                <table className="tableau">
                  <thead style={{ position: "sticky", top: 0, background: "var(--hc-surface)" }}>
                    <tr>
                      <th>Produit</th>
                      <th>Catégorie</th>
                      <th style={{ textAlign: "right" }}>Prix</th>
                      <th style={{ textAlign: "right" }}>Stock théorique</th>
                      <th style={{ textAlign: "right" }}>Stock physique</th>
                      <th style={{ textAlign: "right" }}>Écart</th>
                      <th>Note (obligatoire si écart)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lignes.map((l) => {
                      const saisie  = saisies.find((s) => s.produitId === l.produitId)!;
                      const physique = saisie.stockPhysique.trim() !== "" ? Number(saisie.stockPhysique) : null;
                      const ecart    = physique !== null ? physique - l.stockTheorique : null;
                      const classeEcart = ecart === null ? "" : ecart < 0 ? "texte-erreur" : ecart > 0 ? "texte-succes" : "texte-discret";
                      const ligneDanger = ecart !== null && ecart < 0;
                      const ligneSucces  = ecart !== null && ecart > 0;
                      return (
                        <tr
                          key={l.produitId}
                          className={ligneDanger ? "inv-ligne--manque" : ligneSucces ? "inv-ligne--surplus" : ""}
                        >
                          <td className="hc-text-body-strong">{l.nom}</td>
                          <td className="texte-discret">{l.categorie || "—"}</td>
                          <td style={{ textAlign: "right" }} className="texte-discret">{formatMontant(l.prix, l.devise)}</td>
                          <td style={{ textAlign: "right" }}>{l.stockTheorique}</td>
                          <td style={{ textAlign: "right" }}>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={saisie.stockPhysique}
                              onChange={(e) => setSaisie(l.produitId, "stockPhysique", e.target.value)}
                              className="inv-input-physique"
                              placeholder="0"
                              aria-label={`Stock physique de ${l.nom}`}
                            />
                          </td>
                          <td style={{ textAlign: "right" }} className={classeEcart}>
                            {ecart === null ? "—" : ecart === 0 ? "—" : ecart > 0 ? `+${ecart}` : String(ecart)}
                          </td>
                          <td>
                            {ecart !== null && ecart !== 0 ? (
                              <input
                                type="text"
                                value={saisie.note}
                                onChange={(e) => setSaisie(l.produitId, "note", e.target.value)}
                                placeholder="Justification requise…"
                                className="inv-input-note"
                                aria-label={`Note pour ${l.nom}`}
                              />
                            ) : (
                              <input
                                type="text"
                                value={saisie.note}
                                onChange={(e) => setSaisie(l.produitId, "note", e.target.value)}
                                placeholder="Remarque (optionnel)"
                                className="inv-input-note"
                                aria-label={`Note pour ${l.nom}`}
                              />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {erreur2 && <p role="alert" className="hc-text-body texte-erreur" style={{ marginTop: "var(--hc-space-2)" }}>{erreur2}</p>}

              <div style={{ display: "flex", gap: "var(--hc-space-2)", marginTop: "var(--hc-space-3)" }}>
                <Button type="button" onClick={validerInventaire} disabled={enEnvoi}>
                  {enEnvoi ? "Génération du PDF…" : "Valider et générer le PDF →"}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setEtape(1)} disabled={enEnvoi}>
                  Retour
                </Button>
              </div>
            </>
          )}

          {/* ── Étape 3 ── */}
          {etape === 3 && inventaire && (
            <div className="carte-formulaire">
              <div style={{ display: "flex", alignItems: "center", gap: "var(--hc-space-2)", marginBottom: "var(--hc-space-4)" }}>
                <CheckCircle size={32} style={{ color: "var(--hc-success)" }} aria-hidden="true" />
                <div>
                  <p className="hc-text-subheading">Inventaire enregistré</p>
                  <p className="hc-text-caption texte-discret">
                    {formatDateFR(inventaire.dateDebut)} – {formatDateFR(inventaire.dateFin)}
                    {inventaire.titre ? ` · ${inventaire.titre}` : ""}
                  </p>
                </div>
              </div>

              {/* Récap */}
              <div className="stock-tuiles" style={{ marginBottom: "var(--hc-space-4)" }}>
                <div className="stock-tuile">
                  <ClipboardList size={20} className="stock-tuile__icone stock-tuile__icone--ok" aria-hidden="true" />
                  <div>
                    <p className="hc-text-display-sm stock-tuile__valeur">{inventaire.items.length}</p>
                    <p className="hc-text-caption texte-discret">Produits évalués</p>
                  </div>
                </div>
                <div className={`stock-tuile ${nbEcarts(inventaire) > 0 ? "stock-tuile--alerte" : ""}`}>
                  <div>
                    <p className={`hc-text-display-sm stock-tuile__valeur ${nbEcarts(inventaire) > 0 ? "stock-tuile__valeur--alerte" : ""}`}>
                      {nbEcarts(inventaire)}
                    </p>
                    <p className="hc-text-caption texte-discret">Écarts détectés</p>
                  </div>
                </div>
                <div className="stock-tuile">
                  <div>
                    <p className="hc-text-display-sm stock-tuile__valeur texte-erreur">
                      {inventaire.items.filter((i) => Number(i.ecart) < 0).length}
                    </p>
                    <p className="hc-text-caption texte-discret">Manquants (−)</p>
                  </div>
                </div>
                <div className="stock-tuile">
                  <div>
                    <p className="hc-text-display-sm stock-tuile__valeur texte-succes">
                      {inventaire.items.filter((i) => Number(i.ecart) > 0).length}
                    </p>
                    <p className="hc-text-caption texte-discret">Surplus (+)</p>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: "var(--hc-space-2)", flexWrap: "wrap" }}>
                {inventaire.pdfUrl && (
                  <Button type="button" onClick={ouvrirPdf}>
                    <ExternalLink size={16} aria-hidden="true" style={{ marginRight: "var(--hc-space-1)" }} />
                    Télécharger le PDF
                  </Button>
                )}
                <Button type="button" variant="secondary" onClick={recommencer}>
                  Nouvel inventaire
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── HISTORIQUE ─────────────────────────────────────────────── */}
      {onglet === "historique" && (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "var(--hc-space-2)" }}>
            <button type="button" className="kds-rafraichir" onClick={chargerHistorique} title="Actualiser" aria-label="Actualiser">
              <RefreshCw size={18} aria-hidden="true" />
            </button>
          </div>

          {chargHistorique && <p className="hc-text-body texte-discret">Chargement…</p>}

          {!chargHistorique && historique.length === 0 && (
            <div className="etat-vide">
              <Clock size={32} strokeWidth={1.5} aria-hidden="true" />
              <p className="hc-text-subheading">Aucun inventaire enregistré</p>
            </div>
          )}

          {historique.length > 0 && (
            <div className="carte-tableau">
              <table className="tableau">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Période</th>
                    <th>Titre</th>
                    <th style={{ textAlign: "right" }}>Produits</th>
                    <th style={{ textAlign: "right" }}>Écarts</th>
                    <th>Par</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {historique.map((inv) => (
                    <tr key={inv.id}>
                      <td className="texte-discret" style={{ whiteSpace: "nowrap" }}>
                        {formatDateFR(inv.createdAt)}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {formatDateFR(inv.dateDebut)} – {formatDateFR(inv.dateFin)}
                      </td>
                      <td className="texte-discret">{inv.titre ?? "—"}</td>
                      <td style={{ textAlign: "right" }}>{inv.items.length}</td>
                      <td style={{ textAlign: "right" }}>
                        {nbEcarts(inv) > 0
                          ? <span className="texte-erreur" style={{ fontWeight: 600 }}>{nbEcarts(inv)}</span>
                          : <span className="texte-discret">0</span>
                        }
                      </td>
                      <td className="texte-discret">{inv.createdBy}</td>
                      <td>
                        {inv.pdfUrl && (
                          <button
                            type="button"
                            className="lien-action"
                            onClick={() => ouvrirPdfHistorique(inv)}
                          >
                            PDF
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
