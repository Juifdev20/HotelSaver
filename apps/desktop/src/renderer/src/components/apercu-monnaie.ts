import { Devise } from "@hotel-chicago/types";

/**
 * Prévisualisation de la monnaie à rendre à l'encaissement (espèces) — mêmes règles que `calculerEncaissement`
 * (packages/regles, référence côté serveur et hors ligne) : le bureau n'en dépend pas directement, la vraie valeur
 * enregistrée est toujours celle calculée par `Ecritures` / l'API.
 */
export type ApercuMonnaie =
  | { statut: "taux-manquant" }
  | { statut: "insuffisant"; duReglee: number }
  | { statut: "ok"; monnaie: number; deviseMonnaie: Devise };

export function calculerApercuMonnaie(entree: {
  du: number;
  deviseDue: Devise;
  deviseReglee: Devise;
  deviseRendu: Devise;
  regle: number;
  cdfParUsd: number | undefined;
}): ApercuMonnaie {
  const { du, deviseDue, deviseReglee, deviseRendu, regle, cdfParUsd } = entree;
  const croise = deviseReglee !== deviseDue;
  if ((croise || deviseRendu !== deviseReglee) && !cdfParUsd) return { statut: "taux-manquant" };
  const duReglee = croise ? (deviseDue === Devise.USD ? du * cdfParUsd! : du / cdfParUsd!) : du;
  const reste = regle - duReglee;
  if (reste < -0.005) return { statut: "insuffisant", duReglee };
  const monnaieReglee = Math.max(0, reste);
  const monnaieRendue =
    deviseRendu === deviseReglee ? monnaieReglee : deviseReglee === Devise.USD ? monnaieReglee * cdfParUsd! : monnaieReglee / cdfParUsd!;
  return {
    statut: "ok",
    monnaie: deviseRendu === Devise.CDF ? Math.round(monnaieRendue) : Math.round(monnaieRendue * 100) / 100,
    deviseMonnaie: deviseRendu,
  };
}
