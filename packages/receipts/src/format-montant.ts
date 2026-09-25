import { Devise } from "@hotel-chicago/types";

/**
 * Troisième copie de cette fonction pure (les deux autres : `packages/ui/src/format-montant.ts`
 * et `apps/mobile/src/formatMontant.ts`) — `packages/receipts` ne peut pas
 * dépendre de `packages/ui` (imports `.css` en effet de bord, incompatibles
 * avec Metro) ni d'une app. Même règles (section 9.4/11.3) : si elles
 * changent, mettre à jour les TROIS copies.
 */
export function formatMontant(montant: number | string, devise: Devise): string {
  const valeur = typeof montant === "string" ? Number(montant) : montant;
  if (Number.isNaN(valeur)) {
    throw new Error(`formatMontant: montant invalide (${JSON.stringify(montant)}).`);
  }
  if (devise === Devise.CDF) {
    return `${separerMilliers(Math.round(valeur))} FC`;
  }
  return `${valeur.toFixed(2)} $`;
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
