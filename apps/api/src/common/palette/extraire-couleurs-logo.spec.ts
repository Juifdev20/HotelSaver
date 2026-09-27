jest.mock("node-vibrant/node", () => ({ Vibrant: { from: jest.fn() } }));

import { Vibrant } from "node-vibrant/node";
import { extraireCouleursLogo } from "./extraire-couleurs-logo";

const ancienFetch = global.fetch;

describe("extraireCouleursLogo", () => {
  afterEach(() => {
    global.fetch = ancienFetch;
    jest.clearAllMocks();
  });

  function mockFetchOk() {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    }) as any;
  }

  it("mappe Vibrant/DarkVibrant vers bleu/navy quand présents", async () => {
    mockFetchOk();
    (Vibrant.from as jest.Mock).mockReturnValue({
      getPalette: () =>
        Promise.resolve({
          Vibrant: { hex: "#2563EB" },
          DarkVibrant: { hex: "#111827" },
          Muted: { hex: "#888888" },
        }),
    });

    const resultat = await extraireCouleursLogo("https://exemple.com/logo.png");
    expect(resultat).toEqual({ bleu: "#2563EB", navy: "#111827" });
  });

  it("se rabat sur Muted/DarkMuted si Vibrant/DarkVibrant sont absents", async () => {
    mockFetchOk();
    (Vibrant.from as jest.Mock).mockReturnValue({
      getPalette: () =>
        Promise.resolve({
          Muted: { hex: "#888888" },
          DarkMuted: { hex: "#222222" },
        }),
    });

    const resultat = await extraireCouleursLogo("https://exemple.com/logo.png");
    expect(resultat).toEqual({ bleu: "#888888", navy: "#222222" });
  });

  it("renvoie null si le téléchargement échoue (404)", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as any;
    const resultat = await extraireCouleursLogo("https://exemple.com/inexistant.png");
    expect(resultat).toBeNull();
  });

  it("renvoie null si node-vibrant échoue à décoder l'image", async () => {
    mockFetchOk();
    (Vibrant.from as jest.Mock).mockReturnValue({ getPalette: () => Promise.reject(new Error("format invalide")) });
    const resultat = await extraireCouleursLogo("https://exemple.com/logo.png");
    expect(resultat).toBeNull();
  });

  it("renvoie null si aucun swatch exploitable n'est trouvé", async () => {
    mockFetchOk();
    (Vibrant.from as jest.Mock).mockReturnValue({ getPalette: () => Promise.resolve({}) });
    const resultat = await extraireCouleursLogo("https://exemple.com/logo.png");
    expect(resultat).toBeNull();
  });
});
