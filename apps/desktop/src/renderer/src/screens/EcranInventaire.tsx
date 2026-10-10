import { useEffect, useState } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import type { InventairePhysique, LignePreparationInventaire, UtilisateurAuthentifie } from "@hotel-chicago/types";
import { Button, formatMontant } from "@hotel-chicago/ui";
import { CheckCircle, ClipboardList, Clock, ExternalLink, RefreshCw } from "lucide-react";
import { lireQuantite } from "@hotel-chicago/miroir-local";
import { useConfirmation } from "../components/DialogueConfirmation";

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

/** Stock physique saisi : décimales permises (« 1,5 » litre, « 0,25 » kg) comme sur le mobile ; 0 accepté (produit absent). */
function lireStockPhysique(saisie: string) {
  return lireQuantite(saisie, { autoriserZero: true, max: 1_000_000 });
}

/** Écart arrondi à 3 décimales : « 2,3 − 2 » ne doit pas afficher 0,2999999. */
function ecartArrondi(physique: number, theorique: number): number {
  return Math.round((physique - theorique) * 1000) / 1000;
}

function listerNoms(noms: string[]): string {
  return noms.length <= 5 ? noms.join(", ") : `${noms.slice(0, 5).join(", ")} et ${noms.length - 5} autre(s)`;
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
  const [erreurHistorique, setErreurHistorique] = useState<string | null>(null);
  const [erreurPdf, setErreurPdf] = useState<string | null>(null);
  const { demander, dialogue } = useConfirmation();

  useEffect(() => {
    if (onglet === "historique") chargerHistorique();
  }, [onglet]);

  function chargerHistorique() {
    setChargHistorique(true);
    setErreurHistorique(null);
    client.listerInventaires()
      .then(setHistorique)
      // La liste déjà affichée est conservée : l'échec est dit, pas avalé.
      .catch((e: Error) => setErreurHistorique(`L'historique n'a pas pu être chargé : ${e.message}`))
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
    // Un produit non compté n'est JAMAIS compté comme 0 : on le nomme et on refuse.
    const nom = (produitId: string) => lignes.find((l) => l.produitId === produitId)?.nom ?? "Produit";
    const manquants = saisies.filter((s) => s.stockPhysique.trim() === "");
    if (manquants.length > 0) {
      setErreur2(
        `${manquants.length} produit(s) non compté(s) : ${listerNoms(manquants.map((s) => nom(s.produitId)))}. Saisissez 0 seulement si le produit est vraiment absent.`
      );
      return;
    }
    const valeurs = new Map<string, number>();
    for (const s of saisies) {
      const lu = lireStockPhysique(s.stockPhysique);
      if (!lu.ok) {
        setErreur2(`${nom(s.produitId)} : ${lu.message}`);
        return;
      }
      valeurs.set(s.produitId, lu.valeur);
    }
    // Écarts : il en faut la justification.
    const ecarts = saisies.filter((s) => {
      const ligne = lignes.find((l) => l.produitId === s.produitId);
      return ligne ? ecartArrondi(valeurs.get(s.produitId)!, ligne.stockTheorique) !== 0 : false;
    });
    const ecartsSansNote = ecarts.filter((s) => !s.note.trim());
    if (ecartsSansNote.length > 0) {
      setErreur2(
        `${ecartsSansNote.length} écart(s) sans justification : ${listerNoms(ecartsSansNote.map((s) => nom(s.produitId)))}. Expliquez chaque écart dans le champ Note.`
      );
      return;
    }
    setErreur2(null);
    const confirme = await demander({
      titre: `Enregistrer l'inventaire (${ecarts.length} écart${ecarts.length > 1 ? "s" : ""}) ?`,
      message: (
        <>
          <p>
            {saisies.length} produit{saisies.length > 1 ? "s" : ""} compté{saisies.length > 1 ? "s" : ""} du {formatDateFR(dateDebut)} au {formatDateFR(dateFin)}.
            {ecarts.length === 0 ? " Aucun écart avec le stock théorique." : ` ${ecarts.length} produit${ecarts.length > 1 ? "s" : ""} ${ecarts.length > 1 ? "ont" : "a"} un écart avec le stock théorique.`}
          </p>
          <p>L'inventaire est enregistré définitivement et son rapport PDF est généré.</p>
        </>
      ),
      libelleConfirmer: "Enregistrer l'inventaire",
    });
    if (!confirme) return;
    setEnEnvoi(true);
    try {
      const result = await client.creerInventaire({
        dateDebut,
        dateFin,
        titre: titreInv.trim() || undefined,
        items: saisies.map((s) => ({
          produitId:     s.produitId,
          stockPhysique: valeurs.get(s.produitId)!,
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

  async function ouvrirPdfInventaire(id: string) {
    setErreurPdf(null);
    try {
      const { url } = await client.urlInventaire(id);
      window.open(url, "_blank");
    } catch (e) {
      setErreurPdf(e instanceof Error ? e.message : "Impossible d'obtenir le lien du PDF.");
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
                      const physiqueLu = saisie.stockPhysique.trim() !== "" ? lireStockPhysique(saisie.stockPhysique) : null;
                      const physique = physiqueLu && physiqueLu.ok ? physiqueLu.valeur : null;
                      const erreurSaisie = physiqueLu && !physiqueLu.ok ? physiqueLu.message : null;
                      const ecart    = physique !== null ? ecartArrondi(physique, l.stockTheorique) : null;
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
                              type="text"
                              inputMode="decimal"
                              value={saisie.stockPhysique}
                              onChange={(e) => setSaisie(l.produitId, "stockPhysique", e.target.value)}
                              className="inv-input-physique"
                              placeholder="Compter"
                              aria-label={`Stock physique de ${l.nom}`}
                              aria-invalid={erreurSaisie !== null}
                              title={erreurSaisie ?? undefined}
                            />
                          </td>
                          <td style={{ textAlign: "right" }} className={classeEcart}>
                            {erreurSaisie ? "?" : ecart === null || ecart === 0 ? "—" : ecart > 0 ? `+${ecart}` : String(ecart)}
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
                  <Button type="button" onClick={() => void ouvrirPdfInventaire(inventaire.id)}>
                    <ExternalLink size={16} aria-hidden="true" style={{ marginRight: "var(--hc-space-1)" }} />
                    Télécharger le PDF
                  </Button>
                )}
                <Button type="button" variant="secondary" onClick={recommencer}>
                  Nouvel inventaire
                </Button>
              </div>
              {erreurPdf && <p role="alert" className="hc-text-body texte-erreur">{erreurPdf}</p>}
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
          {erreurHistorique && <p role="alert" className="hc-text-body texte-erreur">{erreurHistorique}</p>}
          {erreurPdf && <p role="alert" className="hc-text-body texte-erreur">{erreurPdf}</p>}

          {!chargHistorique && !erreurHistorique && historique.length === 0 && (
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
                            onClick={() => void ouvrirPdfInventaire(inv.id)}
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
      {dialogue}
    </div>
  );
}
