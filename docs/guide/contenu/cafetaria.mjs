import { annote, encadre, etapes, texte } from "../modele.mjs";

/**
 * Partie C : la cafétaria. Les instructions suivent l'application MOBILE (apps/mobile) : libellés des boutons, parcours et règles.
 * Les images sont dans captures/brut/cafetaria-*.png (script : captures-scripts/cafetaria.cjs). Les repères (x, y, l, h) sont des
 * fractions de la capture : ils sont regroupés dans R pour être recalés d'un seul endroit quand les captures changent.
 */
const C = "captures/brut/cafetaria-";

/* Repères et zones (à recaler après chaque nouvelle série de captures). */
const R = {
  caisseChamps: [{ x: 0.04, y: 0.29, l: 0.92, h: 0.12, n: 1 }],
};

export default {
  id: "cafetaria",
  titre: "Partie C · La cafétaria",
  libelle: "Guide de la cafétaria",
  guide: "Guide de la cafétaria",
  icone: "cafe",
  chapitres: [
    /* ============================================================ 1 */
    {
      titre: "Découvrir votre écran",
      points: [
        "L'écran d'accueil : vos encaissements, le stock bas, l'activité récente",
        "Les boutons du bas : Accueil, Caisse, Comptes, Dépenses, Plus",
        "Le menu « Plus » et le menu de votre compte",
        "Ce que la cafétaria peut faire, et ce qui est réservé au patron",
      ],
      pages: [
        annote({
          surtitre: "Votre écran d'accueil",
          titre: "Ce que vous voyez en arrivant",
          chapo: "L'accueil résume votre journée. Il se met à jour tout seul.",
          image: C + "04-accueil.png",
          marques: [
            { n: 1, titre: "Menu de votre compte", texte: "Touchez votre photo : vous voyez votre nom, l'hôtel et le bouton « Se déconnecter ».", x: 0.07, y: 0.045, cote: "g" },
            { n: 2, titre: "Notifications", texte: "La cloche prévient d'une commande du site ou d'un stock bas. Son petit point de couleur indique si tout est envoyé.", x: 0.92, y: 0.045, cote: "d" },
            { n: 3, titre: "Vos encaissements", texte: "Le total encaissé aujourd'hui, en dollars et en francs. Il ne compte que vos ventes de cafétaria.", x: 0.27, y: 0.43, cote: "g" },
            { n: 4, titre: "Stock bas", texte: "Les produits presque finis. « Voir tout » ouvre le stock.", x: 0.2, y: 0.64, cote: "d" },
            { n: 5, titre: "Activité récente", texte: "Vos dernières ventes, avec le numéro de reçu.", x: 0.2, y: 0.87, cote: "g" },
          ],
        }),
        annote({
          surtitre: "Les rubriques",
          titre: "Le bouton « Plus »",
          chapo: "Cinq boutons en bas : Accueil, Caisse, Comptes, Dépenses et Plus.",
          image: C + "05-plus.png",
          marques: [
            { n: 1, titre: "Cafétaria", texte: "Retrait commande, Cuisine, Menu, Stock et Inventaire.", x: 0.2, y: 0.23, cote: "g" },
            { n: 2, titre: "Reçus", texte: "Journal des reçus et Rapports mensuels.", x: 0.25, y: 0.64, cote: "d" },
            { n: 3, titre: "Appareil", texte: "Paramètres, Imprimante et Synchronisation.", x: 0.2, y: 0.78, cote: "g" },
          ],
          largeurEcran: 270,
          bas: encadre("info", "« Plus » ouvre toutes les autres rubriques", "L'entrée « Cuisine » n'apparaît que si le patron a activé le suivi des commandes en cuisine. « Dépenses » a son propre bouton en bas de l'écran."),
        }),
        texte({
          surtitre: "Vos droits",
          titre: "Ce que vous pouvez faire, ce qui revient au patron",
          chapo: "L'application protège l'argent et le stock : certaines actions sont réservées au patron.",
          blocs: [
            {
              tableau: {
                entetes: ["Tâche", "Vous", "Précision"],
                lignes: [
                  ["Ouvrir un compte, ajouter des articles, encaisser", true, "En dollars ou en francs, espèces ou mobile money"],
                  ["Annuler un compte créé par erreur", true, "Seulement si rien n'y a été encaissé"],
                  ["Réimprimer un reçu", true, "Dans « Journal des reçus »"],
                  ["Suivre la cuisine et servir les plats", true, "Si le patron a activé le suivi en cuisine"],
                  ["Entrée en stock (réapprovisionnement)", true, "Dans « Stock »"],
                  ["Inventaire, dépenses, rapport mensuel", true, "Vous saisissez et vous générez"],
                  ["Annuler un reçu déjà encaissé", false, "Le patron, avec un motif"],
                  ["Modifier le menu, les prix, les photos", false, "Le patron. Vous consultez le menu."],
                  ["Perte ou ajustement de stock", false, "Le patron"],
                  ["Taux de change, comptes de l'équipe", false, "Le patron"],
                ],
              },
            },
            {
              h: "Avant de commencer votre service",
              liste: [
                "**Le point de la cloche** est vert : tout est envoyé. Sinon, lisez le bandeau sous le haut de l'écran.",
                "**L'imprimante** est allumée et choisie dans « Plus », « Imprimante ».",
                "**Le stock bas** de l'accueil : prévenez le patron avant la rupture.",
                "**Le suivi en cuisine** : si « Cuisine » est dans « Plus », les plats passent par la cuisine.",
              ],
            },
            { encadre: { type: "info", titre: "Une rubrique manque ?", texte: "Si une rubrique n'apparaît pas dans « Plus », la formule d'abonnement de l'hôtel ne l'inclut pas, ou le patron ne l'a pas activée. Parlez-en au patron." } },
          ],
        }),
      ],
    },

    /* ============================================================ 2 */
    {
      titre: "La caisse : ouvrir, servir, encaisser",
      points: [
        "Ouvrir un compte pour une table ou un client",
        "Ajouter des articles et des plats, plusieurs personnes sur un compte",
        "Encaisser en dollars ou en francs, avec la monnaie à rendre",
        "Le reçu, l'impression et l'annulation d'un compte créé par erreur",
      ],
      pages: [
        etapes({
          surtitre: "Pas à pas",
          titre: "Ouvrir un compte",
          chapo: "Un compte, c'est la note d'une table ou d'un client. Vous l'ouvrez avant d'ajouter les articles.",
          etapes: [
            { titre: "Allez à la Caisse", texte: "Le bouton « Caisse » est dans la barre du bas. L'écran « Ouvrir un nouveau compte cafétaria » s'affiche.", action: "Appuyez sur « Caisse »", image: C + "10-caisse-vide.png" },
            { titre: "Écrivez la table ou le nom", texte: "Dans « Table ou nom du client », écrivez par exemple Table 6. Le nom de la première personne est facultatif : sans nom, elle s'appelle « Personne 1 ».", action: "Remplissez « Table ou nom du client »", image: C + "11-caisse-remplie.png", vue: [0.15, 0.62] },
            { titre: "Ouvrez le compte", texte: "Le compte s'ouvre, vide : vous voyez la personne, « Aucun article » et le « Total ».", action: "Appuyez sur « Ouvrir le compte »", image: C + "12-compte-ouvert.png" },
          ],
        }),
        etapes({
          surtitre: "Pas à pas",
          titre: "Ajouter des articles et des plats",
          chapo: "Vous ajoutez les produits à une personne. Vous pouvez en choisir plusieurs, puis tout valider d'un coup.",
          etapes: [
            { titre: "Touchez la personne", texte: "Touchez sa carte ou « Ajouter ». La page « Ajouter pour Papa Joseph » s'ouvre avec le menu du jour, les plus vendus et tous les produits.", action: "Appuyez sur « Ajouter »", image: C + "13-ajout-liste.png" },
            { titre: "Choisissez les produits", texte: "Appuyez sur « + » pour ajouter, « − » pour retirer. Cherchez un produit avec « Rechercher un produit » ou filtrez par catégorie : Tous, Boissons, Plats.", action: "Appuyez sur « + » à droite du produit", image: C + "14-ajout-panier.png" },
            { titre: "Validez la sélection", texte: "Le bouton du bas résume la sélection, par exemple « Ajouter à Papa Joseph · 3 articles ». Les articles entrent dans le compte.", action: "Appuyez sur « Ajouter à Papa Joseph »", image: C + "14-ajout-panier.png", vue: [0.55, 1] },
          ],
        }),
        annote({
          surtitre: "Le compte",
          titre: "Lire le compte d'une table",
          chapo: "Chaque personne a sa carte : ses articles, son total, son bouton d'encaissement.",
          image: C + "18-deux-personnes.png",
          marques: [
            { n: 1, titre: "La personne", texte: "Son nom et le nombre d'articles. Touchez la carte pour lui ajouter d'autres articles.", x: 0.18, y: 0.3, cote: "g" },
            { n: 2, titre: "L'état en cuisine", texte: "« En attente », « En préparation » ou « Prêt », si le suivi en cuisine est activé. Pour un plat prêt, le bouton « Servi » apparaît.", x: 0.4, y: 0.4, cote: "d" },
            { n: 3, titre: "Encaisser", texte: "« Encaisser Papa Joseph » règle seulement la part de cette personne.", x: 0.6, y: 0.55, cote: "g" },
            { n: 4, titre: "Ajouter une personne", texte: "Pour une table où chacun paie sa part.", x: 0.3, y: 0.8, cote: "d" },
            { n: 5, titre: "Total", texte: "Le total du compte, en dollars et en francs. Après un paiement, il devient « Reste à payer ».", x: 0.15, y: 0.7, cote: "g" },
          ],
        }),
        etapes({
          surtitre: "Plusieurs personnes",
          titre: "Un compte, plusieurs personnes",
          chapo: "Chaque personne a sa propre note et paie sa part quand elle part.",
          etapes: [
            { titre: "Ajoutez une personne", texte: "Appuyez sur « Ajouter une personne », écrivez le nom, par exemple Mama Grâce, puis validez avec « Ajouter ».", action: "Appuyez sur « Ajouter une personne »", image: C + "17-ajouter-personne.png" },
            { titre: "Ajoutez ses articles", texte: "Touchez la carte de cette personne et choisissez ses produits, comme pour la première.", action: "Appuyez sur la carte de la personne", image: C + "18-deux-personnes.png", vue: [0.15, 0.6] },
            { titre: "Réglez à votre rythme", texte: "Chacun paie sa part avec « Encaisser » et son nom. Si une seule personne règle pour tous, appuyez sur « Tout encaisser ». Une personne payée porte « Payé » et disparaît après une minute ; « Afficher » la ramène.", action: "Appuyez sur « Encaisser » + le nom", image: C + "21-personne-payee.png" },
          ],
        }),
        etapes({
          surtitre: "Encaisser",
          titre: "Encaisser en espèces, en dollars",
          chapo: "Le client donne des billets : l'application calcule la monnaie à rendre.",
          etapes: [
            { titre: "Ouvrez l'encaissement", texte: "Sur la carte de la personne, appuyez sur « Encaisser Papa Joseph ». La feuille « Encaisser Papa Joseph » s'ouvre.", action: "Appuyez sur « Encaisser Papa Joseph »", image: C + "18-deux-personnes.png", vue: [0.2, 0.62] },
            { titre: "Choisissez Espèces et écrivez le montant remis", texte: "« Espèces » est déjà choisi. Dans « Montant remis », écrivez ce que le client vous donne, par exemple 20. La monnaie à rendre s'affiche en vert.", action: "Remplissez « Montant remis »", image: C + "19-encaisser-usd.png" },
            { titre: "Confirmez", texte: "Le reçu s'affiche, avec le total, le montant remis et la monnaie rendue. Rendez la monnaie au client.", action: "Appuyez sur « Confirmer l'encaissement »", image: C + "20-recu-usd.png" },
          ],
        }),
        etapes({
          surtitre: "Encaisser",
          titre: "Quand le client paie en francs congolais",
          chapo: "La note est en dollars ? Le client peut quand même donner des francs : l'application convertit avec le taux du patron.",
          etapes: [
            { titre: "Choisissez la devise remise", texte: "Dans « Devise remise par le client », appuyez sur « CDF ». L'application affiche ce qui est dû en francs, avec le taux : par exemple « 1 $ = 2 800 FC ».", action: "Appuyez sur « CDF »", image: C + "22-encaisser-fc.png" },
            { titre: "Écrivez le montant et la monnaie", texte: "Écrivez le montant remis en francs. Sous « Rendre la monnaie en », choisissez USD ou CDF. « Monnaie à rendre » s'affiche.", action: "Remplissez « Montant remis »", image: C + "22-encaisser-fc.png", vue: [0.45, 1] },
            { titre: "Confirmez et lisez le reçu", texte: "Le reçu garde le montant remis, le taux et la monnaie rendue : tout reste vérifiable.", action: "Appuyez sur « Confirmer l'encaissement »", image: C + "23-recu-fc.png" },
          ],
        }),
        texte({
          surtitre: "Le reçu",
          titre: "Le reçu : lire, imprimer, terminer",
          chapo: "Après chaque encaissement, un reçu s'affiche. C'est lui que vous remettez au client.",
          blocs: [
            {
              parcours: [
                { titre: "Lisez le reçu", texte: "Vous voyez les articles, le total, le mode de paiement, le montant remis et la monnaie rendue." },
                { titre: "Appuyez sur « Imprimer le reçu »", texte: "Le ticket sort sur l'imprimante Bluetooth. L'application dit « Reçu envoyé à l'imprimante. Vérifiez que le ticket est bien sorti ; sinon, réessayez. »" },
                { titre: "Appuyez sur « Terminer »", texte: "Si d'autres personnes doivent encore payer, le bouton s'appelle « Retour au compte »." },
              ],
            },
            {
              tableau: {
                entetes: ["Numéro", "Où le voir", "Ce que c'est"],
                lignes: [
                  ["TEMP-XXXX-AAAAMMJJ-001", "Sur le reçu remis au client", "Numéro provisoire. Il est écrit tout de suite, même avec internet."],
                  ["CAF-AAAAMMJJ-0001", "Dans « Journal des reçus » et sur l'accueil", "Numéro définitif, donné quand la vente arrive sur le serveur."],
                ],
              },
            },
            { encadre: { type: "attention", titre: "Gardez le ticket", texte: "Le numéro TEMP- du ticket permet de retrouver la vente. Il est normal que le ticket remis porte ce numéro provisoire." } },
            { encadre: { type: "info", titre: "Pas d'imprimante ?", texte: "Dans « Plus », ouvrez « Imprimante ». Seuls les appareils déjà appairés dans les réglages Bluetooth du téléphone apparaissent. Choisissez l'imprimante, puis « Imprimer un ticket de test »." } },
          ],
        }),
        etapes({
          surtitre: "Corriger",
          titre: "Annuler un compte créé par erreur",
          chapo: "Vous avez ouvert le mauvais compte ? Tant que rien n'est encaissé, vous pouvez l'annuler.",
          etapes: [
            { titre: "Appuyez sur « Annuler ce compte »", texte: "Le bouton est en bas du compte, sous le texte « Créé par erreur ? Rien n'a encore été encaissé. »", action: "Appuyez sur « Annuler ce compte »", image: C + "24-compte-erreur.png" },
            { titre: "Confirmez", texte: "Le téléphone demande : « Annuler « Table 9 » ? ». Les articles retournent en stock et le patron est informé.", action: "Appuyez sur « Annuler le compte »", image: C + "24-compte-erreur.png", vue: [0.15, 0.7] },
          ],
          apres: [
            { encadre: { type: "attention", titre: "Une ligne ajoutée ne se retire pas", texte: "Avant de valider, « − » retire un article. Une fois validé, il ne peut plus être retiré. Si une personne a déjà payé, le compte ne s'annule plus : « Une partie de ce compte est déjà encaissée : annulez d'abord le reçu (Ventes). » Demandez alors au patron d'annuler le reçu." } },
          ],
        }),
        texte({
          surtitre: "Bien encaisser",
          titre: "Monnaies et modes de paiement",
          chapo: "Deux modes de paiement sont proposés : « Espèces » et « Mobile money ». Deux monnaies : le dollar (USD) et le franc congolais (CDF).",
          blocs: [
            {
              tableau: {
                entetes: ["Situation", "Ce que fait l'application"],
                lignes: [
                  ["Note en dollars, client qui donne des dollars", "Calcule la monnaie à rendre. Il faut écrire le « Montant remis »."],
                  ["Note en dollars, client qui donne des francs", "Convertit la note avec le taux du jour : « Dû : … (1 $ = 2 800 FC) »."],
                  ["Note qui mélange des articles en dollars et en francs", "Ne calcule pas la monnaie. Encaissez chaque personne séparément."],
                  ["Mobile money", "Encaisse le montant de la note, sans calcul de monnaie."],
                  ["Aucun taux défini par le patron", "Le client doit payer dans la monnaie de la note."],
                ],
              },
            },
            { encadre: { type: "attention", titre: "Le franc n'a pas de centimes", texte: "En francs, écrivez un nombre entier. En dollars, deux chiffres au plus après la virgule. Sinon l'application répond « Un montant en dollars a au plus deux chiffres après la virgule. »" } },
            { encadre: { type: "conseil", titre: "Si le montant est trop petit", texte: "L'application répond « Montant insuffisant : il faut … » et n'encaisse pas. Demandez le complément au client, puis corrigez le « Montant remis »." } },
            { encadre: { type: "info", titre: "Le taux de change", texte: "C'est le patron qui le saisit. Vous le voyez dans l'écran d'encaissement quand le client paie dans l'autre monnaie." } },
          ],
        }),
      ],
    },

    /* ============================================================ 3 */
    {
      titre: "La vente rapide et les comptes ouverts",
      points: [
        "Vendre au comptoir en scannant les codes-barres",
        "Utiliser la caméra ou une douchette",
        "Que faire d'un code inconnu ou d'un article épuisé",
        "Retrouver et solder un compte ouvert",
      ],
      pages: [
        etapes({
          surtitre: "Vente au comptoir",
          titre: "Vendre vite avec le scanner",
          chapo: "Pour une boisson prise au comptoir, inutile d'ouvrir un compte à la main : scannez les articles.",
          etapes: [
            { titre: "Appuyez sur « Vente rapide (scanner) »", texte: "Dans la Caisse, la carte « Vente au comptoir » le propose. Aucun compte n'est créé tant que vous n'avez pas validé le panier.", action: "Appuyez sur « Vente rapide (scanner) »", image: C + "30-vente-comptoir.png" },
            { titre: "Scannez les articles", texte: "La caméra s'ouvre. Placez le code-barres dans le cadre : l'article est ajouté, le téléphone vibre. Avec une douchette, scannez sans toucher l'écran.", action: "Scannez chaque article", image: C + "32-scan-ajoute.png" },
            { titre: "Validez le panier", texte: "Le compte « Comptoir » avec la personne « Client » est créé. Vous arrivez sur l'écran pour encaisser, comme pour une table.", action: "Appuyez sur « Ajouter à Client … »", image: C + "34-comptoir-compte.png" },
          ],
        }),
        texte({
          surtitre: "Scanner",
          titre: "Caméra, douchette et codes inconnus",
          chapo: "Le scan marche avec la caméra du téléphone ou avec une douchette. Il marche aussi sans internet.",
          blocs: [
            {
              parcours: [
                { titre: "Avec la caméra", texte: "Appuyez sur le bouton de caméra à côté de « Rechercher un produit ». Un compteur « 2 articles scannés » s'affiche. Appuyez sur « Terminer » pour fermer la caméra." },
                { titre: "Avec une douchette", texte: "Branchez ou appairez la douchette. Scannez : l'article s'ajoute tout seul. Le clavier du téléphone ne s'ouvre pas." },
                { titre: "Pour vendre deux fois le même article", texte: "Retirez l'article de l'image pendant deux secondes puis représentez-le, ou appuyez sur « + »." },
              ],
            },
            {
              tableau: {
                entetes: ["Message à l'écran", "Que faire"],
                lignes: [
                  ["« Code 1234567890123 inconnu »", "Appuyez sur « Associer », puis choisissez le produit : le code lui est lié pour toujours. Il faut internet."],
                  ["« Code … inconnu — associez-le quand le réseau revient. »", "Vous êtes hors ligne : vendez l'article avec la recherche, et associez le code plus tard."],
                  ["« Primus 72 cl : épuisé »", "Le stock est à zéro. Prévenez le patron ; l'article ne peut pas être ajouté."],
                  ["« Fanta 33 cl : plus que 3 en stock »", "Vous demandez plus que le stock. Réduisez la quantité."],
                ],
              },
            },
            { encadre: { type: "info", titre: "Caméra refusée ?", texte: "Si le téléphone refuse la caméra : appuyez sur « Autoriser la caméra », ou ouvrez les réglages du téléphone, Applications, HotelSaver, Autorisations." } },
          ],
        }),
        etapes({
          surtitre: "Comptes ouverts",
          titre: "Retrouver et solder un compte",
          chapo: "Le bouton « Comptes » liste tous les comptes pas encore payés.",
          etapes: [
            { titre: "Appuyez sur « Comptes »", texte: "L'écran « Comptes ouverts » affiche le nombre de comptes. Chaque carte donne le nom, le nombre de personnes et le total. Tirez vers le bas pour actualiser.", action: "Appuyez sur « Comptes »", image: C + "35-comptes-ouverts.png" },
            { titre: "Touchez le compte", texte: "Le détail du compte s'ouvre. Vous pouvez ajouter des articles, ajouter une personne ou encaisser.", action: "Appuyez sur la carte du compte", image: C + "16-compte-lignes.png" },
            { titre: "Encaissez chaque personne", texte: "Quand la dernière personne a payé, le compte se ferme et disparaît de la liste. Vous revenez à la liste avec « Terminer ».", action: "Appuyez sur « Terminer »", image: C + "20-recu-usd.png" },
          ],
        }),
      ],
    },

    /* ============================================================ 4 */
    {
      titre: "La cuisine et les commandes du site",
      points: [
        "Suivre un plat : en attente, en préparation, prêt, servi",
        "Retirer une commande passée sur le site web de l'hôtel",
        "Ce que dit la référence du ticket",
      ],
      pages: [
        etapes({
          surtitre: "Cuisine",
          titre: "Suivre les plats en cuisine",
          chapo: "L'écran « Cuisine » n'existe que si le patron a activé le suivi des commandes en cuisine.",
          etapes: [
            { titre: "Ouvrez « Cuisine »", texte: "Dans « Plus », section Cafétaria. Chaque carte est une table, avec le temps d'attente. L'écran se met à jour toutes les 10 secondes.", action: "Appuyez sur « Plus » puis « Cuisine »", image: C + "43-cuisine.png" },
            { titre: "Prenez en charge, puis marquez prêt", texte: "Appuyez sur « Prendre en charge » quand le plat est lancé, puis sur « Prêt ✓ » quand il est terminé.", action: "Appuyez sur « Prendre en charge »", image: C + "44-cuisine-en-preparation.png" },
            { titre: "Servez le plat", texte: "Dans le compte de la table, la ligne « Prêt » a un bouton « Servi ». Appuyez dessus quand le plat est posé devant le client.", action: "Appuyez sur « Servi »", image: C + "45-compte-pret.png" },
          ],
        }),
        etapes({
          surtitre: "Commandes du site",
          titre: "Retirer une commande du site web",
          chapo: "Le client commande sur le site de l'hôtel, puis vient la retirer avec la référence de son ticket.",
          etapes: [
            { titre: "Ouvrez « Retrait commande »", texte: "Dans « Plus », section Cafétaria. L'écran demande la « Référence du ticket ».", action: "Appuyez sur « Plus » puis « Retrait commande »", image: C + "40-retrait-vide.png" },
            { titre: "Écrivez la référence", texte: "Le client montre son ticket : la référence a 8 caractères, par exemple E6A5E231. Écrivez-la.", action: "Appuyez sur « Ouvrir la commande »", image: C + "41-retrait-saisi.png" },
            { titre: "Encaissez et servez", texte: "Le compte s'ouvre avec le bandeau « Commande passée depuis le site web », la référence, le contact et la note du client. Encaissez-le comme un autre compte.", action: "Appuyez sur « Encaisser » + le nom", image: C + "42-retrait-compte.png" },
          ],
        }),
        texte({
          surtitre: "À savoir",
          titre: "Les plats, les statuts et les commandes web",
          chapo: "Chaque plat passe par quatre états. Le client paie toujours au comptoir.",
          blocs: [
            {
              tableau: {
                entetes: ["État du plat", "Qui agit", "Bouton"],
                lignes: [
                  ["En attente", "La cuisine", "« Prendre en charge »"],
                  ["En préparation", "La cuisine", "« Prêt ✓ »"],
                  ["Prêt", "Le serveur", "« Servi »"],
                  ["Servi", "Plus rien à faire", "Le plat n'a plus de pastille"],
                ],
              },
            },
            {
              tableau: {
                entetes: ["Message à l'écran", "Que faire"],
                lignes: [
                  ["« Référence invalide — elle se trouve sur le ticket du client (ex. E6A5E231). »", "Vérifiez les caractères : chiffres de 0 à 9 et lettres de A à F."],
                  ["« Aucune commande web trouvée avec cette référence. »", "Vérifiez la référence. Hors ligne, la commande doit déjà être arrivée sur l'appareil."],
                  ["« Cette commande a déjà été réglée. »", "La commande est payée : la référence ne peut pas servir deux fois."],
                ],
              },
            },
            { encadre: { type: "conseil", titre: "Retrouver une commande du site", texte: "Dans « Comptes », la commande du site porte une pastille « Réf. E6A5E231 ». Le patron et vous recevez aussi une notification à chaque nouvelle commande." } },
            { encadre: { type: "info", titre: "Sans suivi en cuisine", texte: "Si le suivi est éteint, il n'y a pas d'écran « Cuisine » : la vente se fait au comptoir et les articles sont servis tout de suite." } },
          ],
        }),
      ],
    },

    /* ============================================================ 5 */
    {
      titre: "Le menu",
      points: [
        "Consulter les produits, les plats et leurs prix",
        "Le menu du jour dans la caisse",
        "Ce que seul le patron peut modifier",
      ],
      pages: [
        annote({
          surtitre: "Menu",
          titre: "Consulter le menu",
          chapo: "Dans « Plus », ouvrez « Menu » : vous voyez tout ce qui est en vente.",
          image: C + "50-menu.png",
          marques: [
            { n: 1, titre: "Nom et pastilles", texte: "« Plat » pour un plat, « Site » s'il se commande sur le site, « Inactif » s'il n'est plus vendu.", x: 0.2, y: 0.23, cote: "g" },
            { n: 2, titre: "Catégorie et prix", texte: "Le prix est dans sa devise, en dollars ou en francs.", x: 0.45, y: 0.3, cote: "d" },
            { n: 3, titre: "Stock ou portions", texte: "« Stock : 47 » pour un article. Pour un plat : « Préparé à la commande » ou « Portions : 12 ».", x: 0.75, y: 0.36, cote: "d" },
            { n: 4, titre: "Étiquette", texte: "Sur un article à code-barres, « Étiquette » imprime l'étiquette de prix.", x: 0.35, y: 0.45, cote: "g" },
          ],
          bas: encadre("info", "« Seul le Patron peut modifier le menu. »", "Créer un produit, changer un prix, ajouter une photo : demandez au patron. Les plats du jour qu'il choisit apparaissent en haut de la caisse, sous « Menu du jour ».") + encadre("attention", "Épuisé ou stock bas", "À la caisse, un produit « Épuisé » n'a pas de bouton « + ». « Stock bas · 4 » veut dire qu'il en reste peu. Pour un plat à portions : « Reste 12 portions »."),
        }),
      ],
    },

    /* ============================================================ 6 */
    {
      titre: "Le stock",
      points: [
        "Voir ce qu'il reste en stock",
        "Faire une entrée en stock quand une livraison arrive",
        "Comprendre les mouvements et les alertes",
        "Ce qui est réservé au patron : pertes et ajustements",
      ],
      pages: [
        annote({
          surtitre: "Stock",
          titre: "Votre stock en un coup d'œil",
          chapo: "Dans « Plus », ouvrez « Stock ». Seuls les articles de comptoir ont un stock.",
          image: C + "55-stock.png",
          marques: [
            { n: 1, titre: "Nouveau mouvement", texte: "Le bouton rond « + » en bas à droite enregistre une entrée en stock.", x: 0.85, y: 0.8, cote: "d" },
            { n: 2, titre: "Onglet « Mouvements »", texte: "L'historique : entrées, ventes, retours. Une quantité positive augmente le stock, une négative le réduit.", x: 0.2, y: 0.25, cote: "g" },
            { n: 3, titre: "Onglet « Valeur stock »", texte: "Pour chaque article : le stock, sa valeur et le bouton « Étiquettes ».", x: 0.62, y: 0.25, cote: "d" },
            { n: 4, titre: "Un mouvement", texte: "Le produit, la quantité, le type (Entrée, Vente…) et le motif.", x: 0.3, y: 0.5, cote: "g" },
          ],
        }),
        etapes({
          surtitre: "Réapprovisionner",
          titre: "Enregistrer une entrée en stock",
          chapo: "Une livraison est arrivée ? Ajoutez-la au stock pour que les chiffres restent justes.",
          etapes: [
            { titre: "Ouvrez le formulaire", texte: "Appuyez sur le bouton rond « + » en bas à droite. La feuille « Enregistrer un mouvement » s'ouvre.", action: "Appuyez sur « + » (Nouveau mouvement)", image: C + "55-stock.png" },
            { titre: "Choisissez le produit et la quantité", texte: "Appuyez sur « Choisir un produit » et choisissez dans la liste. Écrivez la quantité reçue, par exemple 24. Le motif est facultatif : « Livraison du fournisseur ».", action: "Remplissez « Produit » et « Quantité »", image: C + "56-stock-entree.png" },
            { titre: "Enregistrez", texte: "Le stock augmente tout de suite. Le téléphone propose ensuite d'imprimer les « Étiquettes de prix » des articles reçus.", action: "Appuyez sur « Enregistrer »", image: C + "57-stock-apres.png" },
          ],
        }),
        texte({
          surtitre: "Comprendre",
          titre: "Les mouvements de stock",
          chapo: "Chaque changement de stock laisse une trace dans « Mouvements ».",
          blocs: [
            {
              tableau: {
                entetes: ["Mouvement", "Quand", "Qui peut le saisir"],
                lignes: [
                  ["Entrée", "Une livraison arrive", true],
                  ["Vente", "Un article est ajouté à un compte", "Automatique"],
                  ["Retour (annulation)", "Un compte ou un reçu est annulé", "Automatique"],
                  ["Perte", "Casse, vol, péremption", false],
                  ["Ajustement", "Correction d'une erreur de stock", false],
                ],
              },
            },
            { encadre: { type: "attention", titre: "Perte et ajustement : le patron seulement", texte: "Si vous essayez, l'application répond « Seul le patron peut enregistrer une perte ou un ajustement de stock. » Dans ce cas, prévenez le patron." } },
            { encadre: { type: "conseil", titre: "Une quantité qui n'est pas acceptée", texte: "« Saisissez une quantité. » ou « La quantité doit être supérieure à zéro. » : écrivez un nombre positif. Une virgule ou un point sont acceptés (1,5)." } },
            { encadre: { type: "info", titre: "Alerte de stock bas", texte: "Quand un article passe sous son seuil, il apparaît dans « Stock bas » sur l'accueil et le patron reçoit une notification. Pensez à commander avant la rupture." } },
          ],
        }),
      ],
    },

    /* ============================================================ 7 */
    {
      titre: "L'inventaire physique",
      points: [
        "Lancer un inventaire sur une période",
        "Compter et saisir le stock réel",
        "Expliquer les écarts, valider, ouvrir le PDF",
        "Retrouver les anciens inventaires",
      ],
      pages: [
        etapes({
          surtitre: "Inventaire",
          titre: "Compter le stock",
          chapo: "L'inventaire compare ce que dit l'application (stock théorique) avec ce que vous comptez sur l'étagère.",
          etapes: [
            { titre: "Choisissez la période", texte: "Dans « Plus », ouvrez « Inventaire ». Choisissez la date de début et la date de fin, par exemple le mois. Un titre est facultatif.", action: "Remplissez « Date de début » et « Date de fin »", image: C + "60-inventaire-periode.png" },
            { titre: "Lancez l'évaluation", texte: "L'application liste chaque article avec son stock théorique. Comptez l'étagère, bouteille par bouteille.", action: "Appuyez sur « Lancer l'évaluation »", image: C + "60-inventaire-periode.png", vue: [0.4, 0.8] },
            { titre: "Écrivez le stock compté", texte: "Pour chaque article, écrivez ce que vous avez compté. Si le chiffre est différent, l'écart s'affiche et une note devient obligatoire.", action: "Remplissez « Stock physique compté »", image: C + "61-inventaire-saisie.png" },
          ],
        }),
        etapes({
          surtitre: "Inventaire",
          titre: "Valider et retrouver l'inventaire",
          chapo: "Quand tous les articles sont comptés, vous validez. Un PDF est préparé pour le patron.",
          etapes: [
            { titre: "Validez", texte: "Appuyez sur « Valider ». Le téléphone demande « Enregistrer l'inventaire » et rappelle le nombre d'écarts. L'inventaire est enregistré définitivement.", action: "Appuyez sur « Enregistrer l'inventaire »", image: C + "62-inventaire-confirmation.png" },
            { titre: "Lisez le résultat", texte: "Vous voyez le nombre de produits, d'écarts, de manquants et de surplus. « Télécharger le PDF » ouvre le rapport.", action: "Appuyez sur « Télécharger le PDF »", image: C + "62r-inventaire-resultat.png" },
          ],
          apres: [
            { encadre: { type: "info", titre: "Retrouver un ancien inventaire", texte: "L'onglet « Historique » liste les inventaires, avec le nombre d'écarts et le lien « Ouvrir le PDF »." } },
          ],
        }),
        texte({
          surtitre: "Comprendre",
          titre: "Les règles de l'inventaire",
          blocs: [
            {
              tableau: {
                entetes: ["Mot", "Ce que cela veut dire"],
                lignes: [
                  ["Stock théorique", "Ce que l'application calcule à la fin de la période : entrées moins ventes, pertes et ajustements."],
                  ["Stock physique", "Ce que vous avez compté."],
                  ["Écart", "Physique moins théorique. Un écart négatif est un manquant ; positif, un surplus."],
                ],
              },
            },
            {
              parcours: [
                { titre: "Comptez tous les produits", texte: "Un produit non compté n'est jamais compté comme zéro. L'application répond « 2 produits non comptés : … Saisissez 0 seulement si le produit est vraiment absent. »" },
                { titre: "Expliquez chaque écart", texte: "« 1 écart sans justification : … Expliquez chaque écart dans le champ Note. » Écrivez la cause, par exemple « bouteille cassée »." },
                { titre: "Gardez votre travail", texte: "Si vous quittez l'écran, votre comptage est gardé tant que l'application reste ouverte. Relancez la même période pour le reprendre." },
              ],
            },
            { encadre: { type: "attention", titre: "L'inventaire ne change pas le stock", texte: "Il enregistre une comparaison et un PDF. Pour corriger le stock, le patron saisit un ajustement. Le PDF demande une connexion internet." } },
          ],
        }),
      ],
    },

    /* ============================================================ 8 */
    {
      titre: "Dépenses, reçus et rapports",
      points: [
        "Saisir et corriger une dépense de la cafétaria",
        "Retrouver et réimprimer un reçu dans le journal",
        "Générer le rapport mensuel de la cafétaria",
      ],
      pages: [
        etapes({
          surtitre: "Dépenses",
          titre: "Saisir une dépense",
          chapo: "Charbon, gaz, produits d'entretien : notez chaque achat pour que le patron suive les coûts.",
          etapes: [
            { titre: "Ouvrez « Dépenses »", texte: "Le bouton « Dépenses » est dans la barre du bas. Les puces « Aujourd'hui », « Ce mois » et « Mois dernier » changent la période. Le total est en haut ; « PDF » télécharge la liste.", action: "Appuyez sur « Dépenses »", image: C + "70-depenses.png" },
            { titre: "Remplissez la nouvelle dépense", texte: "Appuyez sur le bouton rond « + » (« Nouvelle dépense »). Choisissez la date, écrivez le motif, le montant, et la devise : USD ou CDF.", action: "Appuyez sur « + » (Nouvelle dépense)", image: C + "71-depense-formulaire.png" },
            { titre: "Enregistrez", texte: "La dépense apparaît dans la liste du jour. Pour la corriger, touchez-la. « Annuler cette dépense » la barre : elle ne compte plus dans les totaux.", action: "Appuyez sur « Enregistrer »", image: C + "72-depenses-apres.png" },
          ],
        }),
        etapes({
          surtitre: "Reçus",
          titre: "Le journal des reçus",
          chapo: "Un client réclame son reçu ? Retrouvez le paiement et réimprimez-le.",
          etapes: [
            { titre: "Ouvrez « Journal des reçus »", texte: "Dans « Plus », section Reçus. Chaque carte montre le numéro, la date, le montant et « Réglé » ou « Annulé ». Un reçu fait hors connexion porte « Provisoire ».", action: "Appuyez sur « Plus » puis « Journal des reçus »", image: C + "73-journal-recus.png" },
            { titre: "Touchez le reçu", texte: "Le détail montre le mode de paiement, le montant remis, le taux, la monnaie rendue et l'heure d'encaissement.", action: "Appuyez sur la carte du reçu", image: C + "73-journal-recus.png", vue: [0.4, 1] },
            { titre: "Appuyez sur « Réimprimer le reçu »", texte: "Le ticket sort en double, marqué comme duplicata. Seul le patron peut annuler un reçu : pas vous.", action: "Appuyez sur « Réimprimer le reçu »", image: C + "73-journal-recus.png", vue: [0.4, 1] },
          ],
        }),
        etapes({
          surtitre: "Rapports",
          titre: "Le rapport mensuel de la cafétaria",
          chapo: "Chaque mois, le rapport PDF remet au patron les ventes, les dépenses et les chiffres de la cafétaria.",
          etapes: [
            { titre: "Choisissez le mois", texte: "Dans « Plus », ouvrez « Rapports mensuels ». Appuyez sur le mois pour en choisir un autre. Par défaut, c'est le mois écoulé.", action: "Appuyez sur « Plus » puis « Rapports mensuels »", image: C + "75-rapports-vide.png" },
            { titre: "Générez le rapport", texte: "Sous « Rapport Cafétaria », appuyez sur « Générer le rapport ». Vous ne voyez et ne générez que le rapport de la cafétaria.", action: "Appuyez sur « Générer le rapport »", image: C + "75-rapports-vide.png", vue: [0.2, 0.55] },
            { titre: "Ouvrez le PDF", texte: "Le rapport a un numéro. « Concordant » veut dire que ses totaux correspondent aux reçus. « Ouvrir le PDF » l'affiche ; « Régénérer » en crée une nouvelle version.", action: "Appuyez sur « Ouvrir le PDF »", image: C + "76-rapports-genere.png" },
          ],
        }),
      ],
    },

    /* ============================================================ 9 */
    {
      titre: "Travailler sans internet",
      points: [
        "Ce que dit l'indicateur de connexion",
        "Ce qui marche sans réseau : ouvrir, servir, encaisser",
        "Le reçu provisoire TEMP-",
        "Que faire au retour du réseau",
      ],
      pages: [
        etapes({
          surtitre: "Hors ligne",
          titre: "Continuer à vendre sans réseau",
          chapo: "HotelSaver garde tout sur le téléphone et envoie au serveur dès que le réseau revient. Vous n'arrêtez pas de servir.",
          etapes: [
            { titre: "Repérez la coupure", texte: "Un bandeau apparaît sous le haut de l'écran : « Hors ligne · 2 actions à envoyer ». Le point de la cloche devient gris.", action: "Lisez le bandeau en haut", image: C + "80-hors-ligne-accueil.png" },
            { titre: "Vendez comme d'habitude", texte: "Ouvrez des comptes, ajoutez des articles, encaissez. Le reçu porte un numéro provisoire TEMP-… Imprimez-le et remettez-le au client.", action: "Appuyez sur « Confirmer l'encaissement »", image: C + "81-hors-ligne-recu.png" },
            { titre: "Attendez le retour du réseau", texte: "Rien à faire : les ventes partent seules. Le bandeau disparaît et le point redevient vert. Chaque reçu reçoit son numéro CAF- définitif.", action: "Lisez le point de la cloche", image: C + "83-retour-reseau.png" },
          ],
        }),
        texte({
          surtitre: "Synchronisation",
          titre: "Ce qui marche sans internet",
          chapo: "Pour savoir où vous en êtes, lisez le bandeau sous le haut de l'écran, ou ouvrez « Plus », « Synchronisation ».",
          blocs: [
            {
              tableau: {
                entetes: ["Sans internet, vous pouvez", "Il faut internet pour"],
                lignes: [
                  ["Ouvrir un compte, ajouter une personne et des articles", "Générer ou ouvrir un PDF (rapport, inventaire, dépenses)"],
                  ["Encaisser et imprimer le reçu provisoire", "Annuler un reçu (réservé au patron)"],
                  ["Servir un plat prêt, annuler un compte créé par erreur", "Associer un code-barres inconnu à un produit"],
                  ["Saisir une dépense, faire une entrée en stock", "Recevoir les commandes du site et les ventes des autres postes"],
                  ["Scanner et retirer une commande déjà arrivée", "La toute première connexion sur un téléphone neuf"],
                ],
              },
            },
            {
              tableau: {
                entetes: ["Bandeau", "Ce que cela veut dire"],
                lignes: [
                  ["« Hors ligne · 2 actions à envoyer »", "Pas de réseau. Vos actions sont gardées sur le téléphone."],
                  ["« 2 actions à envoyer »", "Le réseau est revenu, l'envoi est en cours."],
                  ["« Synchro en difficulté »", "Connecté, mais l'envoi a échoué. Il réessaie tout seul."],
                  ["« Conflit à vérifier » ou « Action refusée »", "Touchez le bandeau. Dans « Synchronisation », choisissez « Garder la version du serveur » ou « Retirer cette action »."],
                  ["« Horloge à corriger »", "L'heure du téléphone est fausse de plus de 5 minutes : corrigez-la."],
                ],
              },
            },
            { encadre: { type: "attention", titre: "Ne vous déconnectez pas avec des actions à envoyer", texte: "Gardez le téléphone allumé et l'application installée jusqu'à ce que le bandeau disparaisse. Si une action est refusée, le serveur donne la raison dans « Synchronisation »." } },
          ],
        }),
      ],
    },

    /* ============================================================ 10 */
    {
      titre: "Les erreurs fréquentes",
      points: ["Les messages que vous pouvez rencontrer", "Ce qu'ils veulent dire", "Ce qu'il faut faire"],
      pages: [
        texte({
          surtitre: "Aide",
          titre: "Les messages d'erreur à la caisse",
          chapo: "Ces phrases s'affichent en rouge. Elles disent ce qui ne va pas.",
          blocs: [
            {
              tableau: {
                entetes: ["Message", "Ce que cela veut dire", "Que faire"],
                lignes: [
                  ["« Le nom de la table ou du client est obligatoire. »", "Le champ est vide.", "Écrivez un nom, par exemple Table 6."],
                  ["« Espèces : saisissez le montant remis par le client. »", "Vous n'avez pas écrit le montant remis.", "Remplissez « Montant remis »."],
                  ["« Montant insuffisant : il faut … »", "Le client n'a pas donné assez.", "Demandez le complément."],
                  ["« Aucun taux de change défini par le patron. »", "Pas de taux : le client ne peut pas payer dans l'autre monnaie.", "Faites payer dans la monnaie de la note, ou prévenez le patron."],
                  ["« Stock insuffisant pour « Fanta 33 cl » : 4 en stock, 6 demandé(s). »", "Il n'y en a pas assez.", "Ajoutez moins d'articles, ou faites une entrée en stock."],
                  ["« Plus assez de portions de « Poulet braisé » pour cette commande (épuisé ou presque). »", "Plus de portions pour ce plat.", "Prévenez la cuisine ou le patron."],
                  ["« Une partie de ce compte est déjà encaissée : annulez d'abord le reçu (Ventes). »", "Le compte ne peut plus être annulé.", "Demandez au patron d'annuler le reçu."],
                  ["« Ce compte cafétaria est déjà fermé (encaissé). »", "Tout est payé.", "Rien à faire."],
                ],
              },
            },
          ],
        }),
        texte({
          surtitre: "Aide",
          titre: "Les messages du réseau et de l'application",
          blocs: [
            {
              tableau: {
                entetes: ["Message", "Ce que cela veut dire", "Que faire"],
                lignes: [
                  ["« Pas de connexion au serveur. Vérifiez le réseau puis réessayez. »", "Le téléphone n'a pas de réseau.", "Continuez à vendre : tout partira au retour du réseau. Pour un PDF, attendez le réseau."],
                  ["« Votre session a expiré : reconnectez-vous. »", "Votre connexion est trop ancienne.", "Connectez-vous de nouveau."],
                  ["« Vous n'avez pas le droit de faire cette action. »", "Action réservée à un autre rôle.", "Demandez au patron."],
                  ["« Seul le patron peut enregistrer une perte ou un ajustement de stock. »", "La perte et l'ajustement sont réservés au patron.", "Prévenez le patron."],
                  ["« Le serveur a rencontré un problème. Réessayez dans un instant ; si cela continue, prévenez le patron. »", "Problème du côté du serveur.", "Réessayez. Si cela dure, contactez le support."],
                  ["« L'imprimante ne répond pas : vérifiez qu'elle est allumée, proche du téléphone et appairée en Bluetooth. »", "L'imprimante n'est pas joignable.", "Allumez-la, approchez-la, puis « Imprimer le reçu » ; ou réimprimez depuis « Journal des reçus »."],
                  ["« Cette fonction n'est pas incluse dans votre formule. »", "La rubrique n'est pas dans l'abonnement de l'hôtel.", "Le patron peut changer de formule."],
                ],
              },
            },
            { encadre: { type: "conseil", titre: "Avant d'appeler le patron", texte: "Notez le message exact, l'heure et le nom du compte. Cela l'aide à trouver le problème tout de suite." } },
          ],
        }),
      ],
    },
  ],
};
