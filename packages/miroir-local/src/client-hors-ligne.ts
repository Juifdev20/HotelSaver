import {
  ClientApi,
  ErreurApi,
  type ClientAvecSejours,
  type DonneesChambre,
  type DonneesFacture,
  type DonneesModificationChambre,
  type DonneesModificationClient,
  type DonneesModificationProduit,
  type DonneesModificationReservation,
  type DonneesMouvementStock,
  type DonneesOuvrirCompte,
  type DonneesProduit,
  type DonneesReservation,
  type FiltresChambres,
  type FiltresProduits,
  type FiltresReservations,
  type JourneeReception,
  type ReservationAnnulee,
  type ResultatCheckInOut,
  type TauxChange,
} from "@hotel-chicago/api-client";
import type {
  Chambre,
  CompteCafeteria,
  CreerDepense,
  Depense,
  Facture,
  FiltresDepenses,
  LigneCommande,
  MenuDuJour,
  ModifierDepense,
  MouvementStock,
  Occupation,
  Produit,
  ProduitPopulaire,
  ProfilConnecte,
  RecetteDuJour,
  Reservation,
  SousCompte,
  StatutCompte,
  StatutLigne,
  VenteCafeteria,
  VentesRecentes,
} from "@hotel-chicago/types";
import { erreur, type Contexte } from "./contexte";
import { Ecritures } from "./ecritures";
import { debutJourneeHotel, jourDe } from "./vues";

type Doc = Record<string, any>;

const TTL_CACHE_MS = 60_000;
const nombre = (v: unknown) => Number(v ?? 0);
const comparer = (champ: string) => (a: Doc, b: Doc) => String(a[champ] ?? "").localeCompare(String(b[champ] ?? ""));

/** Contexte complet du client hors ligne. */
export interface ContexteClient extends Contexte {
  /** La première synchronisation complète de CET hôtel sur CET appareil a-t-elle eu lieu ? Sinon il n'y a rien de local à lire. */
  amorce(): boolean;
}

/**
 * Client de l'API « d'abord sur l'appareil » : mêmes méthodes, mêmes formes de réponse que `ClientApi`, mais
 *  - les LECTURES viennent du miroir local (instantané, identique avec ou sans réseau, y compris ce qui n'est pas encore envoyé) ;
 *  - les ÉCRITURES s'appliquent au miroir et partent dans la file d'envoi (voir Ecritures) ;
 *  - ce qui n'a de sens qu'en ligne (rapports PDF, utilisateurs, site public, images, annulation d'un reçu, taux de change…) reste
 *    un appel serveur classique, qui échoue proprement hors connexion.
 * Tant que le poste n'a jamais synchronisé cet hôtel, les lectures passent par le serveur (le miroir est vide).
 */
export class ClientHorsLigne extends ClientApi {
  private readonly ecritures: Ecritures;

  constructor(baseUrl: string | string[], getAccessToken: () => string | null | Promise<string | null>, private readonly ctx: ContexteClient) {
    super(baseUrl, getAccessToken);
    this.ecritures = new Ecritures(ctx);
  }

  private get s() {
    return this.ctx.stockage;
  }

  private get v() {
    return this.ctx.vues;
  }

  private local(): boolean {
    return this.ctx.amorce();
  }

  private aucuneDonneeLocale(): ErreurApi {
    return new ErreurApi(0, "Cet appareil n'a pas encore reçu les données de l'hôtel. Connectez-le à Internet pour la première synchronisation.");
  }

  // ================================================================== Cache de lecture (données qui ne sont pas dans le miroir)

  private async avecCache<T>(cle: string, appel: () => Promise<T>, ttlMs = TTL_CACHE_MS): Promise<T> {
    const cleMeta = `cache:${cle}`;
    const entree = this.s.lireMeta<{ valeur: T; le: number }>(cleMeta);
    if (entree && this.ctx.maintenant().getTime() - entree.le < ttlMs) return entree.valeur;
    try {
      const valeur = await appel();
      await this.s.ecrireMeta(cleMeta, { valeur, le: this.ctx.maintenant().getTime() });
      return valeur;
    } catch (e) {
      // Hors connexion : la dernière valeur connue vaut mieux qu'un écran vide. Toute autre erreur (droits, serveur) est réelle.
      if (entree && e instanceof ErreurApi && e.statusCode === 0) return entree.valeur;
      throw e;
    }
  }

