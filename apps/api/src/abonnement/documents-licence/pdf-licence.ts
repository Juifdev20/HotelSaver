import QRCode from "qrcode";
import { blocsDuTexteContrat, dateAbonnement, montantAbonnement } from "@hotel-chicago/regles";
import { collecter, nouveauDocument, signatures, tableau, titreSection } from "../../rapports/pdf/commun";

/**
 * Documents de preuve des licences (11/11/2026) : contrat, reçu de licence, reçu de maintenance, dossier de preuve.
 * Rendu seulement : toutes les données arrivent déjà lues et figées (le contrat est le texte ENREGISTRÉ à l'activation, jamais re-fabriqué).
 * Police Helvetica (WinAnsi) : pas de caractères hors français courant — les montants passent par `montantAbonnement` (espace normale).
 */

const MARGE = 40;
const LARGEUR = 595.28 - 2 * MARGE;
const VERT = "#1f4e2c";

/**
 * Pied de page sur chaque page : référence du document, code de contrôle et « Page x/y ». La marge basse est mise à 0 le temps de l'écriture,
 * sinon PDFKit ouvre une page vide dès que le texte dépasse la marge.
 */
function piedsDePage(doc: PDFKit.PDFDocument, reference: string): void {
  const pages = doc.bufferedPageRange();
  for (let i = pages.start; i < pages.start + pages.count; i++) {
    doc.switchToPage(i);
    const basse = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font("Helvetica").fontSize(7).fillColor("#777777");
    doc.text(`Document HotelSaver — ${reference}`, MARGE, 812, { width: LARGEUR - 70, lineBreak: false });
    doc.text(`Page ${i + 1}/${pages.count}`, MARGE, 812, { width: LARGEUR, align: "right", lineBreak: false });
    doc.page.margins.bottom = basse;
  }
}

export interface DonneesEditeur {
  nom: string;
  adresse?: string | null;
  rccm?: string | null;
  nif?: string | null;
  telephone?: string | null;
  email?: string | null;
  representant?: string | null;
  fonction?: string | null;
}

export interface DonneesAcceptation {
  le: Date;
  parNom: string | null;
  ip: string | null;
  appareil: string | null;
}

export interface DonneesScan {
  envoyeLe: Date;
  type: string;
  taille: number;
  empreinte: string;
  /** Contenu du fichier si c'est une image (PNG/JPEG) : il est alors reproduit dans le dossier de preuve. */
  image?: Buffer | null;
}

export interface DonneesLicencePdf {
  numero: string;
  hotelNom: string;
  hotelAdresse: string | null;
  patronNom: string | null;
  annees: number;
  debutLe: Date;
  finLe: Date;
  montant: number | null;
  devise: "USD" | "CDF" | null;
  methode: string | null;
  fraisMaintenanceUsd: number;
  etabliLe: Date;
  contratVersion: number;
  contratTexte: string;
  contratEmpreinte: string;
  /** Code de contrôle court (début de l'empreinte), imprimé sur chaque page et dans le QR code. */
  code: string;
  urlVerification: string | null;
  editeur: DonneesEditeur;
  enregistreParNom: string | null;
  acceptation: DonneesAcceptation | null;
  scan: DonneesScan | null;
  annulation: { le: Date; motif: string } | null;
}

export interface DonneesMaintenancePdf {
  numeroRecu: string;
  hotelNom: string;
  licenceNumero: string | null;
  editeur: DonneesEditeur;
  mois: number;
  montant: number;
  devise: "USD" | "CDF";
  methode: string;
  source: "EN_LIGNE" | "MANUEL";
  /** Référence ScanLinkPay (paiement en ligne). */
  reference: string | null;
  payeLe: Date;
  periodeCouverteJusquau: Date;
  enregistreParNom: string | null;
  annulation: { le: Date; motif: string } | null;
}

const LIBELLE_METHODE: Record<string, string> = { ESPECES: "Espèces", VIREMENT: "Virement", MOBILE_MONEY: "Mobile Money", AUTRE: "Autre" };
export const libelleMethode = (m: string | null) => (m ? (LIBELLE_METHODE[m] ?? m) : "—");

