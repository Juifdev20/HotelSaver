import type { PrismaClient } from "@hotel-chicago/database";
import { FORMULES, PARAMETRES_PAR_DEFAUT, PROTECTION_ESSAI_PAR_DEFAUT, estFonction, type FormuleAbonnement, type ParametresAbonnement, type ParametresProtectionEssai } from "@hotel-chicago/regles";

/** Ce que le super-admin règle pour toute la plateforme, en plus des formules. */
export interface ReglagesPlateforme extends ParametresAbonnement, ParametresProtectionEssai {
  fraisAbonnementPayesParClient: boolean;
  contactTelephone: string;
  contactWhatsapp: string;
}

export interface Catalogue {
  /** TOUTES les formules, y compris celles qui ne sont plus proposées (les hôtels qui les ont déjà les gardent). */
  formules: FormuleAbonnement[];
  /** Codes des formules encore proposées à l'achat, dans l'ordre d'affichage. */
  proposees: string[];
  parametres: ReglagesPlateforme;
}

const DUREE_CACHE_MS = 30_000;
let cache: { le: number; valeur: Catalogue } | null = null;

const PAR_DEFAUT: Catalogue = {
  formules: FORMULES,
  proposees: FORMULES.map((f) => f.code),
  parametres: { ...PARAMETRES_PAR_DEFAUT, ...PROTECTION_ESSAI_PAR_DEFAUT, fraisAbonnementPayesParClient: true, contactTelephone: "+243828497218", contactWhatsapp: "+243828497218" },
};

/** À appeler après toute modification faite par le super-admin : l'instance qui a écrit voit le changement tout de suite (les autres, sous 30 s). */
export function invaliderCatalogue(): void {
  cache = null;
}

/**
 * Formules et réglages, lus dans la base et gardés 30 secondes en mémoire (la garde d'accès les consulte à CHAQUE requête). Jamais d'erreur
 * remontée si la base répond mal : on retombe sur les valeurs de départ plutôt que de bloquer tous les hôtels.
 */
export async function lireCatalogue(prisma: PrismaClient, maintenant = Date.now()): Promise<Catalogue> {
  if (cache && maintenant - cache.le < DUREE_CACHE_MS) return cache.valeur;
  try {
    const p = prisma as any;
    const [lignes, reglages] = await Promise.all([p.formuleAbonnement.findMany({ orderBy: [{ ordre: "asc" }, { prixMensuelUsd: "asc" }] }), p.parametresPlateforme.findUnique({ where: { id: "plateforme" } })]);
    if (!Array.isArray(lignes) || lignes.length === 0) return PAR_DEFAUT;
    const formules: FormuleAbonnement[] = lignes.map((l: any) => ({
      code: l.code,
      nom: l.nom,
      description: l.description ?? "",
      prixMensuelUsd: Number(l.prixMensuelUsd),
      maxChambres: l.maxChambres ?? null,
      recommandee: l.recommandee === true,
      fonctions: (l.fonctions ?? []).filter(estFonction),
      avantages: l.avantages ?? [],
    }));
    const valeur: Catalogue = {
      formules,
      proposees: lignes.filter((l: any) => l.actif).map((l: any) => l.code),
      parametres: reglages
        ? {
            tauxCdf: reglages.tauxCdf,
            moisOffertsAnnuel: reglages.moisOffertsAnnuel,
            joursEssai: reglages.joursEssai,
            joursGrace: reglages.joursGrace,
            fonctionsEssai: (reglages.fonctionsEssai ?? []).filter(estFonction),
            fraisAbonnementPayesParClient: reglages.fraisAbonnementPayesParClient,
            contactTelephone: reglages.contactTelephone,
            contactWhatsapp: reglages.contactWhatsapp,
            joursAvantSuppression: reglages.joursAvantSuppression ?? PROTECTION_ESSAI_PAR_DEFAUT.joursAvantSuppression,
            maxChambresEssai: reglages.maxChambresEssai ?? PROTECTION_ESSAI_PAR_DEFAUT.maxChambresEssai,
            maxProduitsEssai: reglages.maxProduitsEssai ?? PROTECTION_ESSAI_PAR_DEFAUT.maxProduitsEssai,
            maxPhotosGalerieEssai: reglages.maxPhotosGalerieEssai ?? PROTECTION_ESSAI_PAR_DEFAUT.maxPhotosGalerieEssai,
            maxInscriptionsParJour: reglages.maxInscriptionsParJour ?? PROTECTION_ESSAI_PAR_DEFAUT.maxInscriptionsParJour,
          }
        : PAR_DEFAUT.parametres,
    };
    cache = { le: maintenant, valeur };
    return valeur;
  } catch {
    return cache?.valeur ?? PAR_DEFAUT;
  }
}
