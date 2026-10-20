/**
 * Partie B du guide : la réception. Écrit pour l'application MOBILE (apps/mobile) : libellés et parcours des écrans du téléphone.
 * Les captures sont dans captures/brut/reception-*.png ; les repères (cadres et points) sont LUS dans captures/brut/reception-reperes.json,
 * écrit par les scripts de captures (captures-scripts/reception*.cjs) : refaire les captures refait aussi les repères.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { annote, bloc, etapes, texte } from "../modele.mjs";

const C = "captures/brut/reception-";
const img = (nom) => `${C}${nom}.png`;

/* ---- repères mesurés par les scripts de captures ---- */
const FICHIER = join(dirname(fileURLToPath(import.meta.url)), "../captures/brut/reception-reperes.json");
const MESURES = existsSync(FICHIER) ? JSON.parse(readFileSync(FICHIER, "utf8")) : {};
const manquants = new Set();
function mesure(nom, cle) {
  const m = MESURES[nom]?.[cle];
  if (m) return m;
  manquants.add(`${nom}/${cle}`);
  return { x: 0.1, y: 0.1, l: 0.3, h: 0.05 };
}
/** Cadre numéroté autour d'un élément de la capture. */
const cadre = (nom, cle, n, marge = 0.008) => {
  const m = mesure(nom, cle);
  return { x: Math.max(0, m.x - marge), y: Math.max(0, m.y - marge / 2), l: m.l + 2 * marge, h: m.h + marge, n };
};
/** Point visé au centre (ou à une fraction) d'un élément, pour les écrans annotés. */
const visee = (nom, cle, n, titre, texteLegende, cote, dx = 0.5, dy = 0.5) => {
  const m = mesure(nom, cle);
  return { n, titre, texte: texteLegende, x: m.x + m.l * dx, y: m.y + m.h * dy, cote };
};
/** Rectangle de zoom (fractions) autour d'un ou plusieurs éléments, avec une marge. */
const zoneAutour = (nom, cles, marge = 0.03) => {
  const ms = cles.map((c) => mesure(nom, c));
  const x0 = Math.max(0, Math.min(...ms.map((m) => m.x)) - marge);
  const x1 = Math.min(1, Math.max(...ms.map((m) => m.x + m.l)) + marge);
  const y0 = Math.max(0, Math.min(...ms.map((m) => m.y)) - marge);
  const y1 = Math.min(1, Math.max(...ms.map((m) => m.y + m.h)) + marge);
  return [x0, y0, x1, y1];
};

const pageEtapes = etapes;

