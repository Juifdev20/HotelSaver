import { personnesAEncaisser } from "./cible-encaissement";

const p = (id: string, nom: string) => ({ id, nom });

describe("personnesAEncaisser (identifiant local remplacé après la synchronisation)", () => {
  const apres = [p("srv-1", "Première commande"), p("srv-2", "Suite")];

  it("« tout » = toutes les personnes à régler", () => {
    expect(personnesAEncaisser(apres, "tout", null)).toEqual(apres);
  });

  it("identifiant connu : la personne, sans autre condition", () => {
    expect(personnesAEncaisser(apres, "srv-2", null)).toEqual([apres[1]]);
  });

  it("identifiant local devenu définitif : la personne est retrouvée par son nom (le cas « payer maintenant, il reste »)", () => {
    expect(personnesAEncaisser(apres, "local-1", p("local-1", "Première commande"))).toEqual([apres[0]]);
  });

  it("sans mémoire de la personne, un identifiant inconnu ne donne personne (pas de devinette)", () => {
    expect(personnesAEncaisser(apres, "local-1", null)).toEqual([]);
  });

  it("la mémoire d'une AUTRE personne ne sert pas ; deux personnes de même nom : aucune (ambigu)", () => {
    expect(personnesAEncaisser(apres, "local-9", p("local-1", "Première commande"))).toEqual([]);
    const doublons = [p("a", "Marie"), p("b", "Marie")];
    expect(personnesAEncaisser(doublons, "local-1", p("local-1", "Marie"))).toEqual([]);
  });

  it("une personne déjà payée (absente des « à régler ») n'est pas retrouvée", () => {
    expect(personnesAEncaisser([p("srv-2", "Suite")], "local-1", p("local-1", "Première commande"))).toEqual([]);
  });
});
