/**
 * Captures du guide « réceptionniste », partie 1 : écrans qui ne modifient rien (connexion, accueil, listes, formulaires vides).
 * Hôte de démonstration requis : docs/guide/outils/hote.sh demarrer 40100 <base>_t ; puis GUIDE_PORT_BASE=40100 node reception.cjs
 */
const { L, cap, ouvrir, attendre, noter, chromium } = require("./reception-aide.cjs");

const nommer = (page, nom) => page.getByRole("button", { name: nom, exact: true });

(async () => {
  // ---------- 1. Connexion (avant de se connecter)
  {
    const nav = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--lang=fr-FR"] });
    const ctx = await L.contexte(nav);
    const page = await ctx.newPage();
    await page.goto(L.HOTE.site);
    await attendre(page, "Ravi de vous revoir");
    await cap(page, "connexion-vide");
    await page.getByLabel("Numéro de téléphone").fill("812345678");
    await page.getByLabel("Mot de passe").fill("exemple123");
    await noter(page, "connexion-remplie", "numero", page.getByLabel("Numéro de téléphone"));
    await noter(page, "connexion-remplie", "motdepasse", page.getByLabel("Mot de passe"));
    await noter(page, "connexion-remplie", "bouton", page.getByRole("button", { name: "Se connecter", exact: true }));
    await cap(page, "connexion-remplie");
    await noter(page, "connexion-vide", "oublie", page.getByRole("button", { name: "Mot de passe oublié ?" }));
    await page.getByLabel("Numéro de téléphone").fill("");
    await page.getByRole("button", { name: "Mot de passe oublié ?" }).click();
    await attendre(page, "Mot de passe oublié ?");
    await page.getByLabel("Numéro de téléphone").fill("812345678");
    await noter(page, "oubli", "continuer", page.getByRole("button", { name: "Continuer" }));
    await cap(page, "oubli");
    await nav.close();
  }

  const { nav, page } = await ouvrir();
  const ouvrirPlus = async () => {
    await page.getByRole("navigation", { name: "Navigation rapide" }).getByRole("button", { name: /Plus/ }).click();
    await page.waitForTimeout(1500);
  };

  // ---------- 2. Tiroir « Plus » (avant toute modification : pas d'accueil ici, voir reception-flux.cjs)
  await ouvrirPlus();
  await cap(page, "plus", { attente: 500 });
  await L.fermerTiroir(page);

  // ---------- 3. Chambres
  await L.aller(page, "Chambres");
  await attendre(page, "Standard");
  await noter(page, "chambres", "recherche", page.getByPlaceholder("Rechercher une chambre…"));
  await noter(page, "chambres", "filtres", page.getByRole("group", { name: "Filtrer par statut" }));
  await noter(page, "chambres", "nouvelle", nommer(page, "Nouvelle réservation"));
  await noter(page, "chambres", "carte", page.locator('[data-testid="grille-chambres"] > *').first());
  await cap(page, "chambres");
  await nommer(page, "Libres").click();
  await page.waitForTimeout(600);
  await cap(page, "chambres-libres");
  await nommer(page, "Toutes").click();
  await page.getByPlaceholder("Rechercher une chambre…").fill("Suite");
  await page.waitForTimeout(600);
  await cap(page, "chambres-recherche");

  // ---------- 4. Réservations
  await L.aller(page, "Réserv.");
  await attendre(page, "Tshimanga");
  await noter(page, "reservations", "mode", page.getByRole("group", { name: "Mode d'affichage" }));
  await noter(page, "reservations", "nouvelle", nommer(page, "Nouvelle réservation"));
  await noter(page, "reservations", "recherche", page.getByPlaceholder("Rechercher un client ou une chambre…"));
  await noter(page, "reservations", "filtres", page.getByRole("group", { name: "Filtrer par statut" }));
  await noter(page, "reservations", "liste", page.locator(".carte-tableau").first());
  await cap(page, "reservations");
  await nommer(page, "Confirmées").click();
  await page.waitForTimeout(600);
  await cap(page, "reservations-filtre");
  await nommer(page, "Toutes").click();
  await page.getByPlaceholder("Rechercher un client ou une chambre…").fill("Ilunga");
  await page.waitForTimeout(600);
  await cap(page, "reservations-recherche");
  await page.getByPlaceholder("Rechercher un client ou une chambre…").fill("");
  await nommer(page, "Planning").click();
  await attendre(page, "Patrick");
  await cap(page, "planning");

  // formulaire vide
  await nommer(page, "Liste").click();
  await nommer(page, "Nouvelle réservation").click();
  await page.waitForSelector("#arrivee");
  await cap(page, "nouvelle-vide", { long: true });
  await nommer(page, "Retour").click();

  // ---------- 5. Arrivées et départs, journal, clients, facturation, dépenses, rapports
  await L.aller(page, "Arrivées et départs");
  await attendre(page, "Ilunga");
  await cap(page, "arrivees", { long: true });

  await L.aller(page, "Journal de la journée");
  await attendre(page, "ENCAISSEMENTS DU JOUR", 15000).catch(() => attendre(page, "Encaissements du jour"));
  await cap(page, "journal", { long: true });

  await L.aller(page, "Clients");
  await attendre(page, "Mukendi");
  await noter(page, "clients", "recherche", page.getByPlaceholder("Rechercher par nom ou téléphone…"));
  await cap(page, "clients");
  await page.getByPlaceholder("Rechercher par nom ou téléphone…").fill("Kabasele");
  await page.waitForTimeout(600);
  await cap(page, "clients-recherche");
  await page.getByRole("button", { name: /Ouvrir la fiche de Grâce Kabasele/ }).click();
  await attendre(page, "Fiche client");
  await cap(page, "client-fiche", { long: true });
  await page.getByRole("button", { name: /pièce|Compléter|Modifier/i }).first().click().catch(() => console.log("pas de bouton fiche"));
  await page.waitForTimeout(600);
  console.log((await L.inventaire(page)).join("\n"));
  await cap(page, "client-modifier", { long: true });

  await L.aller(page, "Facturation");
  await attendre(page, "JOURNAL DES REÇUS").catch(() => attendre(page, "Journal des reçus"));
  await cap(page, "facturation", { long: true });
  await page.getByRole("button", { name: /Détail du reçu/ }).click();
  await page.waitForTimeout(700);
  await cap(page, "recu-detail", { long: true });

  await L.aller(page, "Dépenses");
  await attendre(page, "Produits d'entretien");
  await noter(page, "depenses", "pdf", page.getByRole("button", { name: "Télécharger le PDF" }));
  await noter(page, "depenses", "nouvelle", page.getByRole("button", { name: "Nouvelle dépense" }));
  await cap(page, "depenses");

  await L.aller(page, "Rapports mensuels");
  await attendre(page, "Rapport Réception");
  await noter(page, "rapports", "mois", page.getByLabel("Mois du rapport"));
  await noter(page, "rapports", "generer", page.getByRole("button", { name: "Générer le rapport" }));
  await cap(page, "rapports");

  await nav.close();

  // ---------- 6. Grand écran (ordinateur) : menu d'actions d'une chambre
  {
    const { nav: n2, page: p2 } = await ouvrir({ largeur: 1280, hauteur: 800 });
    await L.aller(p2, "Chambres").catch(async () => { await p2.getByRole("link", { name: "Chambres" }).first().click(); });
    await attendre(p2, "Standard");
    await p2.getByRole("button", { name: /Actions pour la chambre 103/ }).click();
    await p2.waitForTimeout(600);
    await noter(p2, "chambre-menu-large", "menu", p2.getByRole("menu"));
    await cap(p2, "chambre-menu-large");
    await n2.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
