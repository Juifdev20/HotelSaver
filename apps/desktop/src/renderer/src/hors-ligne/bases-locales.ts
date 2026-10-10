import { MagasinDocuments, PersistanceIndexedDb, StockageDocuments, supprimerBaseIndexedDb } from "@hotel-chicago/miroir-local";

const PREFIXE = "hotelsaver-";
const CLE_DERNIER_HOTEL = "hotelsaver:dernier-hotel";

/** Une base locale PAR hôtel : deux hôtels sur un même poste ne se mélangent jamais. */
export const nomBaseHotel = (hotelId: string) => `${PREFIXE}${hotelId}`;

/**
 * Quand un autre hôtel se connecte sur ce poste, la copie locale de l'hôtel précédent est effacée — mais SEULEMENT si tout ce qu'il
 * avait fait a été envoyé. Sinon elle reste (rien n'est jamais perdu) et repartira à la prochaine connexion de cet hôtel.
 */
export async function purgerAncienHotel(hotelIdCourant: string): Promise<void> {
  try {
    const precedent = localStorage.getItem(CLE_DERNIER_HOTEL);
    localStorage.setItem(CLE_DERNIER_HOTEL, hotelIdCourant);
    if (!precedent || precedent === hotelIdCourant) return;
    const magasin = new MagasinDocuments(new PersistanceIndexedDb(nomBaseHotel(precedent)));
    await magasin.ouvrir();
    const enAttente = (await new StockageDocuments(magasin).listerFileAttente()).length;
    magasin.fermer();
    if (enAttente === 0) await supprimerBaseIndexedDb(nomBaseHotel(precedent));
  } catch {
    // Nettoyage de confort : jamais bloquant.
  }
}
