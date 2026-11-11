import type { PrismaClient } from "@hotel-chicago/database";
import type { EditeurContrat } from "@hotel-chicago/regles";

/** Champs d'identité de l'éditeur qui peuvent être vidés (le nom, lui, est obligatoire). */
export const CHAMPS_EDITEUR_FACULTATIFS = ["editeurAdresse", "editeurRccm", "editeurNif", "editeurRepresentant", "editeurFonction", "editeurTelephone", "editeurEmail"] as const;

export interface IdentiteEditeur {
  editeurNom: string;
  editeurAdresse: string | null;
  editeurRccm: string | null;
  editeurNif: string | null;
  editeurRepresentant: string | null;
  editeurFonction: string | null;
  editeurTelephone: string | null;
  editeurEmail: string | null;
}

/** L'identité de l'éditeur (réglée dans le super-admin), lue sans cache : elle est imprimée sur chaque contrat et chaque reçu. */
export async function lireEditeur(prisma: PrismaClient): Promise<IdentiteEditeur> {
  const p = await prisma.parametresPlateforme.findUnique({ where: { id: "plateforme" } });
  return {
    editeurNom: p?.editeurNom || "HotelSaver",
    editeurAdresse: p?.editeurAdresse ?? null,
    editeurRccm: p?.editeurRccm ?? null,
    editeurNif: p?.editeurNif ?? null,
    editeurRepresentant: p?.editeurRepresentant ?? null,
    editeurFonction: p?.editeurFonction ?? null,
    editeurTelephone: p?.editeurTelephone ?? null,
    editeurEmail: p?.editeurEmail ?? null,
  };
}

export function editeurPourContrat(i: IdentiteEditeur): EditeurContrat {
  return { nom: i.editeurNom, adresse: i.editeurAdresse, rccm: i.editeurRccm, nif: i.editeurNif, representant: i.editeurRepresentant, fonction: i.editeurFonction, telephone: i.editeurTelephone, email: i.editeurEmail };
}