/** « 12 novembre 2026 à 14:05 » (heure de Lubumbashi, UTC+2). */
export function dateHeure(d: Date): string {
  const l = new Date(d.getTime() + 2 * 3_600_000);
  const hh = String(l.getUTCHours()).padStart(2, "0");
  const mm = String(l.getUTCMinutes()).padStart(2, "0");
  return `${dateAbonnement(d)} à ${hh}:${mm}`;
}

const prixLicence = (d: { montant: number | null; devise: "USD" | "CDF" | null }) => (d.montant === null || d.devise === null ? "Non précisé" : montantAbonnement(d.montant, d.devise));

async function codeQr(url: string | null): Promise<Buffer | null> {
  if (!url) return null;
  try {
    return await QRCode.toBuffer(url, { margin: 1, width: 220, errorCorrectionLevel: "M" });
  } catch {
    return null;
  }
}

function enTete(doc: PDFKit.PDFDocument, editeur: DonneesEditeur, titre: string | null, sousTitre?: string): void {
  const y = doc.y;
  doc.font("Helvetica-Bold").fontSize(15).fillColor(VERT).text(editeur.nom, MARGE, y, { width: LARGEUR });
  const identite = [editeur.adresse, editeur.rccm ? `RCCM ${editeur.rccm}` : "", editeur.nif ? `NIF ${editeur.nif}` : "", editeur.telephone, editeur.email].filter(Boolean).join(" · ");
  if (identite) doc.font("Helvetica").fontSize(8.5).fillColor("#555555").text(identite, MARGE, doc.y + 1, { width: LARGEUR });
  doc.moveDown(0.8);
  if (titre === null) return;
  doc.font("Helvetica-Bold").fontSize(15).fillColor("#1a1a1a").text(titre, MARGE, doc.y, { width: LARGEUR, align: "center" });
  if (sousTitre) doc.font("Helvetica").fontSize(9.5).fillColor("#555555").text(sousTitre, MARGE, doc.y + 2, { width: LARGEUR, align: "center" });
  doc.moveDown(0.8);
}

function ligneDetail(doc: PDFKit.PDFDocument, libelle: string, valeur: string): void {
  const y = doc.y;
  doc.font("Helvetica").fontSize(10).fillColor("#555555").text(libelle, MARGE, y, { width: 150 });
  const h1 = doc.y - y;
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#1a1a1a").text(valeur, MARGE + 155, y, { width: LARGEUR - 155 });
  doc.y = y + Math.max(h1, doc.y - y) + 3;
}

function cadreVerification(doc: PDFKit.PDFDocument, qr: Buffer | null, d: Pick<DonneesLicencePdf, "code" | "contratEmpreinte" | "urlVerification">): void {
  if (doc.y + 100 > 780) doc.addPage();
  const y = doc.y + 6;
  doc.rect(MARGE, y, LARGEUR, 84).lineWidth(0.8).strokeColor("#999999").stroke();
  let x = MARGE + 10;
  if (qr) {
    try {
      doc.image(qr, MARGE + 8, y + 8, { fit: [68, 68] });
      x = MARGE + 88;
    } catch {
      /* QR illisible : on continue sans */
    }
  }
  doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#1a1a1a").text("Vérifier l'authenticité de ce document", x, y + 9, { width: MARGE + LARGEUR - x - 10 });
  doc.font("Helvetica").fontSize(8.5).fillColor("#444444");
  doc.text(`Code de contrôle : ${d.code}`, x, doc.y + 2, { width: MARGE + LARGEUR - x - 10 });
  doc.text(`Empreinte SHA-256 du contrat : ${d.contratEmpreinte}`, x, doc.y + 1, { width: MARGE + LARGEUR - x - 10 });
  doc.text(d.urlVerification ? "Scannez le QR code ou ouvrez le lien de contrôle : la page confirme que ce numéro et ce code existent." : "Demandez à l'éditeur de confirmer ce numéro et ce code.", x, doc.y + 1, { width: MARGE + LARGEUR - x - 10 });
  doc.y = y + 92;
}

