import * as React from "react";
import { useEffect, useState } from "react";
import type { ClientApi } from "@hotel-chicago/api-client";
import { MouvementStock, Produit } from "@hotel-chicago/types";
import { Button } from "@hotel-chicago/ui";
import { Package } from "lucide-react";

export interface EcranStockProps {
  client: ClientApi;
}

const TYPES: { valeur: "ENTREE" | "PERTE" | "AJUSTEMENT"; libelle: string }[] = [
  { valeur: "ENTREE", libelle: "Entrée" },
  { valeur: "PERTE", libelle: "Perte" },
  { valeur: "AJUSTEMENT", libelle: "Ajustement" },
];

const LIBELLE_TYPE: Record<string, string> = {
  ENTREE: "Entrée",
  SORTIE_VENTE: "Vente",
  PERTE: "Perte",
  AJUSTEMENT: "Ajustement",
};

/** Équivalent desktop de apps/mobile/src/ecrans/EcranStock.tsx. SORTIE_VENTE
 * n'apparaît jamais dans le formulaire : généré automatiquement par une
 * ligne de commande cafétaria (voir stock.service.ts). */
export function EcranStock({ client }: EcranStockProps) {
  const [mouvements, setMouvements] = useState<MouvementStock[] | null>(null);
  const [produits, setProduits] = useState<Produit[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);

  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const [produitId, setProduitId] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number]["valeur"]>("ENTREE");
  const [quantite, setQuantite] = useState("");
  const [motif, setMotif] = useState("");
  const [enEnvoi, setEnEnvoi] = useState(false);
  const [erreurFormulaire, setErreurFormulaire] = useState<string | null>(null);

  function charger() {
    client.listerMouvementsStock().then(setMouvements).catch((e: Error) => setErreur(e.message));
    client.listerProduits().then(setProduits).catch(() => {});
  }

  useEffect(charger, [client]);

  function ouvrirFormulaire() {
    setProduitId("");
    setType("ENTREE");
    setQuantite("");
    setMotif("");
    setErreurFormulaire(null);
    setFormulaireOuvert(true);
  }

  async function enregistrer() {
    const quantiteNombre = Number(quantite);
    if (!produitId || !Number.isFinite(quantiteNombre) || quantiteNombre <= 0) {
      setErreurFormulaire("Choisissez un produit et une quantité positive.");
      return;
    }
    setEnEnvoi(true);
    setErreurFormulaire(null);
    try {
      await client.creerMouvementStock({ produitId, type, quantite: quantiteNombre, motif: motif.trim() || undefined });
      setFormulaireOuvert(false);
      charger();
    } catch (e) {
      setErreurFormulaire(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setEnEnvoi(false);
    }
  }

  return (
    <div className="page">
      <header className="page__entete">
        <div>
          <h1 className="hc-text-display-md page__titre">Stock</h1>
          <p className="hc-text-body page__sous-titre">Mouvements de stock des produits.</p>
        </div>
        <Button type="button" onClick={ouvrirFormulaire}>
          Nouveau mouvement
        </Button>
      </header>

      {erreur && (
        <p role="alert" className="hc-text-body texte-erreur">
          {erreur}
        </p>
      )}

      {formulaireOuvert && (
        <div className="carte-formulaire formulaire">
          <label className="hc-text-label" htmlFor="champ-produit-stock">
            Produit
          </label>
          <select id="champ-produit-stock" value={produitId} onChange={(e) => setProduitId(e.target.value)}>
            <option value="">Choisir un produit</option>
            {produits.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nom}
              </option>
            ))}
          </select>

          <div className="puces" role="group" aria-label="Type de mouvement">
            {TYPES.map((t) => (
              <button
                key={t.valeur}
                type="button"
                className="puce"
                aria-pressed={type === t.valeur}
                onClick={() => setType(t.valeur)}
              >
                {t.libelle}
              </button>
            ))}
          </div>

          <label className="hc-text-label" htmlFor="champ-quantite-stock">
            Quantité
          </label>
          <input id="champ-quantite-stock" type="number" step="0.01" value={quantite} onChange={(e) => setQuantite(e.target.value)} placeholder="0" />

          <label className="hc-text-label" htmlFor="champ-motif-stock">
            Motif (optionnel)
          </label>
          <input id="champ-motif-stock" value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Ex. livraison fournisseur" />

          {erreurFormulaire && (
            <p role="alert" className="hc-text-body texte-erreur">
              {erreurFormulaire}
            </p>
          )}

          <Button type="button" onClick={enregistrer} disabled={enEnvoi} style={{ marginTop: "var(--hc-space-2)" }}>
            {enEnvoi ? "…" : "Enregistrer"}
          </Button>
        </div>
      )}

      {mouvements === null && !erreur && <p className="hc-text-body texte-discret">Chargement…</p>}

      {mouvements?.length === 0 && (
        <div className="etat-vide">
          <Package size={32} strokeWidth={1.5} aria-hidden="true" />
          <p className="hc-text-subheading">Aucun mouvement enregistré</p>
        </div>
      )}

      {mouvements && mouvements.length > 0 && (
        <div className="carte-tableau" data-testid="tableau-stock">
          <table className="tableau">
            <thead>
              <tr>
                <th>Produit</th>
                <th>Type</th>
                <th>Quantité</th>
                <th>Motif</th>
              </tr>
            </thead>
            <tbody>
              {mouvements.map((m) => {
                const negatif = m.type === "SORTIE_VENTE" || m.type === "PERTE" || Number(m.quantite) < 0;
                return (
                  <tr key={m.id}>
                    <td className="hc-text-body-strong">{m.produit.nom}</td>
                    <td className="texte-discret">{LIBELLE_TYPE[m.type] ?? m.type}</td>
                    <td className={negatif ? "texte-erreur" : "texte-succes"}>
                      {negatif ? "" : "+"}
                      {m.quantite}
                    </td>
                    <td className="texte-discret">{m.motif ?? "—"}</td>
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
