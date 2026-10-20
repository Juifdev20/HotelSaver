/**
 * Partie A — Le patron.
 * Les libellés et les parcours suivent l'application MOBILE (apps/mobile). Les repères posés sur les captures ne sont pas écrits à la main :
 * ils viennent de docs/guide/captures-scripts/patron-reperes.json (mesures des éléments, écrites par les scripts de capture), pour qu'une
 * nouvelle capture n'oblige jamais à recalculer des coordonnées.
 */
import { readFileSync } from "node:fs";
import { annote, etapes, texte } from "../modele.mjs";

const C = "captures/brut/";

/* ------------------------------------------------------------------ mesures des captures */

const REP = (() => {
  try {
    return JSON.parse(readFileSync(new URL("../captures-scripts/patron-reperes.json", import.meta.url), "utf8"));
  } catch {
    return {};
  }
})();
const mesure = (capture, nom) => {
  const r = REP[capture]?.[nom];
  // Une mesure hors de la capture (élément sous la ligne de flottaison) est inutilisable : on l'ignore.
  return r && r.y >= 0 && r.y + r.h <= 1.001 && r.x >= 0 && r.x + r.l <= 1.001 ? r : null;
};
const borne = (v) => Math.min(1, Math.max(0, v));

/** Cadre doré (numéroté) autour d'un élément mesuré ; null si la mesure manque. */
const rp = (capture, nom, n, mx = 0.012, my = 0.004) => {
  const r = mesure(capture, nom);
  return r ? { x: borne(r.x - mx), y: borne(r.y - my), l: r.l + 2 * mx, h: r.h + 2 * my, n } : null;
};
const rps = (...liste) => liste.filter(Boolean);

/** Point visé dans un élément mesuré (fx, fy = position dans l'élément, de 0 à 1). */
const pt = (capture, nom, fx = 0.5, fy = 0.5) => {
  const r = mesure(capture, nom);
  return r ? { x: r.x + r.l * fx, y: r.y + r.h * fy } : { x: 0.5, y: 0.5 };
};

/** Zoom : le rectangle de la capture qui entoure les éléments mesurés (avec une marge), pour qu'une étape montre l'essentiel en grand. */
const zn = (capture, noms, { mx = 0.04, my = 0.035, minH = 0.14 } = {}) => {
  const boites = noms.map((n) => mesure(capture, n)).filter(Boolean);
  if (boites.length === 0) return [0, 0.1, 1, 0.4];
  const x0 = Math.min(...boites.map((b) => b.x));
  const y0 = Math.min(...boites.map((b) => b.y));
  const x1 = Math.max(...boites.map((b) => b.x + b.l));
  const y1 = Math.max(...boites.map((b) => b.y + b.h));
  let [a, b, c, d] = [borne(x0 - mx), borne(y0 - my), borne(x1 + mx), borne(y1 + my)];
  if (d - b < minH) {
    const milieu = (b + d) / 2;
    b = borne(milieu - minH / 2);
    d = borne(milieu + minH / 2);
  }
  if (c - a < 0.5) {
    const milieu = (a + c) / 2;
    a = borne(milieu - 0.25);
    c = borne(milieu + 0.25);
  }
  return [a, b, c, d];
};

/* ------------------------------------------------------------------ blocs réutilisés */

const conseil = (titre, texteC) => ({ encadre: { type: "conseil", titre, texte: texteC } });
const important = (titre, texteC) => ({ encadre: { type: "attention", titre, texte: texteC } });
const info = (titre, texteC) => ({ encadre: { type: "info", titre, texte: texteC } });

