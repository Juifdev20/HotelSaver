import { AgregatReception, LigneConcordance } from "../agregats/types";
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

export interface ContexteRapportReception {
  numero: string;
  periode: string;
  plage: string;
  genereParNom: string;
  genereLe: Date;
  provisoire: boolean;
  concordance: LigneConcordance[];
  limites: string[];
}

const LIBELLE_MODE: Record<string, string> = {
  CASH: "Espèces",
  MOBILE_MONEY: "Mobile money",
  FACTURE_CHAMBRE: "Facturé chambre",
};

/** Rapport mensuel Réception → PDF (Buffer). Fonction pure : aucun accès base. */
export async function rendreRapportReception(
  data: AgregatReception,
  ctx: ContexteRapportReception,
  branding: BrandingPdf,
  empreinte: string
): Promise<Buffer> {
  const doc = nouveauDocument();

  entetePage(doc, branding, "Rapport mensuel — Réception");
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
      ["Recette chambres (hors cafétaria liée)", montants(data.recetteChambres)],
      ["Dont ventes cafétaria facturées en chambre", montants(data.dontCafeteriaLiee)],
      ["Factures émises", String(data.nombreFactures)],
      ["Nuitées du mois", String(data.nuitees)],
      ["Taux d'occupation", `${data.tauxOccupationPourcent} %`],
      ["Durée moyenne de séjour", `${data.dureeMoyenneSejourNuits} nuit(s)`],
      ["Prix moyen par nuitée facturée", montants(data.prixMoyenNuitee)],
      ["Revenu par chambre disponible (RevPAR)", montants(data.revenuParChambreDisponible)],
      ["Monnaie rendue aux clients", montants(data.monnaieRendueTotale)],
    ]
  );

  // 2. Factures
  titreSection(doc, "2. Factures du mois");
  if (data.factures.length === 0) {
    doc.font("Helvetica-Oblique").fontSize(9).text("Aucune facture sur la période.");
  } else {
    tableau(
      doc,
      [
        { titre: "Reçu", fraction: 0.16 },
        { titre: "Client", fraction: 0.2 },
        { titre: "Chambre", fraction: 0.09 },
        { titre: "Séjour", fraction: 0.19 },
        { titre: "Total", fraction: 0.16, align: "right" },
        { titre: "Mode", fraction: 0.11 },
        { titre: "Date", fraction: 0.09 },
      ],
      data.factures.map((f) => [
        f.numeroRecu,
        f.client,
        f.chambre,
        f.sejour,
        montants(f.parDevise),
        LIBELLE_MODE[f.modePaiement] ?? f.modePaiement,
        f.date,
      ])
    );
    titreSection(doc, "Totaux par mode de paiement");
    tableau(
      doc,
      [
        { titre: "Mode", fraction: 0.4 },
        { titre: "Factures", fraction: 0.2, align: "right" },
        { titre: "Montant", fraction: 0.4, align: "right" },
      ],
      data.parMode.map((m) => [LIBELLE_MODE[m.mode] ?? m.mode, String(m.nombre), montants(m.parDevise)])
    );
  }

  // 3. Occupation par chambre et par type
  titreSection(doc, "3. Occupation et revenu par chambre");
  tableau(
    doc,
    [
      { titre: "Chambre", fraction: 0.3 },
      { titre: "Type", fraction: 0.3 },
      { titre: "Nuitées", fraction: 0.15, align: "right" },
      { titre: "Revenu (grille)", fraction: 0.25, align: "right" },
    ],
    data.occupationParChambre.map((o) => [o.chambre, o.type, String(o.nuitees), montants(o.revenu)])
  );
  tableau(
    doc,
    [
      { titre: "Type de chambre", fraction: 0.5 },
      { titre: "Nuitées", fraction: 0.2, align: "right" },
      { titre: "Revenu (grille)", fraction: 0.3, align: "right" },
    ],
    data.occupationParType.map((t) => [t.type, String(t.nuitees), montants(t.revenu)])
  );

  // 4. Site public et origine
  titreSection(doc, "4. Demandes du site public et origine des séjours");
  tableau(
    doc,
    [
      { titre: "Indicateur", fraction: 0.6 },
      { titre: "Valeur", fraction: 0.4, align: "right" },
    ],
    [
      ["Demandes reçues via le site", String(data.demandesSite.recues)],
      ["Dont confirmées ou honorées", String(data.demandesSite.confirmees)],
      ["Dont annulées", String(data.demandesSite.annulees)],
      ["Séjours saisis à la réception", String(data.origineReservations.reception)],
      ["Séjours venus du site public", String(data.origineReservations.sitePublic)],
    ]
  );

  // 5. Annulations
  titreSection(doc, "5. Annulations du mois");
  if (data.annulationsReservations.length === 0 && data.annulationsRecus.length === 0) {
    doc.font("Helvetica-Oblique").fontSize(9).text("Aucune annulation.");
  } else {
    if (data.annulationsReservations.length > 0) {
      tableau(
        doc,
        [
          { titre: "Client", fraction: 0.3 },
          { titre: "Chambre", fraction: 0.2 },
          { titre: "Date", fraction: 0.15 },
          { titre: "Motif", fraction: 0.35 },
        ],
        data.annulationsReservations.map((a) => [a.client, a.chambre, a.date, a.motif ?? "—"])
      );
    }
    if (data.annulationsRecus.length > 0) {
      doc.font("Helvetica-Bold").fontSize(9).text("Reçus annulés :");
      tableau(
        doc,
        [
          { titre: "Reçu", fraction: 0.3 },
          { titre: "Montant", fraction: 0.25, align: "right" },
          { titre: "Date", fraction: 0.15 },
          { titre: "Motif", fraction: 0.3 },
        ],
        data.annulationsRecus.map((a) => [a.numeroRecu, montants(a.montant), a.date, a.motif ?? "—"])
      );
    }
  }

  // 6. Séjours en cours à fin de mois
  titreSection(doc, "6. Séjours encore en cours à la fin du mois");
  if (data.sejoursEnCoursFinMois.length === 0) {
    doc.font("Helvetica-Oblique").fontSize(9).text("Aucun séjour en cours.");
  } else {
    tableau(
      doc,
      [
        { titre: "Client", fraction: 0.35 },
        { titre: "Chambre", fraction: 0.2 },
        { titre: "Depuis", fraction: 0.2 },
        { titre: "Acompte", fraction: 0.25, align: "right" },
      ],
      data.sejoursEnCoursFinMois.map((s) => [s.client, s.chambre, s.depuis, montants(s.acompte)])
    );
    doc.font("Helvetica-Bold").fontSize(9).text(`Acomptes sur séjours en cours : ${montants(data.acomptesEnCours)}`);
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
    { titre: "Le/La réceptionniste", nom: ctx.genereParNom },
    { titre: "Le patron", nom: "" },
  ]);

  if (ctx.limites.length > 0) {
    doc.moveDown(0.4);
    doc.font("Helvetica").fontSize(7.5).fillColor("#777777");
    for (const l of ctx.limites) doc.text(`Note : ${l}`);
  }

  if (ctx.provisoire) filigraneProvisoire(doc);
  piedsDePage(doc, empreinte);
  return collecter(doc);
}
