import * as React from "react";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Découpe une longue liste en pages (25 lignes par défaut). À brancher après le tri :
 *
 *   const { visibles, pied } = usePagination(lignesTriees);
 *   {visibles.map(…)}   …   {pied}
 *
 * Le pied n'apparaît que s'il y a plus d'une page. Si la liste rétrécit (filtre, recherche), la page courante est ramenée dans les limites.
 */
export function usePagination<T>(lignes: T[], taille = 25) {
  const [page, setPage] = useState(0);
  const nbPages = Math.max(1, Math.ceil(lignes.length / taille));
  const courante = Math.min(page, nbPages - 1);
  const debut = courante * taille;
  const visibles = lignes.slice(debut, debut + taille);

  const pied =
    nbPages > 1 ? (
      <nav className="pagination" aria-label="Pages">
        <span className="hc-text-caption texte-discret">
          {debut + 1}–{debut + visibles.length} sur {lignes.length}
        </span>
        <div className="pagination__boutons">
          <button type="button" className="pagination__bouton" onClick={() => setPage(courante - 1)} disabled={courante === 0} aria-label="Page précédente">
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <span className="hc-text-caption">
            Page {courante + 1} / {nbPages}
          </span>
          <button type="button" className="pagination__bouton" onClick={() => setPage(courante + 1)} disabled={courante >= nbPages - 1} aria-label="Page suivante">
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      </nav>
    ) : null;

  return { visibles, pied };
}
