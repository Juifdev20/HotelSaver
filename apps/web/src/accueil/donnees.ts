/** Tout le contenu éditorial de la page d'accueil est ici : modifier un texte
 * ou un prix = éditer ce fichier, aucun composant à toucher. */

// Les formules et les prix ne sont PAS ici : ils viennent de FORMULES (@hotel-chicago/regles), la même liste que celle des applications et
// du serveur. Une seule source de prix.

/** Comment fonctionne l'abonnement, en trois étapes (section Tarifs). La durée de l'essai est celle réglée par HotelSaver (voir useFormules). */
export const etapesAbonnement = (joursEssai: number) => [
  { titre: `Créez votre hôtel et essayez ${joursEssai} jours`, texte: "L'essai est gratuit, sur toutes les formules, sans carte bancaire." },
  { titre: "Choisissez une formule", texte: "Dans l'application : Paramètres → Abonnement. Vous choisissez la formule et la durée." },
  {
    titre: "Payez avec votre téléphone ou votre carte",
    texte: "Mobile Money ou carte bancaire (Visa, Mastercard), avec ScanLinkPay. Aucun prélèvement automatique, l'accès continue sans interruption.",
  },
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
      "Oui, l'essai est gratuit et sans carte bancaire. Ensuite, vous payez votre abonnement par Mobile Money (M-Pesa, Airtel Money, Orange Money ou Africell) ou par carte bancaire (Visa, Mastercard), directement dans l'application, avec ScanLinkPay. Il n'y a aucun prélèvement automatique.",
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
    question: "Mes clients peuvent-ils payer leur acompte en ligne ?",
    reponse:
      "Oui, avec les formules qui incluent cette fonction. Le patron fixe un pourcentage du séjour ; le client le paie par Mobile Money ou par carte bancaire depuis la page de sa réservation. L'argent va directement sur le compte ScanLinkPay de l'hôtel, et en cas d'annulation l'acompte peut être remboursé.",
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

/** Le fondateur, affiché dans la section « Le créateur » de l'accueil. La photo est le fichier `apps/web/public/fondateur.jpg`
 * (remplacer le fichier suffit, rien d'autre à toucher). Les textes sont à relire et à corriger ici. */
export const FONDATEUR = {
  nom: "Ir. Dieudonné Merci Jean",
  /** Prénom d'usage (message WhatsApp : « Bonjour Dieudonné, … »). */
  prenom: "Dieudonné",
  titre: "Fondateur, CEO et développeur",
  photo: "/fondateur.jpg",
  paragraphes: [
    "Je suis le fondateur et le développeur de HotelSaver. J'ai créé cette application pour que chaque hôtel puisse gérer sa réception et sa cafétaria simplement, même sans internet, avec des prix en dollars et en francs congolais.",
    "Je la fais évoluer avec les retours des patrons et du personnel des hôtels. Une question, une idée, un problème : écrivez-moi directement.",
  ],
};
