/**
 * Contrat de licence et de maintenance (11/11/2026) : le texte que l'hôtel accepte quand le super-admin active sa licence.
 *
 * Le texte est FABRIQUÉ ICI, une seule fois, au moment de l'activation, puis RECOPIÉ tel quel dans la base (LicenceHotel.contratTexte) avec son
 * empreinte SHA-256 : si ce fichier change plus tard (nouvelle version du modèle), les contrats déjà signés gardent leurs mots exacts.
 * Fonction pure, sans date « maintenant » ni accès à la base : mêmes entrées → même texte, octet pour octet.
 *
 * ⚠️ Modèle à FAIRE RELIRE par un avocat congolais avant usage commercial (tribunal compétent, résiliation, protection des données).
 */
import { dateAbonnement, montantAbonnement } from "./abonnement-texte";

/** À augmenter à chaque changement de mots du modèle : elle est écrite sur le contrat et dans le dossier de preuve. */
export const CONTRAT_LICENCE_VERSION = 1;

export interface EditeurContrat {
  /** Raison sociale de l'éditeur (ex. « HotelSaver SARL »). */
  nom: string;
  adresse?: string | null;
  rccm?: string | null;
  nif?: string | null;
  representant?: string | null;
  fonction?: string | null;
  telephone?: string | null;
  email?: string | null;
}

export interface ClientContrat {
  /** Nom de l'hôtel. */
  nom: string;
  /** Adresse de l'hôtel : la licence ne vaut QUE pour cette adresse. */
  adresse?: string | null;
  /** Nom du patron qui représente l'hôtel. */
  representant?: string | null;
  telephone?: string | null;
  email?: string | null;
}

export interface ConditionsContratLicence {
  /** Numéro unique du contrat, ex. « LIC-2026-0001 ». */
  numero: string;
  annees: number;
  debutLe: string | Date;
  finLe: string | Date;
  /** Prix de la licence reçu en main propre ; null = non précisé. */
  montant: number | null;
  devise: "USD" | "CDF" | null;
  /** Frais de maintenance d'une période, en dollars. */
  fraisMaintenanceUsd: number;
  /** Longueur d'une période de maintenance, en jours (30). */
  joursMaintenance: number;
  /** Jours de délai après l'échéance de la maintenance avant la suspension de l'accès. */
  joursGraceMaintenance: number;
  /** Jours de rappel avant l'échéance de la maintenance. */
  joursPreavisMaintenance: number;
  /** Jours de délai après la fin de la licence avant le retour à l'abonnement mensuel. */
  joursGraceAbonnement: number;
  /** Date d'établissement du contrat (jour de l'activation). */
  etabliLe: string | Date;
}

export interface ArticleContrat {
  numero: number;
  titre: string;
  paragraphes: string[];
}

export interface ContratLicence {
  version: number;
  titre: string;
  numero: string;
  /** Qui est partie au contrat (éditeur et client), prêt à imprimer. */
  parties: { role: string; lignes: string[] }[];
  articles: ArticleContrat[];
  /** Le contrat entier en texte brut : c'est CE texte qu'on enregistre et dont on calcule l'empreinte. */
  texte: string;
}

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;
const montantOuVide = (m: number | null, d: "USD" | "CDF" | null) => (m === null || d === null ? null : montantAbonnement(m, d));

function ligneEditeur(e: EditeurContrat): string[] {
  const lignes = [e.nom];
  if (e.adresse) lignes.push(`Adresse : ${e.adresse}`);
  const identifiants = [e.rccm ? `RCCM ${e.rccm}` : "", e.nif ? `NIF ${e.nif}` : ""].filter(Boolean).join(" · ");
  if (identifiants) lignes.push(identifiants);
  if (e.representant) lignes.push(`Représentée par ${e.representant}${e.fonction ? `, ${e.fonction}` : ""}`);
  const contact = [e.telephone, e.email].filter(Boolean).join(" · ");
  if (contact) lignes.push(`Contact : ${contact}`);
  return lignes;
}

function ligneClient(c: ClientContrat): string[] {
  const lignes = [c.nom];
  if (c.adresse) lignes.push(`Adresse : ${c.adresse}`);
  if (c.representant) lignes.push(`Représenté par ${c.representant}, patron`);
  const contact = [c.telephone, c.email].filter(Boolean).join(" · ");
  if (contact) lignes.push(`Contact : ${contact}`);
  return lignes;
}

