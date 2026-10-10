/**
 * Écritures « d'abord sur l'appareil » : chaque action est appliquée au miroir local (l'écran la voit tout de suite) ET mise en file
 * d'envoi dans la MÊME transaction. Les règles métier de base sont vérifiées ici avec les mêmes messages que le serveur, pour que la
 * personne soit prévenue sur le champ ; le serveur reste l'autorité (il refuse ce que le miroir ne pouvait pas savoir).
 */
import {
  calculerEncaissement,
  ErreurRegle,
  numeroRecuProvisoire,
  jourCompact,
  repartirEnParts,
  sechevauchent,
  sommerParDevise,
  STATUTS_OCCUPANTS,
  totauxFactureSejour,
} from "@hotel-chicago/regles";
import type { EntitePull, TypeOperationPush } from "@hotel-chicago/api-client";
import type { LigneFileAttente } from "@hotel-chicago/sync-engine";
import type { OperationMagasin } from "./magasin";
import { erreur, exigerOperationnel, exigerRole, type Contexte } from "./contexte";
import { uuid } from "./references";

type Doc = Record<string, any>;
type Operation = Omit<LigneFileAttente, "id" | "createdAt" | "attempts" | "lastError">;

const iso = (d: Date) => d.toISOString();
const texte = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export class Ecritures {
  constructor(private readonly ctx: Contexte) {}

  private get s() {
    return this.ctx.stockage;
  }

  private get v() {
    return this.ctx.vues;
  }

  private ecrire(collection: string, doc: Doc): OperationMagasin {
    return { type: "ecrire", collection, id: doc.id, valeur: doc };
  }

  private async agir(ecritures: OperationMagasin[], operation?: Operation): Promise<void> {
    await this.s.enregistrerAction(ecritures, operation);
    this.ctx.declencher();
  }

  /** Opération « modifier » : la version de départ est celle que l'appareil connaît (les modifications enchaînées sont gérées à l'envoi). */
  private modification(entiteType: TypeOperationPush, doc: Doc, payload: Record<string, unknown>, touche?: Operation["touche"]): Operation {
    return { entiteType, localId: doc.id, remoteId: doc.id, operation: "UPDATE", payload, baseSyncVersion: doc.syncVersion ?? 1, touche };
  }

  private creation(entiteType: TypeOperationPush, doc: Doc, payload: Record<string, unknown>, touche?: Operation["touche"]): Operation {
    return { entiteType, localId: doc.id, operation: "CREATE", payload, touche };
  }

  private base(extra: Doc = {}): Doc {
    const maintenant = iso(this.ctx.maintenant());
    return { hotelId: this.ctx.utilisateur().hotelId, createdAt: maintenant, updatedAt: maintenant, syncVersion: 1, ...extra };
  }

  /** Copie du document avec `updatedAt` à l'instant (la version serveur reste inchangée jusqu'à confirmation). */
  private touche(_entiteType: EntitePull, doc: Doc): Doc {
    return { ...doc, updatedAt: iso(this.ctx.maintenant()) };
  }

  // =============================================================== Chambres

  async creerChambre(d: { numero: string; type: string; prixParNuit: number; devise: string; statut?: string; photos?: string[] }) {
    const u = this.ctx.utilisateur();
    exigerRole(u, "PATRON");
    const numero = texte(d.numero);
    if (!numero) throw erreur(400, "Le numéro de la chambre est obligatoire.");
    if (this.s.lister("Chambre").some((c) => c.numero === numero)) throw erreur(409, `Une chambre avec le numéro "${numero}" existe déjà.`);
    const chambre = this.base({ id: uuid(), numero, type: d.type, prixParNuit: String(d.prixParNuit), devise: d.devise, statut: d.statut ?? "LIBRE", photos: d.photos ?? [] });
    await this.agir([this.ecrire("Chambre", chambre)], this.creation("Chambre", chambre, { ...d, numero }));
    return chambre;
  }

  async modifierChambre(id: string, d: Record<string, any>) {
    const u = this.ctx.utilisateur();
    exigerRole(u, "RECEPTIONNISTE", "PATRON");
    const chambre = this.s.obtenir("Chambre", id);
    if (!chambre) throw erreur(404, `Aucune chambre trouvée avec l'identifiant ${id}.`);
    const champs: Doc = { ...d };
    if (champs.prixParNuit !== undefined) champs.prixParNuit = String(champs.prixParNuit);
    if (champs.numero !== undefined && this.s.lister("Chambre").some((c) => c.numero === champs.numero && c.id !== chambre.id)) {
      throw erreur(409, `Une chambre avec le numéro "${champs.numero}" existe déjà.`);
    }
    const maj = this.touche("Chambre", { ...chambre, ...champs });
    await this.agir([this.ecrire("Chambre", maj)], this.modification("Chambre", chambre, d));
    return maj;
  }

  // =============================================================== Produits & stock

  async creerProduit(d: Record<string, any>) {
    exigerRole(this.ctx.utilisateur(), "PATRON");
    if (d.codeBarres && this.s.lister("Produit").some((p) => p.codeBarres === d.codeBarres)) throw erreur(409, "Ce code-barres est déjà associé à un autre produit.");
    const produit = this.base({
      id: uuid(), nom: d.nom, categorie: d.categorie, prix: String(d.prix), devise: d.devise, typeProduit: d.typeProduit ?? "ARTICLE", photo: d.photo ?? null,
      stockActuel: String(d.stockActuel ?? 0), seuilAlerte: String(d.seuilAlerte ?? 0), prixAchat: d.prixAchat !== undefined ? String(d.prixAchat) : null, actif: true,
      commandableEnLigne: d.commandableEnLigne ?? false, description: d.description ?? null, portionsDisponibles: d.portionsDisponibles ?? null, codeBarres: d.codeBarres ?? null,
    });
    await this.agir([this.ecrire("Produit", produit)], this.creation("Produit", produit, d));
    return produit;
  }

  async modifierProduit(id: string, d: Record<string, any>) {
    exigerRole(this.ctx.utilisateur(), "PATRON");
    const produit = this.s.obtenir("Produit", id);
    if (!produit) throw erreur(404, `Aucun produit trouvé avec l'identifiant ${id}.`);
    const champs: Doc = { ...d };
    for (const cle of ["prix", "seuilAlerte", "prixAchat"]) if (champs[cle] !== undefined && champs[cle] !== null) champs[cle] = String(champs[cle]);
    const maj = this.touche("Produit", { ...produit, ...champs });
    await this.agir([this.ecrire("Produit", maj)], this.modification("Produit", produit, d));
    return maj;
  }

  async creerMouvementStock(d: { produitId: string; type: "ENTREE" | "PERTE" | "AJUSTEMENT"; quantite: number; motif?: string }) {
    const u = this.ctx.utilisateur();
    exigerRole(u, "CAFETARIA", "PATRON");
    const produit = this.v.produit(d.produitId);
    if (!produit) throw erreur(404, `Aucun produit trouvé avec l'identifiant ${d.produitId}.`);
    const quantite = Number(d.quantite);
    if (!Number.isFinite(quantite)) throw erreur(400, "La quantité est invalide.");
    if ((d.type === "ENTREE" || d.type === "PERTE") && quantite <= 0) throw erreur(400, `La quantité doit être positive pour ${d.type === "ENTREE" ? "une entrée de stock" : "un mouvement PERTE (le sens est déjà porté par le type)"}.`);
    const delta = d.type === "ENTREE" ? quantite : d.type === "PERTE" ? -quantite : quantite;
    const nouveau = Number(produit.stockActuel) + delta;
    if (nouveau < 0) throw erreur(409, `Stock insuffisant pour "${produit.nom}" : ${produit.stockActuel} en stock, ${Math.abs(delta)} demandé(s).`);
    const mouvement = this.base({ id: uuid(), produitId: produit.id, quantite: String(quantite), type: d.type, motif: d.motif ?? null, createdBy: u.userId });
    const maj = this.touche("Produit", { ...produit, stockActuel: String(nouveau) });
    await this.agir(
      [this.ecrire("MouvementStock", mouvement), this.ecrire("Produit", maj)],
      this.creation("MouvementStock", mouvement, { produitId: d.produitId, type: d.type, quantite, motif: d.motif }, [{ entiteType: "Produit", id: produit.id }])
    );
    return { ...mouvement, produit: maj };
  }

  // =============================================================== Clients

  async modifierClient(id: string, d: Record<string, any>) {
    exigerRole(this.ctx.utilisateur(), "RECEPTIONNISTE", "PATRON");
    const client = this.s.obtenir("Client", id);
    if (!client) throw erreur(404, `Aucun client trouvé avec l'identifiant ${id}.`);
    const maj = this.touche("Client", { ...client, ...d });
    await this.agir([this.ecrire("Client", maj)], this.modification("Client", client, d));
    return this.v.clientAvecSejours(maj);
  }

  // =============================================================== Réservations

  private verifierAbsenceDeConflit(chambreId: string, arrivee: string, depart: string, sauf?: string) {
    const conflit = this.s
      .lister("Reservation")
      .some((r) => r.chambreId === chambreId && r.id !== sauf && (STATUTS_OCCUPANTS as readonly string[]).includes(r.statut) && sechevauchent({ dateArrivee: arrivee, dateDepart: depart }, r));
    if (conflit) throw erreur(409, "Cette chambre est déjà réservée sur une partie de cette période. Choisissez d'autres dates ou une autre chambre.");
  }

  async creerReservation(d: Record<string, any>) {
    const u = this.ctx.utilisateur();
    exigerRole(u, "RECEPTIONNISTE", "PATRON");
    exigerOperationnel(u);
    if (Boolean(d.clientId) === Boolean(d.client)) throw erreur(400, "Fournir soit clientId (client existant), soit client (nouveau client), jamais les deux ni aucun des deux.");
    const arrivee = new Date(d.dateArrivee), depart = new Date(d.dateDepart);
    if (Number.isNaN(arrivee.getTime()) || Number.isNaN(depart.getTime())) throw erreur(400, "Les dates sont invalides.");
    if (arrivee >= depart) throw erreur(400, "La date de départ doit être postérieure à la date d'arrivée.");
    const chambre = this.v.chambre(d.chambreId);
    if (!chambre) throw erreur(404, `Aucune chambre trouvée avec l'identifiant ${d.chambreId}.`);
    if (d.clientId && !this.v.client(d.clientId)) throw erreur(404, `Aucun client trouvé avec l'identifiant ${d.clientId}.`);
    const chambreId = chambre.id;
    this.verifierAbsenceDeConflit(chambreId, iso(arrivee), iso(depart));

    const ecritures: OperationMagasin[] = [];
    let client = d.clientId ? this.v.client(d.clientId)! : null;
    if (!client) {
      const c = d.client;
      if (!texte(c?.nom)) throw erreur(400, "Le nom du client est obligatoire.");
      client = this.base({ id: uuid(), nom: texte(c.nom), telephone: c.telephone ?? null, email: c.email ?? null, typePiece: c.typePiece ?? null, numeroPiece: c.numeroPiece ?? null, notes: null });
      ecritures.push(this.ecrire("Client", client));
    }
    const installer = d.installerImmediatement === true;
    const reservation = this.base({
      id: uuid(), chambreId, clientId: client.id, dateArrivee: iso(arrivee), dateDepart: iso(depart), acompte: String(d.acompte ?? 0), note: d.note ?? null,
      statut: installer ? "EN_COURS" : "CONFIRMEE", origine: "RECEPTION",
      // Le lien de suivi n'existe qu'une fois la réservation enregistrée par le serveur (c'est lui qui crée le secret) : vide d'ici là.
      jetonSuivi: "", heureArriveePrevue: null, demandeClient: null, preEnregistreLe: null, reponseReception: null, annuleLe: null, motifAnnulation: null, createdBy: u.userId,
    });
    ecritures.push(this.ecrire("Reservation", reservation));
    const touche: Operation["touche"] = [];
    if (installer) {
      ecritures.push(this.ecrire("Chambre", this.touche("Chambre", { ...chambre, statut: "OCCUPEE" })));
      touche.push({ entiteType: "Chambre", id: chambreId });
    }
    const payload: Record<string, unknown> = {
      chambreId, dateArrivee: d.dateArrivee, dateDepart: d.dateDepart, acompte: d.acompte, note: d.note, installerImmediatement: installer || undefined,
      ...(d.clientId ? { clientId: client.id } : { client: d.client, clientLocalId: client.id }),
    };
    await this.agir(ecritures, this.creation("Reservation", reservation, payload, touche));
    return this.v.reservation(reservation);
  }

  async modifierReservation(id: string, d: Record<string, any>) {
    const u = this.ctx.utilisateur();
    exigerRole(u, "RECEPTIONNISTE", "PATRON");
    exigerOperationnel(u);
    const r = this.s.obtenir("Reservation", id);
    if (!r) throw erreur(404, `Aucune réservation trouvée avec l'identifiant ${id}.`);
    if (r.statut === "ANNULEE" || r.statut === "TERMINEE") throw erreur(409, `Impossible de modifier une réservation ${r.statut === "ANNULEE" ? "annulée" : "déjà terminée"}.`);
    const arrivee = d.dateArrivee ? new Date(d.dateArrivee).toISOString() : r.dateArrivee;
    const depart = d.dateDepart ? new Date(d.dateDepart).toISOString() : r.dateDepart;
    if (new Date(arrivee) >= new Date(depart)) throw erreur(400, "La date de départ doit être postérieure à la date d'arrivée.");
    if (d.dateArrivee || d.dateDepart) this.verifierAbsenceDeConflit(r.chambreId, arrivee, depart, r.id);
    const champs: Doc = { dateArrivee: arrivee, dateDepart: depart };
    if (d.acompte !== undefined) champs.acompte = String(d.acompte);
    if (d.note !== undefined) champs.note = d.note;
    if (d.reponseReception !== undefined) champs.reponseReception = d.reponseReception;
    const maj = this.touche("Reservation", { ...r, ...champs });
    await this.agir([this.ecrire("Reservation", maj)], this.modification("Reservation", r, d));
    return this.v.reservation(maj);
  }

  private async ordreReservation(id: string, action: "CONFIRMER" | "ANNULER" | "CHECK_IN" | "CHECK_OUT", motif?: string) {
    const u = this.ctx.utilisateur();
    exigerRole(u, "RECEPTIONNISTE", "PATRON");
    if (action !== "ANNULER") exigerOperationnel(u);
    const r = this.s.obtenir("Reservation", id);
    if (!r) throw erreur(404, `Aucune réservation trouvée avec l'identifiant ${id}.`);
    const chambre = this.v.chambre(r.chambreId);
    const maintenant = iso(this.ctx.maintenant());
    const ecritures: OperationMagasin[] = [];
    const touche: Operation["touche"] = [{ entiteType: "Reservation", id: r.id }];
    let maj: Doc;
    let chambreMaj: Doc | undefined;

    if (action === "CONFIRMER") {
      if (r.statut !== "EN_ATTENTE") throw erreur(409, `Cette réservation ne peut pas être confirmée (statut actuel : ${r.statut}). Seule une demande EN_ATTENTE peut être validée.`);
      this.verifierAbsenceDeConflit(r.chambreId, r.dateArrivee, r.dateDepart, r.id);
      maj = this.touche("Reservation", { ...r, statut: "CONFIRMEE" });
    } else if (action === "ANNULER") {
      if (r.statut === "ANNULEE") throw erreur(409, "Cette réservation est déjà annulée.");
      if (r.statut === "TERMINEE") throw erreur(409, "Impossible d'annuler une réservation déjà terminée.");
      if (!texte(motif)) throw erreur(400, "Le motif d'annulation est obligatoire (traçabilité, section 17).");
      maj = this.touche("Reservation", { ...r, statut: "ANNULEE", annuleLe: maintenant, motifAnnulation: texte(motif) });
    } else if (action === "CHECK_IN") {
      if (r.statut !== "CONFIRMEE") throw erreur(409, `Cette réservation ne peut pas être enregistrée en arrivée (statut actuel : ${r.statut}). Seule une réservation CONFIRMEE peut faire l'objet d'un check-in.`);
      maj = this.touche("Reservation", { ...r, statut: "EN_COURS" });
      chambreMaj = chambre && this.touche("Chambre", { ...chambre, statut: "OCCUPEE" });
    } else {
      if (r.statut !== "EN_COURS") throw erreur(409, `Cette réservation ne peut pas être enregistrée en départ (statut actuel : ${r.statut}). Seule une réservation EN_COURS (client déjà arrivé) peut faire l'objet d'un check-out.`);
      maj = this.touche("Reservation", { ...r, statut: "TERMINEE" });
      chambreMaj = chambre && this.touche("Chambre", { ...chambre, statut: "NETTOYAGE" });
    }
    ecritures.push(this.ecrire("Reservation", maj));
    if (chambreMaj) {
      ecritures.push(this.ecrire("Chambre", chambreMaj));
      touche.push({ entiteType: "Chambre", id: chambreMaj.id });
    }
    const ordre = { id: uuid() };
    await this.agir(ecritures, { entiteType: "ActionReservation", localId: ordre.id, operation: "CREATE", payload: { reservationId: r.id, action, ...(motif ? { motif: texte(motif) } : {}) }, touche });
    return { maj, chambre: chambreMaj };
  }

  async confirmerReservation(id: string) {
    const { maj } = await this.ordreReservation(id, "CONFIRMER");
    return this.v.reservation(maj);
  }

  async annulerReservation(id: string, motif: string) {
    const { maj } = await this.ordreReservation(id, "ANNULER", motif);
    return maj;
  }

  async checkIn(id: string) {
    const { maj, chambre } = await this.ordreReservation(id, "CHECK_IN");
    return { reservationId: maj.id, statutReservation: "EN_COURS", chambre };
  }

  async checkOut(id: string) {
    const { maj, chambre } = await this.ordreReservation(id, "CHECK_OUT");
    return { reservationId: maj.id, statutReservation: "TERMINEE", chambre };
  }

  // =============================================================== Numéros de reçus provisoires

  /** Réserve `n` numéros provisoires (compteur du jour sur cet appareil) ; l'écriture du compteur part avec l'action. */
  private numerosProvisoires(n: number): { numeros: string[]; ecriture: OperationMagasin } {
    const jour = jourCompact(this.ctx.maintenant());
    const cle = `compteurRecu:${jour}`;
    const depart = this.s.lireMeta<number>(cle) ?? 0;
    const numeros = Array.from({ length: n }, (_, i) => numeroRecuProvisoire(this.ctx.codePoste(), jour, depart + i + 1));
    return { numeros, ecriture: { type: "ecrire", collection: "_meta", id: cle, valeur: { id: cle, valeur: depart + n } } };
  }

  private cdfParUsd(): number | undefined {
    const taux = this.s.lireMeta<{ valeur: { cdfParUsd: string } | null }>("cache:tauxActuel")?.valeur;
    return taux ? Number(taux.cdfParUsd) : undefined;
  }

  // =============================================================== Facturation d'un séjour

  async creerFacture(d: { reservationId: string; modePaiement: string; deviseRegleeParClient?: string; montantRegleParClient?: number; deviseRenduChoisie?: string }) {
    const u = this.ctx.utilisateur();
    exigerRole(u, "RECEPTIONNISTE", "PATRON");
    exigerOperationnel(u);
    const r = this.s.obtenir("Reservation", d.reservationId);
    if (!r) throw erreur(404, `Aucune réservation trouvée avec l'identifiant ${d.reservationId}.`);
    const chambre = this.v.chambre(r.chambreId);
    if (!chambre) throw erreur(404, "La chambre de cette réservation est introuvable sur cet appareil.");
    if (this.v.factureDeReservation(r.id)) throw erreur(409, "Cette réservation a déjà une facture. Utilisez l'annulation si elle est erronée.");
    if (r.statut !== "EN_COURS" && r.statut !== "TERMINEE") {
      throw erreur(409, `Impossible de facturer une réservation ${r.statut} : le client doit être arrivé (check-in) avant de pouvoir être facturé.`);
    }
    const ventesLiees = this.s.lister("VenteCafeteria").filter((x) => x.reservationLieeId === r.id && !x.annuleLe);
    const t = totauxFactureSejour({
      prixParNuit: Number(chambre.prixParNuit), deviseChambre: chambre.devise, dateArrivee: r.dateArrivee, dateDepart: r.dateDepart, acompte: Number(r.acompte),
      consommations: ventesLiees.map((x) => ({ montantTotalUSD: Number(x.montantTotalUSD), montantTotalCDF: Number(x.montantTotalCDF) })),
    });
    const croise = d.deviseRegleeParClient !== undefined || d.montantRegleParClient !== undefined;
    if (croise && t.montantTotalUSD > 0 && t.montantTotalCDF > 0) {
      throw erreur(400, "Cette facture mélange un montant dû en USD et en CDF (chambre + consommations cafétaria) : le paiement croisé automatique n'est pas supporté pour un total mixte (section 9.4). Réglez chaque devise séparément.");
    }
    let encaissement;
    try {
      encaissement = calculerEncaissement({
        montantDu: t.montantDu, deviseDue: t.deviseDue, deviseRegleeParClient: d.deviseRegleeParClient as any, montantRegleParClient: d.montantRegleParClient,
        deviseRenduChoisie: d.deviseRenduChoisie as any, cdfParUsd: this.cdfParUsd(),
      });
    } catch (e) {
      if (e instanceof ErreurRegle) throw erreur(400, e.message);
      throw e;
    }
    const { numeros, ecriture } = this.numerosProvisoires(1);
    const facture = this.base({
      id: uuid(), reservationId: r.id, montantChambre: String(t.montantChambre), deviseChambre: t.deviseChambre, montantTotalUSD: String(t.montantTotalUSD), montantTotalCDF: String(t.montantTotalCDF),
      modePaiement: d.modePaiement, deviseRegleeParClient: d.deviseRegleeParClient ?? null, montantRegleParClient: d.montantRegleParClient !== undefined ? String(d.montantRegleParClient) : null,
      tauxChangeApplique: encaissement.tauxChangeApplique !== undefined ? String(encaissement.tauxChangeApplique) : null,
      deviseMonnaieRendue: encaissement.deviseMonnaieRendue ?? null, montantMonnaieRendue: encaissement.montantMonnaieRendue !== undefined ? String(encaissement.montantMonnaieRendue) : null,
      numeroRecu: numeros[0], numeroProvisoire: numeros[0], imprimeLe: null, annuleLe: null, motifAnnulation: null,
    });
    await this.agir(
      [this.ecrire("Facture", facture), ecriture],
      this.creation("Facture", facture, { reservationId: r.id, modePaiement: d.modePaiement, deviseRegleeParClient: d.deviseRegleeParClient, montantRegleParClient: d.montantRegleParClient, deviseRenduChoisie: d.deviseRenduChoisie, numeroProvisoire: numeros[0] }, [{ entiteType: "Reservation", id: r.id }])
    );
    return this.v.facture(facture);
  }

  // =============================================================== Cafétaria

  private compteOuvert(compteId: string): Doc {
    const c = this.s.obtenir("CompteCafeteria", compteId);
    if (!c) throw erreur(404, `Aucun compte cafétaria trouvé avec l'identifiant ${compteId}.`);
    if (c.statut !== "OUVERT") throw erreur(409, "Ce compte cafétaria est déjà fermé (encaissé).");
    return c;
  }

  async ouvrirCompteCafeteria(d: { tableOuNom: string; nomPremierSousCompte?: string }) {
    const u = this.ctx.utilisateur();
    exigerRole(u, "CAFETARIA", "PATRON");
    exigerOperationnel(u);
    if (!texte(d.tableOuNom)) throw erreur(400, "Le nom de la table ou du client est obligatoire.");
    const compte = this.base({ id: uuid(), tableOuNom: texte(d.tableOuNom), statut: "OUVERT", origine: null, contactClient: null, noteClient: null, ouvertPar: u.userId, ouvertLe: iso(this.ctx.maintenant()), fermeLe: null });
    const premier = this.base({ id: uuid(), compteId: compte.id, nom: texte(d.nomPremierSousCompte) || "Personne 1", payeLe: null });
    await this.agir(
      [this.ecrire("CompteCafeteria", compte), this.ecrire("SousCompte", premier)],
      this.creation("CompteCafeteria", compte, { tableOuNom: compte.tableOuNom, nomPremierSousCompte: d.nomPremierSousCompte, premierSousCompteLocalId: premier.id })
    );
    return this.v.compte(compte);
  }

  async ajouterSousCompte(compteId: string, nom: string) {
    const u = this.ctx.utilisateur();
    exigerRole(u, "CAFETARIA", "PATRON");
    exigerOperationnel(u);
    const compte = this.compteOuvert(compteId);
    if (!texte(nom)) throw erreur(400, "Le nom de la personne est obligatoire.");
    const sc = this.base({ id: uuid(), compteId: compte.id, nom: texte(nom), payeLe: null });
    await this.agir([this.ecrire("SousCompte", sc)], this.creation("SousCompte", sc, { compteId: compte.id, nom: sc.nom }));
    return { ...sc, lignes: [] };
  }

  async ajouterLigne(compteId: string, d: { sousCompteId: string; produitId: string; quantite: number }) {
    const u = this.ctx.utilisateur();
    exigerRole(u, "CAFETARIA", "PATRON");
    exigerOperationnel(u);
    const compte = this.compteOuvert(compteId);
    const sc = this.s.obtenir("SousCompte", d.sousCompteId);
    if (!sc || sc.compteId !== compte.id) throw erreur(404, `Le sous-compte ${d.sousCompteId} n'appartient pas au compte ${compteId}.`);
    if (sc.payeLe) throw erreur(409, `${sc.nom} a déjà réglé sa part : on ne peut plus lui ajouter de consommation.`);
    const produit = this.v.produit(d.produitId);
    if (!produit) throw erreur(404, `Aucun produit trouvé avec l'identifiant ${d.produitId}.`);
    if (!produit.actif) throw erreur(409, `Le produit "${produit.nom}" n'est plus disponible à la vente.`);
    const quantite = Number(d.quantite);
    if (!(quantite > 0)) throw erreur(400, "La quantité doit être positive.");
    const estPlat = produit.typeProduit === "PLAT";
    let produitMaj: Doc | undefined;
    if (!estPlat) {
      const nouveau = Number(produit.stockActuel) - quantite;
      if (nouveau < 0) throw erreur(409, `Stock insuffisant pour "${produit.nom}" : ${produit.stockActuel} en stock, ${quantite} demandé(s).`);
      produitMaj = this.touche("Produit", { ...produit, stockActuel: String(nouveau) });
    } else if (produit.portionsDisponibles != null) {
      if (produit.portionsDisponibles < quantite) throw erreur(409, `Plus assez de portions de "${produit.nom}" pour cette commande (épuisé ou presque).`);
      produitMaj = this.touche("Produit", { ...produit, portionsDisponibles: produit.portionsDisponibles - quantite });
    }
    const ligne = this.base({
      id: uuid(), sousCompteId: sc.id, produitId: produit.id, quantite: String(quantite), prixUnitaire: produit.prix, devise: produit.devise,
      statut: estPlat && u.cuisineActivee ? "EN_ATTENTE" : "SERVI", prisEnChargeA: null, pretA: null, note: null,
    });
    await this.agir(
      [this.ecrire("LigneCommande", ligne), ...(produitMaj ? [this.ecrire("Produit", produitMaj)] : [])],
      this.creation("LigneCommande", ligne, { compteId: compte.id, sousCompteId: sc.id, produitId: produit.id, quantite }, produitMaj ? [{ entiteType: "Produit", id: produit.id }] : undefined)
    );
    return this.v.ligneAvecProduit(ligne);
  }

  async majStatutLigne(ligneId: string, statut: "EN_PREPARATION" | "PRET" | "SERVI") {
    const u = this.ctx.utilisateur();
    exigerRole(u, "CAFETARIA", "PATRON");
    const ligne = this.s.obtenir("LigneCommande", ligneId);
    if (!ligne) throw erreur(404, `Aucune ligne trouvée avec l'identifiant ${ligneId}.`);
    const ordre = ["EN_ATTENTE", "EN_PREPARATION", "PRET", "SERVI"];
    if (ordre.indexOf(statut) <= ordre.indexOf(ligne.statut)) throw erreur(409, `Cette ligne est déjà "${ligne.statut}" : le statut ne peut qu'avancer.`);
    const maintenant = iso(this.ctx.maintenant());
    const maj = this.touche("LigneCommande", { ...ligne, statut, ...(statut === "EN_PREPARATION" ? { prisEnChargeA: maintenant } : {}), ...(statut === "PRET" ? { pretA: maintenant } : {}) });
    await this.agir([this.ecrire("LigneCommande", maj)], { entiteType: "ActionLigne", localId: uuid(), operation: "CREATE", payload: { ligneId: ligne.id, statut }, touche: [{ entiteType: "LigneCommande", id: ligne.id }] });
    return this.v.ligneAvecProduit(maj);
  }

  async encaisserCompte(compteId: string, d: { mode: string; modePaiement: string; sousCompteId?: string; nombrePersonnes?: number; reservationLieeId?: string; deviseRegleeParClient?: string; montantRegleParClient?: number; deviseRenduChoisie?: string }) {
    const u = this.ctx.utilisateur();
    exigerRole(u, "CAFETARIA", "PATRON");
    exigerOperationnel(u);
    const compte = this.compteOuvert(compteId);
    const tous = this.v.sousComptes(compte.id);
    const restants = tous.filter((sc) => !sc.payeLe);
    const lignes = restants.flatMap((sc) => sc.lignes);
    if (lignes.length === 0) throw erreur(400, "Impossible d'encaisser un compte sans aucune ligne de commande à régler.");
    let personne: Doc | undefined;
    if (d.mode === "UNE_PERSONNE") {
      if (!d.sousCompteId) throw erreur(400, "sousCompteId est obligatoire pour un encaissement UNE_PERSONNE.");
      personne = restants.find((sc) => sc.id === d.sousCompteId);
      if (!personne) {
        if (tous.find((sc) => sc.id === d.sousCompteId)?.payeLe) throw erreur(409, "Cette personne a déjà réglé sa part.");
        throw erreur(404, `Le sous-compte ${d.sousCompteId} n'appartient pas au compte ${compteId}.`);
      }
      if (personne.lignes.length === 0) throw erreur(400, `${personne.nom} n'a aucune consommation à régler.`);
    }
    if (d.modePaiement === "FACTURE_CHAMBRE" && !d.reservationLieeId) throw erreur(400, "reservationLieeId est obligatoire pour un règlement FACTURE_CHAMBRE.");
    if (d.reservationLieeId && !this.s.obtenir("Reservation", d.reservationLieeId)) throw erreur(404, `Aucune réservation trouvée avec l'identifiant ${d.reservationLieeId}.`);
    const croise = d.deviseRegleeParClient !== undefined || d.montantRegleParClient !== undefined;
    if (croise && d.mode !== "GROUPE" && d.mode !== "UNE_PERSONNE") throw erreur(400, "Le paiement croisé n'est calculé que pour les modes d'encaissement GROUPE et UNE_PERSONNE dans cette version. Encaissez chaque vente séparément pour PAR_SOUS_COMPTE ou PARTAGE_EGAL.");
    if (d.mode === "PARTAGE_EGAL" && !d.nombrePersonnes) throw erreur(400, "nombrePersonnes est obligatoire pour un encaissement PARTAGE_EGAL.");
    if (!["GROUPE", "UNE_PERSONNE", "PAR_SOUS_COMPTE", "PARTAGE_EGAL"].includes(d.mode)) throw erreur(400, `Mode d'encaissement inconnu : ${d.mode}.`);

    const reglees = personne ? [personne] : restants.filter((sc) => sc.lignes.length > 0);
    const maintenant = iso(this.ctx.maintenant());
    const vente = (montants: { usd: number; cdf: number }, extra: Doc, numero: string): Doc =>
      this.base({
        id: uuid(), compteId: compte.id, sousCompteId: null, montantTotalUSD: String(montants.usd), montantTotalCDF: String(montants.cdf), modePaiement: d.modePaiement,
        deviseRegleeParClient: null, montantRegleParClient: null, tauxChangeApplique: null, deviseMonnaieRendue: null, montantMonnaieRendue: null,
        reservationLieeId: d.reservationLieeId ?? null, numeroRecu: numero, numeroProvisoire: numero, imprimeLe: null, annuleLe: null, motifAnnulation: null, createdBy: u.userId, ...extra,
      });

    const groupe = (lgs: Doc[], sousCompteId?: string): Doc => {
      const m = sommerParDevise(lgs as any);
      if (m.usd > 0 && m.cdf > 0 && croise) throw erreur(400, "Ce compte mélange des articles en USD et en CDF : le paiement croisé automatique n'est pas supporté pour un total mixte (section 9.4). Réglez en espèces classiques ou par mobile money.");
      let enc;
      try {
        enc = calculerEncaissement({ montantDu: m.usd > 0 ? m.usd : m.cdf, deviseDue: m.usd > 0 ? "USD" : "CDF", deviseRegleeParClient: d.deviseRegleeParClient as any, montantRegleParClient: d.montantRegleParClient, deviseRenduChoisie: d.deviseRenduChoisie as any, cdfParUsd: this.cdfParUsd() });
      } catch (e) {
        if (e instanceof ErreurRegle) throw erreur(400, e.message);
        throw e;
      }
      return vente(m, {
        sousCompteId: sousCompteId ?? null, deviseRegleeParClient: d.deviseRegleeParClient ?? null, montantRegleParClient: d.montantRegleParClient !== undefined ? String(d.montantRegleParClient) : null,
        tauxChangeApplique: enc.tauxChangeApplique !== undefined ? String(enc.tauxChangeApplique) : null, deviseMonnaieRendue: enc.deviseMonnaieRendue ?? null,
        montantMonnaieRendue: enc.montantMonnaieRendue !== undefined ? String(enc.montantMonnaieRendue) : null,
      }, "");
    };

    // Les ventes à créer (sans numéro), selon le mode.
    let brouillons: Doc[];
    if (d.mode === "GROUPE") brouillons = [groupe(restants.flatMap((sc) => sc.lignes))];
    else if (d.mode === "UNE_PERSONNE") brouillons = [groupe(personne!.lignes, personne!.id)];
    else if (d.mode === "PAR_SOUS_COMPTE") brouillons = restants.filter((sc) => sc.lignes.length > 0).map((sc) => vente(sommerParDevise(sc.lignes as any), {}, ""));
    else {
      const m = sommerParDevise(lignes as any);
      const n = Number(d.nombrePersonnes);
      const usd = repartirEnParts(m.usd, 2, n), cdf = repartirEnParts(m.cdf, 0, n);
      brouillons = Array.from({ length: n }, (_, i) => vente({ usd: usd[i], cdf: cdf[i] }, {}, ""));
    }
    const { numeros, ecriture } = this.numerosProvisoires(brouillons.length);
    const ventes: Doc[] = brouillons.map((b, i) => ({ ...b, numeroRecu: numeros[i], numeroProvisoire: numeros[i] }));

    const ecritures: OperationMagasin[] = [...ventes.map((x) => this.ecrire("VenteCafeteria", x)), ecriture];
    const touche: Operation["touche"] = [{ entiteType: "CompteCafeteria", id: compte.id }];
    for (const sc of reglees) {
      const { lignes: _l, ...brut } = sc;
      ecritures.push(this.ecrire("SousCompte", this.touche("SousCompte", { ...brut, payeLe: maintenant })));
      touche.push({ entiteType: "SousCompte", id: sc.id });
    }
    const ids = new Set(reglees.map((sc) => sc.id));
    const resteADevoir = restants.some((sc) => sc.lignes.length > 0 && !ids.has(sc.id));
    if (!resteADevoir) ecritures.push(this.ecrire("CompteCafeteria", this.touche("CompteCafeteria", { ...compte, statut: "FERME", fermeLe: maintenant })));

    await this.agir(ecritures, {
      entiteType: "VenteCafeteria", localId: ventes[0].id, operation: "CREATE", touche,
      payload: {
        compteId: compte.id, mode: d.mode, modePaiement: d.modePaiement, sousCompteId: d.sousCompteId, nombrePersonnes: d.nombrePersonnes, reservationLieeId: d.reservationLieeId,
        deviseRegleeParClient: d.deviseRegleeParClient, montantRegleParClient: d.montantRegleParClient, deviseRenduChoisie: d.deviseRenduChoisie,
        ventesLocalIds: ventes.map((x) => x.id), numerosProvisoires: numeros,
      },
    });
    return ventes;
  }

  // =============================================================== Dépenses

  async creerDepense(d: { date: string; motif: string; montant: number; devise: string }) {
    const u = this.ctx.utilisateur();
    if (u.role === "PATRON") throw erreur(403, "Le patron consulte les dépenses mais ne les saisit pas.");
    exigerRole(u, "RECEPTIONNISTE", "CAFETARIA");
    this.validerDepense(d);
    const depense = this.base({
      id: uuid(), departement: u.role === "CAFETARIA" ? "CAFETERIA" : "RECEPTION", date: `${d.date}T00:00:00.000Z`, motif: texte(d.motif), montant: String(Math.round(Number(d.montant) * 100) / 100),
      devise: d.devise, creeParId: u.userId, creeParNom: u.nom, annulee: false, annuleeLe: null,
    });
    await this.agir([this.ecrire("Depense", depense)], this.creation("Depense", depense, { date: d.date, motif: d.motif, montant: d.montant, devise: d.devise }));
    return { ...depense, date: d.date };
  }

  private validerDepense(d: Partial<{ date: string; motif: string; montant: number; devise: string }>) {
    if (d.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) throw erreur(400, "La date doit être au format AAAA-MM-JJ.");
    if (d.motif !== undefined && (texte(d.motif).length < 3 || texte(d.motif).length > 200)) throw erreur(400, "Le motif doit faire entre 3 et 200 caractères.");
    if (d.montant !== undefined && !(Number(d.montant) > 0)) throw erreur(400, "Le montant doit être supérieur à zéro.");
    if (d.devise !== undefined && d.devise !== "USD" && d.devise !== "CDF") throw erreur(400, "La devise doit être USD ou CDF.");
  }

  async modifierDepense(id: string, d: Partial<{ date: string; motif: string; montant: number; devise: string; annulee: boolean }>) {
    const u = this.ctx.utilisateur();
    if (u.role === "PATRON") throw erreur(403, "Le patron consulte les dépenses mais ne les saisit pas.");
    const dep = this.s.obtenir("Depense", id);
    if (!dep) throw erreur(404, "Dépense introuvable.");
    if (dep.departement !== (u.role === "CAFETARIA" ? "CAFETERIA" : "RECEPTION")) throw erreur(403, "Cette dépense appartient à un autre département.");
    if (dep.annulee) throw erreur(400, "Cette dépense est annulée : elle ne peut plus être modifiée.");
    this.validerDepense(d);
    if (d.annulee !== undefined && d.annulee !== true) throw erreur(400, "Une annulation est définitive.");
    const champs: Doc = {};
    if (d.date !== undefined) champs.date = `${d.date}T00:00:00.000Z`;
    if (d.motif !== undefined) champs.motif = texte(d.motif);
    if (d.montant !== undefined) champs.montant = String(Math.round(Number(d.montant) * 100) / 100);
    if (d.devise !== undefined) champs.devise = d.devise;
    if (d.annulee) Object.assign(champs, { annulee: true, annuleeLe: iso(this.ctx.maintenant()) });
    const maj = this.touche("Depense", { ...dep, ...champs });
    await this.agir([this.ecrire("Depense", maj)], this.modification("Depense", dep, d as Record<string, unknown>));
    return { ...maj, date: String(maj.date).slice(0, 10) };
  }
}
