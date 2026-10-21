/**
 * Fabrique le cahier de tests HotelSaver au format Word (.docx), aux couleurs de la marque.
 *   node docs/cahier-tests/construire.cjs   → docs/cahier-tests/sortie/Cahier-de-tests-HotelSaver.docx
 * Le contenu (modules, cas de test, étapes) est dans contenu.cjs.
 */
const fs = require("node:fs");
const path = require("node:path");
const {
  AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, ImageRun, LevelFormat, Packer, PageBreak, PageNumber,
  Paragraph, ShadingType, Tab, Table, TableCell, TabStopType, TableRow, TextRun, VerticalAlign, WidthType,
} = require("docx");
const { presentation, modules, pointsAttention, avis } = require("./contenu.cjs");

const VERSION = "1.0.4";
const DATE = "Octobre 2026";
const COULEUR = { navy: "053483", bleu: "1769E0", or: "F5B400", encre: "0F172A", gris: "64748B", clair: "EAF2FE", trait: "C9D8F0", creme: "FFF8E1", pale: "F7F9FC" };
const POLICE = "Inter";
const LARGEUR = 9906; // A4 (11906) moins deux marges de 1000
const LOGO = fs.readFileSync(path.join(__dirname, "../../apps/web/public/logo-hotelsaver.png"));

/* ------------------------------------------------------------------ petits blocs */
/** Espaces insécables autour des guillemets français : « et » ne se retrouvent jamais seuls en début ou fin de ligne. */
const insecable = (texte) => texte.replace(/« /g, "«\u00A0").replace(/ »/g, "\u00A0»").replace(/ ([:;!?])/g, "\u00A0$1");
const t = (texte, o = {}) => new TextRun({ text: insecable(texte), font: POLICE, ...o });
/** Saut vers le taquet de droite du paragraphe (voir `taquetDroite`), suivi d'un texte. */
const versLaDroite = (texte = "", o = {}) => new TextRun({ font: POLICE, ...o, children: [new Tab(), insecable(texte)] });
/** Taquet à la marge droite, avec ou sans pointillés (compris par Word, LibreOffice et Google Docs). */
const taquetDroite = (pointilles = false) => [{ type: TabStopType.RIGHT, position: LARGEUR, ...(pointilles ? { leader: "dot" } : {}) }];
/** Texte avec **gras** léger : « a **b** c ». */
const riche = (texte, o = {}) => texte.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((m) => (m.startsWith("**") ? t(m.slice(2, -2), { bold: true, ...o }) : t(m, o)));
const p = (texte, o = {}) => new Paragraph({ spacing: { after: 120, line: 276 }, ...o, children: typeof texte === "string" ? riche(texte, { size: 21, color: COULEUR.encre }) : texte });
const titre1 = (texte) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [t(texte)] });
const titre2 = (texte) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [t(texte)] });
const titre3 = (texte) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [t(texte)] });
const puce = (texte) => new Paragraph({ numbering: { reference: "puces", level: 0 }, spacing: { after: 60 }, children: riche(texte, { size: 21 }) });
const numero = (texte, ref) => new Paragraph({ numbering: { reference: ref, level: 0 }, spacing: { after: 60 }, children: riche(texte, { size: 21 }) });
const saut = () => new Paragraph({ children: [new PageBreak()] });
const bord = (couleur = COULEUR.trait, taille = 4) => ({ style: BorderStyle.SINGLE, size: taille, color: couleur });
const bords = (couleur) => ({ top: bord(couleur), bottom: bord(couleur), left: bord(couleur), right: bord(couleur) });

function cellule(contenu, largeur, { entete = false, fond, gras = false, couleur, hauteurMin } = {}) {
  const paragraphes = (Array.isArray(contenu) ? contenu : [contenu]).map((x) =>
    x instanceof Paragraph ? x : new Paragraph({ spacing: { before: 40, after: 40 }, children: riche(String(x ?? ""), { size: entete ? 19 : 19, bold: entete || gras, color: entete ? "FFFFFF" : couleur ?? COULEUR.encre }) })
  );
  return new TableCell({
    width: { size: largeur, type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, color: "auto", fill: entete ? COULEUR.navy : fond ?? "FFFFFF" },
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    verticalAlign: VerticalAlign.TOP,
    borders: bords(COULEUR.trait),
    children: paragraphes,
  });
}

