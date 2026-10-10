import { Devise } from "@hotel-chicago/types";

/**
 * Copie volontaire de `packages/ui/src/format-montant.ts` (même logique,
 * mêmes règles — section 9.4/11.3) : ce paquet-là importe des fichiers .css
 * en effet de bord (`import "./button.css"` etc.), ce que Metro ne sait pas
 * charger côté React Native. Dupliquer cette seule fonction pure est plus
 * simple et plus fiable que d'essayer de faire cohabiter deux bundlers sur
 * un même paquet. Si la règle de formatage change, mettre à jour les DEUX
 * copies.
 * Écart volontaire avec l'autre copie (retour U21) : le dollar a lui aussi une espace entre les milliers
 * (« 1 234.50 $ » et non « 1234.50 $ »), plus lisible à la caisse ; à reporter dans `packages/ui` si le patron valide.
 */
export function formatMontant(montant: number | string, devise: Devise): string {
  const valeur = typeof montant === "string" ? Number(montant) : montant;
  // Mobile : pas de frontière d'erreur par écran, et un rendu qui lève ferme l'application au milieu d'une vente. On affiche « — »
  // (le bureau, lui, garde l'exception : sa frontière d'erreur la montre).
  if (!Number.isFinite(valeur)) return "—";
  if (devise === Devise.CDF) {
    return `${separerMilliers(Math.round(valeur))} FC`;
  }
  const [entier, centimes] = Math.abs(valeur).toFixed(2).split(".");
  const signe = valeur < 0 && Number(`${entier}.${centimes}`) > 0 ? "-" : "";
  return `${signe}${separerMilliers(Number(entier))}.${centimes} $`;
}

function separerMilliers(entier: number): string {
  const signe = entier < 0 ? "-" : "";
  const chiffres = Math.abs(entier).toString();
  const groupes: string[] = [];
  for (let fin = chiffres.length; fin > 0; fin -= 3) {
    groupes.unshift(chiffres.slice(Math.max(0, fin - 3), fin));
  }
  return signe + groupes.join(" ");
}
