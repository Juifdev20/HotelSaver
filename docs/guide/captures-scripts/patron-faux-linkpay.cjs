/**
 * Faux ScanLinkPay pour les captures du guide « patron » (abonnement et acomptes) : mêmes routes publiques que le vrai.
 *   node patron-faux-linkpay.cjs <port>
 * Un paiement reste « PENDING » jusqu'à GET /__succes (le plus récent passe à SUCCESS) ou /__echec (FAILED).
 * Numéros connus : SLP-TEST01 (compte de la plateforme) et SLP-000482 (« Hôtel Grand Lac SARL »).
 */
const { createServer } = require("node:http");
const { randomUUID } = require("node:crypto");

const port = Number(process.argv[2] ?? 40010);
const numeros = new Map([["SLP-TEST01", "HotelSaver"], ["SLP-000482", "Hôtel Grand Lac SARL"]]);
const demandes = new Map();
const paiements = new Map();
const parCle = new Map();

const frais = (montant, modele = "MERCHANT_PAID") => {
  const platform = Math.floor(montant * 0.02);
  const psp = Math.floor(montant * 0.015);
  const total = modele === "CUSTOMER_PAID" ? montant + platform : montant;
  return { commission_model: modele, amount_cents: montant, platform_fee_cents: platform, psp_fee_cents: psp, total_cents: total, net_cents: montant - psp - platform };
};

createServer((req, res) => {
  const morceaux = [];
  req.on("data", (c) => morceaux.push(c));
  req.on("end", () => {
    const corps = morceaux.length ? JSON.parse(Buffer.concat(morceaux).toString()) : {};
    const envoyer = (code, json) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(json)); };
    const url = (req.url ?? "").replace(/^\/api\/v1/, "");
    if (url === "/__succes" || url === "/__echec") {
      const dernier = [...paiements.values()].pop();
      if (dernier) dernier.statut = url === "/__succes" ? "SUCCESS" : "FAILED";
      return envoyer(200, { ok: true });
    }
    if (req.method === "GET" && url.startsWith("/payment-requests/fees-preview")) {
      const q = new URL(url, "http://x").searchParams;
      const numero = q.get("scanlinkpay_number") ?? "";
      if (!numeros.has(numero)) return envoyer(404, { message: "Numéro ScanLinkPay introuvable" });
      return envoyer(200, { business: numeros.get(numero), currency: q.get("currency"), ...frais(Number(q.get("amount_cents")), q.get("commission_model") ?? "MERCHANT_PAID") });
    }
    if (req.method === "POST" && url === "/payment-requests/quick-pay") {
      if (!numeros.has(corps.scanlinkpay_number)) return envoyer(404, { message: "Numéro ScanLinkPay introuvable" });
      const token = randomUUID().replace(/-/g, "");
      const modele = corps.commission_model ?? "MERCHANT_PAID";
      demandes.set(token, { montant: corps.amount_cents, devise: corps.currency, modele });
      return envoyer(201, { reference: `PR-${token.slice(0, 8)}`, link_token: token, amount_cents: corps.amount_cents, currency: corps.currency, status: "CREATED", fees: frais(corps.amount_cents, modele) });
    }
    if (req.method === "POST" && url === "/payments") {
      const cle = String(req.headers["idempotency-key"] ?? "");
      if (parCle.has(cle)) return envoyer(201, { payment_intent_id: "pi", psp_intent_id: parCle.get(cle), status: "PENDING" });
      const d = demandes.get(corps.link_token);
      if (!d) return envoyer(404, { message: "Payment request not found" });
      const reference = `FP-${randomUUID().slice(0, 8)}`;
      const f = frais(d.montant, d.modele);
      paiements.set(reference, { reference, montant: d.montant, devise: d.devise, statut: "PENDING", total: f.total_cents });
      parCle.set(cle, reference);
      return envoyer(201, { payment_intent_id: "pi", psp_intent_id: reference, status: "PENDING", fees_cents: f.total_cents - d.montant, total_cents: f.total_cents });
    }
    const m = /^\/payments\/status\/(.+)$/.exec(url);
    if (req.method === "GET" && m) {
      const p = paiements.get(decodeURIComponent(m[1]));
      if (!p) return envoyer(404, { message: "Référence de paiement introuvable" });
      return envoyer(200, { reference: p.reference, status: p.statut, amount_cents: p.montant, currency: p.devise, total_cents: p.total, fees_cents: p.total - p.montant });
    }
    envoyer(404, { message: "?" });
  });
}).listen(port, "127.0.0.1", () => console.log(`faux ScanLinkPay sur ${port}`));
