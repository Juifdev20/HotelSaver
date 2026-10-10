import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@hotel-chicago/database";

/** Tout ce qu'un hôtel de test possède : de quoi vérifier qu'un autre hôtel n'y touche jamais. */
export interface JeuHotel {
  prefixe: string;
  hotelId: string;
  /** supabaseAuthId de chaque rôle (le jeton de test est signé avec cette valeur). */
  auth: { patron: string; recep: string; caf: string };
  userIds: { patron: string; recep: string; caf: string };
  chambreId: string;
  chambreNumero: string;
  clientId: string;
  reservationId: string;
  reservationTermineeId: string;
  factureId: string;
  produitId: string;
  platId: string;
  mouvementId: string;
  compteId: string;
  compteReference: string;
  sousCompteId: string;
  ligneId: string;
  compteFermeId: string;
  venteId: string;
  depenseId: string;
  menuItemId: string;
  inventaireId: string;
  notificationId: string;
  rapportId: string;
  jetonSuivi: string;
}

const PALETTE = { claire: { primary: "#123456" }, sombre: { primary: "#654321" } };
const TABLES = [
  "NotificationLue", "AppareilPush", "Notification", "InventairePhysiqueItem", "InventairePhysique", "MenuDuJourItem", "MenuDuJour",
  "RapportMensuel", "Depense", "VenteCafeteria", "LigneCommande", "SousCompte", "CompteCafeteria", "MouvementStock", "Facture",
  "Reservation", "Client", "Chambre", "Produit", "TauxChange", "PaiementLicence", "HotelSite", "HotelBranding", "Utilisateur", "SuperAdmin", "Hotel",
];

export async function viderBase(prisma: PrismaClient): Promise<void> {
  for (const t of TABLES) await prisma.$executeRawUnsafe(`DELETE FROM "${t}"`);
}

