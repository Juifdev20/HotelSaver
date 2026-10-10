export * from "./magasin";
export * from "./persistance-memoire";
export * from "./persistance-indexeddb";
export * from "./references";
export * from "./stockage-documents";
export * from "./contexte";
export * from "./vues";
export * from "./ecritures";
export * from "./client-hors-ligne";
export * from "./ouvrir-miroir";
export * from "./session-locale";
export * from "./gestionnaire-session";
export * from "./persistance-sqlite";

// Lecture des montants tapés : un seul lecteur pour le bureau (qui n'a pas `regles` en dépendance directe) et le mobile.
export { lireMontant, lireQuantite, lireTauxChange, TAUX_CDF_PAR_USD_MIN, TAUX_CDF_PAR_USD_MAX } from "@hotel-chicago/regles";
export type { ResultatSaisie } from "@hotel-chicago/regles";
export * from "./persistance-chiffree";
