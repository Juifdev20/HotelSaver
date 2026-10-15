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

/** Ce que coûte un paiement, selon qui porte la commission ScanLinkPay (règles du super admin ScanLinkPay, par devise). */
export interface FraisPaiement {
  modele: ModeleCommission;
  montantCentimes: number;
  /** Commission ScanLinkPay. */
  commissionCentimes: number;
  /** Coût estimé du fournisseur de paiement (supporté par le marchand). */
  fraisFournisseurCentimes: number;
  /** Ce que le payeur débourse (montant + sa part de commission). */
  totalCentimes: number;
  /** Ce que le marchand reçoit une fois les frais retirés. */
  netCentimes: number;
}

/** MARCHAND = le marchand supporte la commission ; CLIENT = le payeur la paie en plus ; PARTAGE = moitié-moitié. */
export type ModeleCommission = "MERCHANT_PAID" | "CUSTOMER_PAID" | "SHARED";

export interface DemandeCreee {
  linkToken: string;
  reference: string;
  frais: FraisPaiement | null;
}

export interface PaiementLance {
  referenceFournisseur: string;
  /** Moyen « carte » : la page de paiement du fournisseur où envoyer le client. */
  urlPaiement: string | null;
  totalCentimes: number | null;
}

export interface StatutPaiement {
  statut: "SUCCESS" | "FAILED" | "PENDING";
  montantCentimes: number | null;
  devise: string | null;
  totalCentimes: number | null;
}

/** Le marchand qui encaisse : par défaut le compte de la PLATEFORME (abonnements) ; pour un acompte, le compte de l'hôtel. */
export interface Marchand {
  numero: string;
  /** Nécessaire seulement si l'entreprise a plusieurs boutiques. */
  boutiqueId?: string | null;
}

const DELAI_MS = 20_000;

@Injectable()
export class LinkPayClient {
  private readonly logger = new Logger(LinkPayClient.name);

  /** Le serveur sait joindre ScanLinkPay (adresse valide, https hors développement) : suffisant pour encaisser pour le compte d'un HÔTEL. */
  adresseConfiguree(): boolean {
    return this.adresse() !== null;
  }

  /** Configuré pour les ABONNEMENTS = adresse de l'API ET numéro du compte marchand de la plateforme. */
  estConfigure(): boolean {
    return this.adresse() !== null && this.numeroMarchand() !== null;
  }

