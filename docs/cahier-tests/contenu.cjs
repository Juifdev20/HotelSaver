/**
 * Contenu du cahier de tests HotelSaver : présentation, prérequis, puis un module par partie de l'application.
 * Chaque cas de test (TC) = un titre, une note facultative et des étapes [action, résultat attendu].
 * Les libellés suivent l'application telle qu'elle est (mobile 1.0.4, bureau 1.0.4, site, super-admin).
 */

const presentation = {
  resume: [
    "HotelSaver est une application de gestion hôtelière pour les hôtels de la RDC. Elle réunit au même endroit les chambres et les réservations, la facturation et les reçus, la cafétaria (caisse, menu, stock, inventaire), les dépenses, les rapports mensuels et le site internet de l'hôtel.",
    "Elle existe sur téléphone Android et sur ordinateur Windows, avec le même compte. Elle fonctionne aussi SANS internet : tout ce qui est fait hors ligne est gardé sur l'appareil, puis envoyé tout seul quand le réseau revient. L'argent est toujours tenu en deux monnaies séparées, le dollar (USD) et le franc congolais (CDF), avec le taux du jour fixé par le patron.",
    "Chaque hôtel a son site public (réservation en ligne, acompte par Mobile Money ou carte, commande de plats) et ses données restent strictement séparées de celles des autres hôtels.",
  ],
  plateformes: [
    ["Application Android", "Téléphone de la réception, de la cafétaria, du patron", "Fichier APK téléchargé sur le site HotelSaver"],
    ["Application Windows", "Ordinateur fixe (réception, bureau du patron)", "Installateur téléchargé sur le site HotelSaver"],
    ["Site HotelSaver", "Tout le monde (vitrine), puis les clients connectés", "Inscription, paiement de l'abonnement, guide d'utilisation"],
    ["Site de l'hôtel", "Les clients de l'hôtel", "Chambres, réservation en ligne, acompte, suivi de réservation, commande de plats"],
    ["Super-admin", "L'équipe HotelSaver seulement", "Hôtels, formules, paiements, conditions d'utilisation, guides"],
  ],
  roles: [
    ["Patron", "Le responsable de l'hôtel", "Tout voir ; régler l'hôtel (chambres, taux, équipe, site, paiement en ligne) ; abonnement ; remboursements ; annuler un reçu ; consulter rapports et dépenses. Il n'opère la caisse et la réception que si « Le patron peut aussi opérer » est activé."],
    ["Réceptionniste", "L'accueil des clients", "Chambres (état), réservations, check-in, facturation et check-out, clients, journal de la journée, dépenses et rapport de la réception."],
    ["Cafétaria", "Le restaurant et le bar", "Caisse et comptes ouverts, vente rapide, cuisine, commandes du site, stock (entrées), inventaire, dépenses et rapport de la cafétaria."],
  ],
  doit: [
    ["S'inscrire, créer son hôtel et commencer un essai gratuit", "Application ou site → « Créer votre hôtel »", "Tous"],
    ["Se connecter avec son numéro et son mot de passe", "Écran de connexion", "Tous"],
    ["Gérer les chambres et leur état", "Onglet Chambres", "Patron, réception"],
    ["Créer, suivre et facturer les réservations", "Onglet Réserv., Plus → Arrivées et départs", "Réception (patron s'il opère)"],
    ["Encaisser à la cafétaria, par personne", "Onglet Caisse, Comptes", "Cafétaria (patron s'il opère)"],
    ["Gérer le stock et faire l'inventaire", "Plus → Stock, Inventaire", "Cafétaria, patron"],
    ["Saisir les dépenses par département", "Onglet / rubrique Dépenses", "Réception, cafétaria (patron consulte)"],
    ["Produire les rapports mensuels PDF", "Plus → Rapports mensuels", "Chaque département (patron consulte)"],
    ["Recevoir des réservations et des commandes en ligne", "Site de l'hôtel", "Clients de l'hôtel"],
    ["Encaisser un acompte en ligne et décider des remboursements", "Plus → Paramètres, Remboursements", "Patron"],
    ["Travailler sans internet et synchroniser ensuite", "Toute l'application ; Plus → Synchronisation", "Tous"],
    ["Payer l'abonnement par Mobile Money", "Plus → Abonnement, ou site → Payer", "Patron"],
    ["Ouvrir le guide d'utilisation de son poste", "Plus → Guide d'utilisation, ou site → Guide", "Tous"],
  ],
  nePasDoit: [
    "Voir ou modifier les données d'un AUTRE hôtel (chambres, clients, ventes, reçus…).",
    "Permettre à un réceptionniste d'ajouter une chambre, de changer son prix, d'annuler un reçu ou de décider d'un remboursement.",
    "Permettre à la cafétaria de modifier le menu ou d'enregistrer une perte / un ajustement de stock.",
    "Laisser un compte désactivé se connecter, ou un employé ouvrir le guide d'un autre poste.",
    "Additionner des dollars et des francs, ou accepter des centimes en francs.",
    "Facturer deux fois le même séjour, ou réserver deux fois la même chambre aux mêmes dates.",
    "Perdre une vente ou une facture faite hors ligne.",
  ],
  prerequis: [
    "Installer la DERNIÈRE version de l'application (Android et/ou Windows, version 1.0.4) depuis le site HotelSaver.",
    "Utiliser un hôtel de TEST créé pour l'occasion (essai gratuit), jamais l'hôtel d'un vrai client.",
    "Disposer d'au moins deux appareils (deux téléphones, ou un téléphone et un ordinateur) pour les tests à plusieurs et hors ligne.",
    "Préparer trois numéros de téléphone différents : un pour le patron, un pour la réception, un pour la cafétaria (9 chiffres commençant par 8 ou 9).",
    "Pour l'acompte en ligne et l'abonnement : un numéro ScanLinkPay de test et un téléphone Mobile Money. ATTENTION : en Prod, un paiement est réel.",
    "Une imprimante de tickets Bluetooth appairée au téléphone (facultatif : sans elle, noter « pas d'imprimante » aux étapes d'impression).",
    "Un navigateur (Chrome conseillé) pour le site de l'hôtel, la page Guide et la page de paiement.",
    "Noter au début du cahier l'environnement utilisé (Test ou Prod) et la version de l'application.",
  ],
  remplir: [
    "La colonne Observation est à remplir par le testeur : écrire OK si le résultat est celui attendu ; sinon, décrire ce qui s'est réellement passé (message exact, écran, heure).",
    "Un écart entre « Résultat attendu » et « Observation » est une anomalie à remonter. Joindre une capture d'écran si possible (nommée avec le numéro du test, par ex. TC-27-étape-3).",
    "Sous chaque tableau, cocher le verdict du cas : ☐ Réussi · ☐ Échoué · ☐ Bloqué (impossible à tester) et ajouter un commentaire libre.",
    "Les tests marqués ⚠ modifient des données (paiement, annulation, désactivation) : les faire sur l'hôtel de test uniquement.",
  ],
};

