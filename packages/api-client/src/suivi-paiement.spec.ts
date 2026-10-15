import { ErreurApi } from "./client";
import { SuiviPaiement, type PaiementSuivi } from "./suivi-paiement";

type P = PaiementSuivi & { urlPaiement?: string | null };
const paiement = (statut: P["statut"], over: Partial<P> = {}): P => ({ id: "p1", statut, messageErreur: null, createdAt: new Date().toISOString(), ...over });

describe("SuiviPaiement (acompte du client, avec carte)", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function creer(source: any) {
    let t = 0;
    let n = 0;
    const s = new SuiviPaiement<P, { moyen: string }>(source, { intervalleMs: 4000, maintenant: () => t, genererCle: () => `cle-${++n}` });
    return { s, avancer: async (ms: number) => { t += ms; await jest.advanceTimersByTimeAsync(ms); } };
  }

  it("carte : le paiement porte l'adresse de la page sécurisée pendant l'attente, puis réussit", async () => {
    let i = 0;
    const source = {
      lancer: jest.fn().mockResolvedValue(paiement("EN_ATTENTE", { urlPaiement: "https://pay.exemple.test/x" })),
      lire: jest.fn(async () => ({ paiement: paiement(++i >= 2 ? "REUSSI" : "EN_ATTENTE") })),
    };
    const { s, avancer } = creer(source);
    await s.payer({ moyen: "CARTE" });
    expect(source.lancer).toHaveBeenCalledWith({ moyen: "CARTE" }, "cle-1");
    expect(s.etat().phase).toBe("attente");
    expect(s.etat().paiement?.urlPaiement).toBe("https://pay.exemple.test/x");
    await avancer(4000);
    await avancer(4000);
    expect(s.etat().phase).toBe("reussi");
  });

  it("réseau coupé pendant l'envoi : même clé au nouvel essai ; refus net : nouvelle clé", async () => {
    const source = { lancer: jest.fn().mockRejectedValueOnce(new ErreurApi(0, "hors ligne")).mockRejectedValueOnce(new ErreurApi(409, "déjà en attente")).mockResolvedValue(paiement("EN_ATTENTE")), lire: jest.fn() };
    const { s } = creer(source);
    await s.payer({ moyen: "MOBILE_MONEY" });
    await s.payer({ moyen: "MOBILE_MONEY" });
    await s.payer({ moyen: "MOBILE_MONEY" });
    expect(source.lancer.mock.calls.map((c: any[]) => c[1])).toEqual(["cle-1", "cle-1", "cle-2"]);
    s.arreter();
  });

  it("échec : message du serveur et possibilité de réessayer ; panne réseau pendant l'attente = pas un échec", async () => {
    const source = { lancer: jest.fn().mockResolvedValue(paiement("EN_ATTENTE")), lire: jest.fn().mockRejectedValueOnce(new ErreurApi(0, "x")).mockResolvedValue({ paiement: paiement("ECHEC", { messageErreur: "Refusé." }) }) };
    const { s, avancer } = creer(source);
    await s.payer({ moyen: "MOBILE_MONEY" });
    await avancer(4000);
    expect(s.etat().phase).toBe("attente");
    await avancer(4000);
    expect(s.etat()).toMatchObject({ phase: "echec", message: "Refusé.", peutReessayer: true });
    s.arreter();
  });
});
