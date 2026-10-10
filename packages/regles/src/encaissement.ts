/**
 * Calcule la monnaie à rendre lors d'un encaissement, y compris le cas du paiement croisé (section 9.4) : le client règle
 * une note dans une devise avec des espèces de l'autre. Fonction pure, utilisée par l'API (qui la transforme en erreur HTTP 400)
 * ET par les applications hors ligne (qui l'affichent à la caisse) : le même calcul des deux côtés, jamais deux versions.
 */

export type DeviseRegle = "USD" | "CDF";

/** Règle métier non respectée (montant insuffisant, taux manquant…). Message en français, affichable tel quel. */
export class ErreurRegle extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErreurRegle";
  }
}

export interface EncaissementInput {
  /** Montant réellement dû, dans la devise d'origine de la note (montantDu > 0). */
  montantDu: number;
  deviseDue: DeviseRegle;
  /** Devise effectivement remise par le client (absent = paiement exact, pas de calcul). */
  deviseRegleeParClient?: DeviseRegle;
  montantRegleParClient?: number;
  /** Devise dans laquelle le caissier choisit de rendre la monnaie (défaut : celle du règlement). */
  deviseRenduChoisie?: DeviseRegle;
  /** Taux du jour (1 USD = cdfParUsd CDF), requis dès qu'une conversion est nécessaire. */
  cdfParUsd?: number;
}

export interface EncaissementResult {
  deviseMonnaieRendue?: DeviseRegle;
  montantMonnaieRendue?: number;
  tauxChangeApplique?: number;
}

export function arrondir(montant: number, devise: DeviseRegle): number {
  return devise === "CDF" ? Math.round(montant) : Math.round(montant * 100) / 100;
}

export function convertir(montant: number, de: DeviseRegle, vers: DeviseRegle, cdfParUsd: number): number {
  if (de === vers) return montant;
  return de === "USD" ? montant * cdfParUsd : montant / cdfParUsd;
}

export function calculerEncaissement(input: EncaissementInput): EncaissementResult {
  const { montantDu, deviseDue, deviseRegleeParClient, montantRegleParClient, deviseRenduChoisie } = input;

  // Paiement "exact" (mode CASH/MOBILE_MONEY/FACTURE_CHAMBRE sans détail de billets remis) :
  // rien à calculer, le caissier n'a pas déclaré de paiement croisé.
  if (deviseRegleeParClient === undefined || montantRegleParClient === undefined) {
    return {};
  }

  const conversionNecessaire = deviseRegleeParClient !== deviseDue;
  if (conversionNecessaire && !input.cdfParUsd) {
    throw new ErreurRegle("Aucun taux de change n'a été défini par le patron : impossible de calculer un paiement croisé.");
  }

  const montantDuDansDeviseReglee = conversionNecessaire
    ? convertir(montantDu, deviseDue, deviseRegleeParClient, input.cdfParUsd!)
    : montantDu;

  if (montantRegleParClient < montantDuDansDeviseReglee) {
    throw new ErreurRegle(
      `Montant remis insuffisant : ${montantRegleParClient} ${deviseRegleeParClient} pour un dû de ` +
        `${arrondir(montantDuDansDeviseReglee, deviseRegleeParClient)} ${deviseRegleeParClient}.`
    );
  }

  const monnaieDansDeviseReglee = montantRegleParClient - montantDuDansDeviseReglee;
  const deviseMonnaieRendue = deviseRenduChoisie ?? deviseRegleeParClient;

  const montantMonnaieRendue =
    deviseMonnaieRendue === deviseRegleeParClient
      ? arrondir(monnaieDansDeviseReglee, deviseMonnaieRendue)
      : arrondir(convertir(monnaieDansDeviseReglee, deviseRegleeParClient, deviseMonnaieRendue, input.cdfParUsd!), deviseMonnaieRendue);

  return {
    deviseMonnaieRendue,
    montantMonnaieRendue,
    tauxChangeApplique: conversionNecessaire || deviseMonnaieRendue !== deviseRegleeParClient ? input.cdfParUsd : undefined,
  };
}
