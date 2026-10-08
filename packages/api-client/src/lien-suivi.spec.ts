import { codeSuivi, lienSuivi } from "@hotel-chicago/types";

describe("lien de suivi client", () => {
  it("garde ?hotel= quand le site n'a pas de domaine propre", () => {
    expect(lienSuivi("http://localhost:5175/?hotel=chicago", "jeton-1")).toBe("http://localhost:5175/ma-reservation/jeton-1?hotel=chicago");
  });

  it("domaine personnalisé : chemin direct, sans double barre", () => {
    expect(lienSuivi("https://www.hotel-chicago.com/", "jeton-1")).toBe("https://www.hotel-chicago.com/ma-reservation/jeton-1");
  });

  it("code lisible RES- + 8 caractères en majuscules", () => {
    expect(codeSuivi("1a2b3c4d-5e6f-4000-8000-000000000000")).toBe("RES-1A2B3C4D");
  });
});
