import { BadRequestException } from "@nestjs/common";
import { Devise } from "@hotel-chicago/database";

/**
 * Calcule la monnaie à rendre lors d'un encaissement, y compris le cas du
 * paiement croisé (section 9.4) : le client règle une note dans une devise
 * avec des espèces de l'autre. Fonction pure, testée isolément.
 */

export interface EncaissementInput {
  /** Montant réellement dû, dans la devise d'origine de la note (montantDu > 0). */
  montantDu: number;
  deviseDue: Devise;
  /** Devise effectivement remise par le client (absent = paiement exact, pas de calcul). */
  deviseRegleeParClient?: Devise;
  montantRegleParClient?: number;
  /** Devise dans laquelle le caissier choisit de rendre la monnaie (défaut : celle du règlement). */
  deviseRenduChoisie?: Devise;
  /** Taux du jour (1 USD = cdfParUsd CDF), requis dès qu'une conversion est nécessaire. */
  cdfParUsd?: number;
}

export interface EncaissementResult {
  deviseMonnaieRendue?: Devise;
  montantMonnaieRendue?: number;
  tauxChangeApplique?: number;
}

function arrondir(montant: number, devise: Devise): number {
  return devise === Devise.CDF ? Math.round(montant) : Math.round(montant * 100) / 100;
}

function convertir(montant: number, de: Devise, vers: Devise, cdfParUsd: number): number {
  if (de === vers) return montant;
  return de === Devise.USD ? montant * cdfParUsd : montant / cdfParUsd;
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
    throw new BadRequestException(
      "Aucun taux de change n'a été défini par le patron : impossible de calculer un paiement croisé."
    );
  }

  const montantDuDansDeviseReglee = conversionNecessaire
    ? convertir(montantDu, deviseDue, deviseRegleeParClient, input.cdfParUsd!)
    : montantDu;

  if (montantRegleParClient < montantDuDansDeviseReglee) {
    throw new BadRequestException(
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
