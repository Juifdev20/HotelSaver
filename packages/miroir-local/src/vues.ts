/**
 * Reconstitue, à partir des lignes brutes du miroir, les MÊMES formes que renvoie l'API (réservation avec sa chambre, son client
 * et sa facture ; compte avec ses personnes et leurs lignes…). Les écrans ne savent pas s'ils parlent au serveur ou au miroir.
 */
import type { StockageDocuments } from "./stockage-documents";

type Ligne = Record<string, any>;

/** Remplaçants affichables quand une ligne liée n'est pas (encore) dans la copie locale : un écran ne doit jamais planter sur `r.client.nom`. */
const CLIENT_INCONNU = (id: string): Ligne => ({ id, nom: "Client inconnu", telephone: null, email: null, typePiece: null, numeroPiece: null, notes: null, updatedAt: "", syncVersion: 0 });
const CHAMBRE_INCONNUE = (id: string): Ligne => ({ id, numero: "?", type: "", prixParNuit: "0", devise: "USD", statut: "LIBRE", photos: [], updatedAt: "", syncVersion: 0 });

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
      chambre: this.chambre(brute.chambreId) ?? CHAMBRE_INCONNUE(brute.chambreId),
      client: this.client(brute.clientId) ?? CLIENT_INCONNU(brute.clientId),
      facture: this.factureDeReservation(brute.id),
    };
  }

  /** Toutes les réservations assemblées — une seule passe sur les factures (pas une par réservation). */
  reservations(): Ligne[] {
    const facturesParResa = new Map<string, Ligne>();
    for (const f of this.s.lister("Facture")) facturesParResa.set(f.reservationId, f);
    return this.s.lister("Reservation").map((r) => ({
      ...r,
      chambre: this.chambre(r.chambreId) ?? CHAMBRE_INCONNUE(r.chambreId),
      client: this.client(r.clientId) ?? CLIENT_INCONNU(r.clientId),
      facture: facturesParResa.get(r.id) ?? null,
    }));
  }

  /** Facture + réservation (avec chambre et client), comme GET /factures. */
  facture(brute: Ligne): Ligne {
    const resa = this.s.obtenir("Reservation", brute.reservationId);
    return { ...brute, reservation: resa ? { ...resa, chambre: this.chambre(resa.chambreId) ?? CHAMBRE_INCONNUE(resa.chambreId), client: this.client(resa.clientId) ?? CLIENT_INCONNU(resa.clientId) } : null };
  }

  private sejoursParClient(): Map<string, Ligne[]> {
    const facturesParResa = new Map<string, Ligne>();
    for (const f of this.s.lister("Facture")) facturesParResa.set(f.reservationId, f);
    const parClient = new Map<string, Ligne[]>();
    for (const r of this.s.lister("Reservation")) {
      const liste = parClient.get(r.clientId) ?? [];
      liste.push({ ...r, chambre: this.chambre(r.chambreId) ?? CHAMBRE_INCONNUE(r.chambreId), facture: facturesParResa.get(r.id) ?? null });
      parClient.set(r.clientId, liste);
    }
    for (const liste of parClient.values()) liste.sort(parDate("dateArrivee", -1));
    return parClient;
  }

  /** Un client et tout son historique de séjours, comme GET /clients. */
  clientAvecSejours(brut: Ligne): Ligne {
    return { ...brut, reservations: this.sejoursParClient().get(brut.id) ?? [] };
  }

  /** Plusieurs clients avec leurs séjours — l'historique est indexé une seule fois. */
  clientsAvecSejours(bruts: Ligne[]): Ligne[] {
    const parClient = this.sejoursParClient();
    return bruts.map((c) => ({ ...c, reservations: parClient.get(c.id) ?? [] }));
  }

  ligneAvecProduit(l: Ligne): Ligne {
    return { ...l, produit: this.produit(l.produitId) ?? null };
  }

  private index() {
    const lignesParSc = new Map<string, Ligne[]>();
    for (const l of [...this.s.lister("LigneCommande")].sort(parDate("createdAt"))) {
      const liste = lignesParSc.get(l.sousCompteId) ?? [];
      liste.push(this.ligneAvecProduit(l));
      lignesParSc.set(l.sousCompteId, liste);
    }
    const scParCompte = new Map<string, Ligne[]>();
    for (const sc of [...this.s.lister("SousCompte")].sort(parDate("createdAt"))) {
      const liste = scParCompte.get(sc.compteId) ?? [];
      liste.push({ ...sc, lignes: lignesParSc.get(sc.id) ?? [] });
      scParCompte.set(sc.compteId, liste);
    }
    const ventesParCompte = new Map<string, Ligne[]>();
    for (const v of [...this.s.lister("VenteCafeteria")].sort(parDate("createdAt"))) {
      const liste = ventesParCompte.get(v.compteId) ?? [];
      liste.push(v);
      ventesParCompte.set(v.compteId, liste);
    }
    return { scParCompte, ventesParCompte };
  }

  sousComptes(compteId: string): Ligne[] {
    return this.index().scParCompte.get(compteId) ?? [];
  }

  /** Compte + personnes + lignes (avec produit) + ventes, comme GET /cafeteria/comptes/:id. */
  compte(brut: Ligne): Ligne {
    const { scParCompte, ventesParCompte } = this.index();
    return { ...brut, sousComptes: scParCompte.get(brut.id) ?? [], ventes: ventesParCompte.get(brut.id) ?? [] };
  }

  /** Plusieurs comptes assemblés d'un coup (liste des comptes ouverts). */
  comptes(bruts: Ligne[]): Ligne[] {
    const { scParCompte, ventesParCompte } = this.index();
    return bruts.map((c) => ({ ...c, sousComptes: scParCompte.get(c.id) ?? [], ventes: ventesParCompte.get(c.id) ?? [] }));
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
