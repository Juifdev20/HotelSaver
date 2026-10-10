import { useMemo, useEffect, useState } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import { Devise, MouvementStock, Produit } from "@hotel-chicago/types";
import { Button, formatMontant } from "@hotel-chicago/ui";
import { AlertTriangle, ArrowDown, ArrowUp, BarChart2, Package, RefreshCw, Search, X } from "lucide-react";
import { lireQuantite } from "@hotel-chicago/miroir-local";

export interface EcranStockProps {
  client: ClientApi;
}

const TYPES: { valeur: "ENTREE" | "PERTE" | "AJUSTEMENT"; libelle: string }[] = [
  { valeur: "ENTREE",      libelle: "Entrée en stock"   },
  { valeur: "PERTE",       libelle: "Perte / casse"     },
  { valeur: "AJUSTEMENT",  libelle: "Ajustement"        },
];

const LIBELLE_TYPE: Record<string, string> = {
  ENTREE:      "Entrée",
  SORTIE_VENTE:"Vente",
  PERTE:       "Perte",
  AJUSTEMENT:  "Ajustement",
};

type Vue = "inventaire" | "mouvements";

function niveauStock(produit: Produit): "epuise" | "bas" | "ok" {
  const stock = Number(produit.stockActuel);
  const seuil = Number(produit.seuilAlerte);
  if (stock <= 0)           return "epuise";
  if (stock <= seuil)       return "bas";
  return "ok";
}

/**
 * Écran Stock enrichi : deux vues
 *  - Inventaire  : liste de tous les produits avec niveau de stock, seuil et évolution du jour
 *  - Mouvements  : historique complet des entrées / sorties / pertes / ajustements
 */
