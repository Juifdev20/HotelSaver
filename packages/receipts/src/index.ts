export type { LigneRecu } from "./types";
export { construireRecuFacture, construireRecuVente, construireTicketDeTest, enteteHotel, SIGNATURE_TICKET } from "./construire-recu";
export type { EnteteHotel, OptionsRecu } from "./construire-recu";
export { genererCommandesEscPos, commandesCodeBarre, nettoyerTexteImpression } from "./esc-pos";
export {
  cleControleEan13,
  estEan13Valide,
  genererEan13Interne,
  normaliserCodeBarres,
  trouverProduitParCode,
  DetecteurRafale,
  construireEtiquette,
} from "./code-barres";
export { proposerImprimantes, extrairePortsSerie, libelleErreurSpouleur, ressembleAImprimante, COLONNES_PAR_LARGEUR } from "./detection-imprimantes";
export type { LargeurPapier, ImprimanteProposee, InfoImprimanteSysteme, PortSerie } from "./detection-imprimantes";
