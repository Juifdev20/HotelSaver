import { extrairePortsSerie, libelleErreurSpouleur, proposerImprimantes } from "./detection-imprimantes";

describe("proposerImprimantes", () => {
  it("met l'imprimante de tickets en tête, écarte les imprimantes virtuelles et garde les autres", () => {
    const liste = proposerImprimantes(
      [
        { name: "Microsoft Print to PDF" },
        { name: "HP LaserJet 1020", isDefault: true },
        { name: "POS-58 Series" },
        { name: "OneNote (Desktop)" },
        { name: "XP-80C", status: 0x80 },
      ],
      []
    );
    expect(liste.map((i) => i.nom)).toEqual(["POS-58 Series", "XP-80C", "HP LaserJet 1020"]);
    expect(liste[0].interface).toBe("windows:POS-58 Series");
    expect(liste[0].recommandee).toBe(true);
    expect(liste[1].horsLigne).toBe(true);
    expect(liste[2]).toMatchObject({ recommandee: false, parDefaut: true });
  });

  it("propose aussi les ports série, le Bluetooth en premier", () => {
    const liste = proposerImprimantes([], extrairePortsSerie(["USB Serial Port (COM3)", "Standard Serial over Bluetooth link (COM7)"]));
    expect(liste.map((i) => i.interface)).toEqual(["\\\\.\\COM7", "\\\\.\\COM3"]);
    expect(liste[0]).toMatchObject({ bluetooth: true, recommandee: true, nom: "Imprimante Bluetooth (COM7)" });
    expect(liste[1]).toMatchObject({ bluetooth: false, recommandee: false });
  });

  it("une liste vide reste vide", () => expect(proposerImprimantes([], [])).toEqual([]));
});

describe("extrairePortsSerie", () => {
  it("lit le numéro de port, sans doublon, dans l'ordre", () => {
    expect(extrairePortsSerie(["Port (COM10)", "Autre chose", "Port (COM2)", "Même port (COM2)"]).map((p) => p.port)).toEqual(["COM2", "COM10"]);
  });
});

describe("libelleErreurSpouleur", () => {
  it("donne une phrase claire pour les erreurs courantes et garde le code pour les autres", () => {
    expect(libelleErreurSpouleur(1801)).toContain("ne reconnaît plus");
    expect(libelleErreurSpouleur(5)).toContain("refuse l'accès");
    expect(libelleErreurSpouleur(1167)).toContain("déconnectée ou éteinte");
    expect(libelleErreurSpouleur(9999, "WRITE")).toContain("code 9999");
    expect(libelleErreurSpouleur(null)).toContain("Vérifiez qu'elle est allumée");
  });
});
