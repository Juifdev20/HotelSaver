import { Injectable, Logger } from "@nestjs/common";
import type { OperateurMobileMoney } from "@hotel-chicago/types";
import { OPERATEURS_MOBILE_MONEY } from "@hotel-chicago/regles";

/**
 * Passerelle vers ScanLinkPay (l'autre produit de la plateforme), qui déclenche le débit Mobile Money (M-Pesa, Airtel Money, Orange Money…)
 * et crédite le compte marchand HotelSaver. On n'utilise QUE les routes publiques de ScanLinkPay — aucune clé de fournisseur de paiement
 * n'est connue de ce serveur, et l'argent ne passe jamais par les identifiants marchands de ScanLinkPay lui-même :
 *
 *   1. POST /payment-requests/quick-pay   (numéro ScanLinkPay + montant)  → une demande de paiement chez le marchand HotelSaver
 *   2. POST /payments                     (jeton de la demande + téléphone + réseau, en-tête Idempotency-Key) → le téléphone du patron reçoit la demande de confirmation
 *   3. GET  /payments/status/:reference   → SUCCESS / FAILED / PENDING (ScanLinkPay revérifie auprès de son fournisseur)
 *
 * Configuration (variables d'environnement du serveur HotelSaver) :
 *   LINKPAY_API_URL           ex. https://linkpay-api.onrender.com/api/v1
 *   LINKPAY_NUMERO_MARCHAND   le numéro ScanLinkPay du compte marchand HotelSaver (ex. SLP-000123)
 * Sans l'une des deux, le paiement en ligne est simplement indisponible (l'enregistrement à la main par le support reste possible).
 */
export class ErreurLinkPay extends Error {
  constructor(
    /** 0 = aucune réponse (réseau, délai dépassé). */
    public readonly statut: number,
    message: string,
    /** true = message écrit par ScanLinkPay pour l'utilisateur (ex. « Numéro de téléphone invalide… »), affichable tel quel. */
    public readonly affichable = false
  ) {
    super(message);
    this.name = "ErreurLinkPay";
  }
}

export interface DemandeCreee {
  linkToken: string;
  reference: string;
}

export interface PaiementLance {
  referenceFournisseur: string;
}

export interface StatutPaiement {
  statut: "SUCCESS" | "FAILED" | "PENDING";
  montantCentimes: number | null;
  devise: string | null;
}

const DELAI_MS = 20_000;

@Injectable()
export class LinkPayClient {
  private readonly logger = new Logger(LinkPayClient.name);

  /** Configuré = adresse de l'API ET numéro marchand présents (et l'adresse en https hors développement). */
  estConfigure(): boolean {
    return this.adresse() !== null && this.numeroMarchand() !== null;
  }

  private adresse(): string | null {
    const brut = (process.env.LINKPAY_API_URL ?? "").trim().replace(/\/+$/, "");
    if (!brut) return null;
    if (!/^https:\/\//i.test(brut) && !(process.env.NODE_ENV !== "production" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(brut))) {
      this.logger.error("LINKPAY_API_URL doit être une adresse https:// (http:// n'est toléré qu'en local) : paiement en ligne désactivé.");
      return null;
    }
    return brut;
  }

  private numeroMarchand(): string | null {
    const n = (process.env.LINKPAY_NUMERO_MARCHAND ?? "").trim();
    return /^[A-Za-z0-9-]{3,40}$/.test(n) ? n : null;
  }

  async creerDemande(p: { montantCentimes: number; devise: "USD" | "CDF" }): Promise<DemandeCreee> {
    const corps = await this.appeler("POST", "/payment-requests/quick-pay", {
      scanlinkpay_number: this.numeroMarchand(),
      amount_cents: p.montantCentimes,
      currency: p.devise,
    });
    const linkToken = chaine(corps?.link_token);
    const reference = chaine(corps?.reference);
    // Garde-fou : ScanLinkPay doit nous renvoyer EXACTEMENT ce que nous avons demandé.
    if (!linkToken || !reference || Number(corps?.amount_cents) !== p.montantCentimes || corps?.currency !== p.devise) {
      this.logger.error(`Réponse inattendue de ScanLinkPay à quick-pay (${JSON.stringify({ reference, devise: corps?.currency, montant: corps?.amount_cents })})`);
      throw new ErreurLinkPay(502, "Réponse inattendue du service de paiement.");
    }
    return { linkToken, reference };
  }