const chapitres = [
  /* ================================================================ 1 */
  {
    titre: "Se connecter et découvrir votre écran",
    points: [
      "Vous connecter avec votre numéro de téléphone",
      "Retrouver un mot de passe oublié",
      "Lire l'écran d'accueil et les notifications",
      "Utiliser la barre du bas et le menu « Plus »",
      "Savoir ce que vous pouvez faire (et ce que le patron garde)",
    ],
    pages: [
      pageEtapes({
        surtitre: "Pas à pas",
        titre: "Se connecter",
        chapo: "Votre patron vous a donné un numéro de téléphone et un mot de passe. Ouvrez l'application HotelSaver.",
        etapes: [
          {
            titre: "Tapez votre numéro",
            texte: "Le code du pays (+243) est déjà écrit. Tapez les 9 chiffres de votre numéro : ils commencent par 8 ou 9, par exemple 970 000 000.",
            action: "Appuyez sur « Numéro de téléphone »",
            image: img("connexion-remplie"),
            zone: zoneAutour("connexion-remplie", ["numero", "motdepasse"], 0.04),
            reperes: [cadre("connexion-remplie", "numero", 1)],
          },
          {
            titre: "Tapez votre mot de passe",
            texte: "Appuyez sur l'œil pour voir ce que vous tapez. Faites attention aux majuscules et aux minuscules.",
            action: "Appuyez sur « Mot de passe »",
            image: img("connexion-remplie"),
            zone: zoneAutour("connexion-remplie", ["numero", "motdepasse"], 0.04),
            reperes: [cadre("connexion-remplie", "motdepasse", 2)],
          },
          {
            titre: "Entrez dans l'application",
            texte: "Vous arrivez sur l'écran d'accueil. Si un message rouge apparaît, relisez votre numéro et votre mot de passe.",
            action: "Appuyez sur « Se connecter »",
            image: img("connexion-remplie"),
            zone: zoneAutour("connexion-remplie", ["motdepasse", "bouton"], 0.04),
            reperes: [cadre("connexion-remplie", "bouton", 3)],
          },
        ],
      }),
      pageEtapes({
        surtitre: "Pas à pas",
        titre: "Mot de passe oublié ?",
        chapo: "Cela arrive à tout le monde. Voici quoi faire.",
        etapes: [
          {
            titre: "Ouvrez « Mot de passe oublié ? »",
            texte: "Ce lien se trouve sous le champ du mot de passe, sur l'écran de connexion.",
            action: "Appuyez sur « Mot de passe oublié ? »",
            image: img("connexion-vide"),
            zone: zoneAutour("connexion-vide", ["oublie"], 0.12),
            reperes: [cadre("connexion-vide", "oublie", 1)],
          },
          {
            titre: "Demandez le lien",
            texte: "Tapez le numéro de votre compte, puis appuyez sur « Continuer ». Si une adresse e-mail est liée à votre compte, vous recevez un lien pour choisir un nouveau mot de passe.",
            action: "Appuyez sur « Continuer »",
            image: img("oubli"),
            zone: zoneAutour("oubli", ["continuer"], 0.16),
            reperes: [cadre("oubli", "continuer", 2)],
          },
        ],
        apres: [
          { encadre: { type: "info", titre: "Pas d'e-mail sur votre compte ?", texte: "Demandez à votre patron de changer votre mot de passe. Il le fait depuis son application, dans la gestion des utilisateurs. Regardez aussi dans les courriers indésirables." } },
          { encadre: { type: "attention", titre: "Important", texte: "Après plusieurs essais ratés, l'application dit « Trop de tentatives. Patientez quelques minutes avant de réessayer. » Attendez avant de recommencer." } },
        ],
      }),
      annote({
        surtitre: "Écran d'accueil",
        titre: "Votre écran d'accueil",
        chapo: "En un coup d'œil : ce que vous avez encaissé aujourd'hui et l'état des chambres.",
        image: img("accueil"),
        marques: [
          visee("accueil", "avatar", 1, "Menu du compte", "Votre nom, votre rôle et « Se déconnecter ».", "g"),
          visee("accueil", "cloche", 2, "Notifications", "Le point de couleur montre la synchronisation : vert = tout est à jour.", "d"),
          visee("accueil", "hero", 3, "Votre hôtel", "Nom de l'hôtel, date et heure du jour.", "g"),
          visee("accueil", "encaissements", 4, "Vos encaissements", "Argent encaissé aujourd'hui, en dollars et en francs.", "d"),
          visee("accueil", "occupation", 5, "Taux d'occupation", "Appuyez sur Occupées, Libres ou Réservées pour ouvrir les chambres.", "g"),
        ],
      }),
      pageEtapes({
        surtitre: "Se déplacer",
        titre: "La barre du bas, « Plus » et les notifications",
        chapo: "Cinq onglets en bas de l'écran, et le menu « Plus » pour tout le reste.",
        etapes: [
          {
            titre: "La barre du bas",
            texte: "Accueil, Chambres, Réserv. (réservations), Dépenses et Plus. L'onglet actif est en bleu.",
            action: "Appuyez sur un onglet",
            image: img("accueil"),
            zone: [0, 0.9, 1, 1],
            reperes: [cadre("accueil", "barre", 1, 0.004)],
          },
          {
            titre: "Le menu « Plus »",
            texte: "Il contient Arrivées et départs, Planning, Journal de la journée, Clients, Journal des reçus, Rapports mensuels, Paramètres, Imprimante et Synchronisation.",
            action: "Appuyez sur « Plus »",
            image: img("plus"),
          },
          {
            titre: "Les notifications",
            texte: "Elles vous préviennent, par exemple : « Chambre à préparer », « Nouvelle demande de réservation » ou « Départ dépassé ». Appuyez sur « Tout marquer lu » pour effacer les points.",
            action: "Appuyez sur la cloche",
            image: img("notifications"),
          },
        ],
      }),
      texte({
        surtitre: "À savoir",
        titre: "Ce que vous pouvez faire",
        chapo: "Le réceptionniste fait le travail de tous les jours. Certaines décisions restent au patron.",
        blocs: [
          {
            tableau: {
              entetes: ["Action", "Vous", "Qui s'en occupe"],
              lignes: [
                ["Voir les chambres et changer leur état", true, "Vous"],
                ["Ajouter, modifier ou supprimer une chambre (numéro, type, prix)", false, "Le patron"],
                ["Créer, modifier ou annuler une réservation", true, "Vous"],
                ["Faire le check-in, facturer et faire le check-out", true, "Vous"],
                ["Voir et compléter la fiche d'un client", true, "Vous"],
                ["Saisir et corriger les dépenses de la réception", true, "Vous (le patron les consulte)"],
                ["Générer le rapport mensuel de la réception", true, "Vous"],
                ["Annuler un reçu", false, "Le patron"],
                ["Rembourser ou garder un acompte payé en ligne", false, "Le patron"],
                ["Cafétaria : caisse, menu, stock", false, "La cafétaria"],
                ["Taux de change, utilisateurs, site de l'hôtel", false, "Le patron"],
              ],
            },
          },
          { encadre: { type: "conseil", titre: "Astuce", texte: "Un message « Vous n'avez pas le droit de faire cette action » veut dire que l'action est réservée au patron. Ce n'est pas une panne." } },
        ],
      }),
    ],
  },

  /* ================================================================ 2 */
  {
    titre: "Les chambres",
    points: [
      "Voir l'état de toutes les chambres",
      "Changer l'état d'une chambre (par exemple après le ménage)",
      "Comprendre les quatre états : Libre, Réservée, Occupée, Nettoyage",
      "Savoir qui peut ajouter ou modifier une chambre",
    ],
    pages: [
      annote({
        surtitre: "Onglet Chambres",
        titre: "La liste des chambres",
        chapo: "Chaque chambre est une carte : numéro, type, prix par nuit et état du moment.",
        image: img("chambres"),
        marques: [
          visee("chambres", "retour", 1, "Retour", "Revient à l'écran d'accueil.", "g"),
          visee("chambres", "carte", 2, "Une chambre", "Numéro, type (Standard, Confort, Suite…) et prix par nuit.", "d"),
          visee("chambres", "etat", 3, "L'état", "Libre (vert), Réservée (orange), Occupée (rouge), Nettoyage (violet).", "g"),
          visee("chambres", "liste", 4, "Actualiser", "Tirez la liste vers le bas pour la remettre à jour.", "d"),
        ],
      }),
      pageEtapes({
        surtitre: "Pas à pas",
        titre: "Changer l'état d'une chambre",
        chapo: "Par exemple, la chambre 103 vient d'être nettoyée : remettez-la « Libre ».",
        etapes: [
          {
            titre: "Touchez la chambre",
            texte: "Appuyez sur la carte de la chambre dans l'onglet Chambres.",
            action: "Appuyez sur la carte de la chambre",
            image: img("chambres"),
            reperes: [cadre("chambres", "carte", 1)],
          },
          {
            titre: "Choisissez le nouvel état",
            texte: "Une fenêtre « Chambre 103 » propose quatre choix : Libre, Réservée, Occupée, Nettoyage.",
            action: "Appuyez sur « Libre »",
            image: img("chambre-etat"),
          },
          {
            titre: "Vérifiez",
            texte: "La carte change tout de suite. Le changement part au serveur dès qu'il y a du réseau, même si vous étiez hors ligne.",
            image: img("chambre-modifiee"),
            reperes: [cadre("chambre-modifiee", "etat", 3)],
          },
        ],
      }),
      texte({
        surtitre: "À savoir",
        titre: "Les quatre états d'une chambre",
        chapo: "L'application change l'état toute seule à l'arrivée et au départ du client. Vous le corrigez à la main si besoin.",
        blocs: [
          {
            tableau: {
              entetes: ["État", "Ce que cela veut dire", "Quand il change"],
              lignes: [
                ["Libre", "La chambre est propre et peut être louée.", "Vous la remettez Libre après le ménage."],
                ["Réservée", "Un client doit arriver prochainement.", "Seulement à la main : l'application ne la met pas toute seule."],
                ["Occupée", "Un client est dans la chambre.", "Automatique au check-in."],
                ["Nettoyage", "Le client est parti, le ménage est à faire.", "Automatique au check-out."],
              ],
            },
          },
          { encadre: { type: "info", titre: "Au départ d'un client", texte: "Quand vous faites le check-out, la chambre passe en « Nettoyage » et vous recevez la notification « Chambre à préparer »." } },
          { encadre: { type: "attention", titre: "Important", texte: "Vous changez l'état d'une chambre, mais vous ne pouvez pas ajouter une chambre ni changer son numéro, son type ou son prix : seul le patron le peut." } },
          { encadre: { type: "conseil", titre: "Astuce", texte: "Sur l'écran d'accueil, appuyez sur « Occupées », « Libres » ou « Réservées » : vous ouvrez directement la liste des chambres." } },
        ],
      }),
    ],
  },

  /* ================================================================ 3 */
  {
    titre: "Créer une réservation",
    points: [
      "Choisir les dates, la durée et la chambre",
      "Enregistrer un nouveau client ou choisir un client connu",
      "Noter la pièce d'identité, l'acompte et les demandes spéciales",
      "Comprendre les règles : une chambre déjà réservée ne se prend pas",
      "Retrouver les réservations dans la liste et dans le planning",
    ],
    pages: [
      pageEtapes({
        surtitre: "Étape 1 sur 3",
        titre: "Le séjour et la chambre",
        chapo: "Une réservation se crée dans l'onglet Réserv.",
        etapes: [
          {
            titre: "Ouvrez une nouvelle réservation",
            texte: "Dans l'onglet Réserv., le bouton rond « + » est en bas à droite de l'écran.",
            action: "Appuyez sur « + » (Nouvelle réservation)",
            image: img("reservations"),
            reperes: [cadre("reservations", "nouvelle", 1)],
          },
          {
            titre: "Choisissez les dates",
            texte: "« Arrivée » montre la date d'aujourd'hui. Pour une autre date, écrivez-la (JJ/MM/AAAA) ou choisissez-la dans le calendrier. Avec « - » et « + », réglez le nombre de nuits (de 1 à 60).",
            action: "Appuyez sur « Arrivée », puis sur « + » pour les nuits",
            image: img("nouvelle-sejour"),
            reperes: [cadre("nouvelle-sejour", "sejour", 2)],
          },
          {
            titre: "Choisissez la chambre",
            texte: "La liste donne le numéro, le type et le prix par nuit. Une chambre déjà prise sur ces dates est grisée avec « déjà réservée » : on ne peut pas la choisir.",
            action: "Appuyez sur la chambre voulue",
            image: img("nouvelle-chambre"),
            reperes: [cadre("nouvelle-chambre", "chambre", 3)],
          },
        ],
      }),
      pageEtapes({
        surtitre: "Étape 2 sur 3",
        titre: "Le client",
        chapo: "Un nouveau client ou un client déjà venu : deux boutons, au choix.",
        etapes: [
          {
            titre: "Nouveau client",
            texte: "Appuyez sur « Nouveau client ». Seul le nom est obligatoire. Le téléphone et l'e-mail servent à joindre le client.",
            action: "Remplissez « Nom (obligatoire) »",
            image: img("nouvelle-client"),
            reperes: [cadre("nouvelle-client", "nom", 1)],
          },
          {
            titre: "Pièce d'identité",
            texte: "Notez le type de pièce (CNI, passeport, permis…) et son numéro. Ces deux champs sont facultatifs, mais utiles pour le registre.",
            action: "Remplissez « Type de pièce » et « N° de pièce »",
            image: img("nouvelle-piece"),
            reperes: [cadre("nouvelle-piece", "piece", 2)],
          },
          {
            titre: "Client déjà connu",
            texte: "Appuyez sur « Client existant ». Tapez un nom ou un téléphone dans « Rechercher », puis touchez le client dans la liste. Au-delà de 30 résultats, précisez la recherche.",
            action: "Appuyez sur « Client existant »",
            image: img("nouvelle-existant"),
            reperes: [cadre("nouvelle-existant", "mode", 3)],
          },
        ],
      }),
      pageEtapes({
        surtitre: "Étape 3 sur 3",
        titre: "Acompte, demandes et validation",
        chapo: "Dernières informations, puis la réservation est créée.",
        etapes: [
          {
            titre: "L'acompte",
            texte: "Si le client verse un acompte, tapez-le dans « Acompte versé », dans la devise de la chambre. L'application affiche « Total séjour » et « Reste à payer à l'arrivée ».",
            action: "Remplissez « Acompte versé »",
            image: img("nouvelle-acompte"),
            reperes: [cadre("nouvelle-acompte", "acompte", 1)],
          },
          {
            titre: "Demandes et arrivée immédiate",
            texte: "Notez les « Demandes spéciales » (lit bébé, étage élevé…). Si le client est déjà devant vous, cochez « Le client est déjà là — enregistrer l'arrivée tout de suite (check-in) ».",
            action: "Cochez la case si le client est là",
            image: img("nouvelle-fin"),
            reperes: [cadre("nouvelle-fin", "case", 2)],
          },
          {
            titre: "Créez la réservation",
            texte: "La fiche de la réservation s'ouvre avec son statut. Elle est enregistrée même sans internet.",
            action: "Appuyez sur « Créer la réservation »",
            image: img("reservation-creee"),
            reperes: [cadre("reservation-creee", "statut", 3)],
          },
        ],
      }),
      texte({
        surtitre: "À savoir",
        titre: "Les règles à connaître",
        chapo: "L'application vous protège des erreurs. Voici les messages que vous pouvez voir et quoi faire.",
        blocs: [
          {
            tableau: {
              entetes: ["Ce que vous voyez", "Pourquoi", "Que faire"],
              lignes: [
                ["Chambre grisée : « déjà réservée »", "Un autre client a cette chambre sur ces dates.", "Choisissez une autre chambre ou d'autres dates."],
                ["« Choisissez une chambre. »", "Aucune chambre n'est choisie.", "Touchez une chambre dans la liste."],
                ["« Le nom du client est obligatoire. »", "Le champ « Nom » est vide.", "Écrivez le nom du client."],
                ["« Choisissez un client existant… »", "Vous êtes sur « Client existant » sans avoir choisi.", "Touchez un client, ou passez en « Nouveau client »."],
                ["« L'acompte ne peut pas dépasser le prix du séjour. »", "L'acompte est trop grand.", "Corrigez le montant."],
                ["« Date d'arrivée invalide — format JJ/MM/AAAA. »", "La date n'existe pas.", "Réécrivez-la, par exemple 25/10/2026."],
              ],
            },
          },
          { encadre: { type: "attention", titre: "Important", texte: "Seules les réservations « Confirmée » ou « En cours » bloquent une chambre. Une demande « En attente » (venue du site de l'hôtel) ne la bloque pas : appuyez sur « Confirmer la demande » pour la valider." } },
          { encadre: { type: "info", titre: "Chambre déjà prise ?", texte: "Si une demande en attente porte sur une chambre déjà réservée, l'application écrit : « Chambre déjà réservée par un autre client sur ces dates : proposez une autre chambre ou d'autres dates, ou refusez cette demande. » Le bouton « Confirmer la demande » est alors bloqué." } },
        ],
      }),
      annote({
        surtitre: "Onglet Réserv.",
        titre: "La liste des réservations",
        chapo: "Cinq vues en haut : Aujourd'hui, À venir, En cours, Historique et Planning.",
        image: img("reservations"),
        marques: [
          visee("reservations", "vues", 1, "Les vues", "Touchez une vue pour trier : arrivées du jour, à venir, en cours, passées.", "g"),
          visee("reservations", "carte", 2, "Une réservation", "Client, statut, chambre, dates et prix par nuit. Touchez pour l'ouvrir.", "d"),
          visee("reservations", "badge", 3, "Les repères", "« Payé en ligne », « en attente de synchro » ou « site public » apparaissent ici.", "g"),
          visee("reservations", "nouvelle", 4, "Nouvelle réservation", "Le bouton « + » crée une réservation.", "d"),
        ],
        bas: bloc({ encadre: { type: "conseil", titre: "Retrouver une réservation", texte: "Choisissez la bonne vue (À venir, En cours, Historique). Pour toutes les réservations d'un client, ouvrez « Plus », « Clients », puis sa fiche." } }),
      }),
      pageEtapes({
        surtitre: "Pas à pas",
        titre: "Le planning",
        chapo: "Sept jours d'un coup d'œil : une ligne par chambre.",
        etapes: [
          {
            titre: "Ouvrez le planning",
            texte: "Vous le trouvez aussi dans « Plus », « Planning ».",
            action: "Appuyez sur « Planning »",
            image: img("reservations"),
            reperes: [cadre("reservations", "vues", 1)],
          },
          {
            titre: "Lisez les couleurs",
            texte: "Les 7 jours commencent aujourd'hui. Barre bleue : confirmée. Barre verte : en cours. Barre orange : en attente. Touchez une barre pour ouvrir la réservation.",
            action: "Appuyez sur une barre colorée",
            image: img("planning"),
            vue: [0.22, 0.9],
            reperes: [cadre("planning", "barre", 2)],
          },
          {
            titre: "Réservez une case vide",
            texte: "Touchez le « + » d'une case vide : le formulaire s'ouvre avec la chambre et la date d'arrivée déjà remplies.",
            action: "Appuyez sur « + » dans une case",
            image: img("nouvelle-sejour"),
            reperes: [cadre("nouvelle-sejour", "sejour", 3)],
          },
        ],
      }),
    ],
  },

  /* ================================================================ 4 */
  {
    titre: "L'arrivée du client",
    points: [
      "Voir les arrivées et les départs du jour",
      "Enregistrer l'arrivée (check-in)",
      "Vérifier l'heure réelle d'arrivée et l'état de la chambre",
      "Modifier un séjour, écrire au client, envoyer le lien de suivi",
    ],
    pages: [
      annote({
        surtitre: "Plus, puis Arrivées et départs",
        titre: "Arrivées et départs du jour",
        chapo: "C'est la vue « Aujourd'hui » de Réserv. : les clients à accueillir et ceux qui partent.",
        image: img("arrivees"),
        marques: [
          visee("arrivees", "titre", 1, "Le décompte", "Sous le titre : le nombre de séjours du jour.", "g"),
          visee("arrivees", "vues", 2, "Aujourd'hui", "La vue « Aujourd'hui » est la bonne vue. Les autres vues restent à un toucher.", "d"),
          visee("arrivees", "arrivee", 3, "Une arrivée", "Statut « Confirmée » : le client doit arriver aujourd'hui.", "g"),
          visee("arrivees", "depart", 4, "Un départ", "Statut « En cours » : le client est là, à facturer au départ.", "d"),
        ],
      }),
      pageEtapes({
        surtitre: "Pas à pas",
        titre: "Enregistrer l'arrivée (check-in)",
        chapo: "Le client est devant vous avec sa pièce d'identité.",
        etapes: [
          {
            titre: "Ouvrez la réservation",
            texte: "Dans la vue « Aujourd'hui », touchez la ligne du client. Vérifiez le nom, les dates et l'acompte.",
            action: "Appuyez sur la ligne du client",
            image: img("arrivees"),
            reperes: [cadre("arrivees", "arrivee", 1)],
          },
          {
            titre: "Appuyez sur « Check-in »",
            texte: "Seule une réservation « Confirmée » peut faire un check-in. Si elle est « En attente », appuyez d'abord sur « Confirmer la demande ».",
            action: "Appuyez sur « Check-in »",
            image: img("reservation-detail"),
            vue: [0.55, 1],
            reperes: [cadre("reservation-detail", "checkin", 2)],
          },
          {
            titre: "Vérifiez",
            texte: "Le statut passe à « En cours » et la ligne « Arrivé le … à … » donne l'heure réelle. La chambre devient « Occupée ».",
            image: img("checkin-fait"),
            reperes: [cadre("checkin-fait", "statut", 3)],
          },
        ],
      }),
      pageEtapes({
        surtitre: "Pendant le séjour",
        titre: "Modifier, écrire, partager",
        chapo: "Ce que vous pouvez faire sur la fiche d'une réservation.",
        etapes: [
          {
            titre: "Modifier le séjour",
            texte: "Pour prolonger, raccourcir ou changer l'acompte. Changez « Arrivée », « Départ », « Acompte » ou « Demandes spéciales », puis appuyez sur « Enregistrer ».",
            action: "Appuyez sur « Modifier dates / acompte »",
            image: img("modifier"),
          },
          {
            titre: "Écrire au client",
            texte: "Un message de confirmation est déjà écrit (dates, total, acompte). Vous pouvez le changer avant d'appuyer sur « Ouvrir WhatsApp ».",
            action: "Appuyez sur « Contacter le client par WhatsApp »",
            image: img("whatsapp"),
          },
          {
            titre: "Le lien de suivi",
            texte: "« Partager le lien de suivi » envoie au client sa page « Ma réservation », où il peut se pré-enregistrer. « Répondre au client » écrit un message visible sur cette page.",
            action: "Appuyez sur « Partager le lien de suivi »",
            image: img("reservation-detail"),
            vue: [0.38, 0.78],
            reperes: [cadre("reservation-detail", "suivi", 3)],
          },
        ],
      }),
    ],
  },

  /* ================================================================ 5 */
  {
    titre: "Le départ du client",
    points: [
      "Facturer le séjour et faire le check-out en une seule action",
      "Encaisser en espèces ou par mobile money, en dollars ou en francs",
      "Remettre un reçu et comprendre ses deux numéros : TEMP-… puis REC-…",
      "Annuler une réservation avec un motif",
      "Traiter une réservation payée en ligne",
    ],
    pages: [
      pageEtapes({
        surtitre: "Pas à pas",
        titre: "Facturer le départ",
        chapo: "Le jour du départ, la facture et le check-out se font ensemble.",
        etapes: [
          {
            titre: "Ouvrez le séjour",
            texte: "Dans Réserv., vue « En cours » (ou « Aujourd'hui »), touchez le client qui part. Un séjour doit avoir fait son check-in avant d'être facturé.",
            action: "Appuyez sur « Facturer et check-out »",
            image: img("checkin-fait"),
            vue: [0.55, 1],
            reperes: [cadre("checkin-fait", "facturer", 1)],
          },
          {
            titre: "Vérifiez la note",
            texte: "L'écran « Facturation » montre le prix de la chambre, l'acompte déjà versé (retiré du total) et le « Total à payer ».",
            image: img("facturer-detail"),
            reperes: [cadre("facturer-detail", "total", 2)],
          },
          {
            titre: "Choisissez le mode de paiement",
            texte: "Deux choix : « Espèces » ou « Mobile money ». Une facture de séjour ne se règle pas autrement.",
            action: "Appuyez sur « Espèces » ou « Mobile money »",
            image: img("facturer-mode"),
            reperes: [cadre("facturer-mode", "mode", 3)],
          },
        ],
      }),
      pageEtapes({
        surtitre: "Pas à pas",
        titre: "Le client paie dans l'autre monnaie",
        chapo: "Exemple : la note est de 135 $ et le client donne des francs. Le taux du jour est fixé par le patron (1 $ = 2 800 FC).",
        etapes: [
          {
            titre: "La devise remise",
            texte: "Dans « Détail du règlement (optionnel) », choisissez la devise que le client vous donne : USD ou CDF. L'application écrit « Dû : 378 000 FC (1 $ = 2 800 FC) ».",
            action: "Appuyez sur « CDF »",
            image: img("facturer-croise"),
            reperes: [cadre("facturer-croise", "devise", 1)],
          },
          {
            titre: "Le montant remis",
            texte: "Tapez ce que le client vous donne, par exemple 400000. Si c'est trop peu, l'application écrit « Montant insuffisant : il faut … ».",
            action: "Remplissez « Montant remis »",
            image: img("facturer-croise"),
            reperes: [cadre("facturer-croise", "montant", 2)],
          },
          {
            titre: "La monnaie à rendre",
            texte: "Choisissez la devise de la monnaie sous « Rendre la monnaie en ». L'application affiche « Monnaie à rendre : 22 000 FC ». Rendez exactement ce montant.",
            image: img("facturer-croise"),
            reperes: [cadre("facturer-croise", "monnaie", 3)],
          },
        ],
      }),
      pageEtapes({
        surtitre: "Pas à pas",
        titre: "Valider et remettre le reçu",
        chapo: "Une facture validée ne se défait pas : relisez avant de confirmer.",
        etapes: [
          {
            titre: "Validez",
            texte: "Appuyez sur « Facturer et check-out ». Une fenêtre résume : « Confirmer 135.00 $ en espèces ? » avec le nom du client et la chambre. Confirmez avec le même bouton.",
            action: "Appuyez sur « Facturer et check-out »",
            image: img("facturer-mode"),
            reperes: [cadre("facturer-mode", "valider", 1)],
          },
          {
            titre: "Lisez le numéro du reçu",
            texte: "L'écran « Facture créée » montre le total et le numéro du reçu. Ce numéro commence par TEMP- avec la pastille « Provisoire » : c'est normal, le numéro définitif (REC-…) arrive à la synchronisation. La chambre passe à « Nettoyage ».",
            image: img("facture-creee"),
            reperes: [cadre("facture-creee", "numero", 2)],
          },
          {
            titre: "Imprimez le reçu",
            texte: "L'imprimante Bluetooth doit être appairée (Plus, Imprimante). Après l'envoi, vérifiez que le ticket est bien sorti ; sinon, recommencez.",
            action: "Appuyez sur « Imprimer le reçu »",
            image: img("facture-creee"),
            reperes: [cadre("facture-creee", "imprimer", 3)],
          },
        ],
      }),
      texte({
        surtitre: "À savoir",
        titre: "Paiements et reçus : les règles",
        chapo: "Ce qu'il faut savoir avant d'encaisser.",
        blocs: [
          {
            tableau: {
              entetes: ["Situation", "Ce qui se passe"],
              lignes: [
                ["Paiement exact", "Laissez vide le « Détail du règlement » : la facture est enregistrée au montant dû."],
                ["Le client paie dans l'autre devise", "Remplissez le détail : l'application calcule la monnaie avec le taux du patron."],
                ["Pas de taux défini", "« Aucun taux de change défini par le patron » : demandez-lui de le fixer."],
                ["Chambre en dollars + consommation en francs", "« Facture en deux devises : le règlement croisé n'est pas possible — encaisser les montants USD et CDF séparément. »"],
                ["Facture déjà faite", "« Cette réservation a déjà une facture. » Un séjour n'a qu'une seule facture."],
              ],
            },
          },
          { encadre: { type: "attention", titre: "Deux numéros pour un même reçu", texte: "Au moment de payer, le reçu est « Provisoire » : son numéro commence par TEMP-. Il reste valable et on peut l'imprimer. Quelques instants plus tard (dès que le téléphone se synchronise), il reçoit son numéro définitif REC-AAAAMMJJ-0001, visible dans le Journal des reçus." } },
          { encadre: { type: "info", titre: "Réimprimer un reçu", texte: "Ouvrez le séjour terminé (vue « Historique ») puis « Réimprimer le reçu », ou passez par « Plus », « Journal des reçus ». La copie est marquée duplicata." } },
          { encadre: { type: "attention", titre: "Reçu faux ?", texte: "Vous ne pouvez pas annuler un reçu : prévenez le patron. Il l'annule dans le journal des reçus, avec un motif." } },
        ],
      }),
      pageEtapes({
        surtitre: "Pas à pas",
        titre: "Annuler une réservation",
        chapo: "Le client ne vient pas, ou change d'avis. Un motif est toujours obligatoire.",
        etapes: [
          {
            titre: "Ouvrez la réservation",
            texte: "Le bouton « Annuler la réservation » existe pour les réservations En attente, Confirmée ou En cours.",
            action: "Appuyez sur « Annuler la réservation »",
            image: img("reservation-detail"),
            vue: [0.55, 1],
            reperes: [cadre("reservation-detail", "annuler", 1)],
          },
          {
            titre: "Écrivez le motif",
            texte: "Appuyez sur « Client non présenté » pour ce motif courant, ou écrivez le vôtre. Sans motif : « Le motif d'annulation est obligatoire. »",
            action: "Remplissez « Motif d'annulation »",
            image: img("annuler"),
            reperes: [cadre("annuler", "motif", 2)],
          },
          {
            titre: "Confirmez",
            texte: "Le séjour passe à « Annulée » et le motif reste visible sur la fiche. Le patron est prévenu. Si le client était déjà arrivé, remettez la chambre dans le bon état (onglet Chambres).",
            action: "Appuyez sur « Confirmer l'annulation »",
            image: img("annuler"),
            reperes: [cadre("annuler", "confirmer", 3)],
          },
        ],
      }),
      pageEtapes({
        surtitre: "Cas particulier",
        titre: "Réservation payée en ligne",
        chapo: "Sur le site de l'hôtel, un client peut payer son acompte par mobile money ou par carte.",
        etapes: [
          {
            titre: "Repérez « Payé en ligne »",
            texte: "Dans la liste, une pastille verte « Payé en ligne » est sous la réservation. L'argent est déjà dans le compte ScanLinkPay de l'hôtel : ne l'encaissez pas une seconde fois.",
            image: img("paye-en-ligne-liste"),
            reperes: [cadre("paye-en-ligne-liste", "badge", 1)],
          },
          {
            titre: "Lisez le détail",
            texte: "Sur la fiche, le bloc « Acompte payé en ligne par le client » donne le montant, la date, le moyen de paiement et la référence.",
            image: img("paye-en-ligne-detail"),
            reperes: [cadre("paye-en-ligne-detail", "bloc", 2)],
          },
        ],
        apres: [
          { encadre: { type: "attention", titre: "Si vous annulez", texte: "L'acompte apparaît chez le patron, dans « Remboursements ». C'est lui qui décide de le rendre ou de le garder. La pastille devient « Payé en ligne · à rembourser ? », puis « remboursé » ou « conservé ». Vous ne rendez jamais cet argent vous-même." } },
        ],
      }),
    ],
  },

  /* ================================================================ 6 */
  {
    titre: "Les clients",
    points: [
      "Retrouver un client par son nom ou son téléphone",
      "Lire sa fiche et l'historique de ses séjours",
      "Compléter la pièce d'identité et les notes",
    ],
    pages: [
      pageEtapes({
        surtitre: "Plus, puis Clients",
        titre: "Le répertoire des clients",
        chapo: "Un client est créé tout seul à sa première réservation.",
        etapes: [
          {
            titre: "Cherchez un client",
            texte: "Ouvrez « Plus », puis « Clients ». Tapez un nom ou un numéro de téléphone dans « Rechercher par nom ou téléphone ».",
            action: "Remplissez « Rechercher »",
            image: img("clients"),
            reperes: [cadre("clients", "recherche", 1)],
          },
          {
            titre: "Ouvrez la fiche",
            texte: "La fiche montre le téléphone, l'e-mail, la pièce d'identité, les notes et « Séjours » : toutes ses réservations avec chambre, dates et statut.",
            action: "Appuyez sur le nom du client",
            image: img("client-fiche"),
            vue: [0, 0.6],
            reperes: [cadre("client-fiche", "sejours", 2)],
          },
          {
            titre: "Complétez la fiche",
            texte: "Changez le nom, le téléphone, l'e-mail, le type et le numéro de pièce, ou les « Notes (suivi interne) » (VIP, habitudes…). Puis « Enregistrer » : cela marche aussi sans internet.",
            action: "Appuyez sur « Compléter la fiche »",
            image: img("client-modifier"),
            reperes: [cadre("client-modifier", "enregistrer", 3)],
          },
        ],
      }),
    ],
  },

  /* ================================================================ 7 */
  {
    titre: "Le journal, les dépenses et les rapports",
    points: [
      "Faire la remise de poste avec le journal de la journée",
      "Saisir, corriger et annuler une dépense de la réception",
      "Retrouver et réimprimer un reçu",
      "Générer le rapport mensuel de la réception",
    ],
    pages: [
      annote({
        surtitre: "Plus, puis Journal de la journée",
        titre: "Le journal de la journée",
        chapo: "À regarder en fin de service, pour la remise de poste.",
        image: img("journal"),
        marques: [
          visee("journal", "encaissements", 1, "Encaissements du jour", "Vos factures de chambres du jour, avec le total en dollars et en francs.", "g"),
          visee("journal", "arrivees", 2, "Arrivées", "Combien sont faites, combien restent. « Reste à accueillir » nomme les clients.", "d"),
          visee("journal", "departs", 3, "Départs", "« Reste à facturer » : les clients à encaisser avant de fermer.", "g"),
          visee("journal", "parc", 4, "Parc de chambres", "Pourcentage occupé et nombre de chambres libres, occupées, réservées, en nettoyage.", "d"),
        ],
      }),
      pageEtapes({
        surtitre: "Onglet Dépenses",
        titre: "Saisir une dépense",
        chapo: "Charbon, produits d'entretien, transport : notez chaque dépense de la réception le jour même.",
        etapes: [
          {
            titre: "Ouvrez Dépenses",
            texte: "Choisissez la période : « Aujourd'hui », « Ce mois » ou « Mois dernier ». Le « Total » en haut compte les dépenses de la période. Le bouton « PDF » demande une connexion.",
            action: "Appuyez sur l'onglet « Dépenses »",
            image: img("depenses"),
            reperes: [cadre("depenses", "pdf", 1)],
          },
          {
            titre: "Ajoutez la dépense",
            texte: "Écrivez la date (pas dans le futur), le motif (3 caractères au moins), le montant et la devise USD ou CDF. Puis « Enregistrer ».",
            action: "Appuyez sur « + » (Nouvelle dépense)",
            image: img("depense-nouvelle"),
            reperes: [cadre("depense-nouvelle", "motif", 2)],
          },
          {
            titre: "Corrigez ou annulez",
            texte: "Touchez une ligne pour la corriger. « Annuler cette dépense » la barre : elle reste visible, ne compte plus dans les totaux, et c'est définitif.",
            action: "Appuyez sur la ligne de la dépense",
            image: img("depense-corriger"),
            reperes: [cadre("depense-corriger", "annuler", 3)],
          },
        ],
      }),
      pageEtapes({
        surtitre: "Plus, puis Reçus",
        titre: "Reçus et rapport du mois",
        chapo: "Retrouvez un paiement, puis remettez le rapport au patron.",
        etapes: [
          {
            titre: "Le journal des reçus",
            texte: "« Plus », « Journal des reçus » : tous les séjours encaissés, avec numéro, date et montant. « Réglé » ou « Annulé » est écrit sur chaque reçu.",
            action: "Appuyez sur « Journal des reçus »",
            image: img("recus"),
            reperes: [cadre("recus", "carte", 1)],
          },
          {
            titre: "Le détail d'un reçu",
            texte: "Touchez un reçu : mode de paiement, montant remis, taux appliqué, monnaie rendue. « Réimprimer le reçu » sort une copie.",
            action: "Appuyez sur « Réimprimer le reçu »",
            image: img("recu-detail"),
            reperes: [cadre("recu-detail", "reimprimer", 2)],
          },
          {
            titre: "Le rapport mensuel",
            texte: "« Plus », « Rapports mensuels ». Choisissez le mois (le mois écoulé est proposé), puis « Générer le rapport ». Ouvrez le PDF et vérifiez « Concordant ». Une connexion est nécessaire.",
            action: "Appuyez sur « Générer le rapport »",
            image: img("rapports"),
            reperes: [cadre("rapports", "generer", 3)],
          },
        ],
      }),
    ],
  },

  /* ================================================================ 8 */
  {
    titre: "Travailler sans internet",
    points: [
      "Reconnaître que vous êtes hors ligne",
      "Savoir ce qui marche sans internet",
      "Comprendre le reçu provisoire (TEMP-…) et son numéro définitif",
      "Que faire quand le réseau revient, et en cas de conflit",
      "Les erreurs fréquentes et quoi faire",
    ],
    pages: [
      texte({
        surtitre: "Le principe",
        titre: "Sans internet, vous continuez",
        chapo: "Ce que vous faites est gardé sur le téléphone, puis envoyé tout seul quand le réseau revient.",
        blocs: [
          {
            tableau: {
              entetes: ["Possible sans internet", "Demande internet"],
              lignes: [
                ["Voir les chambres et changer leur état", "Ouvrir ou générer un rapport mensuel (PDF)"],
                ["Créer, modifier, annuler une réservation", "Télécharger le PDF des dépenses"],
                ["Faire un check-in, même immédiat", "Envoyer le lien de suivi (il apparaît après la synchronisation)"],
                ["Facturer et faire le check-out", "Voir « Payé en ligne » à jour"],
                ["Compléter la fiche d'un client", "Se connecter pour la première fois"],
                ["Saisir et corriger une dépense", ""],
              ],
            },
          },
          {
            parcours: [
              { titre: "Regardez le bandeau", texte: "Il apparaît sous le haut de l'écran : « Hors ligne · 2 actions à envoyer ». Le point de la cloche devient gris." },
              { titre: "Travaillez normalement", texte: "Chaque action est gardée sur le téléphone. Les reçus portent un numéro provisoire (TEMP-…)." },
              { titre: "Attendez le retour du réseau", texte: "L'envoi est automatique. Quand le bandeau disparaît et que le point redevient vert, tout est à jour." },
            ],
          },
        ],
      }),
      pageEtapes({
        surtitre: "Pas à pas",
        titre: "Une journée sans réseau",
        chapo: "Exemple : le réseau tombe pendant un départ.",
        etapes: [
          {
            titre: "Repérez le bandeau",
            texte: "« Hors ligne » en gris. Si des actions attendent, le nombre est écrit : « 2 actions à envoyer ».",
            image: img("hl-bandeau"),
            reperes: [cadre("hl-bandeau", "bandeau", 1)],
          },
          {
            titre: "Encaissez comme d'habitude",
            texte: "La facture marche. Le reçu a un numéro TEMP-… et la pastille « Provisoire ». Donnez-le au client : il reste valable. Sans réseau, il garde ce numéro jusqu'à la synchronisation.",
            image: img("recu-provisoire"),
            reperes: [cadre("recu-provisoire", "numero", 2)],
          },
          {
            titre: "Au retour du réseau",
            texte: "Le bandeau « actions à envoyer » reste un instant, puis le point de la cloche redevient vert. Le reçu reçoit son vrai numéro REC-….",
            image: img("hl-retour"),
            reperes: [cadre("hl-retour", "bandeau", 3)],
          },
        ],
      }),
      pageEtapes({
        surtitre: "Plus, puis Synchronisation",
        titre: "Synchronisation et conflits",
        chapo: "Un conflit arrive quand deux personnes changent la même chose, ou qu'une chambre est prise entre-temps.",
        etapes: [
          {
            titre: "Ouvrez Synchronisation",
            texte: "Dans « Plus », rubrique « Appareil ». Vous voyez « En ligne » ou « Hors ligne », « En attente d'envoi » et la « Dernière synchro ». « Synchroniser maintenant » force l'envoi.",
            action: "Appuyez sur « Synchroniser maintenant »",
            image: img("synchro"),
            reperes: [cadre("synchro", "synchroniser", 1)],
          },
          {
            titre: "Conflits à vérifier",
            texte: "L'écran montre « Vous avez essayé » et « État actuel du serveur ». Le serveur a raison : appuyez sur « Garder la version du serveur ».",
            action: "Appuyez sur « Garder la version du serveur »",
            image: img("synchro-conflit"),
            reperes: [cadre("synchro-conflit", "garder", 2)],
          },
          {
            titre: "Actions échouées",
            texte: "Une action refusée (par exemple une chambre prise entre-temps) est listée avec l'erreur du serveur. Appuyez sur « Retirer cette action », puis refaites-la avec une autre chambre.",
            action: "Appuyez sur « Retirer cette action »",
            image: img("synchro-conflit"),
            reperes: [cadre("synchro-conflit", "retirer", 3)],
          },
        ],
      }),
      texte({
        surtitre: "Aide",
        titre: "Les erreurs fréquentes",
        chapo: "Les messages que l'application affiche vraiment, et quoi faire.",
        blocs: [
          {
            tableau: {
              entetes: ["Message", "Que faire"],
              lignes: [
                ["« Numéro (ou e-mail) ou mot de passe incorrect. »", "Relisez votre saisie ; sinon « Mot de passe oublié ? »."],
                ["« Numéro invalide : 9 chiffres commençant par 8 ou 9 (ex. 970 000 000). »", "Tapez 9 chiffres, sans le 0 ni le +243."],
                ["« Ce compte a été désactivé. Contactez le patron. »", "Appelez le patron."],
                ["« Trop de tentatives. Patientez quelques minutes avant de réessayer. »", "Attendez, puis recommencez."],
                ["« Pas de connexion au serveur. Vérifiez le réseau puis réessayez. »", "Contrôlez le réseau. Vous pouvez travailler hors ligne."],
                ["« Votre session a expiré : reconnectez-vous. »", "Reconnectez-vous avec votre numéro."],
                ["« Cette chambre est déjà réservée sur une partie de cette période… »", "Choisissez d'autres dates ou une autre chambre."],
                ["« Cette chambre est en cours de réservation par un autre client. Réessayez dans quelques minutes. »", "Un client est en train de payer en ligne : attendez ou changez de chambre."],
                ["« Impossible de facturer une réservation … : le client doit être arrivé (check-in) »", "Faites d'abord le check-in."],
                ["« Cette réservation a déjà une facture. »", "Ne refaites pas la facture ; prévenez le patron si elle est fausse."],
                ["« Montant insuffisant : il faut … »", "Le client n'a pas assez donné : redemandez la somme."],
                ["« L'imprimante ne répond pas : vérifiez qu'elle est allumée, proche du téléphone et appairée en Bluetooth. »", "Allumez-la, rapprochez-la, puis réessayez."],
                ["« Le serveur a rencontré un problème. Réessayez dans un instant… »", "Patientez ; si cela continue, prévenez le patron."],
              ],
            },
          },
        ],
      }),
    ],
  },
];

if (manquants.size && process.env.GUIDE_REPERES_STRICT) console.warn(`[reception] repères manquants : ${[...manquants].join(", ")}`);
else if (manquants.size) console.warn(`[reception] ${manquants.size} repère(s) manquant(s) (provisoires) : ${[...manquants].slice(0, 12).join(", ")}…`);

export default {
  id: "reception",
  titre: "Partie B · La réception",
  libelle: "Guide du réceptionniste",
  guide: "Guide du réceptionniste",
  icone: "lit",
  chapitres,
};
