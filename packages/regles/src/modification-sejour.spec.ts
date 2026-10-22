import { MESSAGE_ACOMPTE_APRES_ARRIVEE, MESSAGE_SEJOUR_DEJA_REGLE, refusModificationSejour } from "./sejour";

describe("modifier un séjour selon son état", () => {
  const base = { statut: "CONFIRMEE", acompteActuel: 45, datesChangent: false, dejaEncaisse: false };

  it("avant l'arrivée : l'acompte se change librement", () => {
    expect(refusModificationSejour({ ...base, acompteVoulu: 90 })).toBeNull();
  });

  it("client arrivé : l'acompte ne monte plus (le reste s'encaisse par une facture), il peut baisser", () => {
    expect(refusModificationSejour({ ...base, statut: "EN_COURS", acompteVoulu: 135 })).toBe(MESSAGE_ACOMPTE_APRES_ARRIVEE);
    expect(refusModificationSejour({ ...base, statut: "EN_COURS", acompteVoulu: 45 })).toBeNull();
    expect(refusModificationSejour({ ...base, statut: "EN_COURS", acompteVoulu: 30 })).toBeNull();
    expect(refusModificationSejour({ ...base, statut: "EN_COURS", datesChangent: true })).toBeNull();
  });

  it("séjour déjà encaissé : ni les dates ni l'acompte ne changent", () => {
    expect(refusModificationSejour({ ...base, statut: "EN_COURS", dejaEncaisse: true, datesChangent: true })).toBe(MESSAGE_SEJOUR_DEJA_REGLE);
    expect(refusModificationSejour({ ...base, statut: "EN_COURS", dejaEncaisse: true, acompteVoulu: 30 })).toBe(MESSAGE_SEJOUR_DEJA_REGLE);
    expect(refusModificationSejour({ ...base, statut: "EN_COURS", dejaEncaisse: true, acompteVoulu: 45 })).toBeNull();
  });
});