export default {
  id: "patron",
  titre: "Partie A · Le patron",
  libelle: "Guide du patron",
  guide: "Guide du patron",
  icone: "cle",
  chapitres: [
    /* ================================================================== 1 */
    {
      titre: "Créer votre compte et votre hôtel",
      points: [
        "Ouvrir « Créer votre hôtel » et remplir les deux étapes",
        "Choisir entre l'essai gratuit et « Payer maintenant »",
        "Accepter les conditions d'utilisation et créer le compte",
        "Connaître les limites de l'essai gratuit de 14 jours",
      ],
      pages: [
        etapes({
          surtitre: "Inscription",
          titre: "Créer le compte de votre hôtel",
          chapo: "Le patron crée l'hôtel une seule fois, depuis l'application, avec une connexion internet. Cela prend deux minutes.",
          etapes: [
            {
              titre: "Ouvrez « Créer votre hôtel »",
              texte: "Sur l'écran de connexion, sous le bouton « Se connecter », appuyez sur « Créer votre hôtel ».",
              action: "Appuyez sur « Créer votre hôtel »",
              image: C + "patron-01-connexion.png",
              zone: zn("patron-01-connexion", ["connecter", "creer"], { my: 0.05 }),
              reperes: rps(rp("patron-01-connexion", "creer", 1)),
            },
            {
              titre: "Décrivez votre hôtel",
              texte: "Écrivez le nom de l'hôtel. Le sous-domaine se remplit seul : c'est l'adresse du site de vos clients. L'adresse est facultative.",
              action: "Appuyez sur « Continuer »",
              image: C + "patron-02-inscription-1.png",
              zone: zn("patron-02-inscription-1", ["nom", "continuer"], { my: 0.03 }),
              reperes: rps(rp("patron-02-inscription-1", "nom", 1), rp("patron-02-inscription-1", "sousdomaine", 2), rp("patron-02-inscription-1", "continuer", 3)),
            },
            {
              titre: "Entrez vos coordonnées",
              texte: "Écrivez votre nom, votre numéro de téléphone (il sert à vous connecter) et un mot de passe de 8 caractères au moins, deux fois.",
              action: "Remplissez les quatre champs",
              image: C + "patron-03-inscription-2.png",
              zone: zn("patron-03-inscription-2", ["nom", "confirmation"], { my: 0.012 }),
              reperes: rps(rp("patron-03-inscription-2", "nom", 1, 0.012, 0.002), rp("patron-03-inscription-2", "telephone", 2, 0.012, 0.002), rp("patron-03-inscription-2", "mdp", 3, 0.012, 0.002), rp("patron-03-inscription-2", "confirmation", 4, 0.012, 0.002)),
            },
          ],
        }),
        etapes({
          surtitre: "Inscription",
          titre: "Choisir comment commencer",
          chapo: "La fin du formulaire : le mode de départ, les conditions d'utilisation, puis la création du compte.",
          etapes: [
            {
              titre: "Choisissez votre départ",
              texte: "« Essai gratuit » : vous testez toutes les fonctions. « Payer maintenant » : l'écran de paiement s'ouvre à votre première connexion. Dans les deux cas, aucun jour d'essai n'est perdu.",
              action: "Appuyez sur « Essai gratuit » ou « Payer maintenant »",
              image: C + "patron-03-inscription-2.png",
              zone: zn("patron-03-inscription-2", ["demarrage"], { my: 0.012 }),
              reperes: rps(rp("patron-03-inscription-2", "demarrage", 1, 0.01, 0.002)),
            },
            {
              titre: "Lisez les conditions",
              texte: "Appuyez sur « Lire » pour ouvrir les conditions d'utilisation, puis sur « J'accepte ». La case est cochée : sans elle, « Créer mon compte » reste grisé.",
              action: "Appuyez sur « Lire », puis sur « J'accepte »",
              image: C + "patron-04-conditions.png",
              zone: zn("patron-04-conditions", ["accepte"], { mx: 0.5, my: 0.28 }),
              reperes: rps(rp("patron-04-conditions", "accepte", 1)),
            },
            {
              titre: "Créez votre compte",
              texte: "Appuyez sur « Créer mon compte ». Vous êtes connecté tout de suite et vous arrivez sur l'écran d'accueil de votre hôtel.",
              action: "Appuyez sur « Créer mon compte »",
              image: C + "patron-03-inscription-2.png",
              zone: zn("patron-03-inscription-2", ["conditions", "creer"], { my: 0.02 }),
              reperes: rps(rp("patron-03-inscription-2", "conditions", 1, 0.01, 0.003), rp("patron-03-inscription-2", "creer", 2, 0.01, 0.003)),
            },
          ],
        }),
        texte({
          surtitre: "Essai gratuit",
          titre: "Ce que permet et ce que limite l'essai",
          chapo: "Pendant l'essai, toutes les fonctions sont ouvertes. Mais l'essai a une durée et des plafonds.",
          blocs: [
            {
              tableau: {
                entetes: ["Sujet", "Pendant l'essai gratuit"],
                lignes: [
                  ["Durée", "14 jours, à partir de la création de l'hôtel."],
                  ["Fonctions", "Toutes ouvertes : réception, cafétaria, site de l'hôtel, acompte en ligne."],
                  ["Chambres", "10 chambres au plus."],
                  ["Produits du menu", "50 produits au plus."],
                  ["Galerie photos du site", "6 photos au plus."],
                  ["Un essai par numéro", "Un même numéro de téléphone ne reçoit l'essai gratuit qu'une seule fois."],
                  ["Inscriptions", "2 inscriptions par jour au plus, depuis une même connexion ou un même appareil."],
                ],
              },
            },
            { p: "Quand un plafond est atteint, l'application l'écrit clairement, par exemple : « L'essai gratuit est limité à 10 chambres. Choisissez une formule dans Paramètres → Abonnement pour en ajouter. » Ces plafonds peuvent évoluer : le message de l'application fait toujours foi." },
            important("Sans paiement, l'hôtel est supprimé", "Un hôtel qui n'a jamais payé est supprimé, avec toutes ses données, 10 jours après la fin de l'essai et du délai de grâce de 3 jours. L'écran « Abonnement » affiche la date exacte. Payez avant."),
            conseil("Payer pendant l'essai ne fait perdre aucun jour", "Les jours d'essai restants s'ajoutent à la période payée. Exemple : 3 jours d'essai restants et 1 mois payé donnent 1 mois et 3 jours."),
            { h: "Ce qui se passe à la fin de l'essai" },
            {
              tableau: {
                entetes: ["Moment", "Ce que vous voyez"],
                lignes: [
                  ["7 derniers jours", "Bandeau orange « Essai gratuit : plus que N jours. Choisissez une formule. »"],
                  ["Après le 14e jour", "3 jours de grâce : tout marche, bandeau rouge « l'accès sera bientôt coupé »."],
                  ["Après la grâce", "Écran « Votre abonnement a expiré » : payez pour rouvrir. Sans paiement, les données sont supprimées 10 jours plus tard."],
                ],
              },
            },
            info("Si la connexion automatique échoue", "Après « Créer mon compte », l'écran de connexion peut afficher « Compte créé ! Connectez-vous avec votre numéro et votre mot de passe. » L'hôtel existe bien : connectez-vous normalement."),
          ],
        }),
        texte({
          surtitre: "Après l'inscription",
          titre: "Vos premiers pas",
          chapo: "Dans l'ordre conseillé, avant de donner l'application à votre équipe.",
          blocs: [
            {
              parcours: [
                { titre: "Ajoutez vos chambres", texte: "Onglet « Chambres », bouton « + ». Voir le chapitre 3." },
                { titre: "Vérifiez le taux de change", texte: "« Plus », puis « Taux de change » : 1 dollar vaut combien de francs ?" },
                { titre: "Créez les comptes de votre équipe", texte: "« Plus », puis « Utilisateurs ». Voir le chapitre 4." },
                { titre: "Branchez l'imprimante", texte: "« Plus », puis « Imprimante », pour les reçus." },
                { titre: "Présentez votre hôtel en ligne", texte: "« Plus », puis « Site de l'hôtel » : photos, services, contact." },
                { titre: "Choisissez votre formule", texte: "« Plus », puis « Abonnement ». Voir le chapitre 5." },
              ],
            },
            { h: "Les messages de l'inscription" },
            {
              tableau: {
                entetes: ["Message affiché", "Ce qu'il faut faire"],
                lignes: [
                  ["« Le nom de l'hôtel est obligatoire. »", "Écrivez le nom de l'hôtel."],
                  ["« Le sous-domaine ne doit contenir que des minuscules, chiffres et tirets… »", "Corrigez l'adresse du site : lettres minuscules, chiffres et tirets, sans espace."],
                  ["« Numéro invalide : 9 chiffres commençant par 8 ou 9… »", "Écrivez le numéro sans le zéro du début, par exemple 970 000 000."],
                  ["« Le mot de passe doit contenir au moins 8 caractères. »", "Choisissez un mot de passe plus long."],
                  ["« Les deux mots de passe ne correspondent pas. »", "Écrivez le même mot de passe dans les deux cases."],
                  ["« Cochez la case pour accepter les conditions d'utilisation. »", "Appuyez sur « Lire », puis sur « J'accepte »."],
                ],
              },
            },
          ],
        }),
      ],
    },

    /* ================================================================== 2 */
    {
      titre: "Découvrir l'application",
      points: [
        "Lire l'écran d'accueil et ses chiffres du jour",
        "Les quatre onglets du bas et la rubrique « Plus »",
        "Les notifications et l'état de la synchronisation",
        "Le menu du compte : changer de profil, se déconnecter",
      ],
      pages: [
        annote({
          surtitre: "Écran d'accueil",
          titre: "Votre tableau de bord",
          chapo: "En arrivant, vous voyez ce que l'hôtel a encaissé aujourd'hui et l'état des chambres.",
          image: C + "patron-10-accueil.png",
          marques: [
            { n: 1, titre: "Notifications", texte: "La cloche montre les alertes non lues. Un point de couleur indique l'état de la synchronisation.", ...pt("patron-10-accueil", "cloche", 0.5, 0.5), cote: "d" },
            { n: 2, titre: "Bienvenue", texte: "Votre nom, votre rôle (Patron) et le nom de l'hôtel.", ...pt("patron-10-accueil", "bonjour", 0.92, 0.5), cote: "g" },
            { n: 3, titre: "Hôtel, date et heure", texte: "Le nom de l'hôtel, la date du jour et l'heure.", ...pt("patron-10-accueil", "hero", 0.7, 0.5), cote: "d" },
            { n: 4, titre: "En dollars, en francs", texte: "L'argent encaissé aujourd'hui, dans chaque monnaie. Les deux ne sont jamais additionnés.", ...pt("patron-10-accueil", "dollars", 0.88, 0.12), cote: "g" },
            { n: 5, titre: "Barre du bas", texte: "Accueil, Chambres, Réserv. et Plus : tout le reste se trouve dans « Plus ».", ...pt("patron-10-accueil", "barre", 0.62, 0.12), cote: "d" },
          ],
        }),
        annote({
          surtitre: "Écran d'accueil",
          titre: "Occupation, stock et activité",
          chapo: "Faites défiler l'accueil vers le bas : l'état des chambres, du stock et des dernières ventes.",
          image: C + "patron-11-accueil-milieu.png",
          marques: [
            { n: 1, titre: "Taux d'occupation", texte: "Le cercle montre la part de chambres occupées. Les couleurs distinguent occupées, libres, réservées.", ...pt("patron-11-accueil-milieu", "occupation", 0.2, 0.4), cote: "g" },
            { n: 2, titre: "Lignes cliquables", texte: "Appuyez sur « Occupées », « Libres » ou « Réservées » pour ouvrir la liste des chambres.", ...pt("patron-11-accueil-milieu", "occupation", 0.75, 0.55), cote: "d" },
            { n: 3, titre: "Stock bas", texte: "Les produits sous leur seuil d'alerte. « Voir tout » ouvre le stock.", ...pt("patron-11-accueil-milieu", "stock", 0.5, 0.35), cote: "d" },
          ],
          bas: `<div class="encadre"><svg class="ico" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg><div><b>Plus bas : « Activité récente »</b><span>Les derniers paiements de séjours et les dernières ventes de la cafétaria, avec leur numéro de reçu. Quand des acomptes en ligne attendent votre décision, une bande orange apparaît en haut de l'accueil : appuyez dessus pour ouvrir « Remboursements ».</span></div></div>`,
        }),
        texte({
          surtitre: "Navigation",
          titre: "La barre du bas et la rubrique « Plus »",
          chapo: "Quatre onglets sont toujours à portée de pouce. Tout le reste est rangé dans « Plus ».",
          blocs: [
            {
              cartes: [
                { icone: "graphique", titre: "Accueil", texte: "Chiffres du jour, occupation, stock bas." },
                { icone: "lit", titre: "Chambres", texte: "La liste des chambres et leur état." },
                { icone: "calendrier", titre: "Réserv.", texte: "Les réservations, le planning, les arrivées." },
                { icone: "menu", titre: "Plus", texte: "Toutes les autres rubriques, les réglages." },
              ],
              colonnes: 2,
            },
            {
              tableau: {
                entetes: ["Section de « Plus »", "Ce qu'elle contient pour le patron"],
                lignes: [
                  ["Réception", "Remboursements, Arrivées et départs, Planning, Journal de la journée, Clients"],
                  ["Cafétaria", "Caisse*, Comptes ouverts, Retrait commande, Cuisine**, Menu, Stock, Inventaire"],
                  ["Reçus", "Journal des reçus, Rapports mensuels, Dépenses"],
                  ["Administration", "Site de l'hôtel, Utilisateurs, Taux de change"],
                  ["Abonnement", "Abonnement"],
                  ["Appareil", "Paramètres, Imprimante, Synchronisation"],
                ],
              },
            },
            info("* et **, des rubriques qui apparaissent selon vos réglages", "« Caisse » n'apparaît que si « Le patron peut aussi opérer » est activé (chapitre 3). « Cuisine » n'apparaît que si « Suivi des commandes en cuisine » est activé. Avec la formule Essentiel, les rubriques de la cafétaria et le site de l'hôtel n'existent pas."),
            conseil("Une pastille vous prévient", "Un nombre rouge à côté de « Remboursements » indique les acomptes à décider. À côté de « Synchronisation », il indique les actions pas encore envoyées."),
          ],
        }),
        etapes({
          surtitre: "Au quotidien",
          titre: "Notifications et synchronisation",
          chapo: "Deux écrans à consulter souvent : les alertes de l'hôtel et l'état de l'envoi des données.",
          etapes: [
            {
              titre: "Ouvrez les notifications",
              texte: "Les alertes non lues sont en couleur. Appuyez sur une alerte pour ouvrir l'écran concerné. « Tout marquer lu » efface la pastille rouge.",
              action: "Appuyez sur la cloche",
              image: C + "patron-13-notifications.png",
              zone: zn("patron-13-notifications", ["panneau"], { mx: 0.02, my: 0.02 }),
              reperes: rps(rp("patron-13-notifications", "panneau", 1, 0.004, 0.002)),
            },
            {
              titre: "Vérifiez la synchronisation",
              texte: "L'écran dit si le téléphone est en ligne, combien d'actions attendent d'être envoyées et l'heure de la dernière synchronisation.",
              action: "Appuyez sur « Plus », puis sur « Synchronisation »",
              image: C + "patron-14-synchronisation.png",
              vue: [0.06, 0.42],
            },
          ],
          apres: [
            info("Le menu du compte", "Appuyez sur votre photo ronde, en haut à droite : « Mon compte » affiche votre nom, votre rôle et le nom de l'hôtel. « Changer de profil » ferme votre session et ouvre « Qui utilise HotelSaver sur cet appareil ? » : le mot de passe est redemandé."),
            conseil("Se déconnecter", "Dans « Mon compte », appuyez sur « Se déconnecter », puis confirmez : « Voulez-vous vraiment vous déconnecter ? »."),
          ],
        }),
        texte({
          surtitre: "Notifications",
          titre: "Les alertes que reçoit le patron",
          chapo: "Chaque alerte arrive aussi sur l'écran du téléphone, même quand l'application est fermée.",
          blocs: [
            {
              tableau: {
                entetes: ["Titre de l'alerte", "Quand elle arrive", "Appuyer ouvre"],
                lignes: [
                  ["Nouvelle demande de réservation", "Un client demande une chambre sur le site de l'hôtel.", "La réservation"],
                  ["Acompte payé en ligne", "Un client a payé son acompte ; la réservation est confirmée.", "La réservation"],
                  ["Acompte à rembourser ?", "Une réservation payée en ligne est annulée : vous décidez.", "La réservation"],
                  ["Réservation annulée", "Une réservation est annulée.", "La réservation"],
                  ["Aujourd'hui à l'hôtel", "Chaque matin : les arrivées et les départs du jour.", "Arrivées et départs"],
                  ["Départ dépassé", "Un client devait partir et n'a pas libéré sa chambre.", "La réservation"],
                  ["Stock bas, Rupture de stock", "Un produit passe sous son seuil, ou il est épuisé.", "Stock"],
                  ["Reçu annulé, Compte cafétaria annulé", "Le personnel a annulé un paiement ou un compte.", "L'écran concerné"],
                  ["Récap du jour", "La recette du jour, en dollars et en francs.", "Accueil"],
                  ["Rapport … disponible", "La réception ou la cafétaria a généré son rapport du mois.", "Rapports mensuels"],
                  ["Abonnement bientôt expiré, renouvelé", "Les 7 derniers jours, puis après chaque paiement.", "Accueil"],
                ],
              },
            },
            conseil("Autorisez les notifications", "Si le téléphone vous le demande, répondez « Autoriser » : sans cela, vous ne verrez les alertes qu'en ouvrant l'application."),
          ],
        }),
      ],
    },

    /* ================================================================== 3 */
    {
      titre: "Régler votre hôtel",
      points: [
        "Ajouter et modifier les chambres",
        "Fixer le taux de change dollar - franc",
        "Les réglages du patron et l'imprimante",
        "Les acomptes en ligne avec ScanLinkPay",
        "Le site de l'hôtel : textes, photos, contact",
      ],
      pages: [
        etapes({
          surtitre: "Chambres",
          titre: "Ajouter et modifier une chambre",
          chapo: "Seul le patron crée et modifie les chambres. Le personnel change leur état (libre, occupée…).",
          etapes: [
            {
              titre: "Ouvrez « Chambres »",
              texte: "Chaque carte montre le numéro, le type, l'état et le prix par nuit. Tirez la liste vers le bas pour la mettre à jour.",
              action: "Appuyez sur « Chambres » dans la barre du bas",
              image: C + "patron-51-chambres.png",
              zone: zn("patron-51-chambres", ["premiere"], { my: 0.02 }),
              reperes: rps(rp("patron-51-chambres", "premiere", 1)),
            },
            {
              titre: "Appuyez sur « + », remplissez, enregistrez",
              texte: "La feuille « Nouvelle chambre » s'ouvre : numéro, type (Standard, Confort, Suite…), prix par nuit, photos (visibles sur le site) et devise USD ou CDF. Pour modifier plus tard : appuyez sur la chambre, puis sur « Modifier la chambre (numéro, type, prix) ».",
              action: "Appuyez sur le bouton « + », puis sur « Enregistrer »",
              image: C + "patron-52c-chambre-formulaire.png",
              zone: zn("patron-52c-chambre-formulaire", ["numero", "enregistrer"], { my: 0.02 }),
              reperes: rps(rp("patron-52c-chambre-formulaire", "numero", 1, 0.012, 0.002), rp("patron-52c-chambre-formulaire", "type", 2, 0.012, 0.002), rp("patron-52c-chambre-formulaire", "prix", 3, 0.012, 0.002), rp("patron-52c-chambre-formulaire", "devise", 4, 0.012, 0.002), rp("patron-52c-chambre-formulaire", "enregistrer", 5, 0.012, 0.003)),
            },
          ],
          apres: [important("Les plafonds de chambres", "Essai gratuit : 10 chambres. Formule Essentiel : 15. Formule Pro : 40. Formule Premium : illimité. Au-delà, l'application refuse l'ajout et vous propose de choisir une formule.")],
        }),
        etapes({
          surtitre: "Monnaies",
          titre: "Fixer le taux de change",
          chapo: "Le taux dit combien de francs congolais vaut 1 dollar. Il sert quand un client paie dans une autre monnaie que celle de la chambre.",
          etapes: [
            {
              titre: "Ouvrez « Taux de change »",
              texte: "Dans « Plus », section « Administration ». L'écran affiche le taux en vigueur et la date depuis laquelle il s'applique.",
              action: "Appuyez sur « Plus », puis sur « Taux de change »",
              image: C + "patron-22-administration.png",
              zone: [0, 0.05, 1, 0.5],
            },
            {
              titre: "Écrivez le nouveau taux et confirmez",
              texte: "Tapez le nombre de francs pour 1 dollar, par exemple 2800, dans « Nouveau taux (CDF pour 1 USD) ». L'application demande « Confirmer le nouveau taux ? » : appuyez sur « Enregistrer le taux ». L'historique garde les anciens taux.",
              action: "Appuyez sur « Enregistrer », puis sur « Enregistrer le taux »",
              image: C + "patron-24-taux-enregistre.png",
              zone: zn("patron-24-taux-enregistre", ["champ"], { mx: 0.04, my: 0.09 }),
              reperes: rps(rp("patron-24-taux-enregistre", "champ", 1)),
            },
          ],
          apres: [
            info("Pas de connexion, pas de changement", "Le taux se règle en ligne : hors connexion, l'écran affiche « Hors ligne — la saisie et l'historique nécessitent une connexion. » Mettez-le à jour chaque fois que le cours change."),
          ],
        }),
        texte({
          surtitre: "Réglages du patron",
          titre: "Les trois interrupteurs de « Paramètres »",
          chapo: "Ouvrez « Plus », puis « Paramètres ». Trois réglages sont réservés au patron.",
          blocs: [
            {
              cartes: [
                { icone: "cle", titre: "Le patron peut aussi opérer", texte: "Réserver, faire les check-in et check-out, facturer et tenir la caisse.", points: ["Éteint par défaut", "Activez-le si vous travaillez seul"] },
                { icone: "couverts", titre: "Suivi des commandes en cuisine", texte: "Les plats passent par l'écran « Cuisine » jusqu'à leur service.", points: ["Pour une cuisine séparée", "Éteint : vente au comptoir"] },
                { icone: "globe", titre: "Commande en ligne sur le site", texte: "Un onglet « Cuisine » apparaît sur le site de l'hôtel.", points: ["Les clients commandent", "Ils paient au comptoir"] },
              ],
            },
            important("Pourquoi le patron n'opère pas par défaut", "Pour éviter toute confusion, la réservation, la facturation et la caisse sont réservées au personnel. Le patron garde toujours l'administration, les rapports et les annulations avec motif. Si vous travaillez seul, activez « Le patron peut aussi opérer »."),
            { h: "Brancher l'imprimante de reçus" },
            {
              parcours: [
                { titre: "Appairez l'imprimante dans le Bluetooth d'Android", texte: "Seuls les appareils déjà appairés dans les réglages Bluetooth du téléphone apparaissent dans HotelSaver." },
                { titre: "Ouvrez « Plus », puis « Imprimante »", texte: "La liste des appareils Bluetooth appairés s'affiche. « Actualiser la liste » la relit." },
                { titre: "Appuyez sur « Imprimer un ticket de test »", texte: "Le message dit « Reçu envoyé à l'imprimante. Vérifiez que le ticket est bien sorti ; sinon, réessayez. »" },
              ],
            },
          ],
        }),
        etapes({
          surtitre: "Acomptes en ligne",
          titre: "Relier votre compte ScanLinkPay",
          chapo: "Vos clients paient leur acompte sur le site de l'hôtel. L'argent arrive directement sur le compte ScanLinkPay de l'hôtel.",
          etapes: [
            {
              titre: "Ouvrez le réglage",
              texte: "Dans « Plus », « Paramètres », la carte « Paiement en ligne des acomptes » porte le bouton « Régler le paiement en ligne ».",
              action: "Appuyez sur « Régler le paiement en ligne »",
              image: C + "patron-26-paiement-en-ligne.png",
              vue: [0.1, 0.46],
            },
            {
              titre: "Entrez votre numéro ScanLinkPay",
              texte: "Il commence par SLP- et se trouve dans le profil de votre entreprise, dans l'application ScanLinkPay. Pas de compte ? Créez-le gratuitement.",
              action: "Appuyez sur « Vérifier et enregistrer »",
              image: C + "patron-27-paiement-compte.png",
              zone: zn("patron-27-paiement-compte", ["numero", "trouve"], { my: 0.03 }),
              reperes: rps(rp("patron-27-paiement-compte", "numero", 1), rp("patron-27-paiement-compte", "verifier", 2), rp("patron-27-paiement-compte", "trouve", 3)),
            },
            {
              titre: "Vérifiez le nom affiché",
              texte: "L'application écrit « Compte trouvé : » suivi du nom de l'entreprise. Vérifiez que c'est bien le vôtre avant de continuer.",
              action: "Contrôlez le nom, puis passez à l'étape suivante",
              image: C + "patron-27-paiement-compte.png",
              zone: zn("patron-27-paiement-compte", ["trouve"], { mx: 0.04, my: 0.06 }),
              reperes: rps(rp("patron-27-paiement-compte", "trouve", 1)),
            },
          ],
        }),
        etapes({
          surtitre: "Acomptes en ligne",
          titre: "Fixer l'acompte et les conditions",
          chapo: "Deuxième partie du même écran : combien demander, qui paie les frais, et ce que le client lit avant de payer.",
          etapes: [
            {
              titre: "Écrivez le pourcentage",
              texte: "Un nombre entier de 0 à 100. Avec 0, il n'y a pas de paiement en ligne. L'écran donne un exemple : chambre à 20 $, 4 nuits, 20 % donne un acompte de 16 $.",
              action: "Remplissez « Pourcentage demandé à la réservation »",
              image: C + "patron-28-paiement-acompte.png",
              zone: zn("patron-28-paiement-acompte", ["pourcentage", "exemple"], { my: 0.03 }),
              reperes: rps(rp("patron-28-paiement-acompte", "pourcentage", 1), rp("patron-28-paiement-acompte", "exemple", 2)),
            },
            {
              titre: "Choisissez qui paie les frais",
              texte: "« Le client paie les frais ScanLinkPay en plus » : activé, vous recevez l'acompte entier. Désactivé, la commission est retenue sur votre part.",
              action: "Activez ou non l'interrupteur des frais",
              image: C + "patron-28-paiement-acompte.png",
              vue: [0.45, 0.8],
            },
            {
              titre: "Écrivez vos conditions, puis enregistrez",
              texte: "« Conditions d'annulation et de remboursement » (1000 caractères au plus) : le client les lit avant de payer. Puis « Enregistrer ».",
              action: "Appuyez sur « Enregistrer »",
              image: C + "patron-29-paiement-enregistre.png",
              zone: zn("patron-29-paiement-enregistre", ["bouton", "ok"], { my: 0.05 }),
              reperes: rps(rp("patron-29-paiement-enregistre", "bouton", 1), rp("patron-29-paiement-enregistre", "ok", 2)),
            },
          ],
        }),
        texte({
          surtitre: "Acomptes en ligne",
          titre: "Comment l'acompte fonctionne",
          chapo: "Le serveur fait les calculs. Le client ne saisit jamais le montant.",
          blocs: [
            {
              parcours: [
                { titre: "Le client demande une chambre sur le site", texte: "Il reçoit un lien « Ma réservation » pour suivre sa demande et payer l'acompte." },
                { titre: "Il paie par Mobile Money ou par carte", texte: "Acompte = pourcentage × prix de la nuit × nombre de nuits, arrondi vers le haut. Il voit : acompte + frais ScanLinkPay = total à payer." },
                { titre: "La réservation se confirme toute seule", texte: "Vous et la réception recevez l'alerte « Acompte payé en ligne ». Un repère « Payé en ligne » apparaît dans la liste des réservations." },
                { titre: "L'argent est déjà chez vous", texte: "Il est sur le compte ScanLinkPay de l'hôtel : retirez-le vers votre Mobile Money quand vous voulez. Rien à encaisser à l'arrivée pour cette part." },
              ],
            },
            {
              tableau: {
                entetes: ["Cas", "Ce qui se passe"],
                lignes: [
                  ["Le client annule après avoir payé", "Un remboursement « à faire » apparaît chez vous. Le système ne rend jamais l'argent tout seul : vous décidez."],
                  ["La chambre a été prise entre-temps", "La réservation est annulée et l'acompte part dans « Remboursements » : il n'est jamais gardé en silence."],
                  ["La commission ScanLinkPay", "Elle n'est jamais remboursée : seul l'acompte l'est."],
                  ["Un acompte donné en main propre", "Saisi par la réception : il ne s'annule pas depuis le lien du client, la réception décide."],
                ],
              },
            },
            important("À savoir", "Pour demander un acompte, enregistrez d'abord le numéro ScanLinkPay : sans lui, le pourcentage est refusé. Ce paiement fait partie des formules Pro et Premium ; avec une autre formule, l'écran propose « Voir les formules »."),
          ],
        }),
        etapes({
          surtitre: "Site de l'hôtel",
          titre: "Remplir le site de votre hôtel",
          chapo: "Ce que vos clients voient sur votre adresse, par exemple grand-lac.hotelsaver.com. Il n'y a pas de bouton « Publier » : le site est à jour dès que vous enregistrez.",
          etapes: [
            {
              titre: "Ouvrez « Site de l'hôtel »",
              texte: "Dans « Plus », section « Administration ». Écrivez le nom, le slogan et le texte de présentation : situation, ambiance, ce qui rend l'hôtel unique. Ajoutez ensuite une photo de couverture et la galerie.",
              action: "Appuyez sur « Plus », puis sur « Site de l'hôtel »",
              image: C + "patron-30-site.png",
              zone: zn("patron-30-site", ["nom", "slogan"], { my: 0.06 }),
              reperes: rps(rp("patron-30-site", "nom", 1), rp("patron-30-site", "slogan", 2)),
            },
            {
              titre: "Services, contact, puis « Enregistrer »",
              texte: "Ajoutez les services (Restaurant, Piscine, Wi-Fi, Parking, Navette, Petit-déjeuner), puis l'adresse, le téléphone, WhatsApp avec l'indicatif, l'e-mail, le lien Google Maps, les heures d'arrivée et de départ et les réseaux sociaux.",
              action: "Appuyez sur « Enregistrer »",
              image: C + "patron-33-site-contact.png",
              zone: zn("patron-33-site-contact", ["horaires"], { mx: 0.04, my: 0.2 }),
              reperes: rps(rp("patron-33-site-contact", "horaires", 1)),
            },
          ],
          apres: [
            info("Les photos des chambres", "Elles se règlent dans « Chambres » (« Photos de la chambre »), pas dans « Site de l'hôtel »."),
            info("Votre propre nom de domaine", "Avec la formule Premium, le site peut aussi s'afficher sur votre propre adresse (par exemple votre-hotel.com). Cette mise en place se fait avec l'aide d'HotelSaver : contactez le support."),
          ],
        }),
      ],
    },

    /* ================================================================== 4 */
    {
      titre: "Créer les comptes de votre équipe",
      points: [
        "Voir la liste des comptes et leur statut",
        "Créer un compte réceptionniste ou cafétaria",
        "Modifier un compte, changer un mot de passe",
        "Désactiver un compte et connaître les droits de chaque rôle",
      ],
      pages: [
        etapes({
          surtitre: "Utilisateurs",
          titre: "Créer un compte pour un employé",
          chapo: "Chaque employé a son propre numéro et son propre mot de passe. Vous les créez, puis vous les lui donnez.",
          etapes: [
            {
              titre: "Ouvrez « Utilisateurs »",
              texte: "La liste montre chaque compte : nom, téléphone, rôle et statut « Actif » ou « Désactivé ». Appuyez sur « + » (Nouveau compte).",
              action: "Appuyez sur « Plus », « Utilisateurs », puis sur « + »",
              image: C + "patron-35-utilisateurs.png",
              zone: zn("patron-35-utilisateurs", ["nouveau"], { mx: 0.3, my: 0.34 }),
              reperes: rps(rp("patron-35-utilisateurs", "nouveau", 1)),
            },
            {
              titre: "Remplissez la fiche, choisissez le rôle",
              texte: "Nom, numéro de téléphone (il sert à se connecter), e-mail (facultatif), mot de passe de 8 caractères au moins. Puis le rôle : « Réceptionniste », « Cafétaria » ou « Patron » (un rôle déjà pris est grisé). Enfin « Créer le compte ».",
              action: "Appuyez sur un rôle, puis sur « Créer le compte »",
              image: C + "patron-36b-nouveau-compte-role.png",
              zone: zn("patron-36b-nouveau-compte-role", ["roles", "creer"], { my: 0.04 }),
              reperes: rps(rp("patron-36b-nouveau-compte-role", "roles", 1), rp("patron-36b-nouveau-compte-role", "creer", 2)),
            },
          ],
          apres: [
            important("Un seul compte par rôle", "Chaque hôtel a au plus un compte Réceptionniste, un compte Cafétaria et un compte Patron. Si vous en créez un deuxième, l'application répond « Cet hôtel a déjà un compte Réceptionniste. Un seul compte par rôle est autorisé — modifiez le compte existant pour le transmettre à un nouvel employé. »"),
          ],
        }),
        etapes({
          surtitre: "Utilisateurs",
          titre: "Modifier, transmettre ou désactiver un compte",
          chapo: "Un employé part ? Ne créez pas un nouveau compte : changez les identifiants du compte existant, ou désactivez-le.",
          etapes: [
            {
              titre: "Modifiez le compte",
              texte: "Sur la ligne de l'employé, appuyez sur « Modifier ». Vous pouvez changer le nom, le numéro, l'e-mail. Un numéro ou un e-mail déjà utilisé par un autre compte est refusé.",
              action: "Appuyez sur « Modifier »",
              image: C + "patron-37-modifier.png",
              vue: [0.12, 0.52],
            },
            {
              titre: "Changez le mot de passe",
              texte: "Écrivez le nouveau mot de passe dans « Nouveau mot de passe » (8 caractères au moins). Laissez la case vide pour ne rien changer. Puis « Enregistrer ».",
              action: "Appuyez sur « Enregistrer »",
              image: C + "patron-37b-modifier-mdp.png",
              zone: zn("patron-37b-modifier-mdp", ["mdp", "enregistrer"], { my: 0.04 }),
              reperes: rps(rp("patron-37b-modifier-mdp", "mdp", 1), rp("patron-37b-modifier-mdp", "enregistrer", 2)),
            },
            {
              titre: "Désactivez le compte",
              texte: "« Désactiver » coupe l'accès de la personne tout de suite. Confirmez avec « Désactiver le compte ». « Activer » le rouvre à tout moment.",
              action: "Appuyez sur « Désactiver », puis sur « Désactiver le compte »",
              image: C + "patron-38-desactiver.png",
              vue: [0.3, 0.68],
            },
          ],
        }),
        texte({
          surtitre: "Droits",
          titre: "Ce que peut faire chaque rôle",
          chapo: "Le patron suit tout. Le personnel fait les opérations du quotidien. Le tableau montre qui voit et qui agit.",
          blocs: [
            {
              tableau: {
                entetes: ["Rubrique", "Patron", "Récep.", "Cafét."],
                lignes: [
                  ["Chambres : voir", true, true, false],
                  ["Chambres : créer, modifier, supprimer", true, false, false],
                  ["Réservations, check-in, check-out, factures", "Si il opère", true, false],
                  ["Annuler une réservation", true, true, false],
                  ["Remboursements d'acomptes en ligne", true, false, false],
                  ["Caisse, comptes ouverts, encaissement", "Si il opère", false, true],
                  ["Menu : créer, modifier", true, false, false],
                  ["Stock : entrées", true, false, true],
                  ["Stock : pertes et ajustements", true, false, false],
                  ["Annuler un reçu (avec motif)", true, false, false],
                  ["Dépenses : saisir", false, true, true],
                  ["Dépenses : consulter, PDF", true, true, true],
                  ["Rapports mensuels : générer", "Si il opère", true, true],
                  ["Utilisateurs, taux de change, abonnement, site", true, false, false],
                ],
              },
            },
            info("Lire le tableau", "« Si il opère » veut dire : seulement si « Le patron peut aussi opérer » est activé dans « Paramètres ». Le personnel voit l'état de l'abonnement mais ne peut pas le payer : « Seul le patron peut renouveler l'abonnement. »"),
            conseil("Quand un employé part", "Désactivez son compte le jour même, ou changez son mot de passe pour le donner à son remplaçant. Vous ne pouvez pas désactiver votre propre compte."),
          ],
        }),
      ],
    },

    /* ================================================================== 5 */
    {
      titre: "L'abonnement",
      points: [
        "Lire l'état de l'abonnement : essai, actif, échu",
        "Choisir une formule, une durée, une monnaie",
        "Payer par Mobile Money depuis l'application ou le site",
        "Que se passe-t-il quand l'abonnement est échu ou bloqué ?",
      ],
      pages: [
        annote({
          surtitre: "Abonnement",
          titre: "Lire l'état de votre abonnement",
          chapo: "Ouvrez « Plus », puis « Abonnement » : la carte du haut dit tout de suite où vous en êtes.",
          image: C + "patron-40-abonnement-essai.png",
          marques: [
            { n: 1, titre: "L'état", texte: "« Essai gratuit », « Abonnement actif », « Abonnement échu » ou « Abonnement expiré », avec une phrase d'explication.", ...pt("patron-40-abonnement-essai", "carte", 0.5, 0.18), cote: "g" },
            { n: 2, titre: "Jours restants", texte: "Le compte à rebours avant la fin de la période en cours.", ...pt("patron-40-abonnement-essai", "carte", 0.5, 0.42), cote: "d" },
            { n: 3, titre: "Formule et chambres", texte: "Votre formule actuelle et le nombre de chambres de l'hôtel.", ...pt("patron-40-abonnement-essai", "carte", 0.4, 0.68), cote: "g" },
            { n: 4, titre: "Valable jusqu'au", texte: "La date de fin. Payer avant cette date ne fait perdre aucun jour.", ...pt("patron-40-abonnement-essai", "carte", 0.5, 0.9), cote: "d" },
          ],
          bas: `<div class="encadre encadre--conseil"><svg class="ico" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg><div><b>Bandeau d'alerte</b><span>Pendant les 7 derniers jours, un bandeau orange apparaît en haut de l'écran : « plus que N jours ». Appuyez dessus pour ouvrir l'abonnement.</span></div></div>`,
        }),
        texte({
          surtitre: "Formules",
          titre: "Les formules et les durées",
          chapo: "Trois formules, quatre durées. Les prix sont ceux du moment : l'écran « Abonnement » affiche toujours les prix à jour.",
          blocs: [
            {
              tableau: {
                entetes: ["Formule", "Prix par mois", "Chambres", "Ce qu'elle ouvre"],
                lignes: [
                  ["Essentiel", "29 $", "Jusqu'à 15", "Réception, réservations, facturation, double devise."],
                  ["Pro (le plus choisi)", "59 $", "Jusqu'à 40", "Tout Essentiel, plus cafétaria, hors ligne, site public, acompte en ligne."],
                  ["Premium", "99 $", "Illimité", "Tout Pro, plus domaine personnalisé, accompagnement, support prioritaire."],
                ],
              },
            },
            {
              tableau: {
                entetes: ["Durée", "Ce que vous payez"],
                lignes: [
                  ["1 mois", "1 mois de la formule"],
                  ["3 mois", "3 mois de la formule"],
                  ["6 mois", "6 mois de la formule"],
                  ["12 mois", "10 mois seulement : 2 mois offerts"],
                ],
              },
            },
            { p: "Vous payez en dollars (USD) ou en francs congolais (FC). Le prix en francs est calculé par HotelSaver à partir du prix en dollars. ScanLinkPay peut ajouter ses frais : l'écran les montre avant que vous payiez, par exemple « Prix 177 $ + frais ScanLinkPay 3,54 $ = 180,54 $ à payer »." },
            important("Une formule trop petite est refusée", "Si l'hôtel a plus de chambres que la formule n'en accepte, la formule est grisée avec le message « Votre hôtel a N chambres : cette formule en accepte M au maximum. »"),
            conseil("Vous payez pendant l'essai ?", "Aucun jour n'est perdu : l'écran le rappelle avec « Si vous payez pendant l'essai, aucun jour d'essai n'est perdu : ils s'ajoutent à votre abonnement. »"),
          ],
        }),
        etapes({
          surtitre: "Payer",
          titre: "Choisir sa formule, sa durée et sa monnaie",
          chapo: "Seul le patron peut payer. L'écran propose quatre étapes, en moins d'une minute.",
          etapes: [
            {
              titre: "Choisissez votre formule",
              texte: "Appuyez sur une carte : Essentiel, Pro ou Premium. « Le plus choisi » et « Votre formule » aident à se repérer.",
              action: "Appuyez sur « Plus », « Abonnement », puis sur une formule",
              image: C + "patron-41-formules.png",
              zone: zn("patron-41-formules", ["formules"], { mx: 0.02, my: 0.0, minH: 0.3 }),
              reperes: rps(rp("patron-41-formules", "formules", 1, 0.006, 0.002)),
            },
            {
              titre: "Choisissez la durée",
              texte: "« Combien de temps ? » : 1, 3, 6 ou 12 mois. Pour 12 mois, la mention « 2 mois offerts » apparaît.",
              action: "Appuyez sur une durée",
              image: C + "patron-42-duree.png",
              zone: zn("patron-42-duree", ["durees"], { mx: 0.04, my: 0.09 }),
              reperes: rps(rp("patron-42-duree", "durees", 1, 0.008, 0.003)),
            },
            {
              titre: "Choisissez la monnaie",
              texte: "« Monnaie » : « $ Dollars » ou « FC Francs congolais ». Les prix de l'écran changent aussitôt.",
              action: "Appuyez sur « Dollars » ou « Francs congolais »",
              image: C + "patron-42-duree.png",
              vue: [0.5, 0.85],
            },
          ],
        }),
        etapes({
          surtitre: "Payer",
          titre: "Payer avec Mobile Money",
          chapo: "Le paiement est confirmé avec votre code secret sur votre téléphone : rien n'est débité sans lui.",
          etapes: [
            {
              titre: "Choisissez votre réseau et votre numéro",
              texte: "M-Pesa (Vodacom), Orange Money, Airtel Money ou Africell Money. Écrivez le numéro Mobile Money : c'est lui qui recevra la demande. Le réseau est reconnu à partir du numéro.",
              action: "Appuyez sur votre réseau, puis écrivez le numéro",
              image: C + "patron-43-mobile-money.png",
              zone: zn("patron-43-mobile-money", ["reseaux", "numero"], { my: 0.03 }),
              reperes: rps(rp("patron-43-mobile-money", "reseaux", 1, 0.008, 0.003), rp("patron-43-mobile-money", "numero", 2)),
            },
            {
              titre: "Vérifiez « Votre commande »",
              texte: "La commande rappelle la formule, la durée, le réseau, les frais ScanLinkPay et le « Total à payer ».",
              action: "Contrôlez le total",
              image: C + "patron-44-commande.png",
              zone: zn("patron-44-commande", ["commande"], { mx: 0.02, my: 0.0, minH: 0.3 }),
              reperes: rps(rp("patron-44-commande", "commande", 1, 0.006, 0.002)),
            },
            {
              titre: "Appuyez sur « Payer »",
              texte: "Le bouton affiche le montant, par exemple « Payer 180,54 $ ». Ne fermez pas l'application pendant « Envoi de la demande… ».",
              action: "Appuyez sur « Payer … »",
              image: C + "patron-44-commande.png",
              zone: zn("patron-44-commande", ["payer"], { mx: 0.04, my: 0.1 }),
              reperes: rps(rp("patron-44-commande", "payer", 1, 0.01, 0.003)),
            },
          ],
        }),
        etapes({
          surtitre: "Payer",
          titre: "Confirmer sur le téléphone",
          chapo: "Après « Payer », l'application attend votre confirmation Mobile Money.",
          etapes: [
            {
              titre: "Entrez votre code secret",
              texte: "L'écran dit « Confirmez le paiement sur votre téléphone… ». Une demande arrive sur le numéro choisi : validez-la avec votre code secret (PIN). Un chronomètre « Attente » tourne. Vous pouvez fermer l'écran : l'abonnement s'active tout seul.",
              action: "Validez la demande sur votre téléphone",
              image: C + "patron-45-attente.png",
              zone: zn("patron-45-attente", ["attente"], { mx: 0.02, my: 0.0, minH: 0.3 }),
              reperes: rps(rp("patron-45-attente", "attente", 1, 0.006, 0.002)),
            },
            {
              titre: "Lisez « Merci ! »",
              texte: "Le paiement est confirmé : « Abonnement actif jusqu'au … », avec le montant payé, le réseau utilisé et la date de fin. Plus bas, « Paiements précédents » garde l'historique.",
              action: "Appuyez sur « Continuer »",
              image: C + "patron-46-succes.png",
              zone: zn("patron-46-succes", ["succes"], { mx: 0.02, my: 0.0, minH: 0.3 }),
              reperes: rps(rp("patron-46-succes", "succes", 1, 0.006, 0.002)),
            },
          ],
          apres: [
            {
              tableau: {
                entetes: ["Ce que vous voyez", "Que faire"],
                lignes: [
                  ["« Rien ne s'affiche ? Vérifiez : »", "Solde Mobile Money suffisant, réseau du téléphone, code secret (PIN) bien saisi, bon numéro."],
                  ["« Le paiement n'a pas abouti »", "Si l'argent n'a pas quitté votre compte, vous n'avez rien payé : « Réessayer »."],
                  ["Écran fermé avant de confirmer", "Pas de souci : l'abonnement s'active dès que le paiement est confirmé, même en retard."],
                ],
              },
            },
          ],
        }),
        etapes({
          surtitre: "Échéance",
          titre: "Abonnement échu, accès coupé, renouvellement",
          chapo: "Sept jours avant la fin, un bandeau orange prévient. Voici ce qui se passe ensuite.",
          etapes: [
            {
              titre: "Après la date : 3 jours de grâce",
              texte: "Bandeau rouge : « Abonnement échu depuis le … : l'accès sera bientôt coupé. Renouvelez maintenant. » Tout fonctionne encore. Appuyez sur le bandeau pour ouvrir l'abonnement.",
              action: "Appuyez sur « Voir l'abonnement »",
              image: C + "patron-49-echu.png",
              zone: [0, 0, 1, 0.3],
            },
            {
              titre: "Ensuite : « Votre abonnement a expiré »",
              texte: "L'application est remplacée par cet écran pour tout le monde. Le patron peut payer ici ; les autres lisent « Demandez au patron de renouveler ». Les données sont conservées.",
              action: "Payez, puis appuyez sur « Continuer »",
              image: C + "patron-50-bloque.png",
              vue: [0.0, 0.14],
            },
          ],
          apres: [
            info("Après le paiement", "L'accès rouvre tout de suite, sans redémarrer, et les actions en attente sur les téléphones partent toutes seules. Payer en retard repart de la date du paiement ; payer d'avance ajoute la nouvelle période à la fin de l'actuelle."),
            important("Accès suspendu ou résilié", "Si HotelSaver a suspendu ou résilié l'hôtel, l'écran dit « L'accès de votre hôtel est suspendu » ou « L'abonnement de votre hôtel est résilié ». Payer en ligne est alors refusé : contactez le support au +243 828 497 218."),
          ],
        }),
        etapes({
          surtitre: "Sur le site web",
          titre: "Payer depuis le site HotelSaver",
          chapo: "La page « Payer mon abonnement » marche dans le navigateur d'un téléphone ou d'un ordinateur, sans installer d'application.",
          etapes: [
            {
              titre: "Ouvrez la page de paiement",
              texte: "Sur le site HotelSaver, ouvrez /payer. Connectez-vous avec le numéro et le mot de passe du patron. Un employé est refusé : seul le patron peut payer.",
              action: "Écrivez votre numéro, puis appuyez sur « Continuer »",
              image: C + "patron-90-web-connexion.png",
              zone: zn("patron-90-web-connexion", ["telephone", "motdepasse", "continuer"], { my: 0.03 }),
              reperes: rps(rp("patron-90-web-connexion", "telephone", 1), rp("patron-90-web-connexion", "motdepasse", 2), rp("patron-90-web-connexion", "continuer", 3)),
            },
            {
              titre: "Formule, durée, monnaie, réseau, « Payer »",
              texte: "Mêmes choix que dans l'application : formule, « Pour combien de temps ? », « Dans quelle monnaie ? », réseau Mobile Money et numéro. Vérifiez le « Récapitulatif », appuyez sur « Payer » et validez avec votre code secret.",
              action: "Appuyez sur « Payer … »",
              image: C + "patron-95-web-recap.png",
              zone: zn("patron-95-web-recap", ["recap", "payer"], { mx: 0.04, my: 0.08, minH: 0.3 }),
              reperes: rps(rp("patron-95-web-recap", "payer", 1, 0.01, 0.003)),
            },
          ],
          apres: [
            info("Quand utiliser le site ?", "Si le téléphone n'a plus de place, ou si vous préférez un ordinateur. Dans certaines versions de l'application, le bouton « Payer sur le site HotelSaver » ouvre cette page. Le support répond aussi sur WhatsApp au +243 828 497 218."),
          ],
        }),
      ],
    },

    /* ================================================================== 6 */
    {
      titre: "Suivre la réception",
      points: [
        "Les chambres, leurs états et les réservations",
        "Le planning, les arrivées et les départs, les clients",
        "Les repères « Payé en ligne » et « Chambre déjà réservée »",
        "Décider des remboursements d'acomptes",
      ],
      pages: [
        annote({
          surtitre: "Chambres",
          titre: "L'état de chaque chambre",
          chapo: "Onglet « Chambres » : une carte par chambre, avec son état, son type et son prix par nuit.",
          image: C + "patron-51-chambres.png",
          largeurEcran: 250,
          marques: [
            { n: 1, titre: "Nouvelle chambre", texte: "Le bouton « + » (patron seulement) ajoute une chambre.", ...pt("patron-51-chambres", "nouvelle", 0.2, 0.5), cote: "g" },
            { n: 2, titre: "Une carte de chambre", texte: "Numéro, type, état et prix par nuit. Appuyez dessus pour ouvrir ses actions.", ...pt("patron-51-chambres", "premiere", 0.5, 0.5), cote: "d" },
          ],
          bas: `<table class="tableau" style="margin-top:0"><thead><tr><th>État</th><th>Ce que cela veut dire</th></tr></thead><tbody><tr><td>Libre</td><td>Prête à être louée ou réservée.</td></tr><tr><td>Réservée</td><td>Une réservation confirmée l'attend.</td></tr><tr><td>Occupée</td><td>Un client est dans la chambre.</td></tr><tr><td>Nettoyage</td><td>Le client est parti : la chambre est à préparer.</td></tr></tbody></table>`,
        }),
        etapes({
          surtitre: "Réservations",
          titre: "Lire et ouvrir une réservation",
          chapo: "Onglet « Réserv. » : cinq vues en haut de l'écran pour trouver la bonne réservation.",
          etapes: [
            {
              titre: "Choisissez une vue, lisez la carte",
              texte: "« Aujourd'hui » (arrivées et départs du jour), « À venir », « En cours » (clients présents), « Historique » (terminés ou annulés), « Planning ». Chaque carte donne le client, l'état (En attente, Confirmée, En cours, Terminée, Annulée), la chambre, les dates et le prix par nuit.",
              action: "Appuyez sur « Réserv. », puis sur une vue",
              image: C + "patron-52-reservations.png",
              zone: zn("patron-52-reservations", ["segments"], { mx: 0.3, my: 0.16 }),
              reperes: rps(rp("patron-52-reservations", "segments", 1)),
            },
            {
              titre: "Ouvrez la fiche",
              texte: "La fiche montre le séjour, l'acompte, le client, le suivi en ligne et les actions. « site public » sur une carte indique une demande venue du site. Un patron qui n'opère pas peut « Annuler la réservation ».",
              action: "Appuyez sur une réservation",
              image: C + "patron-54-detail.png",
              zone: [0, 0.0, 1, 0.3],
            },
          ],
          apres: [
            important("Lecture seule pour le patron", "Tant que « Le patron peut aussi opérer » est éteint, vous consultez : créer une réservation, confirmer, faire le check-in, modifier les dates et facturer sont réservés à la réception. Annuler reste possible, avec un motif obligatoire."),
          ],
        }),
        etapes({
          surtitre: "Au jour le jour",
          titre: "Planning, arrivées et clients",
          chapo: "Trois écrans pour savoir qui arrive, qui part, qui est présent.",
          etapes: [
            {
              titre: "Le planning",
              texte: "Une ligne par chambre, une colonne par jour. Une barre colorée est une réservation : appuyez dessus pour l'ouvrir. Une case vide permet de créer une réservation pré-remplie.",
              action: "Appuyez sur « Réserv. », puis sur « Planning »",
              image: C + "patron-53-planning.png",
              vue: [0.12, 0.52],
            },
            {
              titre: "Arrivées et départs",
              texte: "Dans « Plus », section « Réception ». Vous voyez les arrivées du jour, les départs du jour et les clients présents, avec leur chambre et leur date de départ.",
              action: "Appuyez sur « Plus », puis sur « Arrivées et départs »",
              image: C + "patron-55-arrivees.png",
              vue: [0.08, 0.5],
            },
            {
              titre: "Les clients",
              texte: "La liste des clients, avec une recherche par nom ou téléphone. Appuyez sur un client pour voir sa fiche et ses séjours. Les clients sont créés à la première réservation.",
              action: "Appuyez sur « Plus », puis sur « Clients »",
              image: C + "patron-56-clients.png",
              vue: [0.08, 0.5],
            },
          ],
        }),
        etapes({
          surtitre: "Paiements en ligne",
          titre: "Repérer une réservation payée en ligne",
          chapo: "Deux repères vous évitent les erreurs : « Payé en ligne » et « Chambre déjà réservée ».",
          etapes: [
            {
              titre: "« Payé en ligne » dans la liste",
              texte: "Un repère vert apparaît sur la carte. Il devient « Payé en ligne · à rembourser ? » si la réservation est annulée, puis « remboursé » ou « conservé ». Sans internet, il n'apparaît pas, mais l'acompte reste affiché.",
              action: "Regardez la liste « Réserv. »",
              image: C + "patron-52b-reservations-liste.png",
              vue: [0.05, 0.4],
            },
            {
              titre: "Le bloc dans la fiche",
              texte: "« Acompte payé en ligne par le client » : montant reçu, date, moyen (M-Pesa, Airtel, carte…), numéro masqué et référence. Donnez la référence au support en cas de question.",
              action: "Ouvrez la réservation",
              image: C + "patron-54-detail.png",
              zone: zn("patron-54-detail", ["payeEnLigne"], { mx: 0.04, my: 0.04, minH: 0.2 }),
              reperes: rps(rp("patron-54-detail", "payeEnLigne", 1, 0.008, 0.002)),
            },
          ],
          apres: [
            important("« Chambre déjà réservée par un autre client »", "Une demande du site pour une chambre déjà prise porte ce repère rouge, et « Confirmer la demande » est grisé. La réception propose une autre chambre ou d'autres dates, ou refuse la demande."),
            info("Une chambre réservée ne se réserve pas deux fois", "Sur le site, elle reste visible avec « Déjà réservée », sans bouton. Pendant qu'un client confirme son paiement, elle lui est retenue 10 minutes : les autres la voient « Réservation en cours »."),
          ],
        }),
        annote({
          surtitre: "Remboursements",
          titre: "Les acomptes à rembourser ou à garder",
          chapo: "Quand une réservation payée en ligne est annulée, c'est vous qui décidez : rembourser, ou conserver l'acompte.",
          image: C + "patron-58b-remboursement-carte.png",
          marques: [
            { n: 1, titre: "Où envoyer l'argent", texte: "Le numéro ScanLinkPay du client, sinon son téléphone. « Copier » le copie.", ...pt("patron-58b-remboursement-carte", "destination", 0.5, 0.4), cote: "g" },
            { n: 2, titre: "« J'ai remboursé »", texte: "À utiliser après avoir envoyé l'argent au client. Vous pouvez rendre moins que l'acompte.", ...pt("patron-58b-remboursement-carte", "rembourse", 0.95, 0.5), cote: "d" },
            { n: 3, titre: "« Conserver l'acompte »", texte: "Le client n'est pas remboursé : l'acompte reste à l'hôtel, selon vos conditions.", ...pt("patron-58b-remboursement-carte", "conserver", 0.95, 0.5), cote: "d" },
          ],
          bas: `<div class="encadre encadre--attention"><svg class="ico" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg><div><b>HotelSaver ne rend jamais l'argent tout seul</b><span>Vous envoyez l'argent vous-même (compte ScanLinkPay du client, Mobile Money ou espèces), puis vous le marquez ici.</span></div></div>`,
        }),
        etapes({
          surtitre: "Remboursements",
          titre: "Décider et enregistrer",
          chapo: "Dans « Plus », section « Réception », « Remboursements » : onglets « À faire » et « Historique ».",
          etapes: [
            {
              titre: "Ouvrez la liste « À faire »",
              texte: "Chaque carte donne le client, la chambre, la raison (« Le client a annulé », « L'hôtel a annulé », « Client non présenté », « Chambre indisponible », « Autre raison ») et le montant payé en ligne.",
              action: "Appuyez sur « Plus », puis sur « Remboursements »",
              image: C + "patron-58-remboursements.png",
              zone: zn("patron-58-remboursements", ["onglets", "carte"], { my: 0.02 }),
              reperes: rps(rp("patron-58-remboursements", "onglets", 1)),
            },
            {
              titre: "Envoyez l'argent, puis « J'ai remboursé »",
              texte: "Le montant proposé est tout l'acompte ; vous pouvez en rendre moins. Choisissez « Comment avez-vous remboursé ? » : Compte ScanLinkPay, Mobile Money, Espèces ou Autre moyen. Ajoutez la référence.",
              action: "Appuyez sur « Enregistrer le remboursement »",
              image: C + "patron-59-remboursement-confirmer.png",
              zone: zn("patron-59-remboursement-confirmer", ["modes", "enregistrer"], { my: 0.03 }),
              reperes: rps(rp("patron-59-remboursement-confirmer", "modes", 1, 0.01, 0.004), rp("patron-59-remboursement-confirmer", "enregistrer", 2, 0.01, 0.004)),
            },
            {
              titre: "Confirmez",
              texte: "L'application demande « Confirmer le remboursement ? » : appuyez sur « Oui, j'ai remboursé ». Pour garder l'acompte, appuyez sur « Conserver l'acompte », écrivez la raison, puis « Oui, conserver ».",
              action: "Appuyez sur « Oui, j'ai remboursé » ou « Oui, conserver »",
              image: C + "patron-58b-remboursement-carte.png",
              zone: zn("patron-58b-remboursement-carte", ["rembourse", "conserver"], { mx: 0.04, my: 0.05 }),
              reperes: rps(rp("patron-58b-remboursement-carte", "rembourse", 1), rp("patron-58b-remboursement-carte", "conserver", 2)),
            },
          ],
        }),
        texte({
          surtitre: "Remboursements",
          titre: "L'historique et les règles à retenir",
          chapo: "L'onglet « Historique » garde chaque décision : « Décisions déjà prises ».",
          blocs: [
            {
              tableau: {
                entetes: ["Ce que vous lisez", "Ce que cela veut dire"],
                lignes: [
                  ["Remboursé", "Vous avez rendu l'argent, avec le moyen, la date et la référence."],
                  ["Acompte conservé", "Vous avez gardé l'acompte ; la raison que vous avez écrite est affichée."],
                  ["À faire (N)", "N acomptes attendent encore votre décision."],
                ],
              },
            },
            {
              parcours: [
                { titre: "Le client indique où recevoir l'argent", texte: "Il peut donner son numéro ScanLinkPay en payant ; sinon son téléphone est noté. Annuler depuis le lien ne permet jamais de rediriger l'argent ailleurs." },
                { titre: "Vous envoyez l'argent", texte: "Dans l'application ScanLinkPay : « Envoyer », puis le numéro du client. Le client sans compte peut être invité par WhatsApp : « Inviter ce client sur ScanLinkPay »." },
                { titre: "Vous le marquez dans HotelSaver", texte: "Le client voit l'état sur sa page : remboursement en cours, effectué (montant, moyen) ou acompte conservé." },
              ],
            },
            conseil("Écrivez des conditions claires", "Vos « Conditions d'annulation et de remboursement » sont lues par le client avant de payer. Plus elles sont précises, plus vos décisions sont simples à expliquer."),
            info("Une décision ne se prend qu'une fois", "Chaque remboursement est tracé et ne peut pas être décidé deux fois. Si quelqu'un l'a déjà fait, l'application l'écrit et met la liste à jour. Il faut une connexion internet pour voir et décider."),
            { h: "Les raisons possibles d'un remboursement" },
            {
              tableau: {
                entetes: ["Raison affichée", "Situation"],
                lignes: [
                  ["Le client a annulé", "Il a annulé depuis son lien « Ma réservation »."],
                  ["L'hôtel a annulé", "La réception ou le patron a annulé la réservation."],
                  ["Client non présenté", "Le client ne s'est pas présenté (motif « Client non présenté »)."],
                  ["Chambre indisponible", "La chambre n'était plus disponible au moment du paiement."],
                  ["Autre raison", "Tout autre cas."],
                ],
              },
            },
          ],
        }),
      ],
    },

    /* ================================================================== 7 */
    {
      titre: "Suivre la cafétaria",
      points: [
        "Le menu : produits, plats préparés, visibilité sur le site",
        "Le stock : entrées, pertes, ajustements réservés au patron",
        "L'inventaire physique et son PDF",
        "Comptes ouverts, retrait de commande et cuisine",
      ],
      pages: [
        etapes({
          surtitre: "Menu",
          titre: "Gérer le menu",
          chapo: "Le menu est la liste des produits en vente. Le personnel le consulte ; seul le patron le modifie.",
          etapes: [
            {
              titre: "Ouvrez « Menu »",
              texte: "Dans « Plus », section « Cafétaria ». Chaque produit affiche son nom, sa catégorie, son prix et son stock. Des marques disent « Plat », « Site » (visible sur le site), « Inactif » ou « Épuisé ».",
              action: "Appuyez sur « Plus », puis sur « Menu »",
              image: C + "patron-65-menu.png",
              zone: zn("patron-65-menu", ["nouveau"], { mx: 0.4, my: 0.0, minH: 0.5 }),
            },
            {
              titre: "Ajoutez ou modifiez un produit",
              texte: "Appuyez sur « + » (Nouveau produit) ou sur un produit. Type : « Article comptoir » (stocké : bière, sucre…) ou « Plat préparé » (cuisiné). Puis prix et devise, seuil d'alerte, prix d'achat, code-barres ; pour un plat : photo, portions, description et « Visible et commandable sur le site ». « Actif à la vente » retire un produit sans le supprimer.",
              action: "Appuyez sur « + », remplissez, puis « Enregistrer »",
              image: C + "patron-66-produit.png",
              vue: [0.05, 0.35],
            },
          ],
          apres: [
            info("Étiquettes de prix", "Après l'enregistrement, vous pouvez imprimer des étiquettes à code-barres : « Nombre d'étiquettes ». Un code-barres s'obtient en le scannant (« Scanner le code du fabricant ») ou avec « Générer »."),
          ],
        }),
        etapes({
          surtitre: "Stock",
          titre: "Suivre et corriger le stock",
          chapo: "Le stock baisse tout seul à chaque vente. Les mouvements à la main sont : Entrée, Perte, Ajustement.",
          etapes: [
            {
              titre: "Lisez l'écran « Stock »",
              texte: "L'onglet « Mouvements » liste chaque mouvement avec son type (Entrée, Vente, Retour (annulation), Perte, Ajustement). L'onglet « Valeur stock » donne la valeur de chaque produit.",
              action: "Appuyez sur « Plus », puis sur « Stock »",
              image: C + "patron-67-stock.png",
              vue: [0.06, 0.45],
            },
            {
              titre: "Enregistrez un mouvement",
              texte: "Appuyez sur « + » (Nouveau mouvement) : produit, type, quantité, motif facultatif (par exemple « livraison fournisseur »). Le personnel ne saisit que des « Entrée » ; « Perte » (casse) et « Ajustement » (correction, avec un nombre négatif pour retirer) sont réservés au patron.",
              action: "Appuyez sur « + », puis sur « Enregistrer »",
              image: C + "patron-68-mouvement.png",
              vue: [0.1, 0.5],
            },
          ],
          apres: [
            important("Message du serveur", "Si un employé essaie une perte ou un ajustement : « Seul le patron peut enregistrer une perte ou un ajustement de stock. » C'est voulu : cela protège le stock contre les erreurs et les vols."),
          ],
        }),
        etapes({
          surtitre: "Inventaire",
          titre: "Faire un inventaire physique",
          chapo: "Comptez le stock réel et comparez-le au stock théorique. Les écarts sont expliqués et gardés.",
          etapes: [
            {
              titre: "Choisissez la période",
              texte: "« Plus », « Inventaire », « Nouvel inventaire ». Renseignez la date de début, la date de fin et, si vous voulez, un titre (par exemple « Inventaire octobre 2026 »).",
              action: "Appuyez sur « Lancer l'évaluation »",
              image: C + "patron-69-inventaire.png",
              vue: [0.1, 0.5],
              reperes: rps(rp("patron-69-inventaire", "lancer", 1)),
            },
            {
              titre: "Saisissez, validez, lisez le résultat",
              texte: "Pour chaque produit, écrivez « Stock physique compté » ; un écart demande une note. « Valider l'inventaire » affiche « Inventaire enregistré » : produits, écarts, manquants, surplus. « Télécharger le PDF » le garde ; « Historique » liste les anciens.",
              action: "Appuyez sur « Valider l'inventaire »",
              image: C + "patron-70-inventaire-saisie.png",
              vue: [0.1, 0.5],
            },
          ],
          apres: [conseil("Un bon moment pour compter", "Faites l'inventaire en fin de mois, avant de générer les rapports : les chiffres du stock sont alors justes.")],
        }),
        texte({
          surtitre: "Au comptoir",
          titre: "Comptes ouverts, retrait de commande et cuisine",
          chapo: "Trois rubriques de « Plus », section « Cafétaria », que le patron consulte.",
          blocs: [
            {
              cartes: [
                { icone: "recu", titre: "Comptes ouverts", texte: "Les tables et clients dont l'addition n'est pas encore payée.", points: ["Total de chaque compte", "Appuyez pour voir les lignes", "« Site public » : commande du site"] },
                { icone: "colis", titre: "Retrait commande", texte: "Un client a commandé sur le site de l'hôtel.", points: ["Écrivez la « Référence du ticket »", "« Ouvrir la commande »", "Le client paie au comptoir"] },
                { icone: "couverts", titre: "Cuisine", texte: "La file des plats à préparer (suivi cuisine activé).", points: ["« Prendre en charge »", "« Marquer prêt »", "« Cuisine à jour ! » quand tout est servi"] },
              ],
            },
            { p: "Les ventes se font à la caisse par le personnel de la cafétaria. Le patron voit « Caisse » seulement si « Le patron peut aussi opérer » est activé." },
            { h: "Les commandes du site" },
            {
              parcours: [
                { titre: "Activez « Commande en ligne sur le site »", texte: "Dans « Paramètres ». Un onglet « Cuisine » apparaît sur le site de l'hôtel." },
                { titre: "Publiez les plats", texte: "Dans « Menu », cochez « Visible et commandable sur le site » sur chaque plat." },
                { titre: "La cafétaria est prévenue", texte: "L'alerte « Nouvelle commande depuis le site web » arrive ; la commande se retrouve dans « Comptes ouverts »." },
              ],
            },
            { h: "Ce que le patron peut faire à la cafétaria" },
            {
              tableau: {
                entetes: ["Action", "Patron"],
                lignes: [
                  ["Consulter les comptes ouverts, le menu, le stock, l'inventaire", "Oui"],
                  ["Ouvrir un compte, encaisser à la caisse", "Seulement si « Le patron peut aussi opérer » est activé"],
                  ["Créer ou modifier un produit du menu", "Oui : seul le patron"],
                  ["Enregistrer une perte ou un ajustement de stock", "Oui : seul le patron"],
                  ["Annuler un reçu de cafétaria (avec motif)", "Oui : seul le patron"],
                ],
              },
            },
          ],
        }),
      ],
    },

    /* ================================================================== 8 */
    {
      titre: "Chiffres, rapports et reçus",
      points: [
        "Le journal de la journée : encaissements et remise de poste",
        "Les rapports mensuels PDF de la réception et de la cafétaria",
        "Les dépenses et leur PDF",
        "Le journal des reçus : retrouver, réimprimer, annuler",
      ],
      pages: [
        etapes({
          surtitre: "Suivi du jour",
          titre: "Le journal de la journée et les reçus",
          chapo: "Deux écrans pour contrôler l'argent : ce qui est entré aujourd'hui et chaque reçu émis.",
          etapes: [
            {
              titre: "Le journal de la journée",
              texte: "« Encaissements du jour » : chambres et cafétaria, puis le « Total ». Plus bas : « Reste à accueillir », « Reste à facturer » et le parc de chambres (libres, occupées, réservées, nettoyage).",
              action: "Appuyez sur « Plus », puis sur « Journal de la journée »",
              image: C + "patron-57-journal.png",
              zone: zn("patron-57-journal", ["encaissements"], { mx: 0.03, my: 0.05, minH: 0.3 }),
              reperes: rps(rp("patron-57-journal", "encaissements", 1, 0.006, 0.003)),
            },
            {
              titre: "Le journal des reçus",
              texte: "Onglets « Séjours » et « Cafétaria » : numéro de reçu, date, montant, mode de paiement. Seul le patron annule un reçu : « Motif d'annulation (obligatoire) », puis « Annuler le reçu ». Pour une vente, « Remettre les articles en stock » est proposé. L'annulation est définitive et demande une connexion.",
              action: "Appuyez sur « Plus », « Journal des reçus », puis sur un reçu",
              image: C + "patron-77-recus.png",
              vue: [0.1, 0.5],
            },
          ],
          apres: [
            info("Les numéros de reçu", "Un reçu définitif s'écrit REC-AAAAMMJJ-0001 pour une chambre. Un reçu fait sans internet porte d'abord un numéro provisoire « TEMP- » : voir le chapitre 9."),
          ],
        }),
        annote({
          surtitre: "Rapports",
          titre: "Les rapports mensuels",
          chapo: "Chaque mois, la réception et la cafétaria génèrent leur rapport PDF officiel. Vous les consultez.",
          image: C + "patron-75-rapports.png",
          marques: [
            { n: 1, titre: "Le mois", texte: "Choisissez le mois. Par défaut : le mois écoulé, car on remet le rapport le 1er du mois suivant.", ...pt("patron-75-rapports", "mois", 0.5, 0.5), cote: "g" },
            { n: 2, titre: "Rapport Réception", texte: "Numéro du rapport, qui l'a généré et quand. « Ouvrir le PDF » l'affiche.", ...pt("patron-75-rapports", "reception", 0.5, 0.3), cote: "d" },
            { n: 3, titre: "Rapport Cafétaria", texte: "Même chose pour la cafétaria. « Aucun rapport pour ce mois » : il n'est pas encore généré.", ...pt("patron-75-rapports", "cafeteria", 0.5, 0.3), cote: "g" },
          ],
          bas: `<table class="tableau" style="margin-top:0"><thead><tr><th>Mention</th><th>Sens</th></tr></thead><tbody><tr><td>Concordant</td><td>Le rapport correspond aux reçus.</td></tr><tr><td>Écart détecté</td><td>Une différence existe entre le rapport et les reçus : demandez pourquoi.</td></tr><tr><td>Provisoire</td><td>Le rapport contient encore des reçus provisoires (TEMP-).</td></tr></tbody></table>`,
        }),
        etapes({
          surtitre: "Dépenses",
          titre: "Consulter les dépenses",
          chapo: "La réception et la cafétaria saisissent leurs dépenses. Vous les consultez, sans pouvoir les saisir.",
          etapes: [
            {
              titre: "Ouvrez « Dépenses »",
              texte: "Dans « Plus », section « Reçus ». Le titre dit « Réception et Cafétaria ». Choisissez la période : « Aujourd'hui », « Ce mois » ou « Mois dernier ». Chaque ligne donne la date, le service, le motif, le montant et qui l'a saisie.",
              action: "Appuyez sur « Plus », puis sur « Dépenses »",
              image: C + "patron-76-depenses.png",
              zone: zn("patron-76-depenses", ["pdf", "filtres"], { mx: 0.04, my: 0.06 }),
              reperes: rps(rp("patron-76-depenses", "filtres", 1)),
            },
            {
              titre: "Téléchargez le PDF",
              texte: "« Télécharger le PDF des dépenses » crée un document de la période. Il faut une connexion internet : hors ligne, l'écran l'indique.",
              action: "Appuyez sur « Télécharger le PDF »",
              image: C + "patron-76-depenses.png",
              zone: zn("patron-76-depenses", ["pdf"], { mx: 0.3, my: 0.07 }),
              reperes: rps(rp("patron-76-depenses", "pdf", 1)),
            },
          ],
          apres: [
            conseil("Une dépense saisie par erreur ?", "Le personnel peut la corriger ou l'annuler (« Annuler cette dépense »). Vous voyez alors la ligne barrée : elle reste tracée et ne compte plus."),
          ],
        }),
      ],
    },

    /* ================================================================== 9 */
    {
      titre: "Travailler sans internet, en sécurité",
      points: [
        "L'indicateur de synchronisation et le mode hors ligne",
        "Ce qui marche sans internet, ce qui demande une connexion",
        "Les reçus provisoires « TEMP- »",
        "Mot de passe, verrouillage, déconnexion et erreurs fréquentes",
      ],
      pages: [
        annote({
          surtitre: "Hors ligne",
          titre: "Quand le réseau disparaît",
          chapo: "L'application continue de fonctionner : elle garde vos actions sur le téléphone et les envoie au retour du réseau.",
          image: C + "patron-80-hors-ligne.png",
          marques: [
            { n: 1, titre: "Indicateur d'état", texte: "Il dit « À jour », « Hors ligne », « N actions à envoyer », « Action refusée » ou « Conflit à vérifier ».", ...pt("patron-80-hors-ligne", "synchro", 0.5, 0.5), cote: "g" },
            { n: 2, titre: "Le bandeau du haut", texte: "Hors ligne, un bandeau noir « Hors ligne · N actions à envoyer » apparaît. Rouge, il demande votre attention.", ...pt("patron-80-hors-ligne", "synchro", 0.9, 0.5), cote: "d" },
          ],
          bas: `<table class="tableau" style="margin-top:0"><thead><tr><th>Titre</th><th>Ce que cela veut dire</th></tr></thead><tbody><tr><td>À jour</td><td>Tout est envoyé et la dernière synchronisation a réussi.</td></tr><tr><td>N actions à envoyer</td><td>Elles partent dès que possible.</td></tr><tr><td>Hors ligne</td><td>Pas de connexion : vous travaillez sur les données du téléphone.</td></tr><tr><td>Données anciennes</td><td>Aucune synchronisation depuis plus de 24 heures.</td></tr><tr><td>Horloge à corriger</td><td>L'heure du téléphone diffère de plus de 5 minutes de celle du serveur.</td></tr></tbody></table>`,
        }),
        texte({
          surtitre: "Hors ligne",
          titre: "Ce qui marche sans internet",
          chapo: "Le travail du quotidien continue. Ce qui touche à l'argent en ligne ou à la sécurité demande une connexion.",
          blocs: [
            {
              tableau: {
                entetes: ["Sans internet", "Il faut une connexion"],
                lignes: [
                  ["Voir les chambres, réservations, clients, stock", "Utilisateurs (créer, modifier, désactiver)"],
                  ["Changer l'état d'une chambre, créer ou modifier une chambre, un produit", "Taux de change (saisie et historique)"],
                  ["Réserver, check-in, check-out, facturer (patron qui opère, réception)", "Abonnement : paiement et renouvellement"],
                  ["Encaisser à la caisse de la cafétaria, avancer les plats en cuisine", "Remboursements d'acomptes : voir et décider"],
                  ["Saisir une dépense, un mouvement de stock", "Site de l'hôtel, paiement en ligne des acomptes"],
                  ["Imprimer ou réimprimer un reçu", "Annuler un reçu, rapports PDF, PDF des dépenses"],
                ],
              },
            },
            important("14 jours sans contact", "Si le téléphone reste 14 jours sans joindre le serveur, il demande de se reconnecter à internet avant de rouvrir la session. Vos données et vos actions non envoyées restent sur le téléphone."),
            info("L'écran « Synchronisation »", "« Synchroniser maintenant » force l'envoi. Une action refusée par le serveur se relit puis se retire avec « Retirer l'action ». Un conflit se tranche avec « Garder la version du serveur » : votre changement est alors perdu."),
            { h: "Quand le réseau revient" },
            {
              parcours: [
                { titre: "L'application le retrouve toute seule", texte: "Elle vérifie le serveur régulièrement et au retour de la connexion." },
                { titre: "Les actions partent dans l'ordre", texte: "Chaque action gardée sur le téléphone est envoyée. L'indicateur passe de « N actions à envoyer » à « À jour »." },
                { titre: "Vous contrôlez si besoin", texte: "Dans « Synchronisation » : « Dernière synchro », « En attente d'envoi », « Aucun conflit », « Aucune action bloquée »." },
              ],
            },
          ],
        }),
        texte({
          surtitre: "Hors ligne",
          titre: "Les reçus provisoires « TEMP- »",
          chapo: "Sans internet, le serveur ne peut pas numéroter le reçu. Le téléphone en remet un provisoire.",
          blocs: [
            {
              parcours: [
                { titre: "Le reçu est fait sans connexion", texte: "Il porte un numéro « TEMP-poste-date-numéro », par exemple TEMP-FQWV-20261020-001. Le « poste » est un code de 4 caractères propre au téléphone." },
                { titre: "La connexion revient", texte: "Le serveur enregistre la vente et lui donne son vrai numéro (REC- pour une chambre, CAF- pour la cafétaria). Le numéro provisoire est gardé à côté pour retrouver le reçu." },
                { titre: "Dans les écrans", texte: "Le reçu affiche « Provisoire » avec la phrase « Numéro définitif attribué à la synchronisation. » dans le journal des reçus." },
              ],
            },
            important("Les rapports et les reçus provisoires", "Un rapport mensuel qui contient encore des reçus provisoires est marqué « Provisoire ». Laissez le téléphone synchroniser, puis régénérez le rapport."),
            conseil("Avant d'effacer un téléphone", "Ne désinstallez pas l'application et n'appuyez pas sur « Effacer les données de cet appareil » tant que des actions restent « à envoyer » : elles seraient perdues."),
            { h: "Les trois familles de numéros" },
            {
              tableau: {
                entetes: ["Numéro", "Sens"],
                lignes: [
                  ["REC-20261019-0001", "Reçu définitif d'un séjour (chambre)."],
                  ["CAF-20261020-0001", "Reçu définitif d'une vente de cafétaria."],
                  ["TEMP-FQWV-20261020-001", "Reçu provisoire fait sans internet : il sera remplacé par un numéro définitif."],
                ],
              },
            },
          ],
        }),
        etapes({
          surtitre: "Sécurité",
          titre: "Protéger votre compte patron",
          chapo: "Votre compte voit l'argent de l'hôtel : protégez-le. Tout se règle dans « Plus », puis « Paramètres », carte « Sécurité ».",
          etapes: [
            {
              titre: "Changez votre mot de passe",
              texte: "Écrivez le « Mot de passe actuel », le « Nouveau mot de passe » (8 caractères au moins), puis confirmez-le. Vos autres appareils devront se reconnecter.",
              action: "Appuyez sur « Changer le mot de passe »",
              image: C + "patron-21-securite.png",
              vue: [0.4, 0.95],
            },
            {
              titre: "Verrouillez après une absence",
              texte: "« Redemander le mot de passe après une absence » : « Jamais », « 5 min », « 15 min » ou « 1 h ». L'application vous ramène alors à l'écran des profils. Sur un téléphone partagé, utilisez aussi « Changer de profil » dans « Mon compte ».",
              action: "Appuyez sur un délai",
              image: C + "patron-21-securite.png",
              vue: [0.1, 0.6],
            },
          ],
          apres: [
            important("Votre mot de passe est personnel", "Ne le donnez à personne, même à un employé. Le mot de passe du patron est toujours demandé à l'ouverture de l'application. Si un téléphone est perdu ou volé, désactivez le compte concerné tout de suite dans « Utilisateurs »."),
          ],
        }),
        texte({
          surtitre: "Aide",
          titre: "Les erreurs fréquentes",
          chapo: "Les messages ci-dessous sont ceux de l'application. Ils sont écrits en français simple : suivez la consigne.",
          blocs: [
            {
              tableau: {
                entetes: ["Message", "Que faire"],
                lignes: [
                  ["« Pas de connexion au serveur. Vérifiez le réseau puis réessayez. »", "Contrôlez le Wi-Fi ou les données mobiles. Ce qui peut se faire hors ligne est gardé."],
                  ["« Votre session a expiré : reconnectez-vous. »", "Reconnectez-vous avec votre numéro et votre mot de passe."],
                  ["« Vous n'avez pas le droit de faire cette action. »", "Cette action est réservée à un autre rôle. Voir le tableau des droits (chapitre 4)."],
                  ["« Cette information a changé entre-temps. Actualisez puis recommencez. »", "Quelqu'un a modifié la même fiche. Tirez l'écran vers le bas pour actualiser."],
                  ["« Trop de demandes en peu de temps. Patientez un instant puis réessayez. »", "Attendez quelques secondes."],
                  ["« Le serveur a rencontré un problème. Réessayez dans un instant… »", "Réessayez. Si cela continue, contactez le support HotelSaver."],
                  ["« Cette fonction n'est pas incluse dans votre formule… »", "Choisissez une formule supérieure dans « Abonnement »."],
                  ["« L'imprimante ne répond pas : vérifiez qu'elle est allumée… »", "Allumez-la, approchez-la, vérifiez qu'elle est appairée en Bluetooth."],
                  ["« Ce numéro de téléphone est déjà utilisé par un autre compte. »", "Choisissez un autre numéro pour le compte."],
                  ["« Seul le patron peut enregistrer une perte ou un ajustement de stock. »", "Connectez-vous avec le compte patron."],
                ],
              },
            },
            info("Besoin d'aide ?", "Le support HotelSaver répond par téléphone et sur WhatsApp au +243 828 497 218. Les écrans « Abonnement » et « abonnement expiré » ont un bouton pour lui écrire."),
          ],
        }),
      ],
    },
  ],
};
