import { extrairePortsBluetooth, extrairePortsSerie, libelleErreurPortSerie, libelleErreurSpouleur, proposerImprimantes } from "./detection-imprimantes";

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

  it("propose aussi les ports série (sans nom connu : pas de recommandation), le Bluetooth en premier", () => {
    const liste = proposerImprimantes([], extrairePortsSerie(["USB Serial Port (COM3)", "Standard Serial over Bluetooth link (COM7)"]));
    expect(liste.map((i) => i.interface)).toEqual(["\\\\.\\COM7", "\\\\.\\COM3"]);
    expect(liste[0]).toMatchObject({ bluetooth: true, recommandee: false, nom: "Appareil Bluetooth (COM7)" });
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

describe("extrairePortsBluetooth", () => {
  const sortie = [
    "PORT|Lien série sur Bluetooth standard (COM3)|BTHENUM\\{00001101-0000-1000-8000-00805F9B34FB}_LOCALMFG&0000\\7&2D8D9C6B&0&000000000000_00000000",
    "PORT|Lien série sur Bluetooth standard (COM4)|BTHENUM\\{00001101-0000-1000-8000-00805F9B34FB}_VID&0001005D_PID&0000\\7&2D8D9C6B&0&5A4A134E3F47_C00000000",
    "PORT|Lien série sur Bluetooth standard (COM5)|BTHENUM\\{00001101-0000-1000-8000-00805F9B34FB}_VID&0001005D_PID&0000\\7&2D8D9C6B&0&AABBCCDDEEFF_C00000000",
    "PORT|USB Serial Port (COM8)|FTDIBUS\\VID_0403+PID_6001+A\\0000",
    "BT|BTHENUM\\DEV_5A4A134E3F47|BlueTooth Printer",
    "BT|BTHENUM\\DEV_112233445566|Casque de Jean",
  ];

  it("retrouve le nom et l'adresse de l'appareil, et repère le port entrant", () => {
    const ports = extrairePortsBluetooth(sortie);
    expect(ports.find((p) => p.port === "COM3")).toMatchObject({ entrant: true, bluetooth: true });
    expect(ports.find((p) => p.port === "COM4")).toMatchObject({ entrant: false, appareil: "BlueTooth Printer", adresse: "5A:4A:13:4E:3F:47" });
    expect(ports.find((p) => p.port === "COM5")).toMatchObject({ entrant: false, appareil: undefined, bluetooth: true });
    expect(ports.find((p) => p.port === "COM8")).toMatchObject({ nom: "USB Serial Port (COM8)" });
  });

  it("ne propose que les ports utiles, l'imprimante reconnue par son nom en tête", () => {
    const liste = proposerImprimantes([], extrairePortsBluetooth(sortie));
    expect(liste.map((i) => i.nom)).toEqual(["BlueTooth Printer (COM4)", "Appareil Bluetooth (COM5)", "Port série (COM8)"]);
    expect(liste[0]).toMatchObject({ recommandee: true, bluetooth: true, interface: "\\\\.\\COM4" });
    expect(liste[0].detail).toContain("5A:4A:13:4E:3F:47");
    expect(liste[1].recommandee).toBe(false);
  });
});

describe("libelleErreurPortSerie", () => {
  it("distingue port occupé, port disparu et imprimante muette", () => {
    expect(libelleErreurPortSerie("System.UnauthorizedAccessException", "COM4")).toContain("déjà utilisé");
    expect(libelleErreurPortSerie("System.IO.FileNotFoundException", "COM4")).toContain("n'existe plus");
    expect(libelleErreurPortSerie("System.IO.IOException", "COM4")).toContain("ne répond pas");
  });
});
