import { adresseUrlPublique, estAdressePrivee } from "./telechargement-sur";

describe("estAdressePrivee", () => {
  it.each([
    "127.0.0.1", "10.0.0.5", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1",
    "::1", "::", "fe80::1", "fd00::1", "::ffff:127.0.0.1", "::ffff:10.1.2.3", "pas-une-ip",
  ])("%s est refusée", (adresse) => {
    expect(estAdressePrivee(adresse)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "172.15.0.1", "2606:4700:4700::1111"])("%s est publique", (adresse) => {
    expect(estAdressePrivee(adresse)).toBe(false);
  });
});

describe("adresseUrlPublique", () => {
  it.each([
    "http://exemple.com/logo.png",
    "https://localhost/logo.png",
    "https://monapp.localhost/x.png",
    "https://169.254.169.254/latest/meta-data",
    "https://10.0.0.1/x.png",
    "https://[::1]/x.png",
    "https://user:mdp@exemple.com/x.png",
    "ftp://exemple.com/x.png",
    "file:///etc/passwd",
    "n'importe quoi",
  ])("refuse %s", async (url) => {
    expect(await adresseUrlPublique(url)).toBeNull();
  });

  it("accepte une adresse https publique", async () => {
    expect(await adresseUrlPublique("https://8.8.8.8/logo.png")).not.toBeNull();
  });
});
