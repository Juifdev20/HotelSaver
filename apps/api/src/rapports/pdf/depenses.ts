import { ParDevise } from "../agregats/types";
import { AgregatDepenses, soldeNet } from "../agregats/depenses";
import {
  BrandingPdf,
  collecter,
  entetePage,
  ligneMeta,
  montant,
  montants,
  nouveauDocument,
  piedsDePage,
  tableau,
  titreSection,
} from "./commun";

export interface LigneDepensePdf {
  /** « JJ/MM/AAAA ». */
  date: string;
  motif: string;
  montant: number;
  devise: "USD" | "CDF";
  auteur: string;
  departement: "RECEPTION" | "CAFETERIA";
}

export interface ContexteDepensesPdf {
  /** « du 01/10/2026 au 31/10/2026 ». */
  plage: string;
  /** null = les deux départements (export du patron). */
  departement: "RECEPTION" | "CAFETERIA" | null;
  genereParNom: string;
  genereLe: Date;
}

const LIBELLE_DEPARTEMENT = { RECEPTION: "Réception", CAFETERIA: "Cafétaria" } as const;

function totalDe(lignes: LigneDepensePdf[]): ParDevise {
  const t = { usd: 0, cdf: 0 };
  for (const l of lignes) t[l.devise === "USD" ? "usd" : "cdf"] += l.montant;
  return { usd: Math.round(t.usd * 100) / 100, cdf: Math.round(t.cdf * 100) / 100 };
}

/**
 * Liste des dépenses d'une période → PDF (Buffer). Fonction pure : aucun
 * accès base. Lignes déjà triées par date et sans les dépenses annulées.
 * Un sous-total par jour, puis les totaux USD et CDF (jamais convertis).
 */
export async function rendreDepenses(
  lignes: LigneDepensePdf[],
  ctx: ContexteDepensesPdf,
  branding: BrandingPdf,
  empreinte: string
): Promise<Buffer> {
  const doc = nouveauDocument();
  const titre = ctx.departement ? `Dépenses — ${LIBELLE_DEPARTEMENT[ctx.departement]}` : "Dépenses — Réception et Cafétaria";

  entetePage(doc, branding, titre);
  ligneMeta(doc, `Période ${ctx.plage}`);
  ligneMeta(
    doc,
    `Généré par ${ctx.genereParNom} le ${ctx.genereLe.toLocaleDateString("fr-FR")} à ${ctx.genereLe.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`
  );

  titreSection(doc, "Synthèse");
  const synthese: string[][] = [
    ["Nombre de dépenses", String(lignes.length)],
    ["Total de la période", montants(totalDe(lignes))],
  ];
  if (!ctx.departement) {
    for (const d of ["RECEPTION", "CAFETERIA"] as const) {
      synthese.push([`Dont ${LIBELLE_DEPARTEMENT[d]}`, montants(totalDe(lignes.filter((l) => l.departement === d)))]);
    }
  }
  tableau(
    doc,
    [
      { titre: "Indicateur", fraction: 0.55 },
      { titre: "Valeur", fraction: 0.45, align: "right" },
    ],
    synthese
  );

  titreSection(doc, "Détail par jour");
  if (lignes.length === 0) {
    doc.font("Helvetica-Oblique").fontSize(9).text("Aucune dépense sur la période.");
  } else {
    const colonnes = ctx.departement
      ? [
          { titre: "Date", fraction: 0.14 },
          { titre: "Motif", fraction: 0.5 },
          { titre: "Montant", fraction: 0.16, align: "right" as const },
          { titre: "Saisi par", fraction: 0.2 },
        ]
      : [
          { titre: "Date", fraction: 0.13 },
          { titre: "Département", fraction: 0.14 },
          { titre: "Motif", fraction: 0.39 },
          { titre: "Montant", fraction: 0.16, align: "right" as const },
          { titre: "Saisi par", fraction: 0.18 },
        ];
    const tableauLignes: string[][] = [];
    const parJour = new Map<string, LigneDepensePdf[]>();
    for (const l of lignes) parJour.set(l.date, [...(parJour.get(l.date) ?? []), l]);
    for (const [jour, duJour] of parJour) {
      for (const l of duJour) {
        const cellules = [l.date, l.motif, montant(l.montant, l.devise), l.auteur];
        if (!ctx.departement) cellules.splice(1, 0, LIBELLE_DEPARTEMENT[l.departement]);
        tableauLignes.push(cellules);
      }
      const sousTotal = [`Total du ${jour}`, "", montants(totalDe(duJour)), ""];
      if (!ctx.departement) sousTotal.splice(1, 0, "");
      tableauLignes.push(sousTotal);
    }
    tableau(doc, colonnes, tableauLignes);
  }

  piedsDePage(doc, empreinte);
  return collecter(doc);
}

/** Section « Dépenses du mois et solde net » des rapports mensuels
 * (réception, cafétaria) : détail des dépenses non annulées du département,
 * puis recettes − dépenses par devise. */
export function sectionDepenses(
  doc: PDFKit.PDFDocument,
  titre: string,
  depenses: AgregatDepenses,
  recettes: { libelle: string; montant: ParDevise }
): void {
  titreSection(doc, titre);
  if (depenses.lignes.length === 0) {
    doc.font("Helvetica-Oblique").fontSize(9).text("Aucune dépense enregistrée sur la période.");
    doc.moveDown(0.4);
  } else {
    tableau(
      doc,
      [
        { titre: "Date", fraction: 0.14 },
        { titre: "Motif", fraction: 0.5 },
        { titre: "Montant", fraction: 0.16, align: "right" },
        { titre: "Saisi par", fraction: 0.2 },
      ],
      depenses.lignes.map((l) => [l.date, l.motif, montant(l.montant, l.devise), l.auteur])
    );
  }
  tableau(
    doc,
    [
      { titre: "Solde du mois", fraction: 0.55 },
      { titre: "Montant", fraction: 0.45, align: "right" },
    ],
    [
      [recettes.libelle, montants(recettes.montant)],
      [`Dépenses (${depenses.nombre})`, montants(depenses.total)],
      ["Solde net (recettes − dépenses)", montantsSignes(soldeNet(recettes.montant, depenses.total))],
    ]
  );
}

/** Comme `montants`, mais garde les soldes nuls et négatifs visibles. */
function montantsSignes(p: ParDevise): string {
  const morceaux: string[] = [];
  if (p.usd) morceaux.push(montant(p.usd, "USD"));
  if (p.cdf) morceaux.push(montant(p.cdf, "CDF"));
  return morceaux.length ? morceaux.join(" · ") : "0";
}
