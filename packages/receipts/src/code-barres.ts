import type { Produit } from "@hotel-chicago/types";
import type { LigneRecu } from "./types";
import { formatMontant } from "./format-montant";

/**
 * Codes-barres des articles de comptoir (scan à la caisse cafétaria,
 * 08/10/2026). Le code ne contient que l'identifiant du produit, jamais le
 * prix : changer un prix ne demande pas de réimprimer les étiquettes, et une
 * étiquette ne peut pas être falsifiée pour payer moins cher.
 */

/** Clé de contrôle EAN-13 d'un code de 12 chiffres (pondération 1-3-1-3…). */
export function cleControleEan13(douzeChiffres: string): number {
  if (!/^\d{12}$/.test(douzeChiffres)) throw new Error("Un EAN-13 se calcule sur 12 chiffres.");
  let somme = 0;
  for (let i = 0; i < 12; i++) somme += Number(douzeChiffres[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (somme % 10)) % 10;
}

export function estEan13Valide(code: string): boolean {
  return /^\d{13}$/.test(code) && cleControleEan13(code.slice(0, 12)) === Number(code[12]);
}

/** EAN-13 interne : préfixe 2 (plage GS1 réservée à l'usage en magasin, lue
 * par toutes les douchettes et caméras), 11 chiffres aléatoires, clé de
 * contrôle. L'unicité est garantie par le serveur (index unique par hôtel) :
 * sur un 409, l'appelant en génère simplement un autre. */
export function genererEan13Interne(aleatoire: () => number = Math.random): string {
  let douze = "2";
  for (let i = 0; i < 11; i++) douze += Math.floor(aleatoire() * 10);
  return douze + cleControleEan13(douze);
}

/** Même normalisation que l'API : espaces retirés. */
export function normaliserCodeBarres(code: string): string {
  return code.replace(/\s+/g, "");
}

/** Recherche instantanée dans le catalogue déjà chargé (miroir hors ligne
 * sur mobile) : articles actifs seulement, correspondance exacte. */
export function trouverProduitParCode<P extends Pick<Produit, "codeBarres" | "actif" | "typeProduit">>(
  produits: P[],
  code: string
): P | undefined {
  const cherche = normaliserCodeBarres(code);
  if (!cherche) return undefined;
  return produits.find((p) => p.actif && p.typeProduit !== "PLAT" && p.codeBarres === cherche);
}

/**
 * Reconnaît la saisie d'une douchette, qui se comporte comme un clavier : une
 * rafale de caractères (< `intervalleMaxMs` entre deux touches) terminée par
 * Entrée, d'au moins `longueurMin` caractères. Une frappe humaine, plus lente,
 * est ignorée (elle reste une recherche normale).
 */
export class DetecteurRafale {
  private tampon = "";
  private derniere = 0;

  constructor(
    private readonly intervalleMaxMs = 40,
    private readonly longueurMin = 6
  ) {}

  /** À appeler pour chaque touche ; renvoie le code lu quand une rafale se termine par Entrée. */
  touche(cle: string, horodatageMs: number): string | null {
    const ecart = horodatageMs - this.derniere;
    this.derniere = horodatageMs;
    if (cle === "Enter") {
      const code = this.tampon.length >= this.longueurMin && ecart <= this.intervalleMaxMs * 4 ? this.tampon : null;
      this.tampon = "";
      return code;
    }
    if (cle.length !== 1) return null; // Shift, flèches…
    // Trop lent depuis la touche précédente : nouvelle rafale.
    this.tampon = ecart <= this.intervalleMaxMs ? this.tampon + cle : cle;
    return null;
  }
}

/** Étiquette à coller sur un article sans code fabricant : nom, prix,
 * code-barres dessiné par l'imprimante (ESC/POS `GS k`). */
export function construireEtiquette(
  produit: Pick<Produit, "nom" | "prix" | "devise" | "codeBarres">,
  exemplaires = 1
): LigneRecu[] {
  if (!produit.codeBarres) throw new Error("Ce produit n'a pas de code-barres : générez-en un d'abord.");
  const lignes: LigneRecu[] = [];
  for (let i = 0; i < Math.max(1, Math.floor(exemplaires)); i++) {
    lignes.push(
      { type: "titre", texte: produit.nom },
      { type: "soustitre", texte: formatMontant(produit.prix, produit.devise) },
      { type: "codebarre", valeur: produit.codeBarres },
      { type: "separateur" }
    );
  }
  return lignes;
}
