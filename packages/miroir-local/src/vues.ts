/**
 * Reconstitue, à partir des lignes brutes du miroir, les MÊMES formes que renvoie l'API (réservation avec sa chambre, son client
 * et sa facture ; compte avec ses personnes et leurs lignes…). Les écrans ne savent pas s'ils parlent au serveur ou au miroir.
 */
import type { StockageDocuments } from "./stockage-documents";

type Ligne = Record<string, any>;

const parDate = (champ: string, sens: 1 | -1 = 1) => (a: Ligne, b: Ligne) => sens * String(a[champ] ?? "").localeCompare(String(b[champ] ?? ""));

export class Vues {
  constructor(private readonly s: StockageDocuments) {}

  chambre(id: string): Ligne | undefined {
    return this.s.obtenir("Chambre", id);
  }

  client(id: string): Ligne | undefined {
    return this.s.obtenir("Client", id);
  }

  produit(id: string): Ligne | undefined {
    return this.s.obtenir("Produit", id);
  }

  factureDeReservation(reservationId: string): Ligne | null {
    return this.s.lister("Facture").find((f: Ligne) => f.reservationId === reservationId) ?? null;
  }

  /** Réservation + chambre + client + facture, comme GET /reservations. */
  reservation(brute: Ligne): Ligne {
    return {
      ...brute,
      chambre: this.chambre(brute.chambreId) ?? null,
      client: this.client(brute.clientId) ?? null,
      facture: this.factureDeReservation(brute.id),
    };
  }

  reservations(): Ligne[] {
    return this.s.lister("Reservation").map((r) => this.reservation(r));
  }

  /** Facture + réservation (avec chambre et client), comme GET /factures. */
  facture(brute: Ligne): Ligne {
    const resa = this.s.obtenir("Reservation", brute.reservationId);
    return { ...brute, reservation: resa ? { ...resa, chambre: this.chambre(resa.chambreId) ?? null, client: this.client(resa.clientId) ?? null } : null };
  }

  /** Un client et tout son historique de séjours, comme GET /clients. */
  clientAvecSejours(brut: Ligne): Ligne {
    const reservations = this.s
      .lister("Reservation")
      .filter((r) => r.clientId === brut.id)
      .sort(parDate("dateArrivee", -1))
      .map((r) => ({ ...r, chambre: this.chambre(r.chambreId) ?? null, facture: this.factureDeReservation(r.id) }));
    return { ...brut, reservations };
  }

  ligneAvecProduit(l: Ligne): Ligne {
    return { ...l, produit: this.produit(l.produitId) ?? null };
  }

  sousComptes(compteId: string): Ligne[] {
    return this.s
      .lister("SousCompte")
      .filter((sc) => sc.compteId === compteId)
      .sort(parDate("createdAt"))
      .map((sc) => ({
        ...sc,
        lignes: this.s
          .lister("LigneCommande")
          .filter((l) => l.sousCompteId === sc.id)
          .sort(parDate("createdAt"))
          .map((l) => this.ligneAvecProduit(l)),
      }));
  }

  /** Compte + personnes + lignes (avec produit) + ventes, comme GET /cafeteria/comptes/:id. */
  compte(brut: Ligne): Ligne {
    return {
      ...brut,
      sousComptes: this.sousComptes(brut.id),
      ventes: this.s.lister("VenteCafeteria").filter((v) => v.compteId === brut.id).sort(parDate("createdAt")),
    };
  }
}

/** « AAAA-MM-JJ » d'une date ISO (colonne @db.Date côté serveur). */
export function jourDe(valeur: unknown): string {
  return String(valeur ?? "").slice(0, 10);
}

/** Début de la journée de l'hôtel (Lubumbashi = UTC+2) en instant UTC. */
export function debutJourneeHotel(maintenant: Date = new Date(), decalageHeures = 2): Date {
  const decalage = decalageHeures * 3_600_000;
  const local = new Date(maintenant.getTime() + decalage);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - decalage);
}
