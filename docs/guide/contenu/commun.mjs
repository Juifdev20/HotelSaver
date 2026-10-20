import { etapes, texte } from "../modele.mjs";

const C = "captures/brut/";

export default {
  id: "commun",
  titre: "Pour bien démarrer",
  libelle: "Pour bien démarrer",
  guide: "Pour bien démarrer",
  icone: "info",
  chapitres: [
    {
      titre: "Bienvenue dans HotelSaver",
      points: ["Ce que fait l'application", "Les trois rôles : patron, réception, cafétaria", "Comment lire ce guide"],
      pages: [
        texte({
          surtitre: "Présentation",
          titre: "HotelSaver, votre hôtel dans la poche",
          chapo: "Une seule application pour la réception, la cafétaria et le patron, sur téléphone comme sur ordinateur.",
          blocs: [
            { ruban: { icone: "hotel", titre: "Gérez votre hôtel au quotidien", texte: "Chambres et réservations, facturation et reçus, cafétaria, stock, dépenses et rapports : tout au même endroit." } },
            {
              cartes: [
                { icone: "lit", titre: "Réception", texte: "L'accueil des clients.", points: ["Chambres et réservations", "Arrivées et départs", "Factures et reçus"] },
                { icone: "cafe", titre: "Cafétaria", texte: "La vente au restaurant et au bar.", points: ["Caisse et comptes ouverts", "Menu, stock, inventaire", "Commandes du site web"] },
                { icone: "graphique", titre: "Pilotage", texte: "Le suivi par le patron.", points: ["Tableau de bord", "Rapports et dépenses", "Équipe et abonnement"] },
              ],
            },
            {
              h: "Ce qui rend HotelSaver pratique",
              liste: [
                { icone: "horsligne", texte: "**Il marche même sans internet.** Vous continuez à travailler, et tout s'envoie dès que le réseau revient." },
                { icone: "recu", texte: "**Dollars et francs congolais.** Les prix, les reçus et les rapports tiennent compte des deux monnaies." },
                { icone: "globe", texte: "**Réservation en ligne.** Vos clients réservent et paient un acompte depuis le site de votre hôtel." },
                { icone: "bouclier", texte: "**Vos données sont à vous.** Chaque hôtel a ses propres données, séparées de celles des autres." },
              ],
            },
          ],
        }),
        texte({
          surtitre: "Mode d'emploi",
          titre: "Comment lire ce guide",
          chapo: "Chaque partie du guide correspond à un rôle. Lisez d'abord ce chapitre, puis la partie qui vous concerne.",
          blocs: [
            {
              tableau: {
                entetes: ["Vous êtes", "Votre partie", "Ce que vous y trouvez"],
                lignes: [
                  ["Patron", "Partie A", "Créer l'hôtel, régler l'application, créer les comptes de l'équipe, payer l'abonnement, suivre l'activité"],
                  ["Réceptionniste", "Partie B", "Chambres, réservations, arrivées, départs, factures, clients, dépenses"],
                  ["Cafétaria", "Partie C", "Caisse, comptes ouverts, commandes, menu, stock, inventaire"],
                ],
              },
            },
            { h: "Les repères du guide", p: "Dans tout le guide, les boutons et rubriques sont écrits entre guillemets, exactement comme à l'écran. « Appuyez sur » veut dire : touchez avec le doigt sur un téléphone, cliquez avec la souris sur un ordinateur." },
            { encadre: { type: "info", titre: "Bon à savoir", texte: "Un encadré bleu donne une information utile pour comprendre ou aller plus vite." } },
            { encadre: { type: "conseil", titre: "Astuce", texte: "Un encadré vert donne un conseil qui vous fait gagner du temps ou évite une erreur." } },
            { encadre: { type: "attention", titre: "Important", texte: "Un encadré rouge signale une règle à respecter absolument : argent, mot de passe, données." } },
            { encadre: { type: "info", titre: "À propos des images", texte: "Les captures d'écran montrent un hôtel fictif, « Hôtel Grand Lac ». Vos noms et vos chiffres seront différents, et l'écran peut varier légèrement selon votre appareil." } },
          ],
        }),
      ],
    },
    {
      titre: "Installer l'application",
      points: ["Téléphone Android : télécharger l'application sur le site", "Ordinateur Windows : l'installateur", "Google Play et App Store : bientôt"],
      pages: [
        texte({
          surtitre: "Installation",
          titre: "Sur quel appareil installer HotelSaver ?",
          chapo: "L'application se télécharge directement sur le site HotelSaver. Aucun compte Google n'est nécessaire.",
          blocs: [
            {
              cartes: [
                { icone: "telephone", titre: "Téléphone Android", texte: "Téléchargement direct (fichier APK) sur le site.", points: ["Disponible maintenant", "Pour réception, cafétaria et patron"] },
                { icone: "ordinateur", titre: "Ordinateur Windows", texte: "Installateur à télécharger sur le site.", points: ["Disponible maintenant", "Idéal pour un poste fixe à la réception"] },
                { icone: "telecharger", titre: "Google Play et App Store", texte: "Les boutons sont déjà sur le site.", points: ["Bientôt disponibles", "Ce guide sera mis à jour"] },
              ],
            },
            { encadre: { type: "info", titre: "Où télécharger ?", texte: "Rendez-vous sur le site HotelSaver. Au début de la page d'accueil, les boutons « Android » et « Windows » lancent le téléchargement." } },
            { encadre: { type: "conseil", titre: "Un seul compte, plusieurs appareils", texte: "Vous pouvez installer HotelSaver sur le téléphone et sur l'ordinateur, puis vous connecter avec le même numéro et le même mot de passe." } },
            { encadre: { type: "attention", titre: "Téléchargez uniquement sur le site HotelSaver", texte: "Ne prenez jamais l'application sur un autre site ni par un fichier reçu d'un inconnu : elle pourrait être modifiée." } },
          ],
        }),
        etapes({
          surtitre: "Android",
          titre: "Télécharger l'application sur votre téléphone",
          chapo: "Deux gestes pour récupérer le fichier d'installation.",
          etapes: [
            { titre: "Ouvrez le site", texte: "Dans le navigateur de votre téléphone, ouvrez le site HotelSaver. La page d'accueil s'affiche.", action: "Ouvrez le site HotelSaver", image: C + "commun-site-mobile-haut.png" },
            { titre: "Choisissez Android", texte: "Faites défiler jusqu'aux boutons noirs. Touchez « Android ».", action: "Appuyez sur « Android — Télécharger l'APK »", image: C + "commun-site-mobile-boutons.png", reperes: [{ x: 0.041, y: 0.245, l: 0.397, h: 0.057 }] },
          ],
          apres: [
            { encadre: { type: "info", titre: "Ensuite", texte: "Le fichier HotelSaver.apk se télécharge. Une notification vous prévient quand il est prêt : passez à la page suivante pour l'installer." } },
            { encadre: { type: "conseil", titre: "Connexion lente ?", texte: "Le fichier fait quelques dizaines de mégaoctets. Restez sur le site jusqu'à la fin du téléchargement et évitez de changer d'application pendant ce temps." } },
          ],
        }),
        texte({
          surtitre: "Android",
          titre: "Installer le fichier téléchargé",
          chapo: "Votre téléphone peut demander une autorisation : c'est normal pour une application qui ne vient pas encore de Google Play.",
          blocs: [
            {
              parcours: [
                { titre: "Ouvrez le fichier", texte: "Touchez la notification de téléchargement, ou ouvrez le dossier « Téléchargements » de votre téléphone et touchez **HotelSaver.apk**." },
                { titre: "Autorisez l'installation", texte: "Si le téléphone affiche « Pour votre sécurité, l'installation d'applications inconnues est bloquée », touchez **Paramètres**, puis activez **Autoriser depuis cette source**. Revenez en arrière." },
                { titre: "Touchez « Installer »", texte: "Si une analyse de sécurité (Play Protect) est proposée, acceptez-la. Si le téléphone le demande, touchez **Installer quand même**." },
                { titre: "Ouvrez l'application", texte: "Quand l'installation est finie, touchez **Ouvrir**. L'icône HotelSaver est maintenant dans la liste de vos applications." },
              ],
            },
            { encadre: { type: "info", titre: "Les messages changent selon la marque", texte: "Les mots exacts varient selon la marque et la version d'Android (Tecno, Samsung, Infinix, Xiaomi…). Cherchez toujours les mots « Autoriser » et « Installer »." } },
            { encadre: { type: "conseil", titre: "Application déjà installée", texte: "Inutile de la télécharger une seconde fois : ouvrez-la depuis la liste de vos applications, ou installez simplement la nouvelle version par-dessus l'ancienne." } },
          ],
        }),
        texte({
          surtitre: "Windows",
          titre: "Installer l'application sur un ordinateur",
          chapo: "L'installateur vous guide pas à pas. Comptez deux minutes.",
          blocs: [
            {
              parcours: [
                { titre: "Téléchargez l'installateur", texte: "Sur le site HotelSaver, cliquez sur **Windows — Télécharger l'installateur**. Le fichier **HotelSaver-Setup.exe** se télécharge." },
                { titre: "Ouvrez le fichier", texte: "Si Windows affiche « Windows a protégé votre ordinateur », cliquez sur **Informations complémentaires**, puis sur **Exécuter quand même**." },
                { titre: "Page « Bienvenue »", texte: "L'assistant s'appelle « Bienvenue dans l'installation de HotelSaver ». Lisez, puis cliquez sur **Suivant**." },
                { titre: "Conditions d'utilisation", texte: "Lisez les conditions et cliquez sur **J'accepte**." },
                { titre: "Dossier d'installation", texte: "Vous pouvez garder le dossier proposé. Cliquez sur **Installer**." },
                { titre: "Terminez", texte: "Laissez cochée la case **Lancer HotelSaver** et cliquez sur **Terminer**." },
              ],
            },
            { encadre: { type: "conseil", titre: "Retrouver l'application", texte: "L'installateur place une icône « HotelSaver » sur le bureau et dans le menu Démarrer. Aucun droit d'administrateur n'est demandé." } },
            { encadre: { type: "info", titre: "Mises à jour", texte: "Pour installer une nouvelle version, téléchargez de nouveau l'installateur sur le site : vos données restent en place." } },
          ],
        }),
      ],
    },
    {
      titre: "Se connecter à HotelSaver",
      points: ["Se connecter avec son numéro de téléphone", "Mot de passe oublié", "Que faire si la connexion échoue"],
      pages: [
        etapes({
          surtitre: "Connexion",
          titre: "Ouvrir votre espace",
          chapo: "Votre patron vous a créé un compte : il vous a donné votre numéro de téléphone et un mot de passe.",
          etapes: [
            { titre: "Ouvrez l'application", texte: "Touchez l'icône HotelSaver. L'écran « Ravi de vous revoir ! » s'affiche.", action: "Ouvrez HotelSaver", image: C + "commun-connexion.png" },
            { titre: "Saisissez votre numéro", texte: "Le code du pays +243 est déjà écrit. Tapez votre numéro, sans le zéro du début, puis votre mot de passe.", action: "Remplissez « Numéro de téléphone » et « Mot de passe »", image: C + "commun-connexion.png", vue: [0.28, 0.62], reperes: [{ x: 0.126, y: 0.424, l: 0.749, h: 0.066 }, { x: 0.126, y: 0.521, l: 0.749, h: 0.066 }] },
            { titre: "Appuyez sur « Se connecter »", texte: "Vous arrivez sur votre écran d'accueil. Vos rubriques dépendent de votre rôle.", action: "Appuyez sur « Se connecter »", image: C + "commun-connexion-mdp-visible.png", vue: [0.28, 0.72], reperes: [{ x: 0.126, y: 0.637, l: 0.749, h: 0.063 }] },
          ],
        }),
        etapes({
          surtitre: "Mot de passe",
          titre: "Vous avez oublié votre mot de passe ?",
          chapo: "Vous pouvez le faire changer sans attendre.",
          etapes: [
            { titre: "Ouvrez « Mot de passe oublié ? »", texte: "Sur l'écran de connexion, touchez le lien bleu sous le mot de passe.", action: "Appuyez sur « Mot de passe oublié ? »", image: C + "commun-connexion-mdp-visible.png", vue: [0.28, 0.62], reperes: [{ x: 0.52, y: 0.589, l: 0.36, h: 0.032 }] },
            { titre: "Saisissez votre numéro", texte: "Écrivez le numéro de votre compte, puis touchez « Continuer ».", action: "Appuyez sur « Continuer »", image: C + "commun-oubli.png" },
            { titre: "Suivez la règle de votre rôle", texte: "Un e-mail n'est envoyé que si une adresse est liée au compte. Sinon, demandez de l'aide comme indiqué ci-dessous.", action: "Voir le tableau ci-dessous", image: C + "commun-oubli.png", vue: [0.18, 0.7] },
          ],
        }),
        texte({
          surtitre: "Aide",
          titre: "Si la connexion ne marche pas",
          blocs: [
            {
              tableau: {
                entetes: ["Ce que vous voyez", "Ce que cela veut dire", "Que faire"],
                lignes: [
                  ["« Numéro (ou e-mail) ou mot de passe incorrect. »", "Le numéro ou le mot de passe est faux.", "Vérifiez les chiffres, touchez l'œil pour voir le mot de passe, puis réessayez."],
                  ["Mot de passe oublié, vous êtes employé", "Seul le patron peut changer votre mot de passe.", "Demandez à votre patron de le changer dans la rubrique Utilisateurs."],
                  ["Mot de passe oublié, vous êtes patron", "Le lien arrive par e-mail si une adresse est liée au compte.", "Sinon, contactez le support HotelSaver par WhatsApp."],
                  ["Compte lié à une adresse e-mail", "Les anciens comptes se connectent avec une adresse e-mail.", "Touchez « Ancien compte ? Se connecter avec un e-mail »."],
                ],
              },
            },
            { encadre: { type: "attention", titre: "Votre mot de passe est personnel", texte: "Ne le donnez à personne, même à un collègue ou à un responsable. Chaque action est enregistrée au nom de la personne connectée." } },
            { encadre: { type: "conseil", titre: "Poste partagé", texte: "Sur un ordinateur ou un téléphone utilisé par plusieurs personnes, déconnectez-vous toujours à la fin de votre service." } },
          ],
        }),
      ],
    },
  ],
};
