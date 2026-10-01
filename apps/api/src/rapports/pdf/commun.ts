import PDFDocument from "pdfkit";
import { ParDevise } from "../agregats/types";

export interface BrandingPdf {
  nom: string;
  adresse?: string | null;
  telephone?: string | null;
  /** Image du logo (PNG/JPEG), ou null — rapport sans logo acceptable. */
  logo?: Buffer | null;
  /** Couleur principale de l'hôtel (hex), vert Hôtel Chicago par défaut. */
  couleur?: string;
}

const MARGE = 40;
const LARGEUR = 595.28 - 2 * MARGE; // A4

/** PDFKit écrit en flux : on ramasse les morceaux puis on renvoie le PDF complet. */
export function collecter(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resoudre, rejeter) => {
    const morceaux: Buffer[] = [];
    doc.on("data", (morceau: Buffer) => morceaux.push(morceau));
    doc.on("end", () => resoudre(Buffer.concat(morceaux)));
    doc.on("error", rejeter);
    doc.end();
  });
}

export function nouveauDocument(): PDFKit.PDFDocument {
  return new PDFDocument({ size: "A4", margin: MARGE, bufferPages: true, info: { Producer: "HotelSaver" } });
}

/** Montant dans SA devise (« 1 250 $ » / « 350 000 FC »), jamais converti. */
export function montant(valeur: number, devise: "USD" | "CDF"): string {
  if (devise === "CDF") return `${Math.round(valeur).toLocaleString("fr-FR")} FC`;
  return `${valeur.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
}

/** « 12,50 $ · 3 400 FC » — les deux devises côte à côte, « — » si rien. */
export function montants(p: ParDevise): string {
  const morceaux: string[] = [];
  if (p.usd) morceaux.push(montant(p.usd, "USD"));
  if (p.cdf) morceaux.push(montant(p.cdf, "CDF"));
  return morceaux.length ? morceaux.join(" · ") : "—";
}

/** En-tête de chaque page : logo, nom de l'hôtel en couleur, titre du rapport. */
export function entetePage(doc: PDFKit.PDFDocument, branding: BrandingPdf, titre: string): void {
  const couleur = branding.couleur ?? "#1f4e2c";
  let y = MARGE;
  if (branding.logo) {
    try {
      doc.image(branding.logo, MARGE, y, { fit: [48, 48] });
    } catch {
      /* logo illisible : on continue sans */
    }
  }
  const x = branding.logo ? MARGE + 60 : MARGE;
  doc.font("Helvetica-Bold").fontSize(15).fillColor(couleur).text(branding.nom, x, y);
  doc.font("Helvetica").fontSize(9).fillColor("#555555");
  const lignes = [branding.adresse, branding.telephone].filter(Boolean);
  if (lignes.length) doc.text(lignes.join(" · "), x, doc.y + 2);
  doc.font("Helvetica-Bold").fontSize(16).fillColor("#1a1a1a").text(titre, MARGE, y + 62, { width: LARGEUR, align: "center" });
  doc.y = y + 86;
}

/** Ligne de méta sous le titre : période, numéro, auteur — grisé. */
export function ligneMeta(doc: PDFKit.PDFDocument, texte: string): void {
  doc.font("Helvetica").fontSize(9).fillColor("#555555").text(texte, MARGE, doc.y, { width: LARGEUR, align: "center" });
  doc.moveDown(0.6);
}

export function titreSection(doc: PDFKit.PDFDocument, titre: string): void {
  doc.moveDown(0.5);
  doc.font("Helvetica-Bold").fontSize(12).fillColor("#1a1a1a").text(titre, MARGE);
  doc.moveDown(0.3);
  doc.moveTo(MARGE, doc.y).lineTo(MARGE + LARGEUR, doc.y).lineWidth(0.8).strokeColor("#cccccc").stroke();
  doc.moveDown(0.4);
}

export interface ColonneTableau {
  titre: string;
  /** Fraction de la largeur totale (somme = 1). */
  fraction: number;
  align?: "left" | "right" | "center";
}

/** Petit tableau texte : en-têtes gras soulignés + lignes alternées. */
export function tableau(doc: PDFKit.PDFDocument, colonnes: ColonneTableau[], lignes: string[][]): void {
  const largeurs = colonnes.map((c) => c.fraction * LARGEUR);
  const ecrireLigne = (cellules: string[], gras: boolean) => {
    let x = MARGE;
    const hauteurs: number[] = [];
    cellules.forEach((cellule, i) => {
      hauteurs.push(doc.font(gras ? "Helvetica-Bold" : "Helvetica").fontSize(8.5).heightOfString(cellule, { width: largeurs[i] - 6 }));
    });
    const hauteur = Math.max(...hauteurs, 12) + 5;
    if (doc.y + hauteur > 780) {
      doc.addPage();
    }
    const y = doc.y;
    cellules.forEach((cellule, i) => {
      doc
        .font(gras ? "Helvetica-Bold" : "Helvetica")
        .fontSize(8.5)
        .fillColor("#1a1a1a")
        .text(cellule, x + 3, y + 2, { width: largeurs[i] - 6, align: colonnes[i].align ?? "left" });
      x += largeurs[i];
    });
    doc.y = y + hauteur;
  };

  ecrireLigne(colonnes.map((c) => c.titre), true);
  doc.moveTo(MARGE, doc.y - 2).lineTo(MARGE + LARGEUR, doc.y - 2).lineWidth(0.7).strokeColor("#999999").stroke();
  lignes.forEach((ligne, index) => {
    if (index % 2 === 1) {
      const y = doc.y;
      doc.rect(MARGE, y, LARGEUR, 17).fill("#f4f6f4").fillColor("#1a1a1a");
    }
    ecrireLigne(ligne, false);
  });
  doc.moveDown(0.5);
}

/** Deux cadres de signature : nom + rôle + date, trait pour signer à la main. */
export function signatures(doc: PDFKit.PDFDocument, signataires: { titre: string; nom: string }[]): void {
  if (doc.y + 110 > 780) doc.addPage();
  titreSection(doc, "Signatures");
  const largeurCadre = (LARGEUR - 20 * (signataires.length - 1)) / signataires.length;
  let x = MARGE;
  const yDebut = doc.y;
  for (const s of signataires) {
    doc.rect(x, yDebut, largeurCadre, 90).lineWidth(0.8).strokeColor("#999999").stroke();
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#1a1a1a").text(s.titre, x + 8, yDebut + 8, { width: largeurCadre - 16 });
    doc.font("Helvetica").fontSize(9).fillColor("#444444").text(s.nom, x + 8, yDebut + 22, { width: largeurCadre - 16 });
    doc
      .moveTo(x + 8, yDebut + 70)
      .lineTo(x + largeurCadre - 8, yDebut + 70)
      .lineWidth(0.6)
      .strokeColor("#666666")
      .stroke();
    doc.font("Helvetica").fontSize(7.5).fillColor("#777777").text("Signature et date", x + 8, yDebut + 74);
    x += largeurCadre + 20;
  }
  doc.y = yDebut + 100;
}

/** Filigrane diagonal « PROVISOIRE » sur toutes les pages déjà écrites. */
export function filigraneProvisoire(doc: PDFKit.PDFDocument): void {
  const pages = doc.bufferedPageRange();
  for (let i = pages.start; i < pages.start + pages.count; i++) {
    doc.switchToPage(i);
    doc
      .font("Helvetica-Bold")
      .fontSize(80)
      .fillColor("#000000")
      .fillOpacity(0.06)
      .rotate(-35, { origin: [297, 420] })
      .text("PROVISOIRE", 60, 380, { align: "center", width: 475 })
      .rotate(35, { origin: [297, 420] })
      .fillOpacity(1);
  }
}

/** Pied de page sur toutes les pages : « généré par HotelSaver App »,
 * empreinte de contrôle et « Page x/y » — écrit en dernier. */
export function piedsDePage(doc: PDFKit.PDFDocument, empreinte: string): void {
  const pages = doc.bufferedPageRange();
  for (let i = pages.start; i < pages.start + pages.count; i++) {
    doc.switchToPage(i);
    doc
      .font("Helvetica")
      .fontSize(7)
      .fillColor("#777777")
      .text(`Ce document a été généré par HotelSaver App — empreinte ${empreinte}`, MARGE, 806, { width: LARGEUR - 80 });
    doc.text(`Page ${i + 1}/${pages.count}`, MARGE, 806, { width: LARGEUR, align: "right" });
  }
}
