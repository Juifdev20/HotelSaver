import { _electron as electron, ElectronApplication, expect, test } from "@playwright/test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

/**
 * Bout en bout RÉEL : vraie app Electron buildée (out/), vraie API NestJS,
 * vraie connexion Supabase Auth, vraie base de données. Aucun mock.
 *
 * Prérequis (sinon le test est ignoré plutôt que de faire semblant de passer) :
 *   - `pnpm --filter desktop build` a été exécuté ;
 *   - l'API tourne et est joignable à E2E_API_URL ;
 *   - E2E_EMAIL / E2E_MOT_DE_PASSE désignent un vrai compte Supabase Auth
 *     lié à une ligne Utilisateur, et E2E_CHAMBRES_ATTENDUES liste (séparés
 *     par des virgules) des numéros de chambres présents en base.
 * Le mot de passe n'est jamais écrit dans le dépôt.
 */
const API_URL = process.env.E2E_API_URL;
const EMAIL = process.env.E2E_EMAIL;
const MOT_DE_PASSE = process.env.E2E_MOT_DE_PASSE;

test.skip(!API_URL || !EMAIL || !MOT_DE_PASSE, "Variables E2E_API_URL / E2E_EMAIL / E2E_MOT_DE_PASSE non définies.");

let dossierDonnees: string;

function lancerApp(): Promise<ElectronApplication> {
  // VS Code (lui-même une app Electron) exporte ELECTRON_RUN_AS_NODE=1 vers ses
  // terminaux : hérité tel quel, Electron démarrerait comme un simple Node et
  // `require("electron").app` serait undefined. Sans rapport avec l'app elle-même.
  const { ELECTRON_RUN_AS_NODE: _ignore, ...envSansRunAsNode } = process.env;
  return electron.launch({
    args: [join(__dirname, "..")],
    env: { ...envSansRunAsNode, HOTEL_CHICAGO_USER_DATA: dossierDonnees } as Record<string, string>,
  });
}

test.beforeEach(() => {
  dossierDonnees = mkdtempSync(join(tmpdir(), "hotel-chicago-e2e-"));
  writeFileSync(join(dossierDonnees, "configuration.json"), JSON.stringify({ apiUrl: API_URL }));
});

test.afterEach(() => {
  rmSync(dossierDonnees, { recursive: true, force: true });
});

test("la police de la charte (Inter) est réellement chargée", async () => {
  const app = await lancerApp();
  const fenetre = await app.firstWindow();
  await expect(fenetre.getByRole("heading", { name: "Hôtel Chicago" })).toBeVisible();

  // document.fonts.check() renvoie true même quand AUCUNE @font-face ne
  // correspond (repli système) : on liste donc les polices effectivement
  // chargées. Sans ce test, un repli sur Times/Arial passait inaperçu.
  const polices = await fenetre.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/["']/g, ""));
  });
  expect(polices).toEqual(expect.arrayContaining(["Inter"]));

  await app.close();
});

test("un mauvais mot de passe affiche une erreur claire, sans quitter l'écran de connexion", async () => {
  const app = await lancerApp();
  const fenetre = await app.firstWindow();

  await fenetre.getByLabel("Email").fill(EMAIL!);
  await fenetre.getByLabel("Mot de passe").fill("mauvais-mot-de-passe");
  await fenetre.getByRole("button", { name: "Se connecter" }).click();

  // Message français concret (section 17), jamais le texte anglais brut de Supabase.
  await expect(fenetre.getByTestId("erreur-connexion")).toHaveText("Email ou mot de passe incorrect.");
  await expect(fenetre.getByRole("button", { name: "Se connecter" })).toBeVisible();

  await app.close();
});

test("connexion réelle → tableau de bord puis Chambres avec les vraies données, thème sombre, session conservée au redémarrage", async () => {
  let app = await lancerApp();
  let fenetre = await app.firstWindow();

  await fenetre.getByLabel("Email").fill(EMAIL!);
  await fenetre.getByLabel("Mot de passe").fill(MOT_DE_PASSE!);
  await fenetre.getByRole("button", { name: "Se connecter" }).click();

  // Coquille : tableau de bord par défaut, utilisateur affiché.
  await expect(fenetre.getByRole("heading", { name: "Tableau de bord" })).toBeVisible();
  await expect(fenetre.getByTestId("utilisateur-connecte")).toContainText(/Patron|Réceptionniste|Cafétaria/);
  await expect(fenetre.getByText("En dollars", { exact: true })).toBeVisible();

  const navigation = fenetre.getByRole("complementary", { name: "Navigation principale" });
  await expect(navigation).toBeVisible();

  // L'état RÉEL du serveur (déplacé de la barre du haut vers Paramètres, cf. maquette du client) reste vérifiable.
  await navigation.getByRole("button", { name: "Paramètres" }).click();
  await expect(fenetre.getByTestId("indicateur-connexion")).toHaveText("Serveur connecté");
  await navigation.getByRole("button", { name: "Tableau de bord" }).click();

  // Un écran pas encore construit est affiché « Bientôt », jamais une page vide.
  await navigation.getByRole("button", { name: /Réservations/ }).click();
  await expect(fenetre.getByTestId("ecran-bientot")).toBeVisible();

  await navigation.getByRole("button", { name: "Chambres" }).click();
  await expect(fenetre.getByRole("heading", { name: "Chambres" })).toBeVisible();

  const grille = fenetre.getByTestId("grille-chambres");
  for (const numero of (process.env.E2E_CHAMBRES_ATTENDUES ?? "").split(",").filter(Boolean)) {
    await expect(grille.getByText(numero, { exact: true })).toBeVisible();
  }

  // Formatage réel des devises via formatMontant (section 9.4) — jamais de conversion.
  if (process.env.E2E_TEXTES_ATTENDUS) {
    for (const texte of process.env.E2E_TEXTES_ATTENDUS.split("|")) {
      await expect(grille.getByText(texte, { exact: true }).first()).toBeVisible();
    }
  }

  // Mode sombre disponible (section 2) : bascule réellement l'attribut data-theme.
  await fenetre.getByRole("button", { name: "Mode sombre" }).click();
  await expect(fenetre.locator("html")).toHaveAttribute("data-theme", "dark");

  await app.close();

  // Section 14 : l'appareil reste connecté entre deux lancements — on relance
  // avec le même dossier de configuration et on doit arriver directement dans
  // l'application, sans repasser par l'écran de connexion.
  app = await lancerApp();
  fenetre = await app.firstWindow();
  await expect(fenetre.getByRole("heading", { name: "Tableau de bord" })).toBeVisible();
  await expect(fenetre.getByLabel("Mot de passe")).toHaveCount(0);
  await expect(fenetre.locator("html")).toHaveAttribute("data-theme", "dark");

  // Fenêtre étroite (format tablette/mobile) : barre latérale masquée, barre du bas visible.
  await fenetre.setViewportSize({ width: 600, height: 800 });
  await expect(fenetre.getByRole("complementary", { name: "Navigation principale" })).toBeHidden();
  const barreDuBas = fenetre.getByRole("navigation", { name: "Navigation rapide" });
  await expect(barreDuBas).toBeVisible();
  await barreDuBas.getByRole("button", { name: "Chambres" }).click();
  await expect(fenetre.getByRole("heading", { name: "Chambres" })).toBeVisible();

  await app.close();
});