/** Crée un hôtel complet : 3 comptes, une chambre, un client, 2 réservations, une facture, de la cafétaria, une dépense… */
export async function creerHotel(prisma: PrismaClient, prefixe: string, over: { sousDomaine?: string; chambreNumero?: string } = {}): Promise<JeuHotel> {
  const p = prisma as any;
  const hotel = await p.hotel.create({
    data: { nom: `Hôtel ${prefixe}`, sousDomaine: over.sousDomaine ?? `hotel-${prefixe.toLowerCase()}`, statutLicence: "ACTIF", cuisineActivee: true, commandeWebActivee: true, branding: { create: { palette: PALETTE } } },
  });
  const hotelId: string = hotel.id;
  const auth = { patron: `${prefixe}-auth-patron`, recep: `${prefixe}-auth-recep`, caf: `${prefixe}-auth-caf` };
  const mk = (role: string, nom: string, a: string) => p.utilisateur.create({ data: { hotelId, nom, role, supabaseAuthId: a, email: `${a}@exemple.test` } });
  const [patron, recep, caf] = await Promise.all([mk("PATRON", `Patron ${prefixe}`, auth.patron), mk("RECEPTIONNISTE", `Recep ${prefixe}`, auth.recep), mk("CAFETARIA", `Caf ${prefixe}`, auth.caf)]);

  const chambreNumero = over.chambreNumero ?? "101";
  const chambre = await p.chambre.create({ data: { hotelId, numero: chambreNumero, type: `Type-${prefixe}`, prixParNuit: 50, devise: "USD" } });
  const chambre2 = await p.chambre.create({ data: { hotelId, numero: "102", type: `Type-${prefixe}`, prixParNuit: 60, devise: "USD" } });
  const client = await p.client.create({ data: { hotelId, nom: `Client-${prefixe}`, telephone: `+2438${prefixe.charCodeAt(0)}000000` } });
  const demain = new Date(Date.now() + 86_400_000), apres = new Date(Date.now() + 3 * 86_400_000);
  const reservation = await p.reservation.create({
    data: { hotelId, chambreId: chambre.id, clientId: client.id, dateArrivee: demain, dateDepart: apres, statut: "CONFIRMEE", origine: "RECEPTION", createdBy: recep.id },
  });
  const hier = new Date(Date.now() - 86_400_000), avantHier = new Date(Date.now() - 3 * 86_400_000);
  const resTerminee = await p.reservation.create({
    data: { hotelId, chambreId: chambre2.id, clientId: client.id, dateArrivee: avantHier, dateDepart: hier, statut: "EN_COURS", origine: "RECEPTION", createdBy: recep.id },
  });
  const facture = await p.facture.create({
    data: { hotelId, reservationId: resTerminee.id, montantChambre: 100, deviseChambre: "USD", montantTotalUSD: 100, modePaiement: "CASH", numeroRecu: "REC-20261001-0001" },
  });
  const produit = await p.produit.create({ data: { hotelId, nom: `Bière-${prefixe}`, categorie: "Boissons", prix: 3, devise: "USD", stockActuel: 20, codeBarres: "1234567890123" } });
  const plat = await p.produit.create({ data: { hotelId, nom: `Plat-${prefixe}`, categorie: "Plats", prix: 8, devise: "USD", typeProduit: "PLAT", commandableEnLigne: true } });
  const mouvement = await p.mouvementStock.create({ data: { hotelId, produitId: produit.id, quantite: 20, type: "ENTREE", createdBy: caf.id } });
  const compte = await p.compteCafeteria.create({ data: { hotelId, tableOuNom: `Table-${prefixe}`, ouvertPar: caf.id } });
  const sousCompte = await p.sousCompte.create({ data: { hotelId, compteId: compte.id, nom: `Personne-${prefixe}` } });
  const ligne = await p.ligneCommande.create({ data: { hotelId, sousCompteId: sousCompte.id, produitId: plat.id, quantite: 1, prixUnitaire: 8, devise: "USD" } });
  const compteFerme = await p.compteCafeteria.create({ data: { hotelId, tableOuNom: `Fermé-${prefixe}`, ouvertPar: caf.id, statut: "FERME", fermeLe: new Date() } });
  const vente = await p.venteCafeteria.create({ data: { hotelId, compteId: compteFerme.id, montantTotalUSD: 8, modePaiement: "CASH", numeroRecu: "REC-20261001-0001", createdBy: caf.id } });
  const depense = await p.depense.create({ data: { hotelId, departement: "CAFETERIA", date: new Date(), motif: `Achat-${prefixe}`, montant: 5, devise: "USD", creeParId: caf.id, creeParNom: `Caf ${prefixe}` } });
  await p.tauxChange.create({ data: { hotelId, cdfParUsd: 2800, definiPar: patron.id } });
  const menu = await p.menuDuJour.create({ data: { hotelId, date: new Date(), createdBy: caf.id } });
  const menuItem = await p.menuDuJourItem.create({ data: { menuId: menu.id, produitId: plat.id } });
  const inventaire = await p.inventairePhysique.create({ data: { hotelId, dateDebut: hier, dateFin: new Date(), titre: `Inv-${prefixe}`, createdBy: caf.id, items: { create: [{ produitId: produit.id, stockTheorique: 20, stockPhysique: 19, ecart: -1 }] } } });
  const notification = await p.notification.create({ data: { hotelId, type: "TEST", titre: `Notif-${prefixe}`, corps: "x", roles: ["PATRON", "RECEPTIONNISTE", "CAFETARIA"], cleDedup: `k-${prefixe}` } });
  const rapport = await p.rapportMensuel.create({
    data: { hotelId, departement: "CAFETERIA", periode: "2026-09", numero: `RAP-${prefixe}-1`, fichier: `${hotelId}/rapport.pdf`, genereParId: patron.id, genereParNom: `Patron ${prefixe}`, chiffres: {}, empreinte: "abc" },
  });

  return {
    prefixe, hotelId, auth,
    userIds: { patron: patron.id, recep: recep.id, caf: caf.id },
    chambreId: chambre.id, chambreNumero, clientId: client.id, reservationId: reservation.id, reservationTermineeId: resTerminee.id, factureId: facture.id,
    produitId: produit.id, platId: plat.id, mouvementId: mouvement.id, compteId: compte.id, compteReference: compte.id, sousCompteId: sousCompte.id, ligneId: ligne.id,
    compteFermeId: compteFerme.id, venteId: vente.id, depenseId: depense.id, menuItemId: menuItem.id, inventaireId: inventaire.id, notificationId: notification.id,
    rapportId: rapport.id, jetonSuivi: reservation.jetonSuivi,
  };
}

/** Tous les identifiants (et marqueurs de texte) qui appartiennent à cet hôtel — ils ne doivent JAMAIS apparaître chez un autre. */
export function marqueurs(j: JeuHotel): string[] {
  const { prefixe: _p, auth: _a, userIds, ...ids } = j;
  return [...Object.values(userIds), ...Object.values(ids).filter((v) => typeof v === "string" && v.length > 20)] as string[];
}

/** Photographie de toutes les lignes d'un hôtel (JSON), pour prouver qu'une requête étrangère n'y a rien changé. */
export async function instantane(prisma: PrismaClient, hotelId: string): Promise<string> {
  const p = prisma as any;
  const tables = ["chambre", "client", "reservation", "facture", "produit", "mouvementStock", "compteCafeteria", "sousCompte", "ligneCommande", "venteCafeteria", "depense", "tauxChange", "utilisateur", "notification", "rapportMensuel", "menuDuJour"];
  const out: Record<string, unknown> = {};
  for (const t of tables) out[t] = await p[t].findMany({ where: { hotelId }, orderBy: { id: "asc" } });
  out.hotel = await p.hotel.findUnique({ where: { id: hotelId } });
  out.menuItems = await p.menuDuJourItem.findMany({ where: { menu: { hotelId } }, orderBy: { id: "asc" } });
  out.inventaireItems = await p.inventairePhysiqueItem.findMany({ where: { inventaire: { hotelId } }, orderBy: { id: "asc" } });
  return JSON.stringify(out, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
}

export const uuid = () => randomUUID();
