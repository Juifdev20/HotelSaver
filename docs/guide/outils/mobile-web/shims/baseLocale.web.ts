import { PersistanceIndexedDb, type Persistance } from "@hotel-chicago/miroir-local";

/**
 * Remplace apps/mobile/src/stockage/baseLocale.ts (expo-sqlite) : même contrat (une copie locale PAR hôtel), mais la persistance est
 * IndexedDB — celle du bureau (apps/desktop/.../hors-ligne/bases-locales.ts) pour le même paquet miroir-local. Même moteur de
 * synchronisation et mêmes écrans ; seul le stockage de fond change.
 */
export async function ouvrirPersistanceHotel(hotelId: string): Promise<Persistance> {
  return new PersistanceIndexedDb(`hotelsaver-${hotelId}`);
}
