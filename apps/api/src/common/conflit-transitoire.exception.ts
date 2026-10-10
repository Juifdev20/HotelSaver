import { ConflictException } from "@nestjs/common";

/**
 * Conflit qui disparaît en réessayant (ex. le stock a bougé entre la lecture et l'écriture). Pour l'appelant HTTP c'est un 409
 * comme un autre ; pour la synchronisation, c'est une panne passagère : l'action repart plus tard sans compter un échec.
 */
export class ConflitTransitoireException extends ConflictException {}
