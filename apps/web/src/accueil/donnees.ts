/** Tout le contenu éditorial de la page d'accueil est ici : modifier un texte
 * ou un prix = éditer ce fichier, aucun composant à toucher. */

export interface Formule {
  nom: string;
  /** Prix mensuel en USD. */
  prix: number;
  description: string;
  recommandee?: boolean;
  inclus: string[];
}

// À VALIDER PAR LE PATRON : prix et périmètres de formules indicatifs, aucun
// tarif n'est défini ailleurs dans le projet.
export const FORMULES: Formule[] = [
  {
    nom: "Essentiel",
    prix: 29,
    description: "Pour un petit hôtel qui démarre.",
    inclus: [
      "Jusqu'à 15 chambres",
      "Réception et réservations",
      "Facturation et reçus imprimés",
      "Double devise USD / CDF",
      "Application mobile et ordinateur",
    ],
  },
  {
    nom: "Pro",
    prix: 59,
    description: "Pour un hôtel avec cafétaria et réservations en ligne.",
    recommandee: true,
    inclus: [
      "Jusqu'à 40 chambres",
      "Tout Essentiel",
      "Cafétaria, stock et comptes ouverts",
      "Site public de réservation à vos couleurs",
      "Fonctionnement hors ligne et synchronisation",
    ],
  },
  {
    nom: "Premium",
    prix: 99,
    description: "Pour les établissements qui veulent leur propre identité.",
    inclus: [
      "Chambres illimitées",
      "Tout Pro",
      "Domaine personnalisé (votre-hotel.com)",
      "Accompagnement à la mise en route",
      "Support prioritaire",
    ],
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
      "Oui, 14 jours sans carte bancaire. À la fin, l'abonnement se règle par virement, Mobile Money ou en espèces. Il n'y a aucun prélèvement automatique.",
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
];
