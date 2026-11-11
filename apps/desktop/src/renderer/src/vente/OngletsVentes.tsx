import * as React from "react";
import { ShoppingCart, Table2 } from "lucide-react";

export interface OngletVente {
  id: string;
  titre: string;
  sousTitre: string;
  /** « Nouvelle vente » : icône de panier ; les autres sont des tables. */
  nouvelle?: boolean;
  /** Une part de la table est déjà payée. */
  paye?: boolean;
}

/** Onglets des ventes en cours, comme ceux d'un navigateur : « Nouvelle vente » puis une table par client resté. Les produits choisis de chacune sont gardés. */
export function OngletsVentes({ onglets, actif, onChoisir }: { onglets: OngletVente[]; actif: string; onChoisir: (id: string) => void }) {
  return (
    <div className="vente-onglets" role="tablist" aria-label="Ventes en cours">
      {onglets.map((o) => {
        const a = o.id === actif;
        const Icone = o.nouvelle ? ShoppingCart : Table2;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={a}
            className={`vente-onglet${a ? " vente-onglet--actif" : ""}`}
            onClick={() => onChoisir(o.id)}
            title={`${o.titre} — ${o.sousTitre}`}
          >
            <span className="vente-onglet__ligne">
              <Icone size={16} aria-hidden="true" />
              <span className="vente-onglet__titre">{o.titre}</span>
              {o.paye && <span className="vente-puce vente-puce--ok">payé</span>}
            </span>
            <span className="vente-onglet__sous">{o.sousTitre}</span>
          </button>
        );
      })}
    </div>
  );
}
