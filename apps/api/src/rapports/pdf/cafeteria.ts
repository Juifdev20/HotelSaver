import { AgregatCafeteria, LigneConcordance } from "../agregats/types";
import {
  BrandingPdf,
  collecter,
  entetePage,
  filigraneProvisoire,
  ligneMeta,
  montants,
  nouveauDocument,
  piedsDePage,
  signatures,
  tableau,
  titreSection,
} from "./commun";

export interface ContexteRapportCafeteria {
  numero: string;
  periode: string; // « septembre 2026 »
  plage: string; // « du 01/09/2026 au 30/09/2026 »
  genereParNom: string;
  genereLe: Date;
  provisoire: boolean;
  concordance: LigneConcordance[];
  /** Limites honnêtes affichées en fin de document. */
  limites: string[];
}

const LIBELLE_MODE: Record<string, string> = {
  CASH: "Espèces",
  MOBILE_MONEY: "Mobile money",
  FACTURE_CHAMBRE: "Facturé chambre",
};

/** Rapport mensuel Cafétaria → PDF (Buffer). Fonction pure : aucun accès base. */
export async function rendreRapportCafeteria(
  data: AgregatCafeteria,
  ctx: ContexteRapportCafeteria,
  branding: BrandingPdf,
  empreinte: string
): Promise<Buffer> {
  const doc = nouveauDocument();

  entetePage(doc, branding, `Rapport mensuel — Cafétaria`);
  ligneMeta(doc, `${ctx.periode} (${ctx.plage})`);
  ligneMeta(doc, `N° ${ctx.numero} · généré par ${ctx.genereParNom} le ${ctx.genereLe.toLocaleDateString("fr-FR")} à ${ctx.genereLe.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`);

  // 1. Synthèse
  titreSection(doc, "1. Synthèse du mois");
  tableau(
    doc,
    [
      { titre: "Indicateur", fraction: 0.55 },
      { titre: "Valeur", fraction: 0.45, align: "right" },
    ],
    [
      ["Recette nette", montants(data.recetteNette)],
      ["Nombre de ventes (reçus)", String(data.nombreVentes)],
      ["Comptes ayant produit une vente", String(data.nombreComptes)],
      ["Panier moyen par vente", montants(data.panierMoyen)],
      ["Dont ventes facturées sur chambre", `${data.factureChambre.nombre} — ${montants(data.factureChambre.parDevise)}`],
      ["Ventes annulées dans le mois", String(data.annulations.length)],
    ]
  );

  titreSection(doc, "Répartition par mode de paiement");
  tableau(
    doc,
    [
      { titre: "Mode", fraction: 0.4 },
      { titre: "Ventes", fraction: 0.2, align: "right" },
      { titre: "Montant", fraction: 0.4, align: "right" },
    ],
    data.parMode.map((m) => [LIBELLE_MODE[m.mode] ?? m.mode, String(m.nombre), montants(m.parDevise)])
  );

  // 2. Ventes par jour
  titreSection(doc, "2. Ventes par jour");
  if (data.parJour.length === 0) {
    doc.font("Helvetica-Oblique").fontSize(9).text("Aucune vente sur la période.");
  } else {
    tableau(
      doc,
      [
        { titre: "Jour", fraction: 0.4 },
        { titre: "Ventes", fraction: 0.2, align: "right" },
        { titre: "Recette", fraction: 0.4, align: "right" },
      ],
      data.parJour.map((j) => [j.jour, String(j.nombre), montants(j.parDevise)])
    );
  }

  // 3. Top produits + catégories
  titreSection(doc, "3. Produits les plus vendus (top 10)");
  if (data.topProduits.length === 0) {
    doc.font("Helvetica-Oblique").fontSize(9).text("Aucune ligne de commande encaissée sur la période.");
  } else {
    tableau(
      doc,
      [
        { titre: "Produit", fraction: 0.34 },
        { titre: "Catégorie", fraction: 0.22 },
        { titre: "Qté", fraction: 0.12, align: "right" },
        { titre: "Chiffre d'affaires", fraction: 0.32, align: "right" },
      ],
      data.topProduits.map((p) => [p.nom, p.categorie, String(p.quantite), montants(p.parDevise)])
    );
  }

  titreSection(doc, "Ventes par catégorie");
  tableau(
    doc,
    [
      { titre: "Catégorie", fraction: 0.44 },
      { titre: "Qté", fraction: 0.16, align: "right" },
      { titre: "Chiffre d'affaires", fraction: 0.4, align: "right" },
    ],
    data.parCategorie.map((c) => [c.categorie, String(c.quantite), montants(c.parDevise)])
  );

  // 4. Par serveur
  titreSection(doc, "4. Ventes par serveur");
  tableau(
    doc,
    [
      { titre: "Serveur", fraction: 0.44 },
      { titre: "Ventes", fraction: 0.16, align: "right" },
      { titre: "Montant", fraction: 0.4, align: "right" },
    ],
    data.parServeur.map((s) => [s.nom, String(s.nombreVentes), montants(s.parDevise)])
  );

  // 5. Inventaire
  titreSection(doc, "5. Inventaire du mois");
  tableau(
    doc,
    [
      { titre: "Produit", fraction: 0.2 },
      { titre: "Début", fraction: 0.1, align: "right" },
      { titre: "Entrées", fraction: 0.1, align: "right" },
      { titre: "Ventes", fraction: 0.1, align: "right" },
      { titre: "Pertes", fraction: 0.1, align: "right" },
      { titre: "Ajust.", fraction: 0.1, align: "right" },
      { titre: "Fin", fraction: 0.1, align: "right" },
      { titre: "Valeur", fraction: 0.2, align: "right" },
    ],
    data.inventaire.map((l) => [
      l.produit,
      String(l.stockOuverture),
      String(l.entrees),
      String(l.sortiesVentes),
      String(l.pertes),
      String(l.ajustements),
      String(l.stockCloture),
      montants(l.valeurCloture),
    ])
  );
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(`Valeur du stock en clôture : ${montants(data.valeurStockCloture)}`);

  if (data.produitsSousSeuil.length > 0) {
    doc.moveDown(0.3);
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#b3261e").text("Produits sous le seuil d'alerte :");
    doc.fillColor("#1a1a1a");
    for (const p of data.produitsSousSeuil) {
      doc.font("Helvetica").fontSize(9).text(`• ${p.produit} : ${p.stock} restant(s), seuil ${p.seuil}`);
    }
  }

  if (data.pertesAjustements.length > 0) {
    titreSection(doc, "Pertes et ajustements (avec motif)");
    tableau(
      doc,
      [
        { titre: "Produit", fraction: 0.26 },
        { titre: "Type", fraction: 0.14 },
        { titre: "Qté", fraction: 0.1, align: "right" },
        { titre: "Date", fraction: 0.14 },
        { titre: "Motif", fraction: 0.36 },
      ],
      data.pertesAjustements.map((p) => [p.produit, p.type, String(p.quantite), p.date, p.motif ?? "—"])
    );
  }

  // 6. Annulations
  titreSection(doc, "6. Ventes annulées dans le mois");
  if (data.annulations.length === 0) {
    doc.font("Helvetica-Oblique").fontSize(9).text("Aucune annulation.");
  } else {
    tableau(
      doc,
      [
        { titre: "Reçu", fraction: 0.3 },
        { titre: "Montant", fraction: 0.25, align: "right" },
        { titre: "Date", fraction: 0.15 },
        { titre: "Motif", fraction: 0.3 },
      ],
      data.annulations.map((a) => [a.numeroRecu, montants(a.montant), a.date, a.motif ?? "—"])
    );
  }

  // 7. Concordance
  titreSection(doc, "7. Contrôle de concordance avec le tableau de bord");
  tableau(
    doc,
    [
      { titre: "Indicateur", fraction: 0.34 },
      { titre: "Rapport", fraction: 0.22, align: "right" },
      { titre: "Tableau de bord", fraction: 0.22, align: "right" },
      { titre: "Écart", fraction: 0.12, align: "right" },
      { titre: "", fraction: 0.1, align: "center" },
    ],
    ctx.concordance.map((l) => [
      l.libelle,
      montants(l.rapport),
      montants(l.tableauDeBord),
      montants(l.ecart),
      l.conforme ? "✓" : "⚠",
    ])
  );
  if (ctx.concordance.every((l) => l.conforme)) {
    doc.font("Helvetica").fontSize(8.5).fillColor("#1f4e2c").text("Les chiffres du rapport concordent avec le tableau de bord du même mois.");
  } else {
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#b3261e").text("Écart détecté entre le rapport et le tableau de bord — vérification nécessaire.");
  }

  // 8. Signatures
  signatures(doc, [
    { titre: "Responsable cafétaria", nom: ctx.genereParNom },
    { titre: "Le patron", nom: "" },
  ]);

  // Limites honnêtes
  if (ctx.limites.length > 0) {
    doc.moveDown(0.4);
    doc.font("Helvetica").fontSize(7.5).fillColor("#777777");
    for (const l of ctx.limites) doc.text(`Note : ${l}`);
  }

  if (ctx.provisoire) filigraneProvisoire(doc);
  piedsDePage(doc, empreinte);
  return collecter(doc);
}