/** Tableau : en-tête bleu marine, lignes alternées. `hauteurMin` (dxa) laisse la place d'écrire. */
function tableau(entetes, lignes, largeurs, { hauteurMin, colonneGrasse = -1 } = {}) {
  return new Table({
    width: { size: LARGEUR, type: WidthType.DXA },
    columnWidths: largeurs,
    rows: [
      new TableRow({ tableHeader: true, children: entetes.map((e, i) => cellule(e, largeurs[i], { entete: true })) }),
      ...lignes.map(
        (ligne, r) =>
          new TableRow({
            height: hauteurMin ? { value: hauteurMin, rule: "atLeast" } : undefined,
            cantSplit: true,
            children: ligne.map((c, i) => cellule(c, largeurs[i], { fond: r % 2 ? COULEUR.pale : "FFFFFF", gras: i === colonneGrasse })),
          })
      ),
    ],
  });
}

/** Encadré coloré (note, attention). */
function encadre(texte, { fond = COULEUR.creme, trait = COULEUR.or } = {}) {
  return new Paragraph({
    spacing: { before: 60, after: 120 },
    shading: { type: ShadingType.CLEAR, color: "auto", fill: fond },
    border: { left: { style: BorderStyle.SINGLE, size: 24, color: trait, space: 8 } },
    indent: { left: 120, right: 120 },
    children: riche(texte, { size: 20 }),
  });
}

/** Ligne à remplir : libellé puis pointillés jusqu'à la marge droite. */
const ligneARemplir = (libelle = "") =>
  new Paragraph({
    spacing: { before: 120, after: 40 },
    tabStops: taquetDroite(true),
    children: [
      t(libelle, { size: 20, bold: Boolean(libelle), color: COULEUR.navy }),
      versLaDroite("", { size: 20, color: COULEUR.gris }),
    ],
  });

const verdict = () => [
  new Paragraph({
    spacing: { before: 100, after: 0 },
    children: [t("Verdict du cas :   ", { bold: true, size: 20, color: COULEUR.navy }), t("☐ Réussi      ☐ Échoué      ☐ Bloqué", { size: 20 })],
  }),
  ligneARemplir("Commentaire : "),
  new Paragraph({ spacing: { after: 200 }, children: [] }),
];

/* ------------------------------------------------------------------ page de garde */
function pageDeGarde() {
  const fiche = [
    ["Nom et prénom du testeur", ""],
    ["Téléphone / WhatsApp", ""],
    ["Rôle(s) testé(s)", "☐ Patron   ☐ Réception   ☐ Cafétaria   ☐ Site de l'hôtel   ☐ Super-admin"],
    ["Appareil (marque, modèle)", ""],
    ["Système", "☐ Android (version : ……)   ☐ Windows   ☐ Navigateur : ……"],
    ["Version de l'application", `………… (attendue : ${VERSION})`],
    ["Environnement", "☐ Test   ☐ Prod"],
    ["Hôtel de test (sous-domaine)", ""],
    ["Dates des tests", "du ……/……/2026 au ……/……/2026"],
  ];
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 600, after: 200 }, children: [new ImageRun({ type: "png", data: LOGO, transformation: { width: 110, height: 110 } })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [t("Hotel", { bold: true, size: 44, color: COULEUR.navy }), t("Saver", { bold: true, size: 44, color: COULEUR.bleu })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [t("Cahier de tests", { bold: true, size: 56, color: COULEUR.encre })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [t("Tests de manipulation de l'application, module par module", { size: 24, color: COULEUR.gris })] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 480 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: COULEUR.or, space: 12 } },
      children: [t(`Version ${VERSION} · ${DATE}`, { size: 22, bold: true, color: COULEUR.bleu })],
    }),
    titre3("Fiche du testeur"),
    new Table({
      width: { size: LARGEUR, type: WidthType.DXA },
      columnWidths: [3200, 6706],
      rows: fiche.map(([libelle, valeur]) => new TableRow({ height: { value: 460, rule: "atLeast" }, children: [cellule(libelle, 3200, { fond: COULEUR.clair, gras: true, couleur: COULEUR.navy }), cellule(valeur, 6706)] })),
    }),
    p(""),
    encadre("Merci de votre aide ! Suivez les tests dans l'ordre, remplissez la colonne **Observation** et le **verdict** de chaque cas, puis donnez votre avis à la fin du cahier. Renvoyez le document rempli (Word ou photo des pages) à l'équipe HotelSaver.", { fond: COULEUR.clair, trait: COULEUR.bleu }),
  ];
}

