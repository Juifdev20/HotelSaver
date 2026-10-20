import { annote, etapes, texte } from "../modele.mjs";

const C = "captures/brut/";

export default {
  id: "patron",
  titre: "Partie A · Le patron",
  libelle: "Guide du patron",
  guide: "Guide du patron",
  icone: "cle",
  chapitres: [
    {
      titre: "Découvrir l'écran d'accueil",
      points: ["Les chiffres du jour", "Le menu et la barre du bas", "L'indicateur de connexion"],
      pages: [
        annote({
          surtitre: "Tableau de bord",
          titre: "Votre écran d'accueil",
          chapo: "Dès la connexion, vous voyez en un coup d'œil ce que l'hôtel a encaissé aujourd'hui.",
          image: C + "patron-01-accueil.png",
          marques: [
            { n: 1, titre: "Menu", texte: "Ouvre toutes les rubriques de l'application.", x: 0.07, y: 0.045, cote: "g" },
            { n: 2, titre: "Connexion", texte: "« À jour » : tout est enregistré sur le serveur.", x: 0.6, y: 0.045, cote: "d" },
            { n: 3, titre: "Encaissements", texte: "Argent encaissé aujourd'hui, en dollars et en francs.", x: 0.3, y: 0.33, cote: "g" },
            { n: 4, titre: "Taux d'occupation", texte: "Part des chambres occupées en ce moment.", x: 0.5, y: 0.56, cote: "d" },
          ],
        }),
        etapes({
          surtitre: "Pas à pas",
          titre: "Voir et trier les chambres",
          chapo: "La rubrique Chambres montre l'état de chaque chambre.",
          etapes: [
            { titre: "Ouvrez Chambres", texte: "Touchez l'icône Chambres dans la barre du bas.", action: "Appuyez sur « Chambres »", image: C + "patron-02-chambres.png" },
            { titre: "Filtrez par état", texte: "Libres, occupées, réservées ou en nettoyage : touchez un filtre pour ne voir que ces chambres.", action: "Appuyez sur « Libres »", image: C + "patron-02-chambres.png", vue: [0.16, 0.5], reperes: [{ x: 0.04, y: 0.27, l: 0.92, h: 0.1, n: 1 }] },
            { titre: "Consultez une réservation", texte: "Dans Réserv., chaque ligne est une réservation : touchez-la pour la détailler.", action: "Appuyez sur une ligne", image: C + "patron-03-reservations.png" },
          ],
        }),
        texte({
          surtitre: "À savoir",
          titre: "Ce que le patron peut faire",
          chapo: "Le patron suit tout, mais ne saisit pas les ventes : ce sont la réception et la cafétaria qui opèrent.",
          blocs: [
            {
              cartes: [
                { icone: "lit", titre: "Réception", texte: "Chambres, réservations, arrivées, départs.", points: ["Consulter", "Rembourser un acompte"] },
                { icone: "cafe", titre: "Cafétaria", texte: "Menu, stock, inventaire.", points: ["Consulter", "Ajuster le stock"] },
                { icone: "graphique", titre: "Rapports", texte: "Chiffres du jour et du mois.", points: ["Rapport mensuel", "Dépenses"] },
              ],
            },
            { encadre: { type: "conseil", titre: "Astuce", texte: "Touchez « À jour » en haut de l'écran pour savoir si tout est bien synchronisé." } },
            { encadre: { type: "attention", titre: "Important", texte: "Gardez votre mot de passe secret : ne le donnez à personne, même à un employé." } },
            {
              tableau: {
                entetes: ["Rubrique", "Patron", "Réception", "Cafétaria"],
                lignes: [
                  ["Chambres", true, true, false],
                  ["Caisse", false, false, true],
                  ["Rapports", true, true, true],
                  ["Utilisateurs", true, false, false],
                ],
              },
            },
          ],
        }),
      ],
    },
  ],
};