  async lancerPaiement(p: { linkToken: string; cleIdempotence: string; telephone: string; operateur: OperateurMobileMoney; nom?: string }): Promise<PaiementLance> {
    const corps = await this.appeler(
      "POST",
      "/payments",
      {
        link_token: p.linkToken,
        customer_phone: p.telephone,
        customer_name: p.nom,
        payment_method: "mobile_money",
        mobile_money_operator: OPERATEURS_MOBILE_MONEY[p.operateur].idScanLinkPay,
      },
      { "Idempotency-Key": p.cleIdempotence }
    );
    const referenceFournisseur = chaine(corps?.psp_intent_id);
    if (!referenceFournisseur) {
      this.logger.error("ScanLinkPay n'a pas renvoyé d'identifiant de paiement (psp_intent_id).");
      throw new ErreurLinkPay(502, "Réponse inattendue du service de paiement.");
    }
    return { referenceFournisseur };
  }

  async lireStatut(referenceFournisseur: string): Promise<StatutPaiement> {
    const corps = await this.appeler("GET", `/payments/status/${encodeURIComponent(referenceFournisseur)}`);
    const statut = corps?.status === "SUCCESS" || corps?.status === "FAILED" ? corps.status : "PENDING";
    const montant = Number(corps?.amount_cents);
    return { statut, montantCentimes: Number.isFinite(montant) ? montant : null, devise: chaine(corps?.currency) };
  }

  private async appeler(methode: "GET" | "POST", chemin: string, corps?: Record<string, unknown>, entetes: Record<string, string> = {}): Promise<Record<string, any> | null> {
    const base = this.adresse();
    if (!base || !this.numeroMarchand()) throw new ErreurLinkPay(503, "Le paiement en ligne n'est pas configuré sur ce serveur.");
    let reponse: Response;
    try {
      reponse = await fetch(`${base}${chemin}`, {
        method: methode,
        redirect: "error",
        signal: AbortSignal.timeout(DELAI_MS),
        headers: { Accept: "application/json", ...(corps ? { "Content-Type": "application/json" } : {}), ...entetes },
        body: corps ? JSON.stringify(corps) : undefined,
      });
    } catch (e) {
      this.logger.warn(`ScanLinkPay injoignable (${methode} ${chemin}) : ${(e as Error).message}`);
      throw new ErreurLinkPay(0, "Le service de paiement ne répond pas. Réessayez dans un instant.");
    }
    const json = (await reponse.json().catch(() => null)) as Record<string, any> | null;
    if (!reponse.ok) {
      const message = Array.isArray(json?.message) ? json?.message.join(" ") : typeof json?.message === "string" ? json.message : "";
      // Les refus de validation de ScanLinkPay (numéro invalide, mauvais réseau…) sont déjà écrits pour l'utilisateur ; le reste est technique.
      const affichable = reponse.status === 400 && /[àâçéèêîôùû]|num[ée]ro|t[ée]l[ée]phone/i.test(message);
      if (!affichable) this.logger.warn(`ScanLinkPay a répondu ${reponse.status} à ${methode} ${chemin} : ${message.slice(0, 200)}`);
      throw new ErreurLinkPay(reponse.status, affichable ? message : "Le service de paiement est momentanément indisponible. Réessayez dans un instant.", affichable);
    }
    return json;
  }
}

function chaine(valeur: unknown): string | null {
  return typeof valeur === "string" && valeur.length > 0 && valeur.length <= 200 ? valeur : null;
}
