import { webcrypto } from "crypto";
import { PersistanceChiffree } from "./persistance-chiffree";
import { PersistanceMemoire } from "./persistance-memoire";

const CLE = Buffer.alloc(32, 7).toString("base64");
const AUTRE_CLE = Buffer.alloc(32, 9).toString("base64");
const crypto = webcrypto as unknown as Crypto;

describe("PersistanceChiffree", () => {
  it("n'écrit jamais le contenu en clair, et le relit à l'identique", async () => {
    const memoire = new PersistanceMemoire();
    const p = new PersistanceChiffree(memoire, CLE, crypto);
    await p.appliquer([{ type: "ecrire", collection: "Client", id: "c1", valeur: { nom: "Jean Mukendi", numeroPiece: "AB123456" } }]);
    const brut = JSON.stringify(await memoire.chargerTout());
    expect(brut).not.toContain("Mukendi");
    expect(brut).not.toContain("AB123456");
    expect(await p.chargerTout()).toEqual([{ collection: "Client", id: "c1", valeur: { nom: "Jean Mukendi", numeroPiece: "AB123456" } }]);
  });

  it("refuse de relire avec une autre clé", async () => {
    const memoire = new PersistanceMemoire();
    await new PersistanceChiffree(memoire, CLE, crypto).appliquer([{ type: "ecrire", collection: "A", id: "1", valeur: { x: 1 } }]);
    await expect(new PersistanceChiffree(memoire, AUTRE_CLE, crypto).chargerTout()).rejects.toThrow();
  });

  it("refuse un document déplacé sous un autre identifiant", async () => {
    const memoire = new PersistanceMemoire();
    await new PersistanceChiffree(memoire, CLE, crypto).appliquer([{ type: "ecrire", collection: "Client", id: "c1", valeur: { nom: "A" } }]);
    const [doc] = await memoire.chargerTout();
    await memoire.appliquer([{ type: "ecrire", collection: "Client", id: "c2", valeur: doc.valeur }]);
    await expect(new PersistanceChiffree(memoire, CLE, crypto).chargerTout()).rejects.toThrow();
  });

  it("chiffre sur place une copie existante en clair", async () => {
    const memoire = new PersistanceMemoire();
    await memoire.appliquer([{ type: "ecrire", collection: "Client", id: "c1", valeur: { nom: "Ancien" } }]);
    const p = new PersistanceChiffree(memoire, CLE, crypto);
    expect(await p.chargerTout()).toEqual([{ collection: "Client", id: "c1", valeur: { nom: "Ancien" } }]);
    expect(JSON.stringify(await memoire.chargerTout())).not.toContain("Ancien");
  });

  it("supprime et efface", async () => {
    const memoire = new PersistanceMemoire();
    const p = new PersistanceChiffree(memoire, CLE, crypto);
    await p.appliquer([{ type: "ecrire", collection: "A", id: "1", valeur: 1 }, { type: "ecrire", collection: "A", id: "2", valeur: 2 }]);
    await p.appliquer([{ type: "supprimer", collection: "A", id: "1" }]);
    expect((await p.chargerTout()).map((d) => d.id)).toEqual(["2"]);
    await p.effacer();
    expect(await p.chargerTout()).toEqual([]);
  });
});
