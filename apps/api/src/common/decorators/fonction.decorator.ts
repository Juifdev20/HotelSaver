import { SetMetadata } from "@nestjs/common";
import type { Fonction as CodeFonction } from "@hotel-chicago/regles";

export const FONCTION_KEY = "fonctionRequise";

/**
 * La route n'existe que si la formule de l'hôtel ouvre cette fonction (RECEPTION, CAFETERIA, SITE_PUBLIC…). Lu par SupabaseAuthGuard ;
 * sinon 403 FONCTION_NON_INCLUSE avec un message qui dit quoi faire. Plusieurs fonctions = toutes sont nécessaires.
 */
export const Fonction = (...fonctions: CodeFonction[]) => SetMetadata(FONCTION_KEY, fonctions);
