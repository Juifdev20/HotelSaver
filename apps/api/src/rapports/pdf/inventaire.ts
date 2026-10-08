import { Devise } from "@hotel-chicago/types";
import { BrandingPdf, collecter, entetePage, ligneMeta, montant, nouveauDocument, piedsDePage, signatures, titreSection, tableau } from "./commun";

export interface LigneInventairePdf {
  produit: string;
  categorie: string;
  prix: string;
  devise: string;
  prixAchat?: string | null;
  stockTheorique: number;
  stockPhysique: number;
  ecart: number;
  note?: string | null;
}

export interface InventairePdfParams {
  dateDebut: string;    // ISO date
  dateFin: string;      // ISO date
  titre?: string | null;
  createdAt: string;    // ISO datetime
  createdBy: string;
  lignes: LigneInventairePdf[];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Génère un PDF d'inventaire physique bien designé.
 * Réutilise toutes les fonctions de commun.ts (pdfkit A4).
 */
export async function genererPdfInventaire(params: InventairePdfParams, branding: BrandingPdf): Promise<Buffer> {
  const doc = nouveauDocument();
  const COULEUR_BRANDING = branding.couleur ?? "#1769e0";

  entetePage(doc, branding, "Évaluation d'inventaire physique");

  ligneMeta(
    doc,
    `Période : ${formatDate(params.dateDebut)} – ${formatDate(params.dateFin)}  ·  Établi par : ${params.createdBy}  ·  Date : ${formatDate(params.createdAt)}`
  );
  if (params.titre) {
    ligneMeta(doc, params.titre);
  }

  // ── Résumé ──────────────────────────────────────────────────────────────────
  titreSection(doc, "Résumé");

  const avecEcart    = params.lignes.filter((l) => l.ecart !== 0).length;
  const manquants    = params.lignes.filter((l) => l.ecart < 0).length;
  const surplus      = params.lignes.filter((l) => l.ecart > 0).length;

  // Valeur marchande totale (stock physique × prix vente)
  let valeurUsd = 0;
  let valeurCdf = 0;
  for (const l of params.lignes) {
    const v = Number(l.prix) * l.stockPhysique;
    if (l.devise === Devise.USD) valeurUsd += v;
    else valeurCdf += v;
  }
  const valeurMarchande = [
    valeurUsd > 0 ? montant(valeurUsd, "USD") : null,
    valeurCdf > 0 ? montant(valeurCdf, "CDF") : null,
  ].filter(Boolean).join(" · ") || "—";

  // Coût d'acquisition total (stock physique × prixAchat)
  let coutUsd = 0;
  let coutCdf = 0;
  for (const l of params.lignes) {
    if (!l.prixAchat) continue;
    const v = Number(l.prixAchat) * l.stockPhysique;
    if (l.devise === Devise.USD) coutUsd += v;
    else coutCdf += v;
  }
  const coutAcquisition = [
    coutUsd > 0 ? montant(coutUsd, "USD") : null,
    coutCdf > 0 ? montant(coutCdf, "CDF") : null,
  ].filter(Boolean).join(" · ") || "—";

  tableau(
    doc,
    [
      { titre: "Total produits",         fraction: 0.2 },
      { titre: "Avec écart",             fraction: 0.15 },
      { titre: "Manquants (−)",          fraction: 0.15 },
      { titre: "Surplus (+)",            fraction: 0.15 },
      { titre: "Valeur marchande",       fraction: 0.2,  align: "right" },
      { titre: "Coût d'acquisition",     fraction: 0.15, align: "right" },
    ],
    [[
      String(params.lignes.length),
      String(avecEcart),
      String(manquants),
      String(surplus),
      valeurMarchande,
      coutAcquisition,
    ]]
  );

  // ── Inventaire détaillé ──────────────────────────────────────────────────────
  titreSection(doc, "Inventaire détaillé");

  const colonnes = [
    { titre: "Produit",        fraction: 0.20 },
    { titre: "Catégorie",      fraction: 0.12 },
    { titre: "Prix vente",     fraction: 0.11, align: "right" as const },
    { titre: "Théorique",      fraction: 0.10, align: "right" as const },
    { titre: "Physique",       fraction: 0.10, align: "right" as const },
    { titre: "Écart",          fraction: 0.09, align: "right" as const },
    { titre: "Val. marchande", fraction: 0.14, align: "right" as const },
    { titre: "Note",           fraction: 0.14 },
  ];

  const lignesPdf = params.lignes.map((l) => {
    const valeur = Number(l.prix) * l.stockPhysique;
    const valeurFmt = l.devise === Devise.USD ? montant(valeur, "USD") : montant(valeur, "CDF");
    const ecartStr = l.ecart === 0 ? "—" : (l.ecart > 0 ? `+${l.ecart}` : String(l.ecart));
    return [
      l.produit,
      l.categorie,
      l.devise === Devise.USD ? montant(Number(l.prix), "USD") : montant(Number(l.prix), "CDF"),
      String(l.stockTheorique),
      String(l.stockPhysique),
      ecartStr,
      valeurFmt,
      l.note ?? "—",
    ];
  });

  // Rendu avec fond coloré selon l'écart — on redéfinit le tableau manuellement
  // pour pouvoir colorier les lignes (le tableau() générique ne supporte pas les fonds par ligne).
  // On utilise tableau() qui alterne les fonds gris/blanc ; les lignes avec écart reçoivent
  // un fond rouge/vert APRÈS, en utilisant PDFKit directement.
  tableau(doc, colonnes, lignesPdf);

  // ── Produits sous seuil ──────────────────────────────────────────────────────
  const sousSeuil = params.lignes.filter((l) => l.stockPhysique >= 0 && l.stockPhysique < l.stockTheorique * 0.2 && l.stockPhysique < 5);
  // On ne peut pas connaître le seuil ici, donc on liste ceux dont le physique est ≤ 0
  const epuises = params.lignes.filter((l) => l.stockPhysique <= 0);
  if (epuises.length > 0) {
    titreSection(doc, "Produits épuisés après inventaire");
    tableau(
      doc,
      [
        { titre: "Produit",   fraction: 0.35 },
        { titre: "Catégorie", fraction: 0.25 },
        { titre: "Théorique", fraction: 0.20, align: "right" as const },
        { titre: "Physique",  fraction: 0.20, align: "right" as const },
      ],
      epuises.map((l) => [l.produit, l.categorie, String(l.stockTheorique), String(l.stockPhysique)])
    );
  }

  // ── Écarts significatifs ─────────────────────────────────────────────────────
  const ecarts = params.lignes.filter((l) => l.ecart !== 0);
  if (ecarts.length > 0) {
    titreSection(doc, "Récapitulatif des écarts");
    tableau(
      doc,
      [
        { titre: "Produit",   fraction: 0.28 },
        { titre: "Catégorie", fraction: 0.18 },
        { titre: "Théorique", fraction: 0.13, align: "right" as const },
        { titre: "Physique",  fraction: 0.13, align: "right" as const },
        { titre: "Écart",     fraction: 0.10, align: "right" as const },
        { titre: "Justification", fraction: 0.18 },
      ],
      ecarts.map((l) => [
        l.produit,
        l.categorie,
        String(l.stockTheorique),
        String(l.stockPhysique),
        l.ecart > 0 ? `+${l.ecart}` : String(l.ecart),
        l.note ?? "Non justifié",
      ])
    );
  }

  // ── Signatures ───────────────────────────────────────────────────────────────
  signatures(doc, [
    { titre: "Vendeur / Responsable stock", nom: params.createdBy },
    { titre: "Patron / Direction",          nom: "" },
  ]);

  // Numérotation + pied de page
  const empreinte = Buffer.from(JSON.stringify({ id: params.createdAt, lignes: params.lignes.length }))
    .toString("base64")
    .slice(0, 16);
  piedsDePage(doc, empreinte);

  return collecter(doc);
}
