/** Ce qu'un écran d'encaissement sait du moteur de synchronisation : de quoi attendre le numéro définitif d'un reçu avant de l'imprimer. */
export interface SynchronisationEcran {
  forcer: () => Promise<void>;
  enLigne: () => boolean;
}