  /** Relit auprès du serveur les données mises en cache (profil, taux, menu) : à appeler après une synchronisation réussie. */
  async rechauffer(): Promise<void> {
    await Promise.allSettled([this.avecCacheForce("moi", () => super.moi()), this.avecCacheForce("tauxActuel", () => super.tauxActuel()), this.avecCacheForce("menuDuJour", () => super.menuDuJour())]);
  }

  private async avecCacheForce<T>(cle: string, appel: () => Promise<T>): Promise<void> {
    await this.s.ecrireMeta(`cache:${cle}`, { valeur: await appel(), le: this.ctx.maintenant().getTime() });
  }

  override async moi(): Promise<ProfilConnecte> {
    return this.avecCache("moi", () => super.moi(), 20_000);
  }

  /** Les réglages de l'hôtel changent le profil (suivi cuisine, patron qui opère…) : on le relit tout de suite. */
  override async modifierReglagesHotel(donnees: Parameters<ClientApi["modifierReglagesHotel"]>[0]) {
    const reglages = await super.modifierReglagesHotel(donnees);
    const entree = this.s.lireMeta<{ valeur: unknown; le: number }>("cache:moi");
    if (entree) await this.s.ecrireMeta("cache:moi", { ...entree, le: 0 });
    return reglages;
  }

  /** Chiffres du mois : calculés par le serveur (mêmes fonctions que les rapports PDF). Hors ligne : dernière valeur connue. */
  override async recetteDuMois(mois: string) {
    return this.avecCache(`recetteDuMois:${mois}`, () => super.recetteDuMois(mois), 60_000);
  }

  override async tauxActuel(): Promise<TauxChange | null> {
    return this.avecCache("tauxActuel", () => super.tauxActuel(), 5 * 60_000);
  }

  override async menuDuJour(): Promise<MenuDuJour | null> {
    return this.avecCache("menuDuJour", () => super.menuDuJour(), 5 * 60_000);
  }

  // ================================================================== Chambres

  override async listerChambres(filtres: FiltresChambres = {}): Promise<Chambre[]> {
    if (!this.local()) return super.listerChambres(filtres);
    return this.s
      .lister("Chambre")
      .filter((c) => (!filtres.statut || c.statut === filtres.statut) && (!filtres.type || c.type === filtres.type))
      .sort(comparer("numero"));
  }

  override async modifierStatutChambre(id: string, statut: string): Promise<Chambre> {
    return this.ecritures.modifierChambre(id, { statut }) as Promise<Chambre>;
  }

  override async creerChambre(donnees: DonneesChambre): Promise<Chambre> {
    return this.ecritures.creerChambre(donnees) as Promise<Chambre>;
  }

  override async modifierChambre(id: string, donnees: DonneesModificationChambre): Promise<Chambre> {
    return this.ecritures.modifierChambre(id, donnees) as Promise<Chambre>;
  }

  // ================================================================== Réservations, clients, factures

  override async listerReservations(filtres: FiltresReservations = {}): Promise<Reservation[]> {
    if (!this.local()) return super.listerReservations(filtres);
    const plage = Boolean(filtres.du && filtres.au);
    const du = filtres.du ? new Date(filtres.du).getTime() : 0;
    const au = filtres.au ? new Date(filtres.au).getTime() : 0;
    return this.v
      .reservations()
      .filter((r) => {
        if (filtres.statut ? r.statut !== filtres.statut : plage && r.statut === "ANNULEE") return false;
        if (filtres.chambreId && r.chambreId !== filtres.chambreId) return false;
        if (plage && !(new Date(r.dateArrivee).getTime() < au && new Date(r.dateDepart).getTime() > du)) return false;
        return true;
      })
      .sort((a, b) => (plage ? 1 : -1) * String(a.dateArrivee).localeCompare(String(b.dateArrivee))) as unknown as Reservation[];
  }

  override async obtenirReservation(id: string): Promise<Reservation> {
    if (!this.local()) return super.obtenirReservation(id);
    const r = this.s.obtenir("Reservation", id);
    if (!r) throw erreur(404, `Aucune réservation trouvée avec l'identifiant ${id}.`);
    return this.v.reservation(r) as unknown as Reservation;
  }

