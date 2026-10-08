import { LigneRecu } from "./types";
import { estEan13Valide } from "./code-barres";

// Commandes ESC/POS de base (voir la doc Epson ESC/POS, standard repris par
// la quasi-totalité des imprimantes thermiques génériques).
const INITIALISER = [0x1b, 0x40]; // ESC @
const ALIGNER_GAUCHE = [0x1b, 0x61, 0x00]; // ESC a 0
const ALIGNER_CENTRE = [0x1b, 0x61, 0x01]; // ESC a 1
const GRAS_ON = [0x1b, 0x45, 0x01]; // ESC E 1
const GRAS_OFF = [0x1b, 0x45, 0x00]; // ESC E 0
const SAUT_LIGNE = [0x0a];
const COUPER_PAPIER = [0x1d, 0x56, 0x01]; // GS V 1 (coupe partielle — la plus largement supportée)
// ESC t 2 : sélectionne la table de caractères CP850 (Multilingue Latin-1),
// supportée par la plupart des contrôleurs génériques — à vérifier sur
// l'imprimante réelle, les clones bon marché varient. Sans ça, les accents
// français s'impriment souvent comme des caractères aléatoires.
const TABLE_CARACTERES_CP850 = [0x1b, 0x74, 0x02];

/** Une imprimante 58mm classique tient ~32 caractères par ligne en police A. */
const LARGEUR_PAR_DEFAUT = 32;

// Accents français les plus courants → leur octet CP850. Tout caractère non
// listé (au-delà de l'ASCII de base) est remplacé par son équivalent sans
// accent plutôt que d'envoyer un octet UTF-8 qui s'imprimerait n'importe
// comment sur un contrôleur ESC/POS mono-octet.
const CP850: Record<string, number> = {
  é: 0x82, è: 0x8a, ê: 0x88, ë: 0x89,
  à: 0x85, â: 0x83, ä: 0x84,
  ù: 0x97, û: 0x96, ü: 0x81,
  î: 0x8c, ï: 0x8b, ô: 0x93, ö: 0x94, ç: 0x87,
  É: 0x90, È: 0xd4, Ê: 0xd2, Ë: 0xd3,
  À: 0xb7, Â: 0xb6, Ç: 0x80,
  Ù: 0xeb, Û: 0xea, Î: 0xd7, Ï: 0xd8, Ô: 0xe2,
  "°": 0xf8,
};

const SANS_ACCENT: Record<string, string> = {
  é: "e", è: "e", ê: "e", ë: "e", à: "a", â: "a", ä: "a",
  ù: "u", û: "u", ü: "u", î: "i", ï: "i", ô: "o", ö: "o", ç: "c",
  É: "E", È: "E", Ê: "E", Ë: "E", À: "A", Â: "A", Ç: "C",
  Ù: "U", Û: "U", Î: "I", Ï: "I", Ô: "O",
};

function encoderTexte(texte: string): number[] {
  const octets: number[] = [];
  for (const caractere of texte) {
    if (caractere in CP850) {
      octets.push(CP850[caractere]);
    } else if (caractere.charCodeAt(0) < 128) {
      octets.push(caractere.charCodeAt(0));
    } else {
      // Caractère non listé (ex. « ñ », « å » dans un nom d'hôtel) : sa lettre de base, sinon « ? ».
      const base = caractere.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const remplacement = SANS_ACCENT[caractere] ?? (/^[\x20-\x7e]+$/.test(base) ? base : "?");
      for (const c of remplacement) octets.push(c.charCodeAt(0));
    }
  }
  return octets;
}

function ligneMontant(libelle: string, valeur: string, largeur: number): number[] {
  const espaces = Math.max(1, largeur - libelle.length - valeur.length);
  return encoderTexte(libelle + " ".repeat(espaces) + valeur);
}

/**
 * Code-barres dessiné par l'imprimante elle-même (aucune image) : centré,
 * hauteur 80 points (GS h), module de 2 (GS w), chiffres sous les barres
 * (GS H 2). EAN-13 (GS k 67 13 …) quand le code est un EAN-13 valide, sinon
 * Code128 jeu B (GS k 73 n « {B » …) qui accepte lettres et chiffres.
 * Exporté pour le desktop, qui ajoute ces mêmes octets à node-thermal-printer.
 */
export function commandesCodeBarre(valeur: string): number[] {
  const octets = [...ALIGNER_CENTRE, 0x1d, 0x68, 80, 0x1d, 0x77, 0x02, 0x1d, 0x48, 0x02];
  if (estEan13Valide(valeur)) {
    octets.push(0x1d, 0x6b, 67, 13, ...Array.from(valeur, (c) => c.charCodeAt(0)));
  } else {
    const donnees = [0x7b, 0x42, ...Array.from(valeur.slice(0, 32), (c) => c.charCodeAt(0) & 0x7f)];
    octets.push(0x1d, 0x6b, 73, donnees.length, ...donnees);
  }
  octets.push(...SAUT_LIGNE, ...ALIGNER_GAUCHE);
  return octets;
}

/**
 * Traduit un reçu (voir `construire-recu.ts`) en commandes ESC/POS brutes,
 * à envoyer telles quelles sur la connexion Bluetooth SPP (mobile — voir
 * `apps/mobile/src/impression`). Desktop n'utilise pas cette fonction :
 * `node-thermal-printer` a sa propre API haut niveau, alimentée directement
 * par les mêmes `LigneRecu[]`.
 */
export function genererCommandesEscPos(lignes: LigneRecu[], largeurColonnes = LARGEUR_PAR_DEFAUT): Uint8Array {
  const octets: number[] = [...INITIALISER, ...TABLE_CARACTERES_CP850];

  for (const ligne of lignes) {
    switch (ligne.type) {
      case "titre":
        octets.push(...ALIGNER_CENTRE, ...GRAS_ON, ...encoderTexte(ligne.texte), ...GRAS_OFF, ...ALIGNER_GAUCHE, ...SAUT_LIGNE);
        break;
      case "soustitre":
        octets.push(...ALIGNER_CENTRE, ...encoderTexte(ligne.texte), ...ALIGNER_GAUCHE, ...SAUT_LIGNE);
        break;
      case "separateur":
        octets.push(...encoderTexte("-".repeat(largeurColonnes)), ...SAUT_LIGNE);
        break;
      case "champ":
        octets.push(...encoderTexte(`${ligne.label} : ${ligne.valeur}`), ...SAUT_LIGNE);
        break;
      case "montant":
        octets.push(...ligneMontant(ligne.libelle, ligne.valeur, largeurColonnes), ...SAUT_LIGNE);
        break;
      case "codebarre":
        octets.push(...commandesCodeBarre(ligne.valeur));
        break;
    }
  }

  octets.push(...SAUT_LIGNE, ...SAUT_LIGNE, ...COUPER_PAPIER);
  return new Uint8Array(octets);
}
