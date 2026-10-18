import * as React from "react";
import { useEffect, useState } from "react";
import { ErreurApi, type ClientApi } from "@hotel-chicago/api-client";
import { construireEtiquette, genererEan13Interne } from "@hotel-chicago/receipts";
import type { Produit } from "@hotel-chicago/types";
import { Button } from "@hotel-chicago/ui";
import { Printer } from "lucide-react";
import { ApercuRecu } from "./ApercuRecu";

export interface CarteEtiquettesProps {
  client: ClientApi;
  produit: Produit;
  interfaceImprimante: string | null;
  /** Nombre proposé à l'ouverture (ex. la quantité qui vient d'entrer en stock). */
  exemplairesParDefaut?: number;
  /** Phrase de confirmation en tête (ex. « ✓ 24 × Primus entrés en stock. »). */
  entete?: string;
  onFermer: () => void;
  /** Un code vient d'être généré et associé : la liste appelante peut se recharger. */
  onProduitMisAJour?: (produit: Produit) => void;
}

/**
 * Étiquettes de prix (nom, prix, code-barres) — même aperçu et même impression que l'étape « Étiquettes » du Menu patron,
 * ouverte ici depuis le Stock après une ENTRÉE (18/10/2026). Un article sans code reçoit un EAN-13 interne via
 * `associerCodeBarres` (seule écriture produit ouverte à la caisse ; demande le réseau).
 */
export function CarteEtiquettes({ client, produit, interfaceImprimante, exemplairesParDefaut = 1, entete, onFermer, onProduitMisAJour }: CarteEtiquettesProps) {
  const [courant, setCourant] = useState<Produit>(produit);
  const [exemplaires, setExemplaires] = useState("1");
  const [message, setMessage] = useState<{ texte: string; reussi: boolean } | null>(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    setCourant(produit);
    setExemplaires(String(Math.max(1, Math.round(exemplairesParDefaut) || 1)));
    setMessage(null);
  }, [produit, exemplairesParDefaut]);

  async function genererCode(essai = 0): Promise<void> {
    setEnCours(true);
    setMessage(null);
    try {
      const maj = await client.associerCodeBarres(courant.id, genererEan13Interne());
      setCourant(maj);
      onProduitMisAJour?.(maj);
    } catch (e) {
      // Code généré déjà pris (très rare) : un autre.
      if (e instanceof ErreurApi && e.statusCode === 409 && essai < 3) return genererCode(essai + 1);
      setMessage({ texte: e instanceof Error ? e.message : "Le code n'a pas pu être créé : il faut une connexion.", reussi: false });
    } finally {
      setEnCours(false);
    }
  }

  async function imprimer() {
    if (!courant.codeBarres) return;
    if (!interfaceImprimante) {
      setMessage({ texte: "Aucune imprimante configurée — Paramètres > Imprimante.", reussi: false });
      return;
    }
    setEnCours(true);
    setMessage(null);
    try {
      const n = Math.max(1, Math.round(Number(exemplaires)) || 1);
      await window.hotelChicago.imprimer(interfaceImprimante, construireEtiquette(courant, n));
      setMessage({ texte: `${n} étiquette${n > 1 ? "s" : ""} envoyée${n > 1 ? "s" : ""} à l'imprimante.`, reussi: true });
    } catch (e) {
      setMessage({ texte: e instanceof Error ? e.message : "Impression impossible.", reussi: false });
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="carte-formulaire formulaire" role="region" aria-label="Étiquettes de prix">
      {entete ? <p className="hc-text-body texte-succes">{entete}</p> : <p className="hc-text-label texte-discret">Étiquettes de « {courant.nom} »</p>}
      {courant.codeBarres ? (
        <>
          <p className="hc-text-body texte-discret">Collez-les sur les articles pour les scanner à la caisse.</p>
          <div style={{ maxWidth: 320 }}>
            <ApercuRecu lignes={construireEtiquette(courant, 1)} />
          </div>
          <label className="hc-text-label" htmlFor="champ-nb-etiquettes-stock">
            Nombre d'étiquettes
          </label>
          <input id="champ-nb-etiquettes-stock" type="number" min="1" value={exemplaires} onChange={(e) => setExemplaires(e.target.value)} style={{ width: 100 }} />
        </>
      ) : (
        <p className="hc-text-body">
          « {courant.nom} » n'a pas encore de code-barres. S'il porte déjà un code fabricant, cliquez « Terminer » ; sinon, générez un code
          pour imprimer ses étiquettes.
        </p>
      )}
      {message && (
        <p className={`hc-text-body ${message.reussi ? "texte-discret" : "texte-erreur"}`} role={message.reussi ? "status" : "alert"}>
          {message.texte}
        </p>
      )}
      <div style={{ display: "flex", gap: "var(--hc-space-2)" }}>
        {courant.codeBarres ? (
          <Button type="button" onClick={() => void imprimer()} disabled={enCours}>
            <Printer size={16} aria-hidden="true" /> {enCours ? "Impression…" : "Imprimer les étiquettes"}
          </Button>
        ) : (
          <Button type="button" onClick={() => void genererCode()} disabled={enCours}>
            {enCours ? "…" : "Générer un code"}
          </Button>
        )}
        <Button type="button" variant="secondary" onClick={onFermer} disabled={enCours}>
          Terminer
        </Button>
      </div>
    </div>
  );
}