  override async creerReservation(donnees: DonneesReservation): Promise<Reservation> {
    return this.ecritures.creerReservation(donnees) as unknown as Reservation;
  }

  override async modifierReservation(id: string, donnees: DonneesModificationReservation): Promise<Reservation> {
    return this.ecritures.modifierReservation(id, donnees) as unknown as Reservation;
  }

  override async confirmerReservation(id: string): Promise<Reservation> {
    return this.ecritures.confirmerReservation(id) as unknown as Reservation;
  }

  override async annulerReservation(id: string, motif: string): Promise<ReservationAnnulee> {
    return (await this.ecritures.annulerReservation(id, motif)) as unknown as ReservationAnnulee;
  }

  override async checkIn(reservationId: string): Promise<ResultatCheckInOut> {
    return (await this.ecritures.checkIn(reservationId)) as unknown as ResultatCheckInOut;
  }

  override async checkOut(reservationId: string): Promise<ResultatCheckInOut> {
    return (await this.ecritures.checkOut(reservationId)) as unknown as ResultatCheckInOut;
  }

  override async listerClients(q?: string): Promise<ClientAvecSejours[]> {
    if (!this.local()) return super.listerClients(q);
    const terme = q?.trim().toLowerCase();
    return this.s
      .lister("Client")
      .filter((c) => !terme || String(c.nom).toLowerCase().includes(terme) || String(c.telephone ?? "").includes(terme))
      .sort(comparer("nom"))
      .map((c) => this.v.clientAvecSejours(c)) as unknown as ClientAvecSejours[];
  }

  override async obtenirClient(id: string): Promise<ClientAvecSejours> {
    if (!this.local()) return super.obtenirClient(id);
    const c = this.s.obtenir("Client", id);
    if (!c) throw erreur(404, `Aucun client trouvé avec l'identifiant ${id}.`);
    return this.v.clientAvecSejours(c) as unknown as ClientAvecSejours;
  }

  override async modifierClient(id: string, donnees: DonneesModificationClient): Promise<ClientAvecSejours> {
    return (await this.ecritures.modifierClient(id, donnees)) as unknown as ClientAvecSejours;
  }

  override async listerFactures(reservationId?: string): Promise<Facture[]> {
    if (!this.local()) return super.listerFactures(reservationId);
    return this.s
      .lister("Facture")
      .filter((f) => !reservationId || f.reservationId === reservationId)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map((f) => this.v.facture(f)) as unknown as Facture[];
  }

  override async obtenirFacture(id: string): Promise<Facture> {
    if (!this.local()) return super.obtenirFacture(id);
    const f = this.s.obtenir("Facture", id);
    if (!f) throw erreur(404, `Aucune facture trouvée avec l'identifiant ${id}.`);
    return this.v.facture(f) as unknown as Facture;
  }

  override async creerFacture(donnees: DonneesFacture): Promise<Facture> {
    return (await this.ecritures.creerFacture(donnees)) as unknown as Facture;
  }

  // ================================================================== Produits, stock

  override async listerProduits(filtres: FiltresProduits = {}): Promise<Produit[]> {
    if (!this.local()) return super.listerProduits(filtres);
    return this.s
      .lister("Produit")
      .filter((p) => (!filtres.categorie || p.categorie === filtres.categorie) && (filtres.actif === undefined || p.actif === filtres.actif))
      .sort((a, b) => String(a.categorie).localeCompare(String(b.categorie)) || String(a.nom).localeCompare(String(b.nom)));
  }

  override async creerProduit(donnees: DonneesProduit): Promise<Produit> {
    return this.ecritures.creerProduit(donnees) as Promise<Produit>;
  }

  override async modifierProduit(id: string, donnees: DonneesModificationProduit): Promise<Produit> {
    return this.ecritures.modifierProduit(id, donnees) as Promise<Produit>;
  }

  override async listerMouvementsStock(produitId?: string): Promise<MouvementStock[]> {
    if (!this.local()) return super.listerMouvementsStock(produitId);
    return this.s
      .lister("MouvementStock")
      .filter((m) => !produitId || m.produitId === produitId)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map((m) => ({ ...m, produit: this.v.produit(m.produitId) ?? null })) as unknown as MouvementStock[];
  }

  override async creerMouvementStock(donnees: DonneesMouvementStock): Promise<MouvementStock> {
    return (await this.ecritures.creerMouvementStock(donnees)) as unknown as MouvementStock;
  }

