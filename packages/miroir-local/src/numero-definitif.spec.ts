import { attendreNumeroDefinitif, retrouverRecu } from "./numero-definitif";

const provisoire = { numeroRecu: "TEMP-AB12-20261022-1", numeroProvisoire: "TEMP-AB12-20261022-1" };
const definitif = { numeroRecu: "R-000124", numeroProvisoire: "TEMP-AB12-20261022-1" };

function horloge() {
  let t = 0;
  return { maintenant: () => t, attendre: async (ms: number) => { t += ms; } };
}

describe("numéro définitif avant d'imprimer", () => {
  it("en ligne : synchronise et rend le reçu avec son vrai numéro", async () => {
    const h = horloge();
    let synchronise = false;
    const recu = await attendreNumeroDefinitif(provisoire, async () => (synchronise ? definitif : provisoire), async () => { synchronise = true; }, { enLigne: true, ...h });
    expect(recu.numeroRecu).toBe("R-000124");
  });

  it("sans réseau : n'attend pas, le reçu reste provisoire", async () => {
    const synchroniser = jest.fn(async () => undefined);
    const recu = await attendreNumeroDefinitif(provisoire, async () => definitif, synchroniser, { enLigne: false });
    expect(recu.numeroRecu).toBe(provisoire.numeroRecu);
    expect(synchroniser).not.toHaveBeenCalled();
  });

  it("serveur trop lent : rend la main après le délai, reçu provisoire", async () => {
    const h = horloge();
    const recu = await attendreNumeroDefinitif(provisoire, async () => provisoire, async () => undefined, { enLigne: true, delaiMs: 5000, ...h });
    expect(recu.numeroRecu).toBe(provisoire.numeroRecu);
    expect(h.maintenant()).toBeGreaterThanOrEqual(5000);
  });

  it("un reçu déjà définitif est rendu tel quel", async () => {
    const relire = jest.fn();
    expect(await attendreNumeroDefinitif(definitif, relire, async () => undefined, { enLigne: true })).toBe(definitif);
    expect(relire).not.toHaveBeenCalled();
  });
});

describe("retrouver le reçu après la synchronisation", () => {
  it("par son identifiant ou son numéro provisoire, le définitif d'abord", () => {
    const local = { id: "local-1", numeroRecu: "TEMP-X-1", numeroProvisoire: "TEMP-X-1" };
    const serveur = { id: "srv-9", numeroRecu: "R-000124", numeroProvisoire: "TEMP-X-1" };
    const autre = { id: "srv-8", numeroRecu: "R-000123", numeroProvisoire: null };
    expect(retrouverRecu(local, [autre, local, serveur])).toBe(serveur);
    expect(retrouverRecu(local, [autre, local])).toBe(local);
    expect(retrouverRecu(local, [autre])).toBeUndefined();
  });
});
