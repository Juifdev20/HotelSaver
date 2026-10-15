import { ErreurApi } from "@hotel-chicago/api-client";
import type { PaiementAbonnementVue } from "@hotel-chicago/types";
import { SuiviPaiementAbonnement } from "./suivi-paiement-abonnement";

const vue = (statut: PaiementAbonnementVue["statut"], over: Partial<PaiementAbonnementVue> = {}): PaiementAbonnementVue => ({
  id: "p1", formule: "PRO", mois: 1, montant: 59, devise: "USD", source: "EN_LIGNE", operateur: "VODACOM", telephoneMasque: "+243 82• ••• •18",
  statut, messageErreur: null, periodeCouverteJusquau: null, createdAt: new Date().toISOString(), confirmeLe: null, ...over,
});
const etatOk = { statut: "ACTIF", bloque: false } as any;
const demande = { formule: "PRO" as const, mois: 1, devise: "USD" as const, operateur: "VODACOM" as const, telephone: "0828497218" };

describe("SuiviPaiementAbonnement", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function creer(client: any, options: object = {}) {
    let t = 0;
    const s = new SuiviPaiementAbonnement(client, { intervalleMs: 4000, maintenant: () => t, genererCle: (() => { let n = 0; return () => `cle-${++n}`; })(), ...options });
    return { s, avancer: async (ms: number) => { t += ms; await jest.advanceTimersByTimeAsync(ms); } };
  }

  it("envoi → attente → réussite, avec l'état d'abonnement à jour", async () => {
    const statuts = ["EN_ATTENTE", "EN_ATTENTE", "REUSSI"] as const;
    let i = 0;
    const client = { payerAbonnement: jest.fn().mockResolvedValue(vue("EN_ATTENTE")), paiementAbonnement: jest.fn(async () => ({ paiement: vue(statuts[Math.min(++i, 2)]), etat: etatOk })) };
    const { s, avancer } = creer(client);
    await s.payer(demande);
    expect(s.etat().phase).toBe("attente");
    expect(client.payerAbonnement).toHaveBeenCalledWith({ ...demande, cleIdempotence: "cle-1" });
    await avancer(4000);
    await avancer(4000);
    expect(s.etat().phase).toBe("reussi");
    expect(s.etat().etatAbonnement).toBe(etatOk);
    const appels = client.paiementAbonnement.mock.calls.length;
    await avancer(20_000);
    expect(client.paiementAbonnement.mock.calls.length).toBe(appels); // plus d'interrogation une fois fini
  });

  it("refusé sur le téléphone → échec avec le message du serveur", async () => {
    const client = { payerAbonnement: jest.fn().mockResolvedValue(vue("EN_ATTENTE")), paiementAbonnement: jest.fn().mockResolvedValue({ paiement: vue("ECHEC", { messageErreur: "Le paiement a été refusé ou annulé sur le téléphone." }), etat: etatOk }) };
    const { s, avancer } = creer(client);
    await s.payer(demande);
    await avancer(4000);
    expect(s.etat()).toMatchObject({ phase: "echec", message: "Le paiement a été refusé ou annulé sur le téléphone.", peutReessayer: true });
    s.reinitialiser();
    expect(s.etat().phase).toBe("saisie");
  });

  it("réseau coupé PENDANT l'envoi : on reste en saisie et « Réessayer » réutilise la MÊME clé (jamais deux débits)", async () => {
    const client = { payerAbonnement: jest.fn().mockRejectedValueOnce(new ErreurApi(0, "Impossible de joindre le serveur.")).mockResolvedValue(vue("EN_ATTENTE")), paiementAbonnement: jest.fn() };
    const { s } = creer(client);
    await s.payer(demande);
    expect(s.etat()).toMatchObject({ phase: "saisie", message: "Impossible de joindre le serveur." });
    await s.payer(demande);
    expect(client.payerAbonnement.mock.calls.map((c: any[]) => c[0].cleIdempotence)).toEqual(["cle-1", "cle-1"]);
    expect(s.etat().phase).toBe("attente");
    s.arreter();
  });

  it("un refus net (numéro, déjà un paiement en cours…) donne une NOUVELLE clé à l'essai suivant", async () => {
    const client = { payerAbonnement: jest.fn().mockRejectedValueOnce(new ErreurApi(409, "Un paiement est déjà en attente.")).mockResolvedValue(vue("EN_ATTENTE")), paiementAbonnement: jest.fn() };
    const { s } = creer(client);
    await s.payer(demande);
    expect(s.etat().message).toBe("Un paiement est déjà en attente.");
    await s.payer(demande);
    expect(client.payerAbonnement.mock.calls.map((c: any[]) => c[0].cleIdempotence)).toEqual(["cle-1", "cle-2"]);
    s.arreter();
  });

  it("une panne réseau PENDANT l'attente n'est pas un échec ; les conseils apparaissent après 1 min, le nouvel essai après 5 min", async () => {
    const client = { payerAbonnement: jest.fn().mockResolvedValue(vue("EN_ATTENTE")), paiementAbonnement: jest.fn().mockRejectedValue(new ErreurApi(0, "hors ligne")) };
    const { s, avancer } = creer(client);
    await s.payer(demande);
    await avancer(8000);
    expect(s.etat()).toMatchObject({ phase: "attente", lent: false, peutReessayer: false });
    await avancer(60_000);
    expect(s.etat()).toMatchObject({ phase: "attente", lent: true, peutReessayer: false });
    await avancer(240_000);
    expect(s.etat()).toMatchObject({ phase: "attente", peutReessayer: true });
    s.arreter();
  });

  it("reprendre() suit un paiement déjà parti ; arreter() coupe l'interrogation", async () => {
    const client = { payerAbonnement: jest.fn(), paiementAbonnement: jest.fn().mockResolvedValue({ paiement: vue("EN_ATTENTE"), etat: etatOk }) };
    const { s, avancer } = creer(client);
    s.reprendre(vue("EN_ATTENTE"));
    expect(s.etat().phase).toBe("attente");
    await avancer(4000);
    expect(client.paiementAbonnement).toHaveBeenCalledTimes(1);
    s.arreter();
    await avancer(20_000);
    expect(client.paiementAbonnement).toHaveBeenCalledTimes(1);
  });

  it("ne lance pas deux paiements en même temps", async () => {
    const client = { payerAbonnement: jest.fn().mockResolvedValue(vue("EN_ATTENTE")), paiementAbonnement: jest.fn() };
    const { s } = creer(client);
    await s.payer(demande);
    await s.payer(demande);
    expect(client.payerAbonnement).toHaveBeenCalledTimes(1);
    s.arreter();
  });
});
