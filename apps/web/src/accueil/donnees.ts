/** Tout le contenu éditorial de la page d'accueil est ici : modifier un texte
 * ou un prix = éditer ce fichier, aucun composant à toucher. */

// Les formules et les prix ne sont PAS ici : ils viennent de FORMULES (@hotel-chicago/regles), la même liste que celle des applications et
// du serveur. Une seule source de prix.

/** Comment fonctionne l'abonnement, en trois étapes (section Tarifs). */
export const ETAPES_ABONNEMENT = [
  { titre: "Créez votre hôtel et essayez 14 jours", texte: "L'essai est gratuit, sur toutes les formules, sans carte bancaire." },
  { titre: "Choisissez une formule", texte: "Dans l'application : Paramètres → Abonnement. Vous choisissez la formule et la durée." },
  { titre: "Payez avec votre téléphone", texte: "Mobile Money, directement dans l'application. L'accès continue sans interruption." },
];

export const CHIFFRES = [
  { valeur: 14, libelle: "jours d'essai gratuit" },
  { valeur: 3, libelle: "rôles : patron, réception, cafétaria" },
  { valeur: 2, libelle: "devises gérées : USD et CDF" },
  { valeur: 0, libelle: "prélèvement automatique" },
];

export type NomIcone = "lit" | "tasse" | "wifi" | "monnaie" | "cle" | "globe";

export const FONCTIONNALITES: { icone: NomIcone; titre: string; texte: string }[] = [
  {
    icone: "lit",
    titre: "Réception complète",
    texte: "Réservations, check-in, check-out, clients et facturation de séjour, jusqu'au reçu imprimé.",
  },
  {
    icone: "tasse",
    titre: "Cafétaria intégrée",
    texte: "Menu, stock, comptes ouverts et ventes. Les consommations se rattachent au séjour du client.",
  },
  {
    icone: "wifi",
    titre: "Fonctionne sans internet",
    texte: "Consultez et enregistrez hors ligne sur mobile. Tout se synchronise dès que le réseau revient.",
  },
  {
    icone: "monnaie",
    titre: "Double devise USD / CDF",
    texte: "Paiements croisés, taux de change défini par le patron, monnaie à rendre calculée pour vous.",
  },
  {
    icone: "cle",
    titre: "Un compte par rôle",
    texte: "Patron, réception, cafétaria : chacun voit seulement ce qui le concerne. Le patron garde les accès.",
  },
  {
    icone: "globe",
    titre: "Votre site de réservation",
    texte: "Une page publique à l'adresse de votre hôtel, à vos couleurs, où les clients demandent une chambre.",
  },
];

export type NomVisuel = "reception" | "cafeteria" | "horsligne";

export const BLOCS_DETAIL: { etiquette: string; titre: string; texte: string; points: string[]; visuel: NomVisuel }[] = [
  {
    etiquette: "Réception",
    titre: "Du premier appel au reçu, sans papier",
    texte:
      "Confirmez les demandes venues du site, enregistrez l'arrivée, suivez les chambres occupées et facturez le séjour avec la cafétaria en un seul paiement.",
    points: ["Arrivées et départs du jour", "Acompte et solde", "Reçus réimprimables"],
    visuel: "reception",
  },
  {
    etiquette: "Cafétaria",
    titre: "Chaque consommation au bon compte",
    texte: "Ouvrez un compte par table ou par chambre, encaissez en USD ou en CDF et gardez un stock toujours à jour.",
    points: ["Comptes et sous-comptes", "Mouvements de stock", "Journal des ventes"],
    visuel: "cafeteria",
  },
  {
    etiquette: "Hors ligne",
    titre: "La coupure réseau n'arrête plus l'hôtel",
    texte:
      "L'application mobile garde une copie locale de vos réservations et de vos clients, puis envoie vos modifications automatiquement.",
    points: ["Consultation sans réseau", "Création de réservation hors ligne", "Synchronisation automatique"],
    visuel: "horsligne",
  },
];

export const ETAPES = [
  { titre: "Créez votre hôtel", texte: "Nom, adresse et logo : vos couleurs sont générées automatiquement." },
  { titre: "Configurez vos chambres", texte: "Types, prix par nuit, menu de la cafétaria et taux de change." },
  { titre: "Ouvrez à votre équipe", texte: "Chaque employé se connecte sur mobile ou ordinateur avec son rôle." },
];

export const FAQ = [
  {
    question: "L'essai est-il vraiment gratuit ?",
    reponse:
      "Oui, 14 jours sans carte bancaire. Ensuite, vous payez votre abonnement par Mobile Money (M-Pesa, Airtel Money, Orange Money ou Africell), directement dans l'application. Il n'y a aucun prélèvement automatique.",
  },
  {
    question: "Et si ma connexion internet est instable ?",
    reponse:
      "L'application mobile garde une copie locale de vos réservations, clients et chambres. Vous consultez et créez des réservations hors ligne ; tout se synchronise au retour du réseau. Les encaissements et check-out, eux, demandent une connexion.",
  },
  {
    question: "Puis-je facturer en dollars et en francs congolais ?",
    reponse:
      "Oui. Le patron définit le taux de change, et l'application calcule la monnaie à rendre quand le client paie dans une autre devise que la facture.",
  },
  {
    question: "Mes employés ont-ils tous accès à tout ?",
    reponse:
      "Non. Il existe un compte par rôle (patron, réception, cafétaria) et chacun ne voit que son module. Quand un employé part, le patron change les identifiants du compte.",
  },
  {
    question: "Puis-je imprimer des reçus ?",
    reponse:
      "Oui, sur imprimante thermique Bluetooth depuis le mobile, et depuis l'ordinateur. Chaque reçu reste consultable et réimprimable dans le journal.",
  },
  {
    question: "Mes données sont-elles séparées de celles des autres hôtels ?",
    reponse:
      "Oui. Chaque hôtel a son espace isolé : ses clients, ses chambres et ses ventes ne sont jamais visibles par un autre établissement.",
  },
  {
    question: "Que se passe-t-il à la fin de l'essai ?",
    reponse:
      "Après l'échéance, vous avez 3 jours de grâce pour payer : l'application continue de fonctionner et affiche une alerte. Ensuite, l'accès est bloqué, mais vos données sont conservées. Dès que vous payez, l'accès rouvre immédiatement.",
  },
  {
    question: "Mes données sont-elles conservées si je ne paie pas ?",
    reponse:
      "Oui. Si l'accès est bloqué faute de paiement, vos réservations, clients et ventes restent en sécurité. Ils sont de nouveau disponibles dès que l'abonnement est payé.",
  },
  {
    question: "Puis-je changer de formule ?",
    reponse:
      "Oui, à tout moment : vous choisissez une autre formule à votre prochain paiement. Payer d'avance ne fait perdre aucun jour. Les plafonds sont de 15 chambres pour Essentiel, 40 pour Pro, et sans limite pour Premium.",
  },
];
