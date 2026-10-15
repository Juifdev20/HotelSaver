/**
 * Numéros Mobile Money de la RDC : +243 puis 9 chiffres ; les deux premiers désignent le réseau (pas de portabilité des numéros).
 * Même table que ScanLinkPay (linkpay-api/src/payments/mobile-money.ts) : un numéro refusé ici le serait là-bas. Un préfixe INCONNU
 * n'est pas refusé — le fournisseur de paiement reste juge, une table incomplète ne doit pas bloquer de vrais clients.
 */
import type { OperateurMobileMoney } from "@hotel-chicago/types";

export const OPERATEURS_MOBILE_MONEY: Record<OperateurMobileMoney, { libelle: string; prefixes: string[]; idScanLinkPay: "vodacom" | "orange" | "airtel" | "africell" }> = {
  VODACOM: { libelle: "M-Pesa (Vodacom)", prefixes: ["81", "82", "83"], idScanLinkPay: "vodacom" },
  ORANGE: { libelle: "Orange Money", prefixes: ["80", "84", "85", "89"], idScanLinkPay: "orange" },
  AIRTEL: { libelle: "Airtel Money", prefixes: ["97", "98", "99"], idScanLinkPay: "airtel" },
  AFRICELL: { libelle: "Africell Money", prefixes: ["90", "91"], idScanLinkPay: "africell" },
};

export const LISTE_OPERATEURS = Object.keys(OPERATEURS_MOBILE_MONEY) as OperateurMobileMoney[];

/** « +243 828 497 218 », « 0828497218 », « 243828497218 », « 828497218 », « 00243… » → « 828497218 » (9 chiffres) ou null. */
export function numeroNational(telephone: unknown): string | null {
  let d = String(telephone ?? "").replace(/[\s().-]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  if (!/^\d+$/.test(d)) return null;
  if (d.startsWith("00243")) d = d.slice(5);
  else if (d.startsWith("243") && d.length === 12) d = d.slice(3);
  else if (d.startsWith("0") && d.length === 10) d = d.slice(1);
  return /^[89]\d{8}$/.test(d) ? d : null;
}

/** Forme internationale attendue par le fournisseur (« +243828497218 »), ou null si le numéro est invalide. */
export function numeroInternational(telephone: unknown): string | null {
  const n = numeroNational(telephone);
  return n ? `+243${n}` : null;
}

/** Le réseau d'un numéro, ou null quand son préfixe n'est pas dans la table. */
export function operateurDuNumero(telephone: unknown): OperateurMobileMoney | null {
  const n = numeroNational(telephone);
  if (!n) return null;
  const prefixe = n.slice(0, 2);
  for (const [id, op] of Object.entries(OPERATEURS_MOBILE_MONEY)) if (op.prefixes.includes(prefixe)) return id as OperateurMobileMoney;
  return null;
}

/** Message d'erreur en français si le numéro est invalide ou clairement d'un autre réseau que celui choisi ; null si tout va bien. */
export function problemeNumero(operateur: OperateurMobileMoney | null | undefined, telephone: unknown): string | null {
  if (numeroNational(telephone) === null) return "Numéro de téléphone invalide. Exemple : 0828 497 218 ou +243 828 497 218.";
  const choisi = operateur ? OPERATEURS_MOBILE_MONEY[operateur] : undefined;
  if (!choisi) return null;
  const reel = operateurDuNumero(telephone);
  if (reel && reel !== operateur) {
    return `Ce numéro est un numéro ${OPERATEURS_MOBILE_MONEY[reel].libelle}, pas ${choisi.libelle}. Choisissez ${OPERATEURS_MOBILE_MONEY[reel].libelle} ou saisissez un numéro ${choisi.libelle}.`;
  }
  return null;
}

/** « +243 82• ••• •18 » : assez pour reconnaître son numéro, pas pour le réutiliser. */
export function masquerNumero(telephone: unknown): string {
  const n = numeroNational(telephone);
  if (!n) return "••••";
  return `+243 ${n.slice(0, 2)}• ••• •${n.slice(-2)}`;
}
