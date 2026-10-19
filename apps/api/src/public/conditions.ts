import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@hotel-chicago/database";

/**
 * Conditions d'utilisation (19/10/2026) : texte versionné (table ConditionsUtilisation), publié depuis le super-admin. Une
 * inscription d'hôtel doit envoyer la version qu'elle a fait accepter ; elle est enregistrée sur l'hôtel (preuve).
 */
export const MESSAGE_CONDITIONS_ABSENTES =
  "Acceptez les conditions d'utilisation. Mettez l'application à jour si la case n'apparaît pas.";
export const MESSAGE_CONDITIONS_PERIMEES =
  "Les conditions d'utilisation ont changé : relisez-les et acceptez la nouvelle version.";

/** Dernière version publiée. */
export async function conditionsActuelles(prisma: PrismaClient) {
  const conditions = await prisma.conditionsUtilisation.findFirst({
    orderBy: { version: "desc" },
    select: { version: true, texte: true, publieLe: true },
  });
  if (!conditions) throw new NotFoundException("Aucune condition d'utilisation n'est publiée.");
  return conditions;
}

/** Vérifie que l'inscription a fait accepter la DERNIÈRE version ; renvoie le numéro à enregistrer sur l'hôtel. */
export async function verifierConditionsAcceptees(prisma: PrismaClient, version: number | undefined): Promise<number> {
  if (version === undefined || version === null) throw new BadRequestException(MESSAGE_CONDITIONS_ABSENTES);
  const { version: derniere } = await conditionsActuelles(prisma);
  if (version !== derniere) throw new BadRequestException(MESSAGE_CONDITIONS_PERIMEES);
  return derniere;
}
