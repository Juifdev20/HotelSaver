/**
 * Messages d'erreur à montrer à l'écran : du français simple, jamais « Erreur 500 sur /factures/… », « Network request failed »
 * ou un message anglais de bibliothèque. Les messages métier du serveur (déjà en français) passent tels quels.
 * (Une table centrale dans api-client est prévue — U13 ; en attendant, ce filtre local couvre le terrain.)
 */
const PAR_STATUT: Record<number, string> = {
  400: "La demande n'est pas valide. Vérifiez les informations saisies.",
  401: "Votre session a expiré : reconnectez-vous.",
  403: "Vous n'avez pas le droit de faire cette action.",
  404: "Élément introuvable : il a peut-être été supprimé. Actualisez la liste.",
  409: "Cette information a changé entre-temps. Actualisez puis recommencez.",
  413: "Le fichier est trop volumineux.",
  429: "Trop de demandes en peu de temps. Patientez un instant puis réessayez.",
};

const MOTIFS_RESEAU = /network request failed|failed to fetch|network error|timeout|timed out|aborted|abort|socket|ECONN|ENOTFOUND/i;
const MOTIFS_BLUETOOTH = /bluetooth|rfcomm|read failed|socket might closed|device not connected/i;
const MOTIFS_TECHNIQUES = /\b(error|exception|undefined|null|cannot|unable|unexpected|invalid|failed|not found|forbidden|unauthorized|internal server)\b|^\s*[{[<]/i;

export function messageErreur(erreur: unknown, parDefaut = "Une erreur est survenue. Réessayez."): string {
  const message = erreur instanceof Error ? erreur.message.trim() : typeof erreur === "string" ? erreur.trim() : "";
  const statut = typeof (erreur as { statusCode?: unknown } | null)?.statusCode === "number" ? (erreur as { statusCode: number }).statusCode : undefined;

  if (!message) return parDefaut;
  // « Erreur 500 sur /chemin. » (message de repli de l'api-client quand le serveur n'a rien dit d'utile)
  const generique = /^Erreur (\d{3}) sur /.exec(message);
  const code = generique ? Number(generique[1]) : undefined;
  if (code !== undefined || (statut !== undefined && statut >= 500)) {
    const s = code ?? statut!;
    if (s >= 500) return "Le serveur a rencontré un problème. Réessayez dans un instant ; si cela continue, prévenez le patron.";
    return PAR_STATUT[s] ?? parDefaut;
  }
  if (MOTIFS_BLUETOOTH.test(message) && !/imprimante/i.test(message)) {
    return "L'imprimante ne répond pas : vérifiez qu'elle est allumée, proche du téléphone et appairée en Bluetooth.";
  }
  if (MOTIFS_RESEAU.test(message) && !/serveur de l'hôtel|connexion/i.test(message)) {
    return "Pas de connexion au serveur. Vérifiez le réseau puis réessayez.";
  }
  // Message en anglais / technique : on ne l'affiche pas tel quel.
  if (MOTIFS_TECHNIQUES.test(message) && !/[àâçéèêëîïôùûüœ]/i.test(message)) return parDefaut;
  return message;
}
