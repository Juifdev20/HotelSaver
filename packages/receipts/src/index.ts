export type { LigneRecu } from "./types";
export { construireRecuFacture, construireRecuVente, enteteHotel } from "./construire-recu";
export type { EnteteHotel } from "./construire-recu";
export { genererCommandesEscPos, commandesCodeBarre } from "./esc-pos";
export {
  cleControleEan13,
  estEan13Valide,
  genererEan13Interne,
  normaliserCodeBarres,
  trouverProduitParCode,
  DetecteurRafale,
  construireEtiquette,
} from "./code-barres";