  /** Le compte marchand de la plateforme (abonnements). */
  marchandPlateforme(): Marchand | null {
    const numero = this.numeroMarchand();
    return numero ? { numero } : null;
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

  /** Montre les frais d'un paiement vers ce marchand SANS rien créer ; renvoie aussi le nom de l'entreprise (pour que le patron vérifie son numéro). */
  async apercuFrais(p: { marchand: Marchand; montantCentimes: number; devise: "USD" | "CDF"; modele: ModeleCommission }): Promise<{ entreprise: string | null; frais: FraisPaiement }> {
    const params = new URLSearchParams({
      scanlinkpay_number: p.marchand.numero,
      amount_cents: String(p.montantCentimes),
      currency: p.devise,
      commission_model: p.modele,
    });
    if (p.marchand.boutiqueId) params.set("merchant_id", p.marchand.boutiqueId);
    const corps = await this.appeler("GET", `/payment-requests/fees-preview?${params.toString()}`);
    const frais = versFrais(corps, p.modele, p.montantCentimes);
    if (!frais) throw new ErreurLinkPay(502, "Réponse inattendue du service de paiement.");
    return { entreprise: chaine(corps?.business), frais };
  }

  async creerDemande(p: { marchand?: Marchand; montantCentimes: number; devise: "USD" | "CDF"; modele?: ModeleCommission; description?: string; expireMinutes?: number }): Promise<DemandeCreee> {
    const marchand = p.marchand ?? this.marchandPlateforme();
    if (!marchand) throw new ErreurLinkPay(503, "Le paiement en ligne n'est pas configuré sur ce serveur.");
    const corps = await this.appeler("POST", "/payment-requests/quick-pay", {
      scanlinkpay_number: marchand.numero,
      merchant_id: marchand.boutiqueId || undefined,
      amount_cents: p.montantCentimes,
      currency: p.devise,
      commission_model: p.modele,
      description: p.description,
      expires_in_minutes: p.expireMinutes,
    });
    const linkToken = chaine(corps?.link_token);
    const reference = chaine(corps?.reference);
    // Garde-fou : ScanLinkPay doit nous renvoyer EXACTEMENT ce que nous avons demandé.
    if (!linkToken || !reference || Number(corps?.amount_cents) !== p.montantCentimes || corps?.currency !== p.devise) {
      this.logger.error(`Réponse inattendue de ScanLinkPay à quick-pay (${JSON.stringify({ reference, devise: corps?.currency, montant: corps?.amount_cents })})`);
      throw new ErreurLinkPay(502, "Réponse inattendue du service de paiement.");
    }
    return { linkToken, reference, frais: versFrais(corps?.fees, p.modele ?? "MERCHANT_PAID", p.montantCentimes) };
  }

  async lancerPaiement(p: { linkToken: string; cleIdempotence: string; moyen?: "mobile_money" | "card"; telephone?: string; operateur?: OperateurMobileMoney; nom?: string; email?: string }): Promise<PaiementLance> {
    const mobile = (p.moyen ?? "mobile_money") === "mobile_money";
    const corps = await this.appeler(
      "POST",
      "/payments",
      {
        link_token: p.linkToken,
        customer_phone: p.telephone,
        customer_name: p.nom,
        customer_email: p.email,
        payment_method: mobile ? "mobile_money" : "card",
        mobile_money_operator: mobile && p.operateur ? OPERATEURS_MOBILE_MONEY[p.operateur].idScanLinkPay : undefined,
      },
      { "Idempotency-Key": p.cleIdempotence }
    );
    const referenceFournisseur = chaine(corps?.psp_intent_id);
    if (!referenceFournisseur) {
      this.logger.error("ScanLinkPay n'a pas renvoyé d'identifiant de paiement (psp_intent_id).");
      throw new ErreurLinkPay(502, "Réponse inattendue du service de paiement.");
    }
    const url = chaine(corps?.checkout_url);
    // Une page de paiement venue d'ailleurs que de https n'est jamais proposée au client.
    const urlSure = url && /^https:\/\//i.test(url) ? url : null;
    if (!mobile && !urlSure) {
      this.logger.error("ScanLinkPay n'a pas renvoyé de page de paiement par carte exploitable.");
      throw new ErreurLinkPay(502, "Le paiement par carte n'est pas disponible pour le moment.");
    }
    const total = Number(corps?.total_cents);
    return { referenceFournisseur, urlPaiement: urlSure, totalCentimes: Number.isFinite(total) ? total : null };
  }

  async lireStatut(referenceFournisseur: string): Promise<StatutPaiement> {
    const corps = await this.appeler("GET", `/payments/status/${encodeURIComponent(referenceFournisseur)}`);
    const statut = corps?.status === "SUCCESS" || corps?.status === "FAILED" ? corps.status : "PENDING";
    const montant = Number(corps?.amount_cents);
    const total = Number(corps?.total_cents);
    return { statut, montantCentimes: Number.isFinite(montant) ? montant : null, devise: chaine(corps?.currency), totalCentimes: Number.isFinite(total) ? total : null };
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
      if (reponse.status === 404 && /^Cannot (GET|POST)/i.test(message)) {
        this.logger.error(`ScanLinkPay ne connaît pas la route ${methode} ${chemin} : sa version déployée est trop ancienne — déployez la dernière version de ScanLinkPay.`);
        throw new ErreurLinkPay(501, "Le service de paiement doit être mis à jour.");
      }
      if (reponse.status === 400 && /should not exist/i.test(message)) {
        this.logger.error(`ScanLinkPay refuse un champ envoyé (${message.slice(0, 120)}) : sa version déployée est trop ancienne — déployez la dernière version de ScanLinkPay.`);
      }
      const affichable = [400, 403, 404].includes(reponse.status) && /[àâçéèêîôùûï]|ScanLinkPay|num[ée]ro|boutique|t[ée]l[ée]phone/i.test(message) && !/should not exist|must be|Idempotency/i.test(message);
      if (!affichable) this.logger.warn(`ScanLinkPay a répondu ${reponse.status} à ${methode} ${chemin} : ${message.slice(0, 200)}`);
      throw new ErreurLinkPay(reponse.status, affichable ? message : "Le service de paiement est momentanément indisponible. Réessayez dans un instant.", affichable);
    }
    return json;
  }
}

/** Lit l'objet `fees` de ScanLinkPay ; null s'il manque ou s'il est incohérent (le montant ne doit jamais changer en route). */
function versFrais(brut: any, modele: ModeleCommission, montantCentimes: number): FraisPaiement | null {
  if (!brut || typeof brut !== "object") return null;
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);
  const commission = n(brut.platform_fee_cents);
  const fournisseur = n(brut.psp_fee_cents);
  const total = n(brut.total_cents);
  const net = n(brut.net_cents);
  if (commission === null || fournisseur === null || total === null || net === null || Number(brut.amount_cents) !== montantCentimes) return null;
  return { modele, montantCentimes, commissionCentimes: commission, fraisFournisseurCentimes: fournisseur, totalCentimes: total, netCentimes: net };
}

function chaine(valeur: unknown): string | null {
  return typeof valeur === "string" && valeur.length > 0 && valeur.length <= 200 ? valeur : null;
}