  override async stockBas(): Promise<Produit[]> {
    if (!this.local()) return super.stockBas();
    return this.s
      .lister("Produit")
      .filter((p) => p.actif && nombre(p.stockActuel) <= nombre(p.seuilAlerte))
      .sort(comparer("nom"));
  }

  // ================================================================== Cafétaria

  override async listerComptesCafeteria(statut?: StatutCompte): Promise<CompteCafeteria[]> {
    if (!this.local()) return super.listerComptesCafeteria(statut);
    return this.s
      .lister("CompteCafeteria")
      .filter((c) => !statut || c.statut === statut)
      .sort((a, b) => String(b.ouvertLe).localeCompare(String(a.ouvertLe)))
      .map((c) => this.v.compte(c)) as unknown as CompteCafeteria[];
  }

  override async obtenirCompteCafeteria(id: string): Promise<CompteCafeteria> {
    if (!this.local()) return super.obtenirCompteCafeteria(id);
    const c = this.s.obtenir("CompteCafeteria", id);
    if (!c) throw erreur(404, `Aucun compte cafétaria trouvé avec l'identifiant ${id}.`);
    return this.v.compte(c) as unknown as CompteCafeteria;
  }

  override async trouverCompteParReference(reference: string): Promise<CompteCafeteria> {
    if (!this.local()) return super.trouverCompteParReference(reference);
    const ref = reference.trim().toLowerCase();
    if (!/^[0-9a-f]{4,32}$/.test(ref)) throw erreur(400, "Référence invalide — elle se trouve sur le ticket du client (ex. E6A5E231).");
    const correspondants = this.s
      .lister("CompteCafeteria")
      .filter((c) => c.origine === "SITE_PUBLIC" && String(c.id).startsWith(ref))
      .sort((a, b) => String(b.ouvertLe).localeCompare(String(a.ouvertLe)));
    const ouvert = correspondants.find((c) => c.statut === "OUVERT");
    if (!ouvert) {
      if (correspondants.length > 0) throw erreur(409, "Cette commande a déjà été réglée.");
      throw erreur(404, "Aucune commande web trouvée avec cette référence.");
    }
    return this.v.compte(ouvert) as unknown as CompteCafeteria;
  }

  override async ouvrirCompteCafeteria(donnees: DonneesOuvrirCompte): Promise<CompteCafeteria> {
    return (await this.ecritures.ouvrirCompteCafeteria(donnees)) as unknown as CompteCafeteria;
  }

  override async ajouterSousCompte(compteId: string, nom: string): Promise<SousCompte> {
    return (await this.ecritures.ajouterSousCompte(compteId, nom)) as unknown as SousCompte;
  }

  override async ajouterLigne(compteId: string, donnees: { sousCompteId: string; produitId: string; quantite: number }): Promise<LigneCommande> {
    return (await this.ecritures.ajouterLigne(compteId, donnees)) as unknown as LigneCommande;
  }

  override async encaisserCompte(compteId: string, donnees: Parameters<ClientApi["encaisserCompte"]>[1]): Promise<VenteCafeteria[]> {
    return (await this.ecritures.encaisserCompte(compteId, donnees as any)) as unknown as VenteCafeteria[];
  }

  override async majStatutLigne(ligneId: string, statut: StatutLigne): Promise<LigneCommande> {
    return (await this.ecritures.majStatutLigne(ligneId, statut as any)) as unknown as LigneCommande;
  }