/* ------------------------------------------------------------------ présentation */
function partiePresentation(numerotation) {
  const blocs = [saut(), titre1("À quoi sert HotelSaver"), ...presentation.resume.map((x) => p(x))];
  blocs.push(titre2("Les applications"));
  blocs.push(tableau(["Application", "Pour qui", "Rôle"], presentation.plateformes, [2400, 3400, 4106], { colonneGrasse: 0 }));
  blocs.push(titre2("Les rôles dans un hôtel"));
  blocs.push(tableau(["Rôle", "Qui", "Ce qu'il fait"], presentation.roles, [1700, 2100, 6106], { colonneGrasse: 0 }));
  blocs.push(titre2("Ce que l'application doit permettre"));
  blocs.push(tableau(["Fonctionnalité", "Où", "Qui"], presentation.doit, [4300, 3406, 2200]));
  blocs.push(titre2("Ce qu'elle ne doit PAS permettre"));
  blocs.push(...presentation.nePasDoit.map(puce));
  blocs.push(titre2("Prérequis"));
  blocs.push(...presentation.prerequis.map((x) => numero(x, "prerequis")));
  blocs.push(titre2("Comment remplir les tableaux"));
  blocs.push(...presentation.remplir.map(puce));
  blocs.push(titre2("Sommaire des modules"));
  blocs.push(tableau(["Module", "Pour qui", "Cas de test"], numerotation.map((m) => [`${m.n}. ${m.titre}`, m.role, `${m.premier} à ${m.dernier}`]), [4700, 3206, 2000], { colonneGrasse: 0 }));
  blocs.push(titre2("Points d'attention"));
  blocs.push(tableau(["Sujet", "À savoir"], pointsAttention, [2600, 7306], { colonneGrasse: 0 }));
  return blocs;
}

/* ------------------------------------------------------------------ modules */
const tc = (n) => `TC-${String(n).padStart(2, "0")}`;

function partieModules() {
  const blocs = [];
  const numerotation = [];
  let n = 0;
  modules.forEach((m, i) => {
    const premier = tc(n + 1);
    blocs.push(saut(), titre1(`Module ${i + 1} — ${m.titre}`));
    blocs.push(new Paragraph({ spacing: { after: 120 }, children: [t("Pour qui : ", { bold: true, size: 21, color: COULEUR.bleu }), t(m.role, { size: 21 })] }));
    blocs.push(titre3("À quoi sert ce module"), p(m.sert));
    if (m.doit) blocs.push(titre3("Ce qu'il doit pouvoir faire"), tableau(["Fonctionnalité", "Où"], m.doit, [5400, 4506]));
    if (m.nePas) blocs.push(titre3("Ce qu'il ne doit PAS pouvoir faire"), ...m.nePas.map(puce));
    for (const c of m.cas) {
      n += 1;
      blocs.push(titre2(`${tc(n)} — ${c.titre}`));
      if (c.note) blocs.push(encadre(c.note));
      blocs.push(tableau(["Étape", "Action", "Résultat attendu", "Observation"], c.etapes.map(([action, attendu], k) => [String(k + 1), action, attendu, ""]), [820, 3150, 3250, 2686], { hauteurMin: 560 }));
      blocs.push(...verdict());
    }
    numerotation.push({ n: i + 1, titre: m.titre, role: m.role, premier, dernier: tc(n) });
  });
  return { blocs, numerotation, total: n };
}

/* ------------------------------------------------------------------ bilan et avis */
function partieAvis(numerotation) {
  const notes = "☐ 1   ☐ 2   ☐ 3   ☐ 4   ☐ 5";
  return [
    saut(),
    titre1("Bilan des tests"),
    p("Reportez ici le nombre de cas réussis, échoués et bloqués pour chaque module."),
    tableau(["Module", "Cas", "Réussis", "Échoués", "Bloqués"], numerotation.map((m) => [`${m.n}. ${m.titre}`, `${m.premier} à ${m.dernier}`, "", "", ""]), [4200, 2006, 1200, 1250, 1250], { hauteurMin: 420 }),
    titre1("Votre avis"),
    p("Notez chaque point de 1 (très mauvais) à 5 (excellent), et dites-nous pourquoi."),
    tableau(["Critère", "Note", "Pourquoi ?"], avis.map((a) => [a, notes, ""]), [3000, 2900, 4006], { hauteurMin: 620, colonneGrasse: 0 }),
    titre3("Ce qui vous a le plus plu"),
    ligneARemplir(), ligneARemplir(), ligneARemplir(),
    titre3("Ce qui vous a gêné ou bloqué"),
    ligneARemplir(), ligneARemplir(), ligneARemplir(),
    titre3("Ce qui manque à l'application pour votre hôtel"),
    ligneARemplir(), ligneARemplir(), ligneARemplir(),
    titre3("Recommanderiez-vous HotelSaver à un autre hôtel ?"),
    p("☐ Oui, sans hésiter      ☐ Oui, après corrections      ☐ Non"),
    ligneARemplir("Pourquoi : "),
    p(""),
    new Table({
      width: { size: LARGEUR, type: WidthType.DXA },
      columnWidths: [4953, 4953],
      rows: [new TableRow({ height: { value: 1100, rule: "atLeast" }, children: [cellule(["Date :", "", "Signature du testeur :"], 4953, { fond: COULEUR.pale }), cellule(["Reçu par l'équipe HotelSaver le :", "", "Par :"], 4953, { fond: COULEUR.pale })] })],
    }),
  ];
}

