import {
  BrandingPdf,
  collecter,
  entetePage,
  montant,
  nouveauDocument,
  ligneMeta,
  tableau,
} from "../rapports/pdf/commun";

export interface LigneTicketCommande {
  quantite: number;
  nom: string;
  prixUnitaire: number;
  devise: "USD" | "CDF";
}

export interface DonneesTicketCommande {
  reference: string;
  nomClient: string;
  contactClient: string | null;
  noteClient: string | null;
  dateCommande: Date;
  lignes: LigneTicketCommande[];
  totalUSD: number;
  totalCDF: number;
}

function dateFr(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Ticket de commande web (fonction pure — aucun accès base). */
export async function rendreTicketCommandeWeb(
  ticket: DonneesTicketCommande,
  branding: BrandingPdf
): Promise<Buffer> {
  const doc = nouveauDocument();

  entetePage(doc, branding, "Ticket de commande");
  ligneMeta(doc, `Commandé le ${dateFr(ticket.dateCommande)}`);

  // La référence est la seule preuve à présenter au comptoir : gros et centré.
  doc.moveDown(0.5);
  doc
    .font("Helvetica-Bold")
    .fontSize(26)
    .fillColor(branding.couleur ?? "#1f4e2c")
    .text(`Référence : ${ticket.reference}`, { align: "center" });
  doc.moveDown(0.8);

  doc.font("Helvetica-Bold").fontSize(10).fillColor("#1a1a1a").text(`Client : ${ticket.nomClient}`);
  doc.font("Helvetica").fontSize(10).fillColor("#444444");
  if (ticket.contactClient) doc.text(`Contact : ${ticket.contactClient}`);
  if (ticket.noteClient) doc.text(`Note : ${ticket.noteClient}`);
  doc.moveDown(0.8);

  tableau(
    doc,
    [
      { titre: "Qté", fraction: 0.08, align: "center" },
      { titre: "Article", fraction: 0.47 },
      { titre: "Prix unit.", fraction: 0.2, align: "right" },
      { titre: "Montant", fraction: 0.25, align: "right" },
    ],
    ticket.lignes.map((l) => [
      String(l.quantite),
      l.nom,
      montant(l.prixUnitaire, l.devise),
      montant(l.prixUnitaire * l.quantite, l.devise),
    ])
  );

  doc.moveDown(0.4);
  const totaux = [
    ticket.totalUSD > 0 ? montant(ticket.totalUSD, "USD") : null,
    ticket.totalCDF > 0 ? montant(ticket.totalCDF, "CDF") : null,
  ]
    .filter(Boolean)
    .join(" · ");
  doc.font("Helvetica-Bold").fontSize(13).fillColor("#1a1a1a").text(`Total : ${totaux}`, { align: "right" });

  doc.moveDown(1.2);
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#555555")
    .text(
      "Présentez ce ticket ou la référence ci-dessus au comptoir pour payer et récupérer votre commande — paiement sur place uniquement.",
      { align: "center" }
    );
  doc.moveDown(0.4);
  doc.font("Helvetica").fontSize(8).text("Généré par HotelSaver — ticket à usage unique.", { align: "center" });

  return collecter(doc);
}
