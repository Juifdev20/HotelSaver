import { ErreurApi } from "@hotel-chicago/api-client";
import type { Role } from "@hotel-chicago/types";
import type { StockageDocuments } from "./stockage-documents";
import type { Vues } from "./vues";

/** L'utilisateur connecté, tel que connu localement (copie du profil mémorisée à la dernière connexion). */
export interface UtilisateurLocal {
  userId: string;
  hotelId: string;
  role: Role | "PATRON" | "RECEPTIONNISTE" | "CAFETARIA";
  nom: string;
  patronPeutOperer?: boolean;
  cuisineActivee?: boolean;
  commandeWebActivee?: boolean;
}

export interface Contexte {
  stockage: StockageDocuments;
  vues: Vues;
  utilisateur(): UtilisateurLocal;
  /** Prévient le moteur qu'une action vient d'être mise en file (envoi immédiat si le réseau est là). */
  declencher(): void;
  /** Identifiant court de CET appareil, pour les numéros de reçus provisoires. */
  codePoste(): string;
  maintenant(): Date;
}

export const MESSAGE_PATRON_NON_OPERANT =
  "Le patron ne réalise pas les opérations du quotidien (réception, caisse). Activez « Le patron peut aussi opérer » dans Paramètres si nécessaire.";

/** Erreur de règle métier, présentée comme le ferait le serveur (mêmes statuts, messages affichables tels quels). */
export function erreur(statut: 400 | 403 | 404 | 409, message: string): ErreurApi {
  return new ErreurApi(statut, message);
}

export function exigerOperationnel(u: UtilisateurLocal): void {
  if (u.role === "PATRON" && u.patronPeutOperer !== true) throw erreur(403, MESSAGE_PATRON_NON_OPERANT);
}

export function exigerRole(u: UtilisateurLocal, ...roles: string[]): void {
  if (!roles.includes(u.role)) throw erreur(403, "Votre rôle n'a pas accès à cette fonction.");
}
