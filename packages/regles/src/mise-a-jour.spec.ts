import { comparerVersions, miseAJourAndroid, notesLisibles, pourcentage, tailleLisible, versionDepuisTag } from "./mise-a-jour";

const SHA = "a".repeat(64);
const release = (tag: string, assets: { name: string; digest?: string }[] = [{ name: `HotelSaver-${tag.replace(/^v/, "")}.apk`, digest: `sha256:${SHA}` }], extra: object = {}) => ({
  tag_name: tag,
  body: "## Nouveautés\n**Séjours** : une action par séjour.",
  published_at: "2026-11-12T08:00:00Z",
  assets: assets.map((a) => ({ name: a.name, browser_download_url: `https://exemple/${a.name}`, size: 58_000_000, digest: a.digest })),
  ...extra,
});

describe("versions", () => {
  it("lit un tag et refuse le reste", () => {
    expect(versionDepuisTag("v1.0.11")).toBe("1.0.11");
    expect(versionDepuisTag("1.2.3")).toBe("1.2.3");
    expect(versionDepuisTag("v1.0.11-beta")).toBeNull();
    expect(versionDepuisTag("latest")).toBeNull();
    expect(versionDepuisTag(null)).toBeNull();
  });
  it("compare segment par segment, pas comme du texte", () => {
    expect(comparerVersions("1.0.10", "1.0.9")).toBe(1);
    expect(comparerVersions("1.0.9", "1.0.10")).toBe(-1);
    expect(comparerVersions("1.0.10", "1.0.10")).toBe(0);
    expect(comparerVersions("2.0.0", "1.99.99")).toBe(1);
    expect(comparerVersions("illisible", "0.0.0")).toBe(0);
  });
});

describe("miseAJourAndroid", () => {
  it("propose une release plus récente avec son APK versionné", () => {
    const m = miseAJourAndroid(release("v1.0.11"), "1.0.10");
    expect(m).toMatchObject({ version: "1.0.11", fichier: "HotelSaver-1.0.11.apk", taille: 58_000_000, sha256: SHA });
    expect(m?.notes).toBe("Nouveautés\nSéjours : une action par séjour.");
  });
  it("ne propose rien si la version installée est déjà celle-là ou plus récente", () => {
    expect(miseAJourAndroid(release("v1.0.10"), "1.0.10")).toBeNull();
    expect(miseAJourAndroid(release("v1.0.9"), "1.0.10")).toBeNull();
  });
  it("ignore brouillons, pré-versions, tags illisibles et releases sans APK", () => {
    expect(miseAJourAndroid(release("v1.0.11", undefined, { draft: true }), "1.0.10")).toBeNull();
    expect(miseAJourAndroid(release("v1.0.11", undefined, { prerelease: true }), "1.0.10")).toBeNull();
    expect(miseAJourAndroid(release("nouvelle"), "1.0.10")).toBeNull();
    expect(miseAJourAndroid(release("v1.0.11", [{ name: "HotelSaver-Setup-1.0.11.exe" }]), "1.0.10")).toBeNull();
    expect(miseAJourAndroid(null, "1.0.10")).toBeNull();
  });
  it("se rabat sur la copie au nom fixe si l'APK versionné manque ; empreinte absente = null", () => {
    const m = miseAJourAndroid(release("v1.0.11", [{ name: "HotelSaver.apk" }]), "1.0.10");
    expect(m?.fichier).toBe("HotelSaver.apk");
    expect(m?.sha256).toBeNull();
  });
});

describe("affichage", () => {
  it("notes courtes et sans Markdown", () => {
    expect(notesLisibles("# Titre\n\n`code` et **gras**")).toBe("Titre\ncode et gras");
    expect(notesLisibles("x".repeat(600), 100)).toHaveLength(100);
    expect(notesLisibles(null)).toBe("");
  });
  it("taille et pourcentage", () => {
    expect(tailleLisible(58_300_000)).toBe("58 Mo");
    expect(tailleLisible(840_000)).toBe("840 Ko");
    expect(tailleLisible(0)).toBe("");
    expect(pourcentage(50, 200)).toBe(25);
    expect(pourcentage(300, 200)).toBe(100);
    expect(pourcentage(10, 0)).toBe(0);
  });
});
