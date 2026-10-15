import { createServer, Server } from "node:http";
import type { AddressInfo } from "node:net";
import { uuid } from "./donnees";

/** Faux ScanLinkPay : mêmes routes publiques que le vrai (quick-pay, payments, payments/status), états pilotables par le test. */
export interface FauxPaiement { reference: string; montantCentimes: number; devise: string; statut: "SUCCESS" | "FAILED" | "PENDING"; telephone?: string; operateur?: string; cle?: string; montantAnnonce?: number; moyen?: string; totalCentimes?: number; numero?: string; description?: string; modele?: string }

/** Commission du faux ScanLinkPay : 2 % (la sienne) et 1,5 % de frais du fournisseur, comme le vrai calcul le ferait avec une règle à 2 %. */
export function fraisFaux(amount: number, modele = "MERCHANT_PAID") {
  const platform = Math.floor(amount * 0.02);
  const psp = Math.floor(amount * 0.015);
  const total = modele === "CUSTOMER_PAID" ? amount + platform : modele === "SHARED" ? amount + (platform - Math.floor(platform / 2)) : amount;
  const net = modele === "CUSTOMER_PAID" ? amount - psp : modele === "SHARED" ? amount - psp - Math.floor(platform / 2) : amount - psp - platform;
  return { commission_model: modele, amount_cents: amount, platform_fee_cents: platform, psp_fee_cents: psp, total_cents: total, net_cents: net };
}
export class FauxLinkPay {
  server!: Server;
  url = "";
  demandes = new Map<string, { reference: string; montantCentimes: number; devise: string; modele: string; numero: string; description: string }>();
  /** Numéros ScanLinkPay connus (autres que celui de la plateforme) : un acompte est encaissé par l'hôtel qui possède le numéro. */
  numerosConnus = new Map<string, string>([["SLP-TEST01", "HotelSaver"]]);
  paiements = new Map<string, FauxPaiement>();
  parCle = new Map<string, string>();
  appels: string[] = [];
  /** Réponse forcée pour la prochaine création de paiement (ex. refus de validation de ScanLinkPay). */
  refusProchainPaiement: { statut: number; message: string; fois?: number } | null = null;

  async demarrer() {
    this.server = createServer((req, res) => {
      const morceaux: Buffer[] = [];
      req.on("data", (c) => morceaux.push(c));
      req.on("end", () => {
        const corps = morceaux.length ? JSON.parse(Buffer.concat(morceaux).toString()) : {};
        const envoyer = (code: number, json: unknown) => {
          res.writeHead(code, { "Content-Type": "application/json" });
          res.end(JSON.stringify(json));
        };
        this.appels.push(`${req.method} ${req.url}`);
        if (req.method === "GET" && req.url?.startsWith("/payment-requests/fees-preview")) {
          const q = new URL(req.url, "http://x").searchParams;
          const numero = q.get("scanlinkpay_number") ?? "";
          if (!this.numerosConnus.has(numero)) return envoyer(404, { message: "Numéro ScanLinkPay introuvable" });
          const montant = Number(q.get("amount_cents"));
          return envoyer(200, { business: this.numerosConnus.get(numero), currency: q.get("currency"), ...fraisFaux(montant, q.get("commission_model") ?? "MERCHANT_PAID") });
        }
        if (req.method === "POST" && req.url === "/payment-requests/quick-pay") {
          if (!this.numerosConnus.has(corps.scanlinkpay_number)) return envoyer(404, { message: "Numéro ScanLinkPay introuvable" });
          const token = uuid().replace(/-/g, "");
          const reference = `PR-${token.slice(0, 8)}`;
          const modele = corps.commission_model ?? "MERCHANT_PAID";
          this.demandes.set(token, { reference, montantCentimes: corps.amount_cents, devise: corps.currency, modele, numero: corps.scanlinkpay_number, description: corps.description ?? "" });
          return envoyer(201, { reference, link_token: token, amount_cents: corps.amount_cents, currency: corps.currency, status: "CREATED", fees: fraisFaux(corps.amount_cents, modele) });
        }
        if (req.method === "POST" && req.url === "/payments") {
          if (this.refusProchainPaiement) {
            const r = this.refusProchainPaiement;
            if (--r.fois! <= 0) this.refusProchainPaiement = null;
            return envoyer(r.statut, { message: r.message });
          }
          const cle = String(req.headers["idempotency-key"] ?? "");
          if (!cle) return envoyer(400, { message: "Idempotency-Key header is required" });
          const existante = this.parCle.get(cle);
          if (existante) return envoyer(201, { payment_intent_id: "pi", psp_intent_id: existante, status: "PENDING", message: "Payment intent already exists (idempotent)" });
          const demande = this.demandes.get(corps.link_token);
          if (!demande) return envoyer(404, { message: "Payment request not found" });
          const reference = `FP-${uuid().slice(0, 8)}`;
          const f = fraisFaux(demande.montantCentimes, demande.modele);
          this.paiements.set(reference, { reference, montantCentimes: demande.montantCentimes, devise: demande.devise, statut: "PENDING", telephone: corps.customer_phone, operateur: corps.mobile_money_operator, cle, moyen: corps.payment_method, totalCentimes: f.total_cents, numero: demande.numero, description: demande.description, modele: demande.modele });
          this.parCle.set(cle, reference);
          return envoyer(201, {
            payment_intent_id: "pi",
            psp_intent_id: reference,
            status: "PENDING",
            checkout_url: corps.payment_method === "card" ? `https://pay.exemple.test/checkout/${reference}` : undefined,
            fees_cents: f.total_cents - demande.montantCentimes,
            total_cents: f.total_cents,
          });
        }
        const m = /^\/payments\/status\/(.+)$/.exec(req.url ?? "");
        if (req.method === "GET" && m) {
          const paiement = this.paiements.get(decodeURIComponent(m[1]));
          if (!paiement) return envoyer(404, { message: "Référence de paiement introuvable" });
          return envoyer(200, { reference: paiement.reference, status: paiement.statut, amount_cents: paiement.montantAnnonce ?? paiement.montantCentimes, currency: paiement.devise, total_cents: paiement.totalCentimes, fees_cents: (paiement.totalCentimes ?? paiement.montantCentimes) - paiement.montantCentimes });
        }
        envoyer(404, { message: "?" });
      });
    });
    await new Promise<void>((ok) => this.server.listen(0, "127.0.0.1", ok));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  dernier(): FauxPaiement {
    return [...this.paiements.values()].pop()!;
  }

  arreter() {
    return new Promise<void>((ok) => this.server.close(() => ok()));
  }
}