  override async listerVentesCafeteria(reservationLieeId?: string): Promise<VenteCafeteria[]> {
    if (!this.local()) return super.listerVentesCafeteria(reservationLieeId);
    return this.s
      .lister("VenteCafeteria")
      .filter((v) => !reservationLieeId || v.reservationLieeId === reservationLieeId)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))) as unknown as VenteCafeteria[];
  }

  /** Commandes actives pour la cuisine, groupées par compte (mêmes règles que le serveur). */
  override async lignesPourCuisine(): Promise<unknown[]> {
    if (!this.local()) return super.lignesPourCuisine();
    if (!this.ctx.utilisateur().cuisineActivee) return [];
    const comptes = new Map<string, { compteId: string; tableOuNom: string; ouvertLe: string; lignes: Doc[] }>();
    const lignes = this.s
      .lister("LigneCommande")
      .filter((l) => l.statut === "EN_ATTENTE" || l.statut === "EN_PREPARATION")
      .sort(comparer("createdAt"));
    for (const l of lignes) {
      const sc = this.s.obtenir("SousCompte", l.sousCompteId);
      const compte = sc && this.s.obtenir("CompteCafeteria", sc.compteId);
      if (!sc || sc.payeLe || !compte || compte.statut !== "OUVERT") continue;
      if (!comptes.has(compte.id)) comptes.set(compte.id, { compteId: compte.id, tableOuNom: compte.tableOuNom, ouvertLe: compte.ouvertLe, lignes: [] });
      comptes.get(compte.id)!.lignes.push({ ...l, produit: this.v.produit(l.produitId) ?? null, sousCompte: { ...sc, compte: { id: compte.id, tableOuNom: compte.tableOuNom, ouvertLe: compte.ouvertLe } } });
    }
    return [...comptes.values()];
  }

  override async produitsPopulaires(): Promise<ProduitPopulaire[]> {
    if (!this.local()) return super.produitsPopulaires();
    const debut = debutJourneeHotel(this.ctx.maintenant()).toISOString();
    const parProduit = new Map<string, number>();
    for (const l of this.s.lister("LigneCommande")) {
      if (String(l.createdAt) >= debut) parProduit.set(l.produitId, (parProduit.get(l.produitId) ?? 0) + nombre(l.quantite));
    }
    return [...parProduit.entries()].map(([produitId, quantite]) => ({ produitId, quantite })).sort((a, b) => b.quantite - a.quantite).slice(0, 30);
  }

  // ================================================================== Dépenses

  override async listerDepenses(filtres: FiltresDepenses): Promise<Depense[]> {
    if (!this.local()) return super.listerDepenses(filtres);
    const u = this.ctx.utilisateur();
    const departement = u.role === "PATRON" ? filtres.departement : u.role === "CAFETARIA" ? "CAFETERIA" : u.role === "RECEPTIONNISTE" ? "RECEPTION" : undefined;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(filtres.du) || !/^\d{4}-\d{2}-\d{2}$/.test(filtres.au)) throw erreur(400, "Les dates doivent être au format AAAA-MM-JJ.");
    if (filtres.au < filtres.du) throw erreur(400, "La date de fin précède la date de début.");
    return this.s
      .lister("Depense")
      .filter((d) => (!departement || d.departement === departement) && jourDe(d.date) >= filtres.du && jourDe(d.date) <= filtres.au)
      .sort((a, b) => jourDe(b.date).localeCompare(jourDe(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt)))
      .map((d) => ({ ...d, date: jourDe(d.date) })) as unknown as Depense[];
  }

  override async creerDepense(donnees: CreerDepense): Promise<Depense> {
    return (await this.ecritures.creerDepense(donnees)) as unknown as Depense;
  }

  override async modifierDepense(id: string, donnees: ModifierDepense): Promise<Depense> {
    return (await this.ecritures.modifierDepense(id, donnees)) as unknown as Depense;
  }

  // ================================================================== Tableaux de bord (calculés sur le miroir, ventes non envoyées incluses)

  override async occupation(): Promise<Occupation> {
    if (!this.local()) return super.occupation();
    const chambres = this.s.lister("Chambre");
    const total = chambres.length;
    const n = (statut: string) => chambres.filter((c) => c.statut === statut).length;
    return { total, libres: n("LIBRE"), occupees: n("OCCUPEE"), reservees: n("RESERVEE"), enNettoyage: n("NETTOYAGE"), tauxOccupationPourcent: total === 0 ? 0 : Math.round((n("OCCUPEE") / total) * 1000) / 10 };
  }

  private recette(lignes: Doc[]): { montantUSD: number; montantCDF: number } {
    return lignes.reduce<{ montantUSD: number; montantCDF: number }>(
      (acc, l) => ({ montantUSD: acc.montantUSD + nombre(l.montantTotalUSD), montantCDF: acc.montantCDF + nombre(l.montantTotalCDF) }),
      { montantUSD: 0, montantCDF: 0 }
    );
  }

  /** Factures du jour visibles par l'utilisateur (la réception ne voit que ses propres encaissements). */
  private facturesVisibles(depuis: string, jusqua?: string): Doc[] {
    const u = this.ctx.utilisateur();
    return this.s.lister("Facture").filter((f) => {
      if (f.annuleLe || String(f.createdAt) < depuis || (jusqua && String(f.createdAt) >= jusqua)) return false;
      return u.role === "PATRON" || this.s.obtenir("Reservation", f.reservationId)?.createdBy === u.userId;
    });
  }

  private ventesVisibles(depuis: string, jusqua?: string): Doc[] {
    const u = this.ctx.utilisateur();
    return this.s.lister("VenteCafeteria").filter((v) => !v.annuleLe && String(v.createdAt) >= depuis && (!jusqua || String(v.createdAt) < jusqua) && (u.role === "PATRON" || v.createdBy === u.userId));
  }

  override async recetteDuJour(): Promise<RecetteDuJour> {
    if (!this.local()) return super.recetteDuJour();
    const u = this.ctx.utilisateur();
    const debut = debutJourneeHotel(this.ctx.maintenant()).toISOString();
    const chambres = u.role !== "CAFETARIA" ? this.recette(this.facturesVisibles(debut)) : undefined;
    const cafeteria = u.role !== "RECEPTIONNISTE" ? this.recette(this.ventesVisibles(debut)) : undefined;
    return {
      chambres,
      cafeteria,
      total: { montantUSD: (chambres?.montantUSD ?? 0) + (cafeteria?.montantUSD ?? 0), montantCDF: (chambres?.montantCDF ?? 0) + (cafeteria?.montantCDF ?? 0) },
    };
  }

  override async ventesRecentes(limite = 6): Promise<VentesRecentes> {
    if (!this.local()) return super.ventesRecentes(limite);
    const u = this.ctx.utilisateur();
    const recents = (l: Doc[]) => l.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, limite);
    const factures =
      u.role !== "CAFETARIA"
        ? recents(this.s.lister("Facture").filter((f) => u.role === "PATRON" || this.s.obtenir("Reservation", f.reservationId)?.createdBy === u.userId)).map((f) => this.v.facture(f))
        : [];
    const ventesCafeteria = u.role !== "RECEPTIONNISTE" ? recents(this.s.lister("VenteCafeteria").filter((x) => u.role === "PATRON" || x.createdBy === u.userId)) : [];
    return { factures, ventesCafeteria } as unknown as VentesRecentes;
  }

  override async journeeReception(): Promise<JourneeReception> {
    if (!this.local()) return super.journeeReception();
    const debut = debutJourneeHotel(this.ctx.maintenant());
    const fin = new Date(debut.getTime() + 24 * 3_600_000);
    const d = debut.toISOString(), f = fin.toISOString();
    const dans = (valeur: string) => String(valeur) >= d && String(valeur) < f;
    const resume = (r: Doc) => ({ statut: r.statut, client: { nom: this.v.client(r.clientId)?.nom ?? "" }, chambre: { numero: this.v.chambre(r.chambreId)?.numero ?? "" } });
    const reservations = this.s.lister("Reservation");
    const arrivees = reservations.filter((r) => dans(r.dateArrivee) && r.statut !== "ANNULEE");
    const departs = reservations.filter((r) => dans(r.dateDepart) && (r.statut === "EN_COURS" || r.statut === "TERMINEE"));
    const factures = this.facturesVisibles(d, f);
    const ventes = this.ventesVisibles(d, f);
    const rc = this.recette(factures), rf = this.recette(ventes);
    return {
      date: d,
      recette: {
        chambres: { ...rc, nombreFactures: factures.length },
        cafeteria: { ...rf, nombreVentes: ventes.length },
        total: { montantUSD: rc.montantUSD + rf.montantUSD, montantCDF: rc.montantCDF + rf.montantCDF },
      },
      arrivees: { effectuees: arrivees.filter((r) => r.statut === "EN_COURS" || r.statut === "TERMINEE").map(resume), restantes: arrivees.filter((r) => r.statut === "EN_ATTENTE" || r.statut === "CONFIRMEE").map(resume) },
      departs: { effectues: departs.filter((r) => r.statut === "TERMINEE").map(resume), restants: departs.filter((r) => r.statut === "EN_COURS").map(resume) },
      chambres: await this.occupation(),
      comptesCafeteriaOuverts: this.s.lister("CompteCafeteria").filter((c) => c.statut === "OUVERT").length,
    };
  }
}