export function EcranStock({ client }: EcranStockProps) {
  const [vue, setVue]               = useState<Vue>("inventaire");
  const [produits, setProduits]     = useState<Produit[]>([]);
  const [mouvements, setMouvements] = useState<MouvementStock[]>([]);
  const [erreur, setErreur]         = useState<string | null>(null);
  const [recherche, setRecherche]   = useState("");

  // Formulaire nouveau mouvement
  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const [produitId,  setProduitId]  = useState("");
  const [type,       setType]       = useState<(typeof TYPES)[number]["valeur"]>("ENTREE");
  const [quantite,   setQuantite]   = useState("");
  const [motif,      setMotif]      = useState("");
  const [enEnvoi,    setEnEnvoi]    = useState(false);
  const [erreurForm, setErreurForm] = useState<string | null>(null);

  function charger() {
    // Les plats n'ont pas de stock compté (préparés à la commande) : hors de
    // la gestion de stock, comme côté mobile et dans l'inventaire.
    client.listerProduits().then((liste) => setProduits(liste.filter((p) => p.typeProduit !== "PLAT"))).catch((e: Error) => setErreur(e.message));
    client.listerMouvementsStock().then(setMouvements).catch((e: Error) => setErreur(e.message));
  }

  useEffect(charger, [client]);

  function ouvrirFormulaire(pId?: string) {
    setProduitId(pId ?? "");
    setType("ENTREE");
    setQuantite("");
    setMotif("");
    setErreurForm(null);
    setFormulaireOuvert(true);
  }

  async function enregistrer() {
    if (!produitId) {
      setErreurForm("Choisissez un produit.");
      return;
    }
    const negatif = type === "AJUSTEMENT" && quantite.trim().startsWith("-");
    const qteLue = lireQuantite(negatif ? quantite.trim().slice(1) : quantite, { max: 1_000_000 });
    if (!qteLue.ok) {
      setErreurForm(qteLue.message);
      return;
    }
    const qte = negatif ? -qteLue.valeur : qteLue.valeur;
    setEnEnvoi(true);
    setErreurForm(null);
    try {
      await client.creerMouvementStock({ produitId, type, quantite: qte, motif: motif.trim() || undefined });
      setFormulaireOuvert(false);
      charger();
    } catch (e) {
      setErreurForm(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnEnvoi(false);
    }
  }

  // Résumé global pour les tuiles en tête
  const nbEpuises = produits.filter((p) => Number(p.stockActuel) <= 0).length;
  const nbBas     = produits.filter((p) => {
    const s = Number(p.stockActuel); const seuil = Number(p.seuilAlerte);
    return s > 0 && s <= seuil;
  }).length;
  const nbOk      = produits.length - nbEpuises - nbBas;

  // Évolution du jour par produit (à partir des mouvements)
  const evolutionJour = useMemo(() => {
    const today = new Date().toDateString();
    const map = new Map<string, number>();
    for (const m of mouvements) {
      if (new Date(m.createdAt).toDateString() !== today) continue;
      const delta =
        m.type === "ENTREE" || m.type === "AJUSTEMENT"
          ? Number(m.quantite)
          : -Math.abs(Number(m.quantite));
      map.set(m.produitId, (map.get(m.produitId) ?? 0) + delta);
    }
    return map;
  }, [mouvements]);

  // Filtre de recherche
  const terme = recherche.toLowerCase().trim();
  const produitsFiltres = terme
    ? produits.filter((p) => p.nom.toLowerCase().includes(terme) || p.categorie.toLowerCase().includes(terme))
    : produits;

  // Totaux valeur marchande / coût d'acquisition par devise
  const totaux = useMemo(() => {
    const valUsd = produits.filter((p) => p.devise === "USD").reduce((s, p) => s + Number(p.prix) * Number(p.stockActuel), 0);
    const valCdf = produits.filter((p) => p.devise === "CDF").reduce((s, p) => s + Number(p.prix) * Number(p.stockActuel), 0);
    const coutUsd = produits.filter((p) => p.devise === "USD" && p.prixAchat).reduce((s, p) => s + Number(p.prixAchat) * Number(p.stockActuel), 0);
    const coutCdf = produits.filter((p) => p.devise === "CDF" && p.prixAchat).reduce((s, p) => s + Number(p.prixAchat) * Number(p.stockActuel), 0);
    return { valUsd, valCdf, coutUsd, coutCdf };
  }, [produits]);

  // Tri : épuisés en tête, puis bas stock, puis ok — alphabétique au sein de chaque groupe
  const produitsTriés = [...produitsFiltres].sort((a, b) => {
    const ordre = { epuise: 0, bas: 1, ok: 2 };
    const diff = ordre[niveauStock(a)] - ordre[niveauStock(b)];
    return diff !== 0 ? diff : a.nom.localeCompare(b.nom, "fr");
  });

  return (
    <div className="page">
      <header className="page__entete">
        <div>
          <h1 className="hc-text-display-md page__titre">Stock</h1>
          <p className="hc-text-body page__sous-titre">{produits.length} produit{produits.length > 1 ? "s" : ""} au catalogue</p>
        </div>
        <div style={{ display: "flex", gap: "var(--hc-space-2)" }}>
          <button type="button" className="kds-rafraichir" onClick={charger} title="Actualiser" aria-label="Actualiser">
            <RefreshCw size={18} aria-hidden="true" />
          </button>
          <Button type="button" onClick={() => ouvrirFormulaire()}>
            Nouveau mouvement
          </Button>
        </div>
      </header>

      {erreur && <p role="alert" className="hc-text-body texte-erreur">{erreur}</p>}

      {/* Tuiles résumé */}
      <div className="stock-tuiles">
        <div className="stock-tuile">
          <Package size={20} className="stock-tuile__icone stock-tuile__icone--ok" aria-hidden="true" />
          <div>
            <p className="hc-text-display-sm stock-tuile__valeur">{nbOk}</p>
            <p className="hc-text-caption texte-discret">En stock</p>
          </div>
        </div>
        <div className="stock-tuile stock-tuile--alerte">
          <AlertTriangle size={20} className="stock-tuile__icone stock-tuile__icone--alerte" aria-hidden="true" />
          <div>
            <p className="hc-text-display-sm stock-tuile__valeur stock-tuile__valeur--alerte">{nbBas}</p>
            <p className="hc-text-caption texte-discret">Stock bas</p>
          </div>
        </div>
        <div className="stock-tuile stock-tuile--danger">
          <X size={20} className="stock-tuile__icone stock-tuile__icone--danger" aria-hidden="true" />
          <div>
            <p className="hc-text-display-sm stock-tuile__valeur stock-tuile__valeur--danger">{nbEpuises}</p>
            <p className="hc-text-caption texte-discret">Épuisés</p>
          </div>
        </div>
        <div className="stock-tuile">
          <BarChart2 size={20} className="stock-tuile__icone stock-tuile__icone--ok" aria-hidden="true" />
          <div>
            <p className="hc-text-display-sm stock-tuile__valeur">{mouvements.length}</p>
            <p className="hc-text-caption texte-discret">Mouvements</p>
          </div>
        </div>
      </div>

      {/* Onglets */}
      <div className="puces" role="group" aria-label="Vue">
        <button type="button" className="puce" aria-pressed={vue === "inventaire"} onClick={() => setVue("inventaire")}>
          Inventaire
        </button>
        <button type="button" className="puce" aria-pressed={vue === "mouvements"} onClick={() => setVue("mouvements")}>
          Mouvements
        </button>
      </div>

      {/* Formulaire nouveau mouvement */}
      {formulaireOuvert && (
        <div className="carte-formulaire formulaire">
          <p className="hc-text-label texte-discret">Nouveau mouvement de stock</p>

          <label className="hc-text-label" htmlFor="champ-produit-stock">Produit</label>
          <select id="champ-produit-stock" value={produitId} onChange={(e) => setProduitId(e.target.value)}>
            <option value="">Choisir un produit</option>
            {produits.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom} — stock actuel : {p.stockActuel}
              </option>
            ))}
          </select>

          <div className="puces" role="group" aria-label="Type de mouvement">
            {TYPES.map((t) => (
              <button key={t.valeur} type="button" className="puce" aria-pressed={type === t.valeur} onClick={() => setType(t.valeur)}>
                {t.libelle}
              </button>
            ))}
          </div>

          <label className="hc-text-label" htmlFor="champ-quantite-stock">Quantité</label>
          <input id="champ-quantite-stock" type="number" step="0.01" min="0.01" value={quantite} onChange={(e) => setQuantite(e.target.value)} placeholder="0" />

          <label className="hc-text-label" htmlFor="champ-motif-stock">Motif (optionnel)</label>
          <input id="champ-motif-stock" value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Ex. livraison fournisseur, inventaire mensuel…" />

          {erreurForm && <p role="alert" className="hc-text-body texte-erreur">{erreurForm}</p>}

          <div style={{ display: "flex", gap: "var(--hc-space-2)", marginTop: "var(--hc-space-2)" }}>
            <Button type="button" onClick={enregistrer} disabled={enEnvoi}>
              {enEnvoi ? "Enregistrement…" : "Enregistrer"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setFormulaireOuvert(false)} disabled={enEnvoi}>
              Annuler
            </Button>
          </div>
        </div>
      )}

      {/* ── VUE INVENTAIRE ── */}
      {vue === "inventaire" && (
        <>
          <label className="champ-recherche" style={{ marginBottom: "var(--hc-space-2)" }}>
            <Search size={18} aria-hidden="true" />
            <span className="visuellement-cache">Rechercher un produit</span>
            <input
              type="search"
              placeholder="Rechercher par nom ou catégorie…"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
            />
            {recherche && (
              <button type="button" className="champ-recherche__effacer" onClick={() => setRecherche("")} aria-label="Effacer">
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </label>

          {produitsTriés.length === 0 && !erreur && (
            <div className="etat-vide">
              <Package size={32} strokeWidth={1.5} aria-hidden="true" />
              <p className="hc-text-subheading">{recherche ? "Aucun produit ne correspond." : "Aucun produit dans le catalogue."}</p>
            </div>
          )}

          {produitsTriés.length > 0 && (
            <div className="carte-tableau">
              <table className="tableau">
                <thead>
                  <tr>
                    <th>Produit</th>
                    <th>Catégorie</th>
                    <th>Prix</th>
                    <th>Stock actuel</th>
                    <th>Seuil d'alerte</th>
                    <th style={{ textAlign: "right" }}>Val. marchande</th>
                    <th style={{ textAlign: "right" }}>Coût acq.</th>
                    <th>Évolution auj.</th>
                    <th>Statut</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {produitsTriés.map((p) => {
                    const niveau    = niveauStock(p);
                    const stock     = Number(p.stockActuel);
                    const seuil     = Number(p.seuilAlerte);
                    const evolution = evolutionJour.get(p.id) ?? 0;
                    return (
                      <tr key={p.id} className={niveau === "epuise" ? "ligne-danger" : niveau === "bas" ? "ligne-alerte" : ""}>
                        <td className="hc-text-body-strong">{p.nom}</td>
                        <td className="texte-discret">{p.categorie || "—"}</td>
                        <td>{formatMontant(p.prix, p.devise)}</td>
                        <td>
                          <span className={`stock-valeur stock-valeur--${niveau}`}>
                            {stock}
                          </span>
                        </td>
                        <td className="texte-discret">{seuil > 0 ? seuil : "—"}</td>
                        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {formatMontant(String(Number(p.prix) * stock), p.devise)}
                        </td>
                        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }} className="texte-discret">
                          {p.prixAchat ? formatMontant(String(Number(p.prixAchat) * stock), p.devise) : "—"}
                        </td>
                        <td>
                          {evolution === 0 ? (
                            <span className="texte-discret">—</span>
                          ) : evolution > 0 ? (
                            <span className="texte-succes stock-evolution">
                              <ArrowUp size={13} aria-hidden="true" />+{evolution}
                            </span>
                          ) : (
                            <span className="texte-erreur stock-evolution">
                              <ArrowDown size={13} aria-hidden="true" />{evolution}
                            </span>
                          )}
                        </td>
                        <td>
                          {niveau === "epuise" && <span className="badge-stock badge-stock--epuise">Épuisé</span>}
                          {niveau === "bas"    && <span className="badge-stock badge-stock--bas">Stock bas</span>}
                          {niveau === "ok"     && <span className="badge-stock badge-stock--ok">OK</span>}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="lien-action"
                            onClick={() => ouvrirFormulaire(p.id)}
                          >
                            Mouvement
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 700, borderTop: "2px solid var(--hc-border)" }}>
                    <td colSpan={5} className="hc-text-caption texte-discret">Total ({produits.length} produits)</td>
                    <td style={{ textAlign: "right" }}>
                      {totaux.valUsd > 0 && <div>{formatMontant(String(totaux.valUsd), Devise.USD)}</div>}
                      {totaux.valCdf > 0 && <div>{formatMontant(String(totaux.valCdf), Devise.CDF)}</div>}
                      {totaux.valUsd === 0 && totaux.valCdf === 0 && "—"}
                    </td>
                    <td style={{ textAlign: "right" }} className="texte-discret">
                      {totaux.coutUsd > 0 && <div>{formatMontant(String(totaux.coutUsd), Devise.USD)}</div>}
                      {totaux.coutCdf > 0 && <div>{formatMontant(String(totaux.coutCdf), Devise.CDF)}</div>}
                      {totaux.coutUsd === 0 && totaux.coutCdf === 0 && "—"}
                    </td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── VUE MOUVEMENTS ── */}
      {vue === "mouvements" && (
        <>
          {mouvements.length === 0 && !erreur && (
            <div className="etat-vide">
              <Package size={32} strokeWidth={1.5} aria-hidden="true" />
              <p className="hc-text-subheading">Aucun mouvement enregistré</p>
            </div>
          )}

          {mouvements.length > 0 && (
            <div className="carte-tableau">
              <table className="tableau">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Produit</th>
                    <th>Type</th>
                    <th>Quantité</th>
                    <th>Motif</th>
                    <th>Par</th>
                  </tr>
                </thead>
                <tbody>
                  {mouvements.map((m) => {
                    const negatif = m.type === "SORTIE_VENTE" || m.type === "PERTE" || Number(m.quantite) < 0;
                    const date    = new Date(m.createdAt);
                    return (
                      <tr key={m.id}>
                        <td className="texte-discret" style={{ whiteSpace: "nowrap" }}>
                          {date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                          {" "}
                          <span style={{ opacity: 0.6 }}>{date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
                        </td>
                        <td className="hc-text-body-strong">{m.produit.nom}</td>
                        <td>
                          <span className={`badge-mouvement badge-mouvement--${m.type.toLowerCase().replace("_", "-")}`}>
                            {LIBELLE_TYPE[m.type] ?? m.type}
                          </span>
                        </td>
                        <td className={negatif ? "texte-erreur" : "texte-succes"} style={{ fontWeight: 700 }}>
                          {negatif ? "" : "+"}{m.quantite}
                        </td>
                        <td className="texte-discret">{m.motif ?? "—"}</td>
                        <td className="texte-discret">{m.createdBy}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