/** Fabrique le contrat. Aucune donnée n'est inventée : un champ inconnu est simplement omis. */
export function genererContratLicence(editeur: EditeurContrat, client: ClientContrat, c: ConditionsContratLicence): ContratLicence {
  const duree = pluriel(c.annees, "an");
  const debut = dateAbonnement(c.debutLe);
  const fin = dateAbonnement(c.finLe);
  const prix = montantOuVide(c.montant, c.devise);
  const frais = montantAbonnement(c.fraisMaintenanceUsd, "USD");
  const adresseHotel = client.adresse ? `situé à ${client.adresse}` : "à l'adresse déclarée lors de son inscription";
  const editeurNom = editeur.nom || "HotelSaver";

  const articles: Omit<ArticleContrat, "numero">[] = [
    {
      titre: "Objet",
      paragraphes: [
        `${editeurNom} (« l'Éditeur ») concède à ${client.nom} (« le Client ») une licence d'utilisation du logiciel de gestion hôtelière HotelSaver (application de bureau, application mobile et site de l'hôtel), pour une durée de ${duree}, aux conditions ci-dessous.`,
        "Le Client reconnaît avoir reçu les informations nécessaires pour choisir cette licence en connaissance de cause.",
      ],
    },
    {
      titre: "Durée de la licence",
      paragraphes: [
        `La licence prend effet le ${debut} et se termine le ${fin}, soit ${duree}.`,
        "Acheter une nouvelle licence avant la fin de celle-ci ne fait perdre aucun jour au Client : la nouvelle licence commence à la fin de la précédente.",
      ],
    },
    {
      titre: "Étendue de la licence",
      paragraphes: [
        `La licence est accordée pour UN SEUL hôtel, ${adresseHotel}. Elle ne peut être ni cédée, ni prêtée, ni utilisée pour un autre établissement ou une autre adresse ; chaque établissement a sa propre licence.`,
        "Pendant toute sa durée, la licence donne accès à toutes les fonctions du logiciel, sans limite du nombre de chambres.",
        `Toutes les mises à jour du logiciel publiées pendant la durée de la licence sont comprises, sans supplément.`,
      ],
    },
    {
      titre: "Prix de la licence",
      paragraphes: [
        prix
          ? `Le prix de la licence est de ${prix}, payé par le Client à l'Éditeur à la signature, et constaté par un reçu numéroté ${c.numero}.`
          : `Le prix de la licence a été payé par le Client à l'Éditeur à la signature, et est constaté par un reçu numéroté ${c.numero}.`,
        "Le prix de la licence n'est pas remboursable, sauf erreur de l'Éditeur.",
      ],
    },
    {
      titre: "Frais de maintenance",
      paragraphes: [
        `Le Client paie des frais de maintenance de ${frais} par période de ${pluriel(c.joursMaintenance, "jour")}. La première période est comprise dans la signature : elle court à partir du ${debut}.`,
        "Ces frais couvrent l'hébergement des données, la sécurité, l'assistance et la correction des anomalies. Ils sont payés dans l'application (Mobile Money, via ScanLinkPay) ou directement à l'Éditeur, qui en remet un reçu numéroté.",
        `Un rappel est affiché dans l'application ${pluriel(c.joursPreavisMaintenance, "jour")} avant chaque échéance.`,
        `Si les frais ne sont pas payés à l'échéance, le Client dispose d'un délai de ${pluriel(c.joursGraceMaintenance, "jour")}. Passé ce délai, l'accès à l'application est suspendu jusqu'au paiement. Les données de l'hôtel ne sont pas supprimées pour autant, et l'accès est rétabli dès le paiement.`,
        "Le montant des frais peut être modifié par l'Éditeur pour les périodes futures, avec un préavis écrit d'au moins 30 jours ; il ne change jamais une période déjà payée.",
      ],
    },
    {
      titre: "Obligations de l'Éditeur",
      paragraphes: [
        "L'Éditeur met à disposition le logiciel et ses mises à jour, assure l'hébergement sécurisé des données du Client et fournit une assistance par téléphone ou WhatsApp.",
        "L'Éditeur s'efforce d'assurer la disponibilité du service, sans pouvoir garantir l'absence d'interruption (coupure d'internet, maintenance, panne d'un fournisseur).",
      ],
    },
    {
      titre: "Obligations du Client",
      paragraphes: [
        "Le Client utilise le logiciel conformément à son usage, garde confidentiels les identifiants de ses employés, et reste responsable des opérations faites avec ces identifiants.",
        "Le Client est responsable de l'exactitude des informations qu'il saisit (tarifs, clients, caisse, stock).",
      ],
    },
    {
      titre: "Données du Client",
      paragraphes: [
        "Les données de l'hôtel (chambres, réservations, factures, caisse, stock, clients) restent la propriété du Client. L'Éditeur ne les utilise que pour fournir le service et ne les vend pas.",
        "Les opérations financières sont conservées dans des journaux qu'on ne peut ni modifier ni supprimer : une erreur se corrige par une annulation motivée, jamais par un effacement.",
      ],
    },
    {
      titre: "Fin de la licence",
      paragraphes: [
        `À la fin de la licence, l'hôtel peut continuer à utiliser le logiciel en souscrivant l'abonnement mensuel en vigueur, avec un délai de ${pluriel(c.joursGraceAbonnement, "jour")} après la fin de la licence. Il peut aussi acheter une nouvelle licence.`,
        "Chaque partie peut mettre fin au contrat en cas de manquement grave de l'autre partie, après une mise en demeure restée sans effet pendant 15 jours.",
      ],
    },
    {
      titre: "Responsabilité",
      paragraphes: [
        "La responsabilité de l'Éditeur est limitée au prix de la licence effectivement payé. L'Éditeur ne répond pas des pertes indirectes (manque à gagner, perte de clientèle) ni des pertes causées par une mauvaise utilisation ou une coupure d'internet.",
      ],
    },
    {
      titre: "Preuve et acceptation électronique",
      paragraphes: [
        "Les parties reconnaissent la valeur de preuve des journaux de l'application : date et heure de l'activation de la licence, paiements de maintenance et leurs références Mobile Money, et acceptation du présent contrat.",
        "Le Client peut accepter le présent contrat en cliquant sur « J'accepte » dans l'application : cette acceptation, enregistrée avec la date, l'heure, l'identité du compte, l'adresse internet et l'appareil utilisé, vaut signature. Une empreinte numérique (SHA-256) du texte exact accepté est conservée : elle prouve qu'il n'a pas été modifié depuis.",
        "Le Client peut aussi signer deux exemplaires papier ; l'exemplaire signé, numérisé, est conservé avec le dossier de l'hôtel. Les deux preuves se complètent.",
      ],
    },
    {
      titre: "Droit applicable et litiges",
      paragraphes: [
        "Le présent contrat est soumis au droit de la République démocratique du Congo.",
        "Les parties cherchent d'abord un règlement amiable. À défaut, le litige est porté devant les juridictions compétentes de la République démocratique du Congo.",
      ],
    },
  ];

  const numerotes: ArticleContrat[] = articles.map((a, i) => ({ numero: i + 1, ...a }));
  const parties = [
    { role: "L'ÉDITEUR", lignes: ligneEditeur(editeur.nom ? editeur : { ...editeur, nom: editeurNom }) },
    { role: "LE CLIENT", lignes: ligneClient(client) },
  ];
  const titre = "CONTRAT DE LICENCE ET DE MAINTENANCE";

  const texte = [
    `${titre} N° ${c.numero}`,
    `Version du modèle : ${CONTRAT_LICENCE_VERSION}`,
    `Établi le ${dateAbonnement(c.etabliLe)}`,
    "",
    ...parties.flatMap((p) => [`${p.role}`, ...p.lignes, ""]),
    ...numerotes.flatMap((a) => [`Article ${a.numero} — ${a.titre}`, ...a.paragraphes, ""]),
  ]
    .join("\n")
    .trimEnd();

  return { version: CONTRAT_LICENCE_VERSION, titre, numero: c.numero, parties, articles: numerotes, texte };
}

/**
 * Remet en forme le texte brut ENREGISTRÉ d'un contrat (celui qu'on a fait accepter) pour l'imprimer : on n'interprète jamais le modèle actuel,
 * on affiche les mots exacts d'alors. Renvoie des blocs : titre d'article en gras, paragraphes simples.
 */
export function blocsDuTexteContrat(texte: string): { type: "titre" | "article" | "ligne" | "vide"; texte: string }[] {
  return texte.split("\n").map((ligne, i) => {
    if (ligne === "") return { type: "vide" as const, texte: "" };
    if (i === 0) return { type: "titre" as const, texte: ligne };
    if (/^Article \d+ — /.test(ligne) || ligne === "L'ÉDITEUR" || ligne === "LE CLIENT") return { type: "article" as const, texte: ligne };
    return { type: "ligne" as const, texte: ligne };
  });
}