/* ------------------------------------------------------------------ en-tête, pied, styles */
const entete = new Header({
  children: [
    new Paragraph({
      tabStops: taquetDroite(),
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: COULEUR.or, space: 6 } },
      children: [
        new ImageRun({ type: "png", data: LOGO, transformation: { width: 22, height: 22 } }),
        t("  HotelSaver", { bold: true, size: 20, color: COULEUR.navy }),
        versLaDroite(`Cahier de tests · version ${VERSION}`, { size: 17, color: COULEUR.gris }),
      ],
    }),
  ],
});
const pied = new Footer({
  children: [
    new Paragraph({
      tabStops: taquetDroite(),
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: COULEUR.trait, space: 6 } },
      children: [
        new ImageRun({ type: "png", data: LOGO, transformation: { width: 12, height: 12 } }),
        t("  Copyright © 2026 HotelSaver. Tous droits réservés.", { size: 16, color: COULEUR.gris }),
        versLaDroite("Page ", { size: 16, color: COULEUR.gris }),
        new TextRun({ font: POLICE, size: 16, bold: true, color: COULEUR.navy, children: [PageNumber.CURRENT] }),
        new TextRun({ font: POLICE, size: 16, color: COULEUR.gris, children: [" / ", PageNumber.TOTAL_PAGES] }),
      ],
    }),
  ],
});

const styleTitre = (id, nom, taille, couleur, avant, apres, bordure) => ({
  id, name: nom, basedOn: "Normal", next: "Normal", quickFormat: true,
  run: { font: POLICE, size: taille, bold: true, color: couleur },
  paragraph: { spacing: { before: avant, after: apres }, keepNext: true, keepLines: true, outlineLevel: Number(id.slice(-1)) - 1, ...(bordure ? { border: bordure } : {}) },
});

/* ------------------------------------------------------------------ assemblage */
const { blocs: blocsModules, numerotation, total } = partieModules();
const doc = new Document({
  creator: "HotelSaver",
  title: "Cahier de tests HotelSaver",
  description: `Cahier de tests de l'application HotelSaver, version ${VERSION}`,
  styles: {
    default: { document: { run: { font: POLICE, size: 21, color: COULEUR.encre } } },
    paragraphStyles: [
      styleTitre("Heading1", "Heading 1", 34, COULEUR.navy, 120, 200, { bottom: { style: BorderStyle.SINGLE, size: 12, color: COULEUR.or, space: 6 } }),
      styleTitre("Heading2", "Heading 2", 25, COULEUR.bleu, 280, 120),
      styleTitre("Heading3", "Heading 3", 22, COULEUR.navy, 200, 80),
    ],
  },
  numbering: {
    config: [
      { reference: "puces", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } }, run: { color: COULEUR.or } } }] },
      { reference: "prerequis", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 340 } }, run: { bold: true, color: COULEUR.bleu } } }] },
    ],
  },
  sections: [
    {
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1300, bottom: 1100, left: 1000, right: 1000, header: 500, footer: 500 } } },
      headers: { default: entete },
      footers: { default: pied },
      children: [...pageDeGarde(), ...partiePresentation(numerotation), ...blocsModules, ...partieAvis(numerotation)],
    },
  ],
});

const sortie = path.join(__dirname, "sortie");
fs.mkdirSync(sortie, { recursive: true });
Packer.toBuffer(doc).then((tampon) => {
  const fichier = path.join(sortie, "Cahier-de-tests-HotelSaver.docx");
  fs.writeFileSync(fichier, tampon);
  console.log(`${fichier} : ${modules.length} modules, ${total} cas de test`);
});