/** Les mots EXACTS du contrat enregistré à l'activation. */
function ecrireTexteContrat(doc: PDFKit.PDFDocument, texte: string): void {
  for (const bloc of blocsDuTexteContrat(texte)) {
    if (bloc.type === "vide") {
      doc.moveDown(0.3);
    } else if (bloc.type === "titre") {
      doc.font("Helvetica-Bold").fontSize(14).fillColor("#1a1a1a").text(bloc.texte, MARGE, doc.y, { width: LARGEUR, align: "center" });
      doc.moveDown(0.3);
    } else if (bloc.type === "article") {
      if (doc.y > 735) doc.addPage();
      doc.font("Helvetica-Bold").fontSize(10.5).fillColor(VERT).text(bloc.texte, MARGE, doc.y, { width: LARGEUR });
    } else {
      doc.font("Helvetica").fontSize(9.5).fillColor("#1a1a1a").text(bloc.texte, MARGE, doc.y, { width: LARGEUR, align: "justify" });
    }
  }
}

function blocAcceptation(doc: PDFKit.PDFDocument, a: DonneesAcceptation | null): void {
  if (doc.y + 70 > 780) doc.addPage();
  titreSection(doc, "Acceptation dans l'application");
  if (!a) {
    doc.font("Helvetica").fontSize(9.5).fillColor("#444444").text("Le Client n'a pas encore accepté ce contrat dans l'application.", MARGE, doc.y, { width: LARGEUR });
    return;
  }
  ligneDetail(doc, "Accepté le", dateHeure(a.le));
  ligneDetail(doc, "Par", a.parNom ?? "Compte du patron");
  ligneDetail(doc, "Adresse internet", a.ip ?? "—");
  ligneDetail(doc, "Appareil", (a.appareil ?? "—").slice(0, 160));
}

/** Contrat de licence et de maintenance, avec cadres de signature et cadre de vérification. */
export async function pdfContrat(d: DonneesLicencePdf): Promise<Buffer> {
  const doc = nouveauDocument();
  const qr = await codeQr(d.urlVerification);
  doc.y = MARGE;
  enTete(doc, d.editeur, null);
  if (d.annulation) doc.font("Helvetica-Bold").fontSize(11).fillColor("#a11d1d").text(`CONTRAT ANNULÉ le ${dateAbonnement(d.annulation.le)} — motif : ${d.annulation.motif}`, MARGE, doc.y, { width: LARGEUR, align: "center" });
  // Le texte enregistré (titre compris) est reproduit mot pour mot.
  ecrireTexteContrat(doc, d.contratTexte);
  blocAcceptation(doc, d.acceptation);
  signatures(doc, [
    { titre: "Pour l'Éditeur", nom: d.editeur.representant ? `${d.editeur.representant}${d.editeur.fonction ? `, ${d.editeur.fonction}` : ""}` : d.editeur.nom },
    { titre: "Pour le Client", nom: d.patronNom ? `${d.patronNom}, patron — ${d.hotelNom}` : d.hotelNom },
  ]);
  cadreVerification(doc, qr, d);
  piedsDePage(doc, `contrat ${d.numero} · code ${d.code}`);
  return collecter(doc);
}

