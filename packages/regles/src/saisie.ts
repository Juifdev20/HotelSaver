/**
 * Lecture des montants et quantités TAPÉS par une personne (clavier de téléphone ou d'ordinateur).
 * Un seul lecteur pour tous les écrans : avant, chacun faisait son propre `Number(x.replace(",", "."))`, si bien que « 10.000 » (dix mille
 * francs, usage courant) était lu 10 et qu'un taux « 2.800 » devenait 2,8.
 *
 * Règles (devise USD = 2 décimales, CDF = entier) :
 * - espaces, espaces insécables et fines sont ignorés (« 1 000 ») ;
 * - si « . » ET « , » sont présents, le DERNIER est la virgule décimale, l'autre sépare les milliers (« 1.250,50 » ou « 1,250.50 ») ;
 * - un seul séparateur répété (« 1.000.000 ») sépare des milliers ;
 * - un séparateur unique suivi d'EXACTEMENT trois chiffres sépare des milliers (« 10.000 » = 10 000, « 2,800 » = 2 800) ;
 * - sinon c'est une décimale (« 12,5 », « 3.75 ») ; plus de trois chiffres après (« 1.2345 ») est refusé.
 */
export type ResultatSaisie = { ok: true; valeur: number } | { ok: false; message: string };

export type DeviseSaisie = "USD" | "CDF";

const ESPACES = /[\s  ]/g;

function normaliser(saisie: string): { ok: true; texte: string; decimales: number } | { ok: false; message: string } {
  const brut = saisie.replace(ESPACES, "");
  if (brut === "") return { ok: false, message: "Saisissez un montant." };
  if (brut.startsWith("-")) return { ok: false, message: "Le montant ne peut pas être négatif." };
  if (!/^[0-9]+([.,][0-9]+)*$/.test(brut) && !/^[0-9]*[.,][0-9]+$/.test(brut)) return { ok: false, message: "Montant invalide : utilisez uniquement des chiffres (ex. 12,50)." };

  const dernierPoint = brut.lastIndexOf(".");
  const derniereVirgule = brut.lastIndexOf(",");
  const nbPoints = (brut.match(/\./g) ?? []).length;
  const nbVirgules = (brut.match(/,/g) ?? []).length;

  let separateurDecimal: "." | "," | null = null;
  if (nbPoints > 0 && nbVirgules > 0) {
    separateurDecimal = dernierPoint > derniereVirgule ? "." : ",";
  } else if (nbPoints + nbVirgules === 1) {
    const sep = nbPoints === 1 ? "." : ",";
    const apres = brut.length - 1 - brut.indexOf(sep);
    const avant = brut.slice(0, brut.indexOf(sep));
    // exactement trois chiffres derrière, et quelque chose de non nul devant : séparateur de milliers
    separateurDecimal = apres === 3 && avant !== "" && Number(avant) > 0 ? null : sep;
  } // plusieurs du même : milliers

  let entiere = brut;
  let decimale = "";
  if (separateurDecimal) {
    const i = brut.lastIndexOf(separateurDecimal);
    entiere = brut.slice(0, i);
    decimale = brut.slice(i + 1);
  }
  const autre = separateurDecimal === "." ? "," : ".";
  // Dans la partie entière, tout séparateur restant est un séparateur de milliers : il doit former des groupes de trois chiffres.
  const groupes = entiere.split(/[.,]/);
  if (groupes.length > 1 && !groupes.slice(1).every((g) => g.length === 3)) return { ok: false, message: "Montant invalide : vérifiez les séparateurs." };
  if (separateurDecimal && entiere.includes(separateurDecimal)) return { ok: false, message: "Montant invalide : une seule virgule décimale." };
  void autre;
  if (decimale.length > 3) return { ok: false, message: "Trop de chiffres après la virgule." };
  return { ok: true, texte: `${groupes.join("") || "0"}${decimale ? `.${decimale}` : ""}`, decimales: decimale.length };
}

/** Montant d'argent strictement positif (ou nul si `autoriserZero`) dans la devise donnée. */
export function lireMontant(saisie: string, devise: DeviseSaisie, options: { autoriserZero?: boolean; max?: number } = {}): ResultatSaisie {
  const n = normaliser(saisie);
  if (!n.ok) return n;
  const valeur = Number(n.texte);
  if (!Number.isFinite(valeur)) return { ok: false, message: "Montant invalide." };
  if (devise === "CDF" && !Number.isInteger(valeur)) return { ok: false, message: "Le franc congolais n'a pas de centimes : saisissez un nombre entier." };
  if (devise === "USD" && Math.abs(Math.round(valeur * 100) - valeur * 100) > 1e-6) return { ok: false, message: "Un montant en dollars a au plus deux chiffres après la virgule." };
  if (valeur === 0 && !options.autoriserZero) return { ok: false, message: "Le montant doit être supérieur à zéro." };
  if (options.max !== undefined && valeur > options.max) return { ok: false, message: "Ce montant est trop élevé : vérifiez la saisie." };
  return { ok: true, valeur };
}

/** Quantité (articles, litres, kilos) : « . » ou « , » décimal, jusqu'à trois décimales, jamais de séparateur de milliers. */
export function lireQuantite(saisie: string, options: { entier?: boolean; autoriserZero?: boolean; max?: number } = {}): ResultatSaisie {
  const brut = saisie.replace(ESPACES, "").replace(",", ".");
  if (brut === "") return { ok: false, message: "Saisissez une quantité." };
  if (brut.startsWith("-")) return { ok: false, message: "La quantité ne peut pas être négative." };
  if (!/^[0-9]+(\.[0-9]{1,3})?$/.test(brut)) return { ok: false, message: "Quantité invalide : utilisez des chiffres (ex. 2 ou 1,5)." };
  const valeur = Number(brut);
  if (options.entier && !Number.isInteger(valeur)) return { ok: false, message: "La quantité doit être un nombre entier." };
  if (valeur === 0 && !options.autoriserZero) return { ok: false, message: "La quantité doit être supérieure à zéro." };
  if (options.max !== undefined && valeur > options.max) return { ok: false, message: "Cette quantité est trop élevée : vérifiez la saisie." };
  return { ok: true, valeur };
}

/** Bornes plausibles d'un taux (francs congolais pour 1 dollar) : au-delà, c'est presque sûrement une faute de frappe. */
export const TAUX_CDF_PAR_USD_MIN = 500;
export const TAUX_CDF_PAR_USD_MAX = 20000;

export function lireTauxChange(saisie: string): ResultatSaisie {
  const r = lireMontant(saisie, "USD");
  if (!r.ok) return r;
  if (r.valeur < TAUX_CDF_PAR_USD_MIN || r.valeur > TAUX_CDF_PAR_USD_MAX) {
    return { ok: false, message: `Le taux doit être compris entre ${TAUX_CDF_PAR_USD_MIN} et ${TAUX_CDF_PAR_USD_MAX} FC pour 1 $ (vous avez saisi ${r.valeur}).` };
  }
  return r;
}
