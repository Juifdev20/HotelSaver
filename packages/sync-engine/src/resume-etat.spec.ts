import { resumerEtatSync } from "./resume-etat";
import type { EtatSync } from "./types";

const MAINTENANT = Date.parse("2026-10-10T12:00:00.000Z");
const base: EtatSync = {
  enLigne: true, enAttente: 0, conflits: 0, dernierePousseeLe: null, derniereErreur: null,
  derniereSyncReussieLe: "2026-10-10T11:59:30.000Z", echecsDefinitifs: 0, decalageHorlogeMs: 0, horlogeSuspecte: false,
};
const r = (o: Partial<EtatSync>) => resumerEtatSync({ ...base, ...o }, MAINTENANT);

describe("resumerEtatSync", () => {
  it("« À jour » seulement quand tout est vraiment synchronisé", () => expect(r({}).niveau).toBe("ok"));
  it("jamais « À jour » avec des actions en attente", () => expect(r({ enAttente: 2 }).niveau).toBe("attente"));
  it("hors ligne avec des actions : rassure sur la conservation, sans dire « à jour »", () => {
    const x = r({ enLigne: false, enAttente: 3 });
    expect(x.niveau).toBe("horsLigne");
    expect(x.titre).toContain("3 actions à envoyer");
    expect(x.detail).toContain("gardées sur cet appareil");
  });
  it("hors ligne sans rien en attente indique l'ancienneté de la dernière synchro", () => {
    expect(r({ enLigne: false, derniereSyncReussieLe: "2026-10-10T09:00:00.000Z" }).detail).toContain("il y a 3 h");
  });
  it("un conflit ou une action refusée l'emporte sur tout", () => {
    expect(r({ conflits: 1, enLigne: false }).niveau).toBe("danger");
    expect(r({ echecsDefinitifs: 2 }).niveau).toBe("danger");
  });
  it("en ligne mais synchro en échec : attention, pas « à jour »", () => expect(r({ derniereErreur: "timeout" }).niveau).toBe("attention"));
  it("horloge décalée : attention", () => expect(r({ horlogeSuspecte: true }).niveau).toBe("attention"));
  it("jamais synchronisé : pas « à jour »", () => expect(r({ derniereSyncReussieLe: null }).niveau).toBe("attente"));
  it("synchro vieille de plus de 24 h : données anciennes", () => {
    expect(r({ derniereSyncReussieLe: "2026-10-08T12:00:00.000Z" }).niveau).toBe("attention");
  });
});
