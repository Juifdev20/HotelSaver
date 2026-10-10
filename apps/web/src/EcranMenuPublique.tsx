import * as React from "react";
import { useEffect, useState } from "react";
import { listerMenu } from "@hotel-chicago/api-client";
import { formatMontant } from "@hotel-chicago/ui";
import type { Produit } from "@hotel-chicago/types";
import { configuration } from "./config";

export function EcranMenuPublique({ sousDomaine }: { sousDomaine: string }) {
  const [produits, setProduits] = useState<Produit[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    (async () => {
      setChargement(true);
      setErreur(null);
      try {
        const resultat = await listerMenu({ url: configuration.apiUrl }, sousDomaine);
        if (!annule) setProduits(resultat);
      } catch (e) {
        if (!annule) setErreur(e instanceof Error ? e.message : "Erreur de chargement.");
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [sousDomaine]);

  if (chargement) return <div className="page"><p role="status">Chargement de la carte…</p></div>;
  if (erreur) return <div className="page"><p className="erreur" role="alert">{erreur}</p></div>;

  const parCategorie = new Map<string, Produit[]>();
  for (const p of produits) {
    const liste = parCategorie.get(p.categorie) ?? [];
    liste.push(p);
    parCategorie.set(p.categorie, liste);
  }

  return (
    <div className="page">
      <h1 className="titre-page">Menu</h1>
      {[...parCategorie.entries()].map(([categorie, items]) => (
        <div key={categorie} style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, color: "var(--hc-navy)" }}>{categorie}</h2>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {items.map((p) => (
              <li key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--hc-border)" }}>
                <span>{p.nom}</span>
                <strong>{formatMontant(p.prix, p.devise)}</strong>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {produits.length === 0 && <p>Le menu n'est pas encore disponible.</p>}
    </div>
  );
}
