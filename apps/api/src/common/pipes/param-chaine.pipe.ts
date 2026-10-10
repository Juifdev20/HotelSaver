import { BadRequestException, Injectable, PipeTransform } from "@nestjs/common";

/**
 * Paramètre de requête qui doit être une simple chaîne (ou absent). Express/qs transforme `?x[startsWith]=a` en OBJET ; passé tel quel
 * à Prisma, il deviendrait un filtre (`{ startsWith: "a" }`) au lieu d'une valeur exacte et contournerait les contrôles du service.
 */
@Injectable()
export class ParamChainePipe implements PipeTransform<unknown, string | undefined> {
  transform(valeur: unknown): string | undefined {
    if (valeur === undefined) return undefined;
    if (typeof valeur !== "string") throw new BadRequestException("Paramètre de requête invalide.");
    return valeur.length > 200 ? valeur.slice(0, 200) : valeur;
  }
}

/** Entier borné (défaut si absent) — jamais de NaN ni de limite démesurée. */
export class ParamEntierPipe implements PipeTransform<unknown, number> {
  constructor(private readonly min: number, private readonly max: number, private readonly defaut: number) {}

  transform(valeur: unknown): number {
    if (valeur === undefined || valeur === "") return this.defaut;
    // Le ValidationPipe global a déjà converti "100" en 100 pour un paramètre typé number : on accepte les deux formes.
    const n = typeof valeur === "string" ? Number(valeur) : typeof valeur === "number" ? valeur : NaN;
    if (!Number.isInteger(n)) throw new BadRequestException("Paramètre de requête invalide.");
    return Math.min(this.max, Math.max(this.min, n));
  }
}
