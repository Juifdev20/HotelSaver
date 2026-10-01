import { DELAI_LIEN_PAYES_MS, DELAI_MASQUAGE_PAYES_MS, sousComptesVisibles } from "@hotel-chicago/types";

const MAINTENANT = new Date("2026-10-01T15:00:00Z").getTime();
const ilYA = (ms: number) => new Date(MAINTENANT - ms).toISOString();
const aucune = new Set<string>();

describe("sousComptesVisibles — personnes payées qui s'effacent", () => {
  it("garde toujours une personne qui n'a pas encore payé, quel que soit son âge", () => {
    const { visibles, nbMasquees } = sousComptesVisibles([{ id: "a", payeLe: null }, { id: "b" }], MAINTENANT, new Set(["a", "b"]));
    expect(visibles.map((s) => s.id)).toEqual(["a", "b"]);
    expect(nbMasquees).toBe(0);
  });

  it("garde une personne payée depuis moins d'une minute", () => {
    const { visibles } = sousComptesVisibles([{ id: "a", payeLe: ilYA(DELAI_MASQUAGE_PAYES_MS - 1000) }], MAINTENANT, aucune);
    expect(visibles).toHaveLength(1);
  });

  it("masque une personne payée depuis une minute ou plus, et la compte", () => {
    const { visibles, nbMasquees } = sousComptesVisibles(
      [{ id: "a", payeLe: ilYA(DELAI_MASQUAGE_PAYES_MS) }, { id: "b", payeLe: ilYA(5 * 60_000) }, { id: "c", payeLe: null }],
      MAINTENANT,
      aucune
    );
    expect(visibles.map((s) => s.id)).toEqual(["c"]);
    expect(nbMasquees).toBe(2);
  });

  it("masque immédiatement une personne payée écartée à la main", () => {
    const { visibles, nbMasquees } = sousComptesVisibles([{ id: "a", payeLe: ilYA(2000) }], MAINTENANT, new Set(["a"]));
    expect(visibles).toHaveLength(0);
    expect(nbMasquees).toBe(1);
  });

  it("une personne masquée reste « revoyable » moins de 5 minutes, puis le lien disparaît", () => {
    const { revoyables, nbMasquees } = sousComptesVisibles(
      [
        { id: "recente", payeLe: ilYA(DELAI_MASQUAGE_PAYES_MS + 1000) },
        { id: "limite", payeLe: ilYA(DELAI_LIEN_PAYES_MS - 1000) },
        { id: "ancienne", payeLe: ilYA(DELAI_LIEN_PAYES_MS) },
      ],
      MAINTENANT,
      aucune
    );
    expect(nbMasquees).toBe(3);
    expect(revoyables.map((s) => s.id)).toEqual(["recente", "limite"]);
  });

  it("une personne écartée à la main reste revoyable jusqu'à 5 minutes après son paiement", () => {
    const { revoyables } = sousComptesVisibles([{ id: "a", payeLe: ilYA(3000) }], MAINTENANT, new Set(["a"]));
    expect(revoyables).toHaveLength(1);
  });

  it("une horloge en avance sur le serveur (âge négatif) ne masque pas", () => {
    const { visibles } = sousComptesVisibles([{ id: "a", payeLe: new Date(MAINTENANT + 5000).toISOString() }], MAINTENANT, aucune);
    expect(visibles).toHaveLength(1);
  });
});

describe("peutOperer — séparation des tâches", () => {
  const { peutOperer, Role } = require("@hotel-chicago/types");
  it("la réception et la cafétaria opèrent toujours", () => {
    expect(peutOperer({ role: Role.RECEPTIONNISTE })).toBe(true);
    expect(peutOperer({ role: Role.CAFETARIA, patronPeutOperer: false })).toBe(true);
  });
  it("le patron n'opère que si l'hôtel l'a explicitement autorisé", () => {
    expect(peutOperer({ role: Role.PATRON })).toBe(false);
    expect(peutOperer({ role: Role.PATRON, patronPeutOperer: false })).toBe(false);
    expect(peutOperer({ role: Role.PATRON, patronPeutOperer: true })).toBe(true);
  });
});
