import * as React from "react";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

export type Sens = "asc" | "desc";
type Valeur = string | number | null | undefined;

const COMPARATEUR = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });

function comparer(a: Valeur, b: Valeur): number {
  // Les valeurs vides vont toujours en bas, quel que soit le sens.
  const videA = a === null || a === undefined || a === "";
  const videB = b === null || b === undefined || b === "";
  if (videA || videB) return videA === videB ? 0 : videA ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return COMPARATEUR.compare(String(a), String(b));
}

/**
 * Tri par clic sur l'en-tête d'une colonne : 1er clic croissant, 2e décroissant, 3e retour à l'ordre d'origine.
 *
 *   const { lignes, entete } = useTri(liste, { client: (r) => r.client.nom, arrivee: (r) => r.dateArrivee });
 *   <thead><tr>{entete("client", "Client")}{entete("arrivee", "Arrivée")}<th>Statut</th></tr></thead>
 *   {lignes.map(…)}
 *
 * Un extracteur renvoie ce qui sert à comparer (nombre, texte ou date ISO). Le bouton de l'en-tête est focalisable
 * au clavier et annonce le sens du tri (`aria-sort`).
 */
export function useTri<T>(
  source: T[],
  extracteurs: Record<string, (ligne: T) => Valeur>,
  initial?: { cle: string; sens: Sens }
) {
  const [tri, setTri] = useState<{ cle: string; sens: Sens } | null>(initial ?? null);

  const lignes = useMemo(() => {
    const extracteur = tri ? extracteurs[tri.cle] : undefined;
    if (!tri || !extracteur) return source;
    const signe = tri.sens === "asc" ? 1 : -1;
    // Tri stable : à valeur égale, l'ordre d'origine est conservé.
    return source
      .map((ligne, i) => ({ ligne, i, v: extracteur(ligne) }))
      .sort((x, y) => {
        const videX = x.v === null || x.v === undefined || x.v === "";
        const videY = y.v === null || y.v === undefined || y.v === "";
        if (videX || videY) return comparer(x.v, y.v) || x.i - y.i;
        return comparer(x.v, y.v) * signe || x.i - y.i;
      })
      .map((x) => x.ligne);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, tri]);

  function basculer(cle: string) {
    setTri((actuel) => {
      if (!actuel || actuel.cle !== cle) return { cle, sens: "asc" };
      if (actuel.sens === "asc") return { cle, sens: "desc" };
      return null;
    });
  }

  function entete(cle: string, libelle: string, options?: { aDroite?: boolean }) {
    const actif = tri?.cle === cle;
    const Icone = !actif ? ChevronsUpDown : tri.sens === "asc" ? ArrowUp : ArrowDown;
    return (
      <th
        aria-sort={actif ? (tri.sens === "asc" ? "ascending" : "descending") : "none"}
        style={options?.aDroite ? { textAlign: "right" } : undefined}
      >
        <button type="button" className={`th-tri${actif ? " th-tri--actif" : ""}`} onClick={() => basculer(cle)}>
          {libelle}
          <Icone size={13} aria-hidden="true" />
        </button>
      </th>
    );
  }

  return { lignes, entete };
}