/** Reçu de licence : la preuve d'achat. */
export async function pdfRecuLicence(d: DonneesLicencePdf): Promise<Buffer> {
  const doc = nouveauDocument();
  const qr = await codeQr(d.urlVerification);
  doc.y = MARGE;
  enTete(doc, d.editeur, "REÇU DE LICENCE", `N° ${d.numero}${d.annulation ? " — ANNULÉ" : ""}`);
  doc.font("Helvetica").fontSize(10).fillColor("#1a1a1a").text(`Établi le ${dateAbonnement(d.etabliLe)}`, MARGE, doc.y, { width: LARGEUR, align: "center" });
  doc.moveDown(1);
  ligneDetail(doc, "Reçu de", `${d.hotelNom}${d.patronNom ? ` (${d.patronNom}, patron)` : ""}`);
  if (d.hotelAdresse) ligneDetail(doc, "Adresse de l'hôtel", d.hotelAdresse);
  ligneDetail(doc, "Objet", `Licence d'utilisation de HotelSaver pour ${d.annees} an${d.annees > 1 ? "s" : ""}, pour un seul hôtel`);
  ligneDetail(doc, "Période", `du ${dateAbonnement(d.debutLe)} au ${dateAbonnement(d.finLe)}`);
  ligneDetail(doc, "Montant reçu", prixLicence(d));
  ligneDetail(doc, "Mode de paiement", libelleMethode(d.methode));
  ligneDetail(doc, "Mises à jour", "comprises pendant toute la durée de la licence");
  ligneDetail(doc, "Frais de maintenance", `${montantAbonnement(d.fraisMaintenanceUsd, "USD")} par période de 30 jours (première période comprise)`);
  ligneDetail(doc, "Encaissé par", d.enregistreParNom ?? d.editeur.nom);
  if (d.annulation) {
    doc.moveDown(0.5);
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#a11d1d").text(`REÇU ANNULÉ le ${dateAbonnement(d.annulation.le)} — motif : ${d.annulation.motif}`, MARGE, doc.y, { width: LARGEUR });
  }
  doc.moveDown(0.8);
  doc.font("Helvetica").fontSize(9).fillColor("#444444").text(`Ce reçu est lié au contrat de licence et de maintenance n° ${d.numero}.`, MARGE, doc.y, { width: LARGEUR });
  signatures(doc, [
    { titre: "Pour l'Éditeur (cachet et signature)", nom: d.editeur.representant ?? d.editeur.nom },
    { titre: "Le Client (nom et signature)", nom: d.patronNom ?? d.hotelNom },
  ]);
  cadreVerification(doc, qr, d);
  piedsDePage(doc, `reçu ${d.numero} · code ${d.code}`);
  return collecter(doc);
}

/** Reçu d'un paiement de frais de maintenance. */
export async function pdfRecuMaintenance(d: DonneesMaintenancePdf): Promise<Buffer> {
  const doc = nouveauDocument();
  doc.y = MARGE;
  enTete(doc, d.editeur, "REÇU DE MAINTENANCE", `N° ${d.numeroRecu}${d.annulation ? " — ANNULÉ" : ""}`);
  ligneDetail(doc, "Reçu de", d.hotelNom);
  ligneDetail(doc, "Objet", `Frais de maintenance — ${d.mois} période${d.mois > 1 ? "s" : ""} de 30 jours`);
  if (d.licenceNumero) ligneDetail(doc, "Licence", d.licenceNumero);
  ligneDetail(doc, "Montant", montantAbonnement(d.montant, d.devise));
  ligneDetail(doc, "Payé le", dateHeure(d.payeLe));
  ligneDetail(doc, "Mode de paiement", d.source === "EN_LIGNE" ? "Mobile Money, dans l'application (ScanLinkPay)" : libelleMethode(d.methode));
  if (d.reference) ligneDetail(doc, "Référence ScanLinkPay", d.reference);
  ligneDetail(doc, "Maintenance couverte jusqu'au", dateAbonnement(d.periodeCouverteJusquau));
  if (d.source === "MANUEL") ligneDetail(doc, "Encaissé par", d.enregistreParNom ?? d.editeur.nom);
  if (d.annulation) {
    doc.moveDown(0.5);
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#a11d1d").text(`REÇU ANNULÉ le ${dateAbonnement(d.annulation.le)} — motif : ${d.annulation.motif}`, MARGE, doc.y, { width: LARGEUR });
  }
  piedsDePage(doc, `reçu ${d.numeroRecu}`);
  return collecter(doc);
}