/* ======================================================================== modules */
const modules = [
  {
    titre: "Installation et premier accès",
    role: "Tout le monde",
    sert: "Vérifier qu'on trouve, télécharge et installe HotelSaver facilement, sur téléphone et sur ordinateur, depuis le site officiel.",
    cas: [
      {
        titre: "Télécharger et installer l'application Android",
        etapes: [
          ["Sur le téléphone, ouvrir le site HotelSaver dans le navigateur", "La page d'accueil s'affiche, avec les boutons de téléchargement"],
          ["Appuyer sur « Android — Télécharger l'APK »", "Le fichier HotelSaver.apk se télécharge"],
          ["Ouvrir le fichier téléchargé ; si le téléphone bloque, autoriser l'installation depuis cette source", "L'installation est proposée (le message exact dépend de la marque du téléphone)"],
          ["Appuyer sur « Installer », puis « Ouvrir »", "HotelSaver s'ouvre sur l'écran de connexion « Ravi de vous revoir ! »"],
          ["Vérifier l'icône dans la liste des applications", "L'icône HotelSaver est présente"],
        ],
      },
      {
        titre: "Installer l'application Windows",
        etapes: [
          ["Sur l'ordinateur, ouvrir le site HotelSaver et cliquer « Windows — Télécharger l'installateur »", "Le fichier HotelSaver-Setup.exe se télécharge"],
          ["Lancer l'installateur", "Écran de bienvenue HotelSaver"],
          ["Continuer", "Page des conditions d'utilisation : il faut appuyer sur « J'accepte » pour continuer"],
          ["Choisir pour qui installer, le dossier, puis installer", "L'installation se termine ; la case « Lancer HotelSaver » est proposée"],
          ["Terminer en lançant l'application", "La fenêtre HotelSaver s'ouvre sur l'écran de connexion"],
        ],
      },
      {
        titre: "Le site vitrine HotelSaver",
        etapes: [
          ["Sur ordinateur, ouvrir le site HotelSaver", "La barre du haut tient sur une ligne : Fonctionnalités, Application, Créateur, Hôtels, Tarifs, FAQ, Payer, Guide, Connexion, Essai gratuit"],
          ["Cliquer sur chaque lien du menu", "Chaque lien mène à la bonne section ou page, sans erreur"],
          ["Lire la section Tarifs", "Les formules (Essentiel, Pro, Premium) affichent prix, chambres et fonctions"],
          ["Ouvrir le site sur un téléphone", "Le menu est remplacé par ☰ ; rien ne déborde à droite de l'écran"],
          ["Lire le pied de page", "Liens utiles, WhatsApp du support et « © 2026 HotelSaver. Tous droits réservés. »"],
        ],
      },
    ],
  },
  {
    titre: "Inscription et essai gratuit",
    role: "Futur patron",
    sert: "Un nouvel hôtel doit pouvoir s'inscrire seul, accepter les conditions d'utilisation et démarrer un essai gratuit limité (durée et quantités).",
    doit: [
      ["Créer l'hôtel et le compte du patron", "Application → « Créer votre hôtel », ou site → Essai gratuit"],
      ["Choisir « Essai gratuit » ou « Payer maintenant »", "Étape 2 de l'inscription"],
      ["Lire et accepter les conditions d'utilisation", "Lien « Lire » puis « J'accepte »"],
    ],
    nePas: ["S'inscrire sans accepter les conditions.", "Profiter deux fois de l'essai avec le même numéro.", "Dépasser les plafonds de l'essai (10 chambres, 50 produits, 6 photos de galerie, par défaut)."],
    cas: [
      {
        titre: "Créer son hôtel depuis l'application",
        etapes: [
          ["Sur l'écran de connexion, appuyer sur « Créer votre hôtel »", "Étape 1 « Votre hôtel » : nom, sous-domaine, adresse (facultative)"],
          ["Saisir le nom de l'hôtel, un sous-domaine (ex. hotel-test-01) et l'adresse, puis « Continuer »", "Étape 2 « Vos coordonnées »"],
          ["Saisir votre nom, votre numéro, un mot de passe (8 caractères au moins) deux fois", "Les champs sont validés (coches vertes)"],
          ["Choisir « Essai gratuit »", "Le choix est mis en évidence"],
          ["Appuyer sur « Lire » à côté des conditions, faire défiler, puis « J'accepte »", "La case « J'ai lu et j'accepte les conditions d'utilisation » est cochée"],
          ["Appuyer sur « Créer mon compte »", "L'application ouvre l'accueil du patron, avec le nom de l'hôtel"],
          ["Ouvrir Plus → Abonnement", "« Essai gratuit : N jours restants » (14 jours par défaut)"],
        ],
      },
      {
        titre: "Contrôles du formulaire d'inscription",
        etapes: [
          ["Laisser le nom de l'hôtel vide et appuyer sur « Continuer »", "Un message demande le nom ; on reste à l'étape 1"],
          ["Saisir un numéro de 8 chiffres", "« Numéro invalide : 9 chiffres commençant par 8 ou 9 (ex. 970 000 000). »"],
          ["Saisir deux mots de passe différents", "Un message signale que les mots de passe ne correspondent pas"],
          ["Ne pas cocher les conditions", "Le bouton « Créer mon compte » reste inactif"],
          ["Recommencer une inscription avec le MÊME numéro qu'au test précédent", "L'inscription est refusée avec un message clair (un numéro = un seul essai)"],
        ],
      },
      {
        titre: "S'inscrire depuis le site HotelSaver",
        etapes: [
          ["Sur le site, cliquer « Essai gratuit »", "Le formulaire « Créer le compte de mon hôtel » s'affiche"],
          ["Remplir avec un NOUVEAU numéro, accepter les conditions, valider", "Écran de succès qui invite à télécharger l'application"],
          ["Dans l'application, se connecter avec ce numéro et ce mot de passe", "L'accueil du patron de ce nouvel hôtel s'ouvre"],
          ["Cliquer sur le lien « Conditions d'utilisation » en pied de page du site", "La page publique des conditions s'affiche (texte en vigueur)"],
        ],
      },
      {
        titre: "Plafonds de l'essai gratuit",
        note: "⚠ Crée beaucoup de chambres : faire sur l'hôtel de test.",
        etapes: [
          ["Pendant l'essai, ajouter des chambres jusqu'à 10 (onglet Chambres, bouton +)", "Les 10 chambres sont créées"],
          ["Ajouter une 11e chambre", "Refus : « L'essai gratuit est limité à 10 chambres. Choisissez une formule dans Paramètres → Abonnement pour en ajouter. »"],
          ["Refaire l'essai en étant HORS LIGNE", "Même refus, même message (le contrôle existe aussi sans internet)"],
          ["Ajouter plus de 6 photos à la galerie du site (Plus → Site de l'hôtel)", "Refus avec le message de la galerie"],
        ],
      },
    ],
  },
  {
    titre: "Connexion et compte",
    role: "Tous les rôles",
    sert: "Chaque personne se connecte avec son numéro et son mot de passe ; la session est protégée (verrouillage, déconnexion, compte désactivé).",
    cas: [
      {
        titre: "Se connecter par numéro",
        etapes: [
          ["Sur l'écran de connexion, vérifier l'indicatif", "+243 (drapeau RDC) est déjà affiché"],
          ["Saisir le numéro (9 chiffres) et un MAUVAIS mot de passe, puis « Se connecter »", "« Numéro (ou e-mail) ou mot de passe incorrect. »"],
          ["Appuyer sur l'œil du champ mot de passe", "Le mot de passe devient lisible"],
          ["Saisir le bon mot de passe", "L'accueil du rôle s'ouvre (Patron, Réceptionniste ou Cafétaria)"],
          ["Se tromper plusieurs fois de suite (sur un compte de test)", "Au bout de quelques essais : « Trop de tentatives. Patientez quelques minutes avant de réessayer. »"],
        ],
      },
      {
        titre: "Mot de passe oublié",
        etapes: [
          ["Appuyer sur « Mot de passe oublié ? »", "Écran de demande de lien"],
          ["Saisir le numéro du compte et « Continuer »", "Un message confirme l'envoi s'il existe une adresse e-mail liée au compte"],
          ["Pour un employé sans e-mail", "Le patron change le mot de passe dans Utilisateurs (voir module Patron)"],
        ],
      },
      {
        titre: "Menu du compte, verrouillage et déconnexion",
        etapes: [
          ["Toucher la photo du compte en haut à droite", "Nom, rôle, hôtel ; boutons « Changer de profil » et « Se déconnecter »"],
          ["Plus → Paramètres → Sécurité : choisir « 5 min »", "Le choix est enregistré"],
          ["Laisser l'application en arrière-plan plus de 5 minutes puis revenir", "Le mot de passe est redemandé"],
          ["Paramètres → Changer mon mot de passe : ancien, nouveau, confirmation", "Message de succès ; le nouveau mot de passe fonctionne à la connexion suivante"],
          ["« Se déconnecter » et confirmer", "Retour à l'écran de connexion"],
        ],
      },
    ],
  },
  {
    titre: "Patron — régler et piloter l'hôtel",
    role: "Patron",
    sert: "Le patron prépare l'hôtel (chambres, taux, équipe, site, paiement en ligne), suit l'activité et prend les décisions d'argent (annuler un reçu, rembourser un acompte).",
    doit: [
      ["Voir les chiffres du jour (USD et FC séparés), l'occupation, le stock bas", "Onglet Accueil"],
      ["Ajouter / modifier une chambre", "Onglet Chambres → +"],
      ["Fixer le taux de change", "Plus → Taux de change"],
      ["Créer les comptes de l'équipe, changer un mot de passe, désactiver", "Plus → Utilisateurs"],
      ["Gérer le menu et les plats visibles sur le site", "Plus → Menu"],
      ["Régler l'acompte en ligne (ScanLinkPay)", "Plus → Paramètres → Paiement en ligne"],
      ["Remplir le site de l'hôtel", "Plus → Site de l'hôtel"],
      ["Payer l'abonnement", "Plus → Abonnement, ou site → Payer"],
      ["Annuler un reçu, décider des remboursements", "Plus → Journal des reçus, Remboursements"],
    ],
    cas: [
      {
        titre: "Accueil du patron",
        etapes: [
          ["Se connecter avec le compte patron", "Accueil : « Bonjour, … » avec la pastille Patron et le nom de l'hôtel"],
          ["Lire les cartes « En dollars » et « En francs »", "Deux montants séparés, jamais additionnés ; détail « Dont chambres » et « Dont cafétaria »"],
          ["Lire « Taux d'occupation » et toucher « Libres »", "La liste des chambres s'ouvre"],
          ["Lire « Stock bas » et « Activité récente »", "Les produits sous leur seuil ; les dernières ventes et factures"],
          ["Observer la barre du bas", "Accueil, Chambres, Réserv., Plus"],
        ],
      },
      {
        titre: "Taux de change",
        etapes: [
          ["Plus → Taux de change", "Le taux en vigueur (1 $ = … FC) et l'historique"],
          ["Saisir 2850 puis « Enregistrer »", "Une confirmation est demandée"],
          ["Confirmer « Enregistrer le taux »", "Le nouveau taux est en vigueur ; il apparaît dans les encaissements en francs"],
          ["Couper internet et réessayer", "La saisie est refusée hors ligne avec un message clair"],
        ],
      },
      {
        titre: "Ajouter et modifier une chambre",
        etapes: [
          ["Onglet Chambres → bouton +", "Feuille « Nouvelle chambre »"],
          ["Saisir numéro 301, type Suite, prix 120, devise USD, puis « Enregistrer »", "La chambre 301 apparaît dans la liste, état Libre"],
          ["Ouvrir la chambre 301 et changer son prix à 130", "Le nouveau prix est affiché"],
          ["Créer une autre chambre avec le numéro 301", "Refus : le numéro existe déjà"],
        ],
      },
      {
        titre: "Créer les comptes de l'équipe",
        note: "Un hôtel a au plus un compte par rôle (Réceptionniste, Cafétaria, Patron).",
        etapes: [
          ["Plus → Utilisateurs → « Nouveau compte »", "Formulaire : nom, numéro de téléphone, e-mail (facultatif), mot de passe, rôle"],
          ["Créer le compte Réceptionniste (numéro 2) avec un mot de passe de 8 caractères", "Le compte apparaît dans la liste, actif"],
          ["Créer le compte Cafétaria (numéro 3)", "Le compte apparaît dans la liste"],
          ["Ouvrir à nouveau « Nouveau compte »", "Les rôles déjà pris portent « déjà créé » et ne sont pas sélectionnables"],
          ["Mot de passe de 5 caractères", "« Le mot de passe doit contenir au moins 8 caractères. »"],
          ["Se connecter sur un autre appareil avec le compte Réceptionniste", "L'accueil Réceptionniste s'ouvre"],
        ],
      },
      {
        titre: "Modifier et désactiver un compte",
        note: "⚠ Destructif : sur le compte de test de la réception.",
        etapes: [
          ["Utilisateurs → « Modifier » sur la réception, nouveau mot de passe, « Enregistrer »", "Message de succès"],
          ["Se connecter avec l'ANCIEN mot de passe", "Connexion refusée"],
          ["Se connecter avec le NOUVEAU mot de passe", "Connexion réussie"],
          ["Désactiver le compte (interrupteur « Compte … actif »), confirmer", "Le compte est marqué désactivé"],
          ["Tenter de se connecter avec ce compte", "« Ce compte a été désactivé. Contactez le patron. »"],
          ["Réactiver le compte", "La connexion fonctionne de nouveau"],
        ],
      },
      {
        titre: "Les interrupteurs de « Paramètres »",
        etapes: [
          ["Plus → Paramètres : lire les trois interrupteurs", "Le patron peut aussi opérer ; Suivi des commandes en cuisine ; Commande en ligne sur le site"],
          ["« Le patron peut aussi opérer » ÉTEINT : ouvrir une réservation confirmée", "Pas de bouton Check-in ni de facturation pour le patron (lecture seule)"],
          ["L'ALLUMER puis rouvrir la réservation", "Check-in et facturation deviennent possibles ; la Caisse apparaît"],
          ["Éteindre « Suivi des commandes en cuisine »", "L'écran « Cuisine » disparaît de Plus (cafétaria)"],
          ["Allumer « Commande en ligne sur le site »", "Un onglet « Cuisine » apparaît sur le site de l'hôtel"],
        ],
      },
      {
        titre: "Gérer le menu",
        etapes: [
          ["Plus → Menu → « Nouveau produit »", "Formulaire du produit"],
          ["Créer une boisson : nom, catégorie Boissons, prix 2, devise USD, stock initial, seuil d'alerte, code-barres", "Le produit apparaît avec son stock"],
          ["Créer un plat (type Plat), cocher « Visible et commandable sur le site »", "Le plat porte les pastilles « Plat » et « Site »"],
          ["Modifier le prix d'un produit", "Le nouveau prix apparaît dans la caisse de la cafétaria"],
          ["Désactiver un produit", "Il porte « Inactif » et n'est plus proposé à la caisse"],
        ],
      },
      {
        titre: "Imprimante de tickets",
        etapes: [
          ["Appairer l'imprimante dans le Bluetooth d'Android", "L'imprimante est appairée"],
          ["Plus → Imprimante", "La liste des appareils Bluetooth appairés s'affiche"],
          ["Choisir l'imprimante puis « Imprimer un ticket de test »", "« Reçu envoyé à l'imprimante. Vérifiez que le ticket est bien sorti ; sinon, réessayez. » et le ticket sort"],
        ],
      },
      {
        titre: "Remplir le site de l'hôtel",
        etapes: [
          ["Plus → Site de l'hôtel", "Sections : Présentation, Photos, Services proposés, Contact et horaires, Réseaux sociaux"],
          ["Saisir slogan et texte de présentation, ajouter une photo de couverture et 2 photos de galerie", "Les photos s'affichent (allégées automatiquement)"],
          ["Ajouter les services Wi-Fi et Restaurant, l'adresse, le WhatsApp, « Arrivée dès 14:00 », « Départ avant 11:00 »", "Les champs sont remplis"],
          ["« Enregistrer »", "Message de succès"],
          ["Ouvrir le site de l'hôtel (voir module Site)", "Les textes, photos, services et horaires saisis y apparaissent"],
        ],
      },
      {
        titre: "Relier ScanLinkPay pour l'acompte en ligne",
        note: "Nécessite un numéro ScanLinkPay (SLP-…) de l'hôtel.",
        etapes: [
          ["Plus → Paramètres → « Régler le paiement en ligne »", "Écran « Paiement en ligne des acomptes »"],
          ["Saisir un numéro faux (SLP-000000) puis « Vérifier et enregistrer »", "Refus : numéro inconnu"],
          ["Saisir le vrai numéro puis « Vérifier et enregistrer »", "« Compte trouvé » avec le nom de l'entreprise : vérifier que c'est bien l'hôtel"],
          ["Pourcentage d'acompte : 20 ; écrire les conditions d'annulation", "Un exemple de calcul s'affiche (ex. 20 % × 4 nuits × 60 $)"],
          ["« Enregistrer »", "Réglages enregistrés ; le site propose maintenant l'acompte"],
        ],
      },
      {
        titre: "Abonnement : lire l'état et payer",
        note: "⚠ En Prod, le paiement Mobile Money est réel.",
        etapes: [
          ["Plus → Abonnement", "Carte « Votre abonnement » : état, jours restants, formule, chambres, date de fin"],
          ["Choisir une formule, puis une durée (1, 3, 6 ou 12 mois)", "Le prix se met à jour ; 12 mois montre les mois offerts"],
          ["Choisir la monnaie (dollars ou francs) et le réseau, saisir le numéro Mobile Money", "« Réseau reconnu : … » et le récapitulatif « Votre commande » avec les frais ScanLinkPay"],
          ["« Payer … » puis confirmer", "« Confirmez le paiement sur votre téléphone… » avec un compte à rebours"],
          ["Valider avec le code secret sur le téléphone", "« Merci ! Abonnement actif jusqu'au … »"],
          ["Refaire depuis le site : page « Payer », connexion du patron", "Même parcours, même résultat ; un compte réception est refusé (« Seul le patron… »)"],
        ],
      },
      {
        titre: "Annuler un reçu",
        note: "⚠ Destructif : sur un reçu de test.",
        etapes: [
          ["Plus → Journal des reçus", "Onglets Séjours et Cafétaria ; chaque reçu : numéro, date, montant, Réglé / Annulé"],
          ["Ouvrir un reçu puis « Annuler le reçu »", "Un motif est obligatoire"],
          ["Saisir le motif et confirmer", "Le reçu passe « Annulé » ; il ne compte plus dans les chiffres du jour ni dans le rapport"],
          ["Avec le compte réception, ouvrir le même reçu", "Pas de bouton d'annulation (réservé au patron)"],
        ],
      },
      {
        titre: "Remboursements d'acomptes payés en ligne",
        note: "Nécessite une réservation payée en ligne puis annulée (module Site).",
        etapes: [
          ["Plus → Remboursements, onglet « À faire »", "La carte du client : chambre, raison, montant payé en ligne, où envoyer l'argent"],
          ["« J'ai remboursé » : montant, moyen, référence, puis « Enregistrer le remboursement » et confirmer", "La carte passe dans « Historique » : Remboursé"],
          ["Sur un autre cas : « Conserver l'acompte », écrire la raison, « Oui, conserver »", "Historique : Acompte conservé"],
          ["Ouvrir la page de suivi du client", "Elle montre le remboursement effectué ou l'acompte conservé"],
        ],
      },
      {
        titre: "Rapports, dépenses et notifications",
        etapes: [
          ["Plus → Rapports mensuels, choisir le mois écoulé", "Rapport Réception et Rapport Cafétaria (s'ils sont générés), avec « Ouvrir le PDF »"],
          ["Ouvrir un PDF", "Le rapport s'affiche ; « Concordant » si ses totaux correspondent aux reçus"],
          ["Plus → Dépenses : période « Ce mois », filtres Tous / Réception / Cafétaria", "Les dépenses de chaque département ; « Télécharger le PDF » fonctionne"],
          ["Toucher la cloche", "Les alertes du patron (stock bas, arrivées du jour, récap…), « Tout marquer lu »"],
        ],
      },
    ],
  },
  {
    titre: "Réception",
    role: "Réceptionniste",
    sert: "Accueillir les clients : état des chambres, réservations, arrivées (check-in), facturation et départ (check-out), fiches clients, journal de la journée, dépenses et rapport de la réception.",
    doit: [
      ["Changer l'état d'une chambre", "Onglet Chambres"],
      ["Créer, modifier, annuler une réservation", "Onglet Réserv."],
      ["Check-in, facturation et check-out", "Fiche de la réservation"],
      ["Encaisser en USD ou en CDF, rendre la monnaie", "Écran Facturation"],
      ["Compléter les fiches clients", "Plus → Clients"],
      ["Saisir les dépenses de la réception", "Onglet Dépenses"],
    ],
    nePas: ["Ajouter une chambre ou changer son prix.", "Annuler un reçu.", "Rembourser ou garder un acompte payé en ligne.", "Ouvrir la caisse de la cafétaria ou le menu."],
    cas: [
      {
        titre: "Accueil et navigation de la réception",
        etapes: [
          ["Se connecter avec le compte réception", "Accueil : « Bonjour, … », pastille Réceptionniste"],
          ["Lire « En dollars » / « En francs »", "Seulement VOS encaissements de chambres du jour"],
          ["Observer la barre du bas", "Accueil, Chambres, Réserv., Dépenses, Plus"],
          ["Ouvrir Plus", "Arrivées et départs, Planning, Journal de la journée, Clients, Journal des reçus, Rapports mensuels, Paramètres, Imprimante, Guide d'utilisation, Synchronisation"],
        ],
      },
      {
        titre: "Changer l'état d'une chambre",
        etapes: [
          ["Onglet Chambres", "Une carte par chambre : numéro, type, prix, état coloré"],
          ["Toucher une chambre « Nettoyage »", "Fenêtre « Chambre … » : Libre, Réservée, Occupée, Nettoyage"],
          ["Choisir « Libre »", "La carte passe tout de suite à Libre"],
          ["Vérifier sur un second appareil", "Le changement y apparaît après synchronisation"],
        ],
      },
      {
        titre: "Créer une réservation (nouveau client)",
        etapes: [
          ["Onglet Réserv. → bouton rond +", "Formulaire « Nouvelle réservation »"],
          ["Arrivée : demain ; nuits : 2 avec « + »", "« Départ le … » se met à jour"],
          ["Lire la liste des chambres", "Les chambres déjà prises sur ces dates sont grisées « déjà réservée » et non sélectionnables"],
          ["Choisir une chambre libre", "Elle est sélectionnée"],
          ["« Nouveau client » : nom, téléphone, type et numéro de pièce", "Champs remplis"],
          ["Acompte versé : 20 ; demandes spéciales : « Lit bébé »", "« Total séjour » et « Reste à payer à l'arrivée » sont affichés"],
          ["« Créer la réservation »", "La fiche s'ouvre, statut « Confirmée »"],
        ],
      },
      {
        titre: "Contrôles de la réservation",
        etapes: [
          ["Créer sans choisir de chambre", "« Choisissez une chambre. »"],
          ["Créer sans nom de client", "« Le nom du client est obligatoire. »"],
          ["Acompte supérieur au prix du séjour", "« L'acompte ne peut pas dépasser le prix du séjour. »"],
          ["Date d'arrivée 31/02/2026", "« Date d'arrivée invalide — format JJ/MM/AAAA. »"],
          ["« Client existant » sans choisir de client", "« Choisissez un client existant… »"],
          ["Sur deux appareils, réserver en même temps la même chambre aux mêmes dates", "Une seule réservation est acceptée ; l'autre est refusée (« Cette chambre est déjà réservée… »)"],
        ],
      },
      {
        titre: "Réservation d'un client déjà venu, listes et planning",
        etapes: [
          ["Nouvelle réservation → « Client existant », rechercher par nom ou téléphone", "Le client est trouvé et sélectionnable"],
          ["Créer la réservation", "Elle apparaît sur la fiche du client (Plus → Clients)"],
          ["Onglet Réserv. : vues Aujourd'hui, À venir, En cours, Historique", "Chaque vue liste les bonnes réservations (client, chambre, dates, statut)"],
          ["Vue Planning", "7 jours, une ligne par chambre, barres colorées (confirmée, en cours, en attente)"],
          ["Toucher le + d'une case vide", "Le formulaire s'ouvre avec la chambre et la date déjà remplies"],
        ],
      },
      {
        titre: "Arrivée du client (check-in)",
        etapes: [
          ["Plus → Arrivées et départs (vue Aujourd'hui)", "Les arrivées « Confirmée » et les départs « En cours » du jour"],
          ["Ouvrir la réservation qui arrive aujourd'hui puis « Check-in »", "Statut « En cours », ligne « Arrivé le … à … », chambre Occupée"],
          ["Créer une réservation en cochant « Le client est déjà là… (check-in) »", "La réservation est directement « En cours »"],
          ["Tenter un check-in sur une réservation « En attente »", "Impossible : il faut d'abord « Confirmer la demande »"],
        ],
      },
      {
        titre: "Pendant le séjour : modifier, écrire, partager",
        etapes: [
          ["Fiche → « Modifier dates / acompte » : prolonger d'une nuit, « Enregistrer »", "Dates et total mis à jour"],
          ["« Contacter le client par WhatsApp »", "Message de confirmation déjà écrit (dates, total, acompte) ; « Ouvrir WhatsApp » ouvre la conversation"],
          ["« Partager le lien de suivi »", "Le partage propose le lien « Ma réservation » du client"],
          ["« Répondre au client » : écrire un message", "Le message apparaît sur la page de suivi du client"],
        ],
      },
      {
        titre: "Facturer le départ (espèces, dollars)",
        etapes: [
          ["Ouvrir un séjour « En cours » → « Facturer et check-out »", "Écran Facturation : prix de la chambre, acompte déduit, « Total à payer »"],
          ["Mode « Espèces », laisser le détail du règlement vide", "Paiement exact"],
          ["« Facturer et check-out » puis confirmer", "« Facture créée » : total, numéro du reçu (TEMP-… « Provisoire », puis REC-… à la synchronisation)"],
          ["« Imprimer le reçu »", "Le ticket sort (si imprimante)"],
          ["Vérifier la chambre et le journal", "Chambre en « Nettoyage » ; notification « Chambre à préparer » ; la facture apparaît au journal"],
          ["Tenter de facturer à nouveau le même séjour", "« Cette réservation a déjà une facture. »"],
        ],
      },
      {
        titre: "Le client paie dans l'autre monnaie",
        etapes: [
          ["Facturation d'un séjour en dollars : détail du règlement, devise remise « CDF »", "« Dû : … FC (1 $ = … FC) » avec le taux du patron"],
          ["Montant remis trop petit", "« Montant insuffisant : il faut … »"],
          ["Montant remis suffisant ; « Rendre la monnaie en » CDF", "« Monnaie à rendre : … FC »"],
          ["Valider", "Le reçu garde le montant remis, le taux et la monnaie rendue"],
          ["Montant en francs avec des centimes (ex. 1000,50)", "Refusé : le franc n'a pas de centimes"],
        ],
      },
      {
        titre: "Annuler une réservation",
        note: "⚠ Destructif : sur une réservation de test.",
        etapes: [
          ["Fiche d'une réservation confirmée → « Annuler la réservation »", "Écran du motif"],
          ["Confirmer sans motif", "« Le motif d'annulation est obligatoire. »"],
          ["Choisir « Client non présenté » puis « Confirmer l'annulation »", "Statut « Annulée », motif visible ; la chambre redevient réservable sur ces dates"],
          ["Vérifier les notifications du patron", "Le patron est prévenu de l'annulation"],
        ],
      },
      {
        titre: "Fiches clients",
        etapes: [
          ["Plus → Clients, rechercher par nom puis par téléphone", "Le client est trouvé"],
          ["Ouvrir la fiche", "Téléphone, pièce d'identité, notes et « Séjours » (chambre, dates, statut)"],
          ["« Compléter la fiche » : notes « VIP », « Enregistrer »", "La fiche est mise à jour (même sans internet)"],
        ],
      },
      {
        titre: "Journal de la journée, dépenses, reçus et rapport",
        etapes: [
          ["Plus → Journal de la journée", "Encaissements du jour (chambres, cafétaria, total), arrivées et départs restants, parc de chambres"],
          ["Onglet Dépenses → + : date du jour, motif « Transport du linge », 8, USD, « Enregistrer »", "La dépense apparaît ; le total de la période est mis à jour"],
          ["Dépense avec une date future, ou un motif de 2 lettres", "Refus avec un message clair"],
          ["Toucher une dépense → « Annuler cette dépense »", "Elle est barrée et ne compte plus dans le total (définitif)"],
          ["Plus → Journal des reçus → ouvrir un reçu → « Réimprimer le reçu »", "Une copie marquée duplicata sort"],
          ["Plus → Rapports mensuels → « Générer le rapport » (Réception)", "Le rapport a un numéro ; « Ouvrir le PDF » l'affiche (internet nécessaire)"],
        ],
      },
    ],
  },
  {
    titre: "Cafétaria",
    role: "Cafétaria",
    sert: "Vendre au restaurant et au bar : comptes par table et par personne, encaissement en USD ou CDF, vente rapide au scanner, cuisine, commandes du site, stock, inventaire, dépenses et rapport.",
    doit: [
      ["Ouvrir un compte, ajouter des articles, encaisser chaque personne", "Onglet Caisse"],
      ["Vendre vite au comptoir avec le scanner", "Caisse → Vente rapide (scanner)"],
      ["Reprendre un compte non payé", "Onglet Comptes"],
      ["Suivre les plats en cuisine", "Plus → Cuisine (si activé)"],
      ["Servir une commande passée sur le site", "Plus → Retrait commande"],
      ["Enregistrer une entrée en stock, faire l'inventaire", "Plus → Stock, Inventaire"],
    ],
    nePas: ["Modifier le menu ou les prix.", "Enregistrer une perte ou un ajustement de stock.", "Annuler un reçu encaissé.", "Voir les réservations de la réception."],
    cas: [
      {
        titre: "Accueil et rubriques de la cafétaria",
        etapes: [
          ["Se connecter avec le compte cafétaria", "Accueil : encaissements du jour (USD et FC, ventes de cafétaria seulement), Stock bas, Activité récente"],
          ["Observer la barre du bas", "Accueil, Caisse, Comptes, Dépenses, Plus"],
          ["Ouvrir Plus", "Cafétaria (Retrait commande, Cuisine, Menu, Stock, Inventaire), Reçus, Abonnement, Appareil (Paramètres, Imprimante, Guide d'utilisation, Synchronisation)"],
        ],
      },
      {
        titre: "Ouvrir un compte et ajouter des articles",
        etapes: [
          ["Onglet Caisse", "« Ouvrir un nouveau compte cafétaria »"],
          ["Table ou nom : « Table 6 » ; première personne : « Papa Joseph » ; « Ouvrir le compte »", "Le compte s'ouvre : la personne, « Aucun article », Total"],
          ["Toucher la personne", "« Ajouter pour Papa Joseph » : menu du jour, plus vendus, tous les produits"],
          ["« + » sur 2 produits, rechercher un 3e, filtrer par catégorie", "Le bouton du bas résume la sélection (« Ajouter à Papa Joseph · 3 articles »)"],
          ["Valider", "Les lignes sont dans le compte ; le total est juste ; le stock baisse"],
          ["Ajouter un produit « Épuisé »", "Il n'a pas de bouton « + »"],
        ],
      },
      {
        titre: "Plusieurs personnes à la même table",
        etapes: [
          ["« Ajouter une personne » : « Mama Grâce », « Ajouter »", "Une deuxième carte apparaît"],
          ["Lui ajouter des articles", "Chaque personne a son propre sous-total"],
          ["« Encaisser Papa Joseph » seulement", "Seule sa part est payée ; il porte « Payé » ; le total devient « Reste à payer »"],
          ["« Tout encaisser » pour le reste", "Le compte se ferme et disparaît des comptes ouverts"],
        ],
      },
      {
        titre: "Encaisser : espèces, francs, monnaie",
        etapes: [
          ["Encaisser en Espèces, montant remis 20 $", "La monnaie à rendre s'affiche en vert"],
          ["« Confirmer l'encaissement »", "Reçu : articles, total, mode, montant remis, monnaie rendue ; numéro TEMP-… puis CAF-…"],
          ["Encaisser un autre compte en CDF, rendre la monnaie en USD", "Dû en francs avec le taux ; « Monnaie à rendre » juste"],
          ["Montant trop petit", "« Montant insuffisant : il faut … »"],
          ["Montant en dollars avec 3 décimales (2,555)", "« Un montant en dollars a au plus deux chiffres après la virgule. »"],
          ["« Imprimer le reçu » puis « Terminer »", "Le ticket sort ; retour à la caisse (ou « Retour au compte » s'il reste des personnes)"],
        ],
      },
      {
        titre: "Annuler un compte créé par erreur",
        etapes: [
          ["Ouvrir un compte « Table 9 » avec un article, sans encaisser", "En bas : « Créé par erreur ? Rien n'a encore été encaissé. »"],
          ["« Annuler ce compte » puis « Annuler le compte »", "Le compte disparaît ; les articles retournent en stock ; le patron est informé"],
          ["Essayer sur un compte dont une personne a déjà payé", "« Une partie de ce compte est déjà encaissée : annulez d'abord le reçu (Ventes). »"],
        ],
      },
      {
        titre: "Vente rapide au scanner",
        etapes: [
          ["Caisse → « Vente rapide (scanner) »", "La caméra s'ouvre (autoriser si demandé)"],
          ["Scanner le code-barres de 2 articles", "Ils s'ajoutent ; le téléphone vibre ; compteur « 2 articles scannés »"],
          ["Valider le panier", "Compte « Comptoir », personne « Client », prêt à encaisser"],
          ["Avec une douchette Bluetooth (si disponible)", "Les articles s'ajoutent sans toucher l'écran"],
          ["Scanner un code-barres qui n'est dans aucun produit", "Un message indique que le produit n'est pas trouvé ; rien n'est ajouté"],
        ],
      },
      {
        titre: "Comptes ouverts et cuisine",
        etapes: [
          ["Onglet Comptes", "Nombre de comptes ; chaque carte : nom, personnes, total"],
          ["Ouvrir un compte, ajouter un plat", "Le plat est « En attente »"],
          ["Plus → Cuisine (suivi activé par le patron)", "Chaque table avec son temps d'attente ; mise à jour toutes les 10 secondes"],
          ["« Prendre en charge » puis « Prêt ✓ »", "Le plat passe « En préparation » puis « Prêt »"],
          ["Dans le compte, « Servi » sur la ligne prête", "Le plat est servi ; quand tout est servi : « Cuisine à jour ! »"],
        ],
      },
      {
        titre: "Stock : entrée et limites",
        etapes: [
          ["Plus → Stock, onglets « Mouvements » et « Valeur du stock »", "Historique des mouvements ; valeur par article"],
          ["Bouton + → choisir un produit, quantité 24, motif « Livraison », « Enregistrer »", "Le stock augmente ; l'impression des étiquettes de prix est proposée"],
          ["Quantité 0 ou vide", "« La quantité doit être supérieure à zéro. » / « Saisissez une quantité. »"],
          ["Tenter une perte ou un ajustement", "« Seul le patron peut enregistrer une perte ou un ajustement de stock. »"],
          ["Faire passer un article sous son seuil", "Il apparaît dans « Stock bas » ; le patron reçoit une notification"],
        ],
      },
      {
        titre: "Inventaire physique",
        etapes: [
          ["Plus → Inventaire : début et fin de période, titre facultatif", "Champs remplis"],
          ["« Lancer l'évaluation »", "Chaque article avec son stock théorique"],
          ["Saisir les quantités comptées, dont un écart sans note", "« 1 écart sans justification… Expliquez chaque écart dans le champ Note. »"],
          ["Laisser un produit non compté", "« N produits non comptés… Saisissez 0 seulement si le produit est vraiment absent. »"],
          ["Tout compléter, « Valider » puis « Enregistrer l'inventaire »", "Résultat : produits, écarts, manquants, surplus ; « Télécharger le PDF »"],
          ["Onglet « Historique »", "L'inventaire est listé avec « Ouvrir le PDF »"],
        ],
      },
      {
        titre: "Dépenses, reçus et rapport de la cafétaria",
        etapes: [
          ["Onglet Dépenses → + : « Achat de charbon », 12, USD", "La dépense apparaît (département Cafétaria)"],
          ["Plus → Journal des reçus", "Les ventes : numéro, date, montant, Réglé"],
          ["Plus → Rapports mensuels → « Générer le rapport » (Cafétaria)", "Le rapport de la cafétaria seulement ; « Ouvrir le PDF »"],
        ],
      },
    ],
  },
  {
    titre: "Site de l'hôtel : réservation et commande en ligne",
    role: "Client de l'hôtel, puis réception, cafétaria et patron",
    sert: "Un client réserve une chambre ou commande des plats sur le site de l'hôtel, sans compte. La réception confirme la demande, l'acompte peut être payé en ligne, la cafétaria sert la commande. Ce module teste le parcours de bout en bout, à plusieurs.",
    doit: [
      ["Voir l'hôtel : présentation, photos, services, contact", "Site de l'hôtel (sous-domaine, ou adresse du site + ?hotel=<sous-domaine>)"],
      ["Envoyer une demande de réservation", "Site → Chambres → « Demander cette chambre »"],
      ["Payer l'acompte (Mobile Money ou carte)", "Page « Ma réservation » du client"],
      ["Suivre, pré-enregistrer, annuler sa réservation", "Page « Ma réservation »"],
      ["Commander des plats à retirer au comptoir", "Site → Cuisine (si activé par le patron)"],
    ],
    nePas: ["Confirmer une chambre déjà réservée par un autre client.", "Recevoir un faux message « réservation confirmée » avant la décision de la réception (sans acompte).", "Voir les données d'un autre hôtel."],
    cas: [
      {
        titre: "Visiter le site de l'hôtel",
        etapes: [
          ["Ouvrir le site de l'hôtel de test (son sous-domaine, ou l'adresse du site HotelSaver suivie de ?hotel=<sous-domaine>)", "Page d'accueil : nom, slogan, photo, boutons « Voir toutes les chambres et réserver »"],
          ["Parcourir Services, Galerie, Contact", "Ce qu'a saisi le patron dans « Site de l'hôtel » (services, photos, adresse, horaires, WhatsApp)"],
          ["Agrandir une photo de la galerie", "La photo s'ouvre en grand ; on peut la fermer"],
          ["Ouvrir le site sur téléphone", "Mise en page adaptée, menu ☰"],
        ],
      },
      {
        titre: "Le client envoie une demande de réservation",
        etapes: [
          ["Site → Chambres : choisir arrivée et départ", "Les chambres libres sur ces dates ont « Demander cette chambre »"],
          ["« Demander cette chambre »", "Formulaire : nom (obligatoire), téléphone, e-mail"],
          ["Envoyer sans nom", "« Votre nom est obligatoire. »"],
          ["Remplir et « Envoyer la demande »", "La page « Ma réservation » s'ouvre : « Demande envoyée », « En attente de confirmation »"],
          ["Noter l'adresse de cette page (lien de suivi)", "Le lien rouvre la même page plus tard"],
        ],
      },
      {
        titre: "La réception confirme la demande",
        etapes: [
          ["Sur le téléphone de la réception : la cloche", "Notification « Nouvelle demande de réservation »"],
          ["Onglet Réserv. → vue À venir", "La demande est « En attente », avec le repère « site public »"],
          ["Ouvrir la demande → « Confirmer la demande »", "Statut « Confirmée » ; la chambre est bloquée sur ces dates"],
          ["Côté client, rafraîchir « Ma réservation »", "« Réservation confirmée »"],
          ["La réception écrit au client (« Répondre au client »)", "Le message apparaît sur la page du client"],
        ],
      },
      {
        titre: "Demande sur une chambre déjà prise",
        etapes: [
          ["Réception : réserver la chambre X du 10 au 12", "Réservation confirmée"],
          ["Client : demander la même chambre X du 11 au 13 (avant que la page ne se rafraîchisse, ou depuis un autre appareil)", "La demande arrive « En attente »"],
          ["Réception : ouvrir cette demande", "« Chambre déjà réservée par un autre client sur ces dates : proposez une autre chambre ou d'autres dates, ou refusez cette demande. » ; « Confirmer la demande » est bloqué"],
          ["Refuser / annuler la demande avec un motif", "Côté client : « Réservation non retenue »"],
        ],
      },
      {
        titre: "Acompte payé en ligne",
        note: "Nécessite ScanLinkPay relié (module Patron). ⚠ En Prod, le paiement est réel.",
        etapes: [
          ["Client : nouvelle demande de réservation", "« Ma réservation » propose « Payer l'acompte » avec le montant (pourcentage × nuits × prix) et les frais"],
          ["Choisir Mobile Money, le réseau, saisir le numéro, payer", "« C'est sur ce numéro que vous recevrez la demande de confirmation. » puis l'attente"],
          ["Valider avec le code secret", "« Votre réservation est confirmée. » ; la progression de l'acompte est à jour"],
          ["Réception : liste des réservations", "Pastille verte « Payé en ligne » ; la fiche montre « Acompte payé en ligne par le client » (montant, date, moyen, référence)"],
          ["Patron et réception : la cloche", "Alerte « Acompte payé en ligne »"],
          ["Au départ, facturer ce séjour", "L'acompte payé en ligne est déjà déduit du total à payer"],
          ["(Variante) Payer par carte bancaire", "Paiement par carte Visa / Mastercard, même résultat"],
        ],
      },
      {
        titre: "Le client suit, pré-enregistre ou annule",
        etapes: [
          ["Sur « Ma réservation » : pré-enregistrement (pièce d'identité, numéro, demandes)", "Les informations sont envoyées ; la réception les voit sur la fiche"],
          ["« Annuler » puis « Oui, annuler »", "« Réservation annulée » / « Vous avez annulé cette réservation. »"],
          ["Réception : ouvrir la réservation", "Statut « Annulée »"],
          ["Si un acompte avait été payé", "La pastille devient « Payé en ligne · à rembourser ? » ; le cas apparaît chez le patron dans Remboursements (module Patron)"],
        ],
      },
      {
        titre: "Commande de plats en ligne",
        note: "Le patron doit avoir activé « Commande en ligne sur le site » et publié des plats.",
        etapes: [
          ["Site de l'hôtel → onglet « Cuisine »", "La carte des plats publiés, avec leurs prix ; « Épuisé » sur un plat sans portion"],
          ["« Ajouter » sur deux plats, nom et prénom, note « sans piment », « Envoyer la commande »", "« Votre commande a été transmise à la cafétéria. », avec une référence de 8 caractères et le total"],
          ["Cafétaria : la cloche", "Notification « Nouvelle commande depuis le site web »"],
          ["Plus → Retrait commande : saisir la référence, « Ouvrir la commande »", "Le compte s'ouvre avec le bandeau « Commande passée depuis le site web », le contact et la note"],
          ["Encaisser au comptoir", "Comme un compte normal ; la commande disparaît des comptes ouverts"],
          ["Saisir une référence qui n'existe pas", "Un message indique qu'aucune commande ne correspond ; aucun compte ne s'ouvre"],
        ],
      },
    ],
  },
  {
    titre: "Hors ligne et synchronisation",
    role: "Tous les rôles (téléphone et ordinateur)",
    sert: "HotelSaver doit continuer de marcher sans internet : tout est gardé sur l'appareil puis envoyé dans l'ordre au retour du réseau, sans perte ni doublon ; les conflits sont montrés clairement.",
    cas: [
      {
        titre: "Réception sans internet",
        etapes: [
          ["Mettre le téléphone de la réception en mode avion", "Bandeau « Hors ligne » ; le point de la cloche devient gris"],
          ["Changer l'état d'une chambre, créer une réservation, faire un check-in", "Tout fonctionne ; le bandeau compte « N actions à envoyer »"],
          ["Facturer un séjour", "Reçu avec numéro TEMP-… et « Provisoire » ; il peut être imprimé"],
          ["Ouvrir un rapport mensuel ou télécharger le PDF des dépenses", "Refus clair : internet nécessaire"],
          ["Rétablir le réseau", "Les actions partent seules ; le bandeau disparaît ; le point redevient vert"],
          ["Ouvrir le Journal des reçus", "Le reçu a reçu son numéro définitif REC-… (le TEMP-… reste visible à côté)"],
        ],
      },
      {
        titre: "Cafétaria sans internet",
        etapes: [
          ["Mode avion sur le téléphone de la cafétaria", "Bandeau « Hors ligne »"],
          ["Ouvrir un compte, ajouter des articles, encaisser", "Le reçu porte TEMP-… ; le stock baisse sur l'appareil"],
          ["Rétablir le réseau", "La vente part ; le reçu reçoit son numéro CAF-… ; le patron voit la vente"],
        ],
      },
      {
        titre: "Conflit entre deux appareils",
        etapes: [
          ["Appareil A hors ligne : modifier les notes d'un client", "Gardé sur A"],
          ["Appareil B en ligne : modifier les notes du MÊME client", "Enregistré sur le serveur"],
          ["Remettre A en ligne", "Bandeau rouge « Conflit à vérifier »"],
          ["Plus → Synchronisation", "« Vous avez essayé » et « État actuel du serveur » écrits en clair (pas de code ni « undefined »)"],
          ["« Garder la version du serveur »", "Le conflit disparaît ; A affiche la version du serveur"],
        ],
      },
      {
        titre: "Action refusée par le serveur",
        etapes: [
          ["Appareil A hors ligne : réserver la chambre X pour demain", "Gardé sur A"],
          ["Appareil B en ligne : réserver la même chambre X pour demain", "Accepté par le serveur"],
          ["Remettre A en ligne", "Bandeau « Action refusée »"],
          ["Plus → Synchronisation → Actions échouées", "La réservation en clair (chambre, dates, client) et l'erreur « Cette chambre est déjà réservée… »"],
          ["« Retirer cette action » et confirmer", "L'action disparaît ; refaire la réservation avec une autre chambre"],
        ],
      },
      {
        titre: "Effacer les données de cet appareil",
        note: "⚠ À faire seulement quand le bandeau ne montre plus d'actions à envoyer.",
        etapes: [
          ["Plus → Paramètres → « Effacer les données de cet appareil »", "Une confirmation explique ce qui sera effacé"],
          ["Confirmer", "Retour à la connexion ; la copie locale est vide"],
          ["Se reconnecter", "Toutes les données de l'hôtel reviennent du serveur"],
        ],
      },
    ],
  },
  {
    titre: "Droits et sécurité",
    role: "Tous les rôles",
    sert: "Chaque rôle ne voit et ne fait que ce qui le concerne, et un hôtel ne voit jamais les données d'un autre.",
    cas: [
      {
        titre: "Ce que la réception ne peut pas faire",
        etapes: [
          ["Compte réception : onglet Chambres", "Pas de bouton + (nouvelle chambre) ; le prix ne se modifie pas"],
          ["Ouvrir un reçu", "Pas de bouton d'annulation"],
          ["Chercher Remboursements, Caisse, Menu, Utilisateurs, Taux de change", "Ces rubriques n'apparaissent pas"],
        ],
      },
      {
        titre: "Ce que la cafétaria ne peut pas faire",
        etapes: [
          ["Compte cafétaria : Plus → Menu, ouvrir un produit", "Lecture seule : « Seul le Patron peut modifier le menu. »"],
          ["Stock : tenter une perte", "« Seul le patron peut enregistrer une perte ou un ajustement de stock. »"],
          ["Chercher les réservations ou les chambres", "Ces onglets n'apparaissent pas"],
        ],
      },
      {
        titre: "Deux hôtels bien séparés",
        etapes: [
          ["Créer un second hôtel de test (autre numéro) avec ses chambres et clients", "Hôtel B prêt"],
          ["Avec le patron de l'hôtel A, parcourir chambres, clients, reçus, rapports", "Aucune donnée de l'hôtel B n'apparaît"],
          ["Sur le site de l'hôtel A, demander une chambre", "Seules les chambres de A sont proposées ; la demande arrive chez A seulement"],
        ],
      },
    ],
  },
  {
    titre: "Guide d'utilisation",
    role: "Tous les rôles",
    sert: "Chaque compte ouvre le guide PDF de son poste, après connexion. Le fichier reste privé : le lien d'ouverture expire au bout de 5 minutes.",
    cas: [
      {
        titre: "Ouvrir le guide depuis le site",
        etapes: [
          ["Site HotelSaver → « Guide »", "Page « Guide d'utilisation pas à pas » avec une connexion"],
          ["Se connecter avec le compte patron", "Quatre guides : complet, patron, réceptionniste, cafétaria (édition et taille)"],
          ["« Télécharger » le guide du patron", "Le PDF s'ouvre / se télécharge"],
          ["Se connecter avec le compte réception", "Un seul guide : celui du réceptionniste"],
          ["Copier le lien du PDF, attendre 6 minutes, le rouvrir", "Le lien ne fonctionne plus (expiré)"],
        ],
      },
      {
        titre: "Ouvrir le guide dans l'application",
        etapes: [
          ["Téléphone : Plus → Guide d'utilisation", "Les guides du rôle, bouton « Ouvrir le guide »"],
          ["Ordinateur : barre latérale → Aide → Guide d'utilisation", "Même liste ; le PDF s'ouvre hors de la fenêtre"],
          ["Sans internet", "Message clair : connexion nécessaire"],
        ],
      },
    ],
  },
  {
    titre: "Application Windows",
    role: "Tous les rôles sur ordinateur",
    sert: "Sur ordinateur, les mêmes fonctions qu'au téléphone, avec une barre latérale, un mode clair/sombre et le travail hors ligne.",
    cas: [
      {
        titre: "Navigation et affichage sur ordinateur",
        etapes: [
          ["Se connecter sur Windows", "Barre latérale : Tableau de bord, sections Réception / Cafétaria / Rapports / Mon hôtel / Aide selon le rôle, Paramètres en bas"],
          ["Passer en mode sombre puis clair (Paramètres)", "Tout l'affichage suit ; les textes restent lisibles"],
          ["Réduire la fenêtre à une largeur de téléphone", "La barre du bas remplace la barre latérale ; rien ne déborde"],
          ["Refaire une réservation et une facturation", "Mêmes écrans, mêmes règles qu'au téléphone"],
          ["Débrancher internet et travailler", "Mêmes comportements hors ligne qu'au téléphone ; reçus TEMP-…"],
        ],
      },
    ],
  },
  {
    titre: "Super-admin (équipe HotelSaver)",
    role: "Équipe HotelSaver seulement",
    sert: "L'équipe HotelSaver gère les hôtels, les formules d'abonnement, les paiements, les réglages de la plateforme, les conditions d'utilisation et les guides.",
    cas: [
      {
        titre: "Hôtels",
        etapes: [
          ["Onglet Hôtels", "Liste des hôtels : formule, statut, abonnement, date de création"],
          ["« Nouvel hôtel » : nom, sous-domaine, patron (numéro, mot de passe), « Créer l'hôtel »", "L'hôtel apparaît ; le patron peut se connecter"],
          ["« Changer la formule », « Changer le statut » (suspendre puis réactiver)", "L'hôtel suspendu perd l'accès ; réactivé, il le retrouve"],
          ["Enregistrer un paiement manuel (Espèces, Mobile Money ou Virement, date de fin)", "L'abonnement de l'hôtel est prolongé"],
        ],
      },
      {
        titre: "Formules, réglages et paiements",
        etapes: [
          ["Onglet Abonnements : modifier une formule (prix, chambres, fonctions)", "Les tarifs du site et de l'application suivent"],
          ["Réglages de la plateforme : durée d'essai, délai de grâce, plafonds de l'essai, taux, contacts", "« Réglages enregistrés. Les applications les reprennent à leur prochain chargement. »"],
          ["Saisir une valeur hors limites (ex. essai de 120 jours)", "Refus : « La durée d'essai doit être un nombre entier de jours, de 0 à 90. »"],
          ["Onglet Paiements en ligne : filtrer, « Revérifier » un paiement en attente", "Le statut est mis à jour depuis ScanLinkPay"],
        ],
      },
      {
        titre: "Conditions d'utilisation et guides",
        etapes: [
          ["Onglet Conditions : modifier le texte, « Publier une nouvelle version »", "Version N+1 publiée ; l'historique garde les anciennes"],
          ["Faire une nouvelle inscription", "Elle demande d'accepter la nouvelle version"],
          ["Onglet Guides : choisir le PDF de chaque guide, « Publier »", "Version publiée (taille, date) ; « Ouvrir » l'affiche"],
          ["Vérifier sur le site → Guide", "Les comptes voient la nouvelle version"],
        ],
      },
    ],
  },
];

const pointsAttention = [
  ["La nouvelle version 1.0.4", "L'entrée « Guide d'utilisation » et l'écran Synchronisation écrit en clair n'existent que dans la version 1.0.4 (téléphone et Windows). Avec une version plus ancienne, noter la version dans la fiche du testeur."],
  ["Le guide en ligne", "La publication réelle des PDF dans le stockage privé est récente : tester en priorité l'onglet Guides du super-admin puis la page Guide du site."],
  ["Paiements réels", "En Prod, l'abonnement et l'acompte en ligne débitent vraiment le Mobile Money. Utiliser de petits montants ou l'environnement Test."],
  ["Mode sombre", "Seule l'application Windows a un mode sombre ; le téléphone est toujours en clair (ce n'est pas une anomalie)."],
  ["Documents PDF", "Rapports mensuels, PDF des dépenses et de l'inventaire, guide : une connexion internet est nécessaire pour les ouvrir."],
];

const avis = [
  "Facilité de prise en main",
  "Clarté des écrans et des messages",
  "Rapidité de l'application",
  "Fiabilité sans internet",
  "Réservation et paiement en ligne",
  "Utilité générale pour un hôtel",
];

module.exports = { presentation, modules, pointsAttention, avis };
