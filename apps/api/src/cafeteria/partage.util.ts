/**
 * Répartit un montant en N parts égales sans perte par arrondi : travaille en
 * plus petite unité de la devise (centimes pour USD, francs entiers pour CDF)
 * et distribue le reste de la division entière aux premières parts, pour que
 * la somme des parts reconstitue exactement le total (section 9.2, "PARTAGE_EGAL").
 */
export function repartirEnParts(total: number, decimales: number, nombreDeParts: number): number[] {
  const unites = Math.round(total * 10 ** decimales);
  const base = Math.floor(unites / nombreDeParts);
  const reste = unites - base * nombreDeParts;

  return Array.from({ length: nombreDeParts }, (_, index) => {
    const unitesPart = base + (index < reste ? 1 : 0);
    return unitesPart / 10 ** decimales;
  });
}