/** Dossier de preuve : tout ce qu'un avocat ou un juge doit voir, en un seul PDF. */
export async function pdfDossierPreuve(d: DonneesLicencePdf, maintenances: DonneesMaintenancePdf[], edite: { le: Date; parNom: string | null }): Promise<Buffer> {
  const doc = nouveauDocument();
  const qr = await codeQr(d.urlVerification);
  doc.y = MARGE;

  // Page de garde
  enTete(doc, d.editeur, "DOSSIER DE PREUVE", `Licence ${d.numero} — ${d.hotelNom}`);
  doc.font("Helvetica").fontSize(10).fillColor("#1a1a1a").text(`Dossier édité le ${dateHeure(edite.le)}${edite.parNom ? ` par ${edite.parNom}` : ""}.`, MARGE, doc.y, { width: LARGEUR, align: "center" });
  doc.moveDown(1);
  titreSection(doc, "Résumé");
  ligneDetail(doc, "Client", `${d.hotelNom}${d.patronNom ? ` — ${d.patronNom}, patron` : ""}`);
  if (d.hotelAdresse) ligneDetail(doc, "Adresse", d.hotelAdresse);
  ligneDetail(doc, "Licence", `${d.annees} an${d.annees > 1 ? "s" : ""}, du ${dateAbonnement(d.debutLe)} au ${dateAbonnement(d.finLe)}`);
  ligneDetail(doc, "Prix payé", prixLicence(d));
  ligneDetail(doc, "Frais de maintenance", `${montantAbonnement(d.fraisMaintenanceUsd, "USD")} par période de 30 jours`);
  ligneDetail(doc, "Activée le", `${dateHeure(d.etabliLe)}${d.enregistreParNom ? ` par ${d.enregistreParNom}` : ""}`);
  if (d.annulation) ligneDetail(doc, "Statut", `ANNULÉE le ${dateAbonnement(d.annulation.le)} — ${d.annulation.motif}`);
  titreSection(doc, "Pièces de ce dossier");
  const pieces = [
    "1. Reçu de licence (preuve d'achat)",
    `2. Contrat de licence et de maintenance n° ${d.numero} (version ${d.contratVersion} du modèle), texte exact proposé au Client`,
    `3. Acceptation dans l'application : ${d.acceptation ? `faite le ${dateHeure(d.acceptation.le)}` : "pas encore faite"}`,
    `4. Exemplaire papier signé : ${d.scan ? `numérisé et enregistré le ${dateHeure(d.scan.envoyeLe)}` : "aucun exemplaire numérisé"}`,
    `5. Paiements de frais de maintenance (${maintenances.length})`,
  ];
  for (const p of pieces) doc.font("Helvetica").fontSize(10).fillColor("#1a1a1a").text(p, MARGE, doc.y + 2, { width: LARGEUR });
  titreSection(doc, "Comment vérifier que le contrat n'a pas été modifié");
  doc.font("Helvetica").fontSize(9.5).fillColor("#333333").text(
    "Le texte exact du contrat a été enregistré le jour de l'activation avec son empreinte numérique SHA-256, reproduite ci-dessous. Toute modification du texte, même d'une virgule, donne une autre empreinte. Pour contrôler : calculer le SHA-256 du texte du contrat (UTF-8) et comparer avec cette empreinte.",
    MARGE, doc.y, { width: LARGEUR, align: "justify" });
  doc.moveDown(0.5);
  cadreVerification(doc, qr, d);

  // Pièce 1 : reçu de licence
  doc.addPage();
  doc.y = MARGE;
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#777777").text("PIÈCE 1", MARGE, doc.y);
  enTete(doc, d.editeur, "REÇU DE LICENCE", `N° ${d.numero}`);
  ligneDetail(doc, "Reçu de", `${d.hotelNom}${d.patronNom ? ` (${d.patronNom}, patron)` : ""}`);
  ligneDetail(doc, "Objet", `Licence HotelSaver ${d.annees} an${d.annees > 1 ? "s" : ""}, un seul hôtel`);
  ligneDetail(doc, "Période", `du ${dateAbonnement(d.debutLe)} au ${dateAbonnement(d.finLe)}`);
  ligneDetail(doc, "Montant reçu", prixLicence(d));
  ligneDetail(doc, "Mode de paiement", libelleMethode(d.methode));
  ligneDetail(doc, "Établi le", dateHeure(d.etabliLe));

  // Pièce 2 : contrat
  doc.addPage();
  doc.y = MARGE;
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#777777").text("PIÈCE 2", MARGE, doc.y);
  doc.moveDown(0.3);
  ecrireTexteContrat(doc, d.contratTexte);
  doc.moveDown(0.5);
  ligneDetail(doc, "Empreinte SHA-256", d.contratEmpreinte);

  // Pièce 3 : acceptation
  doc.addPage();
  doc.y = MARGE;
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#777777").text("PIÈCE 3", MARGE, doc.y);
  blocAcceptation(doc, d.acceptation);
  if (d.acceptation) {
    doc.moveDown(0.5);
    doc.font("Helvetica").fontSize(9).fillColor("#444444").text(`Texte accepté : version ${d.contratVersion} du modèle, empreinte ${d.contratEmpreinte}.`, MARGE, doc.y, { width: LARGEUR });
  }

  // Pièce 4 : exemplaire signé
  doc.addPage();
  doc.y = MARGE;
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#777777").text("PIÈCE 4", MARGE, doc.y);
  titreSection(doc, "Exemplaire papier signé");
  if (!d.scan) {
    doc.font("Helvetica").fontSize(9.5).fillColor("#444444").text("Aucun exemplaire papier signé n'a été numérisé et enregistré pour cette licence.", MARGE, doc.y, { width: LARGEUR });
  } else {
    ligneDetail(doc, "Enregistré le", dateHeure(d.scan.envoyeLe));
    ligneDetail(doc, "Type de fichier", d.scan.type);
    ligneDetail(doc, "Taille", `${Math.round(d.scan.taille / 1024)} Ko`);
    ligneDetail(doc, "Empreinte SHA-256", d.scan.empreinte);
    doc.moveDown(0.5);
    if (d.scan.image) {
      try {
        doc.image(d.scan.image, MARGE, doc.y, { fit: [LARGEUR, 560], align: "center" });
      } catch {
        doc.font("Helvetica").fontSize(9.5).fillColor("#444444").text("L'image n'a pas pu être reproduite ici ; elle reste disponible dans le dossier de l'hôtel.", MARGE, doc.y, { width: LARGEUR });
      }
    } else {
      doc.font("Helvetica").fontSize(9.5).fillColor("#444444").text("Le fichier signé est un PDF : il est joint à ce dossier en pièce séparée (son empreinte ci-dessus permet de prouver qu'il est identique à celui enregistré).", MARGE, doc.y, { width: LARGEUR });
    }
  }

  // Pièce 5 : maintenance
  doc.addPage();
  doc.y = MARGE;
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#777777").text("PIÈCE 5", MARGE, doc.y);
  titreSection(doc, "Paiements de frais de maintenance");
  if (maintenances.length === 0) {
    doc.font("Helvetica").fontSize(9.5).fillColor("#444444").text("Aucun paiement de maintenance enregistré.", MARGE, doc.y, { width: LARGEUR });
  } else {
    tableau(
      doc,
      [
        { titre: "Reçu", fraction: 0.17 },
        { titre: "Date", fraction: 0.16 },
        { titre: "Montant", fraction: 0.12, align: "right" },
        { titre: "Mode", fraction: 0.15 },
        { titre: "Couvert jusqu'au", fraction: 0.16 },
        { titre: "Référence / statut", fraction: 0.24 },
      ],
      maintenances.map((m) => [
        m.numeroRecu,
        dateAbonnement(m.payeLe),
        montantAbonnement(m.montant, m.devise),
        m.source === "EN_LIGNE" ? "Mobile Money" : libelleMethode(m.methode),
        dateAbonnement(m.periodeCouverteJusquau),
        m.annulation ? `ANNULÉ le ${dateAbonnement(m.annulation.le)}` : (m.reference ?? "Saisi par l'éditeur"),
      ])
    );
  }

  piedsDePage(doc, `dossier ${d.numero} · code ${d.code}`);
  return collecter(doc);
}
