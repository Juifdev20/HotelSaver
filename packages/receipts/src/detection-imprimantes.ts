/**
 * Aide à choisir son imprimante sur l'ordinateur sans rien saisir : les imprimantes installées dans Windows et les ports série
 * (dont ceux créés par une imprimante Bluetooth appairée) sont reconnus et classés ; l'utilisateur n'a plus qu'à choisir dans une liste.
 * Logique pure (testée) : la lecture de Windows se fait côté application bureau.
 */

/** Ce que renvoie Electron (`webContents.getPrintersAsync`) pour chaque imprimante installée. */
export interface InfoImprimanteSysteme {
  name: string;
  displayName?: string;
  description?: string;
  /** Drapeaux d'état Windows (PRINTER_STATUS_*) ; 0 = prête. */
  status?: number;
  isDefault?: boolean;
}

/** Un port série vu par Windows, ex. « Standard Serial over Bluetooth link (COM5) ». */
export interface PortSerie {
  port: string;
  nom: string;
}

export interface ImprimanteProposee {
  /** Valeur enregistrée dans la configuration : `windows:<nom>` ou `\\.\COM5`. */
  interface: string;
  type: "windows" | "serie";
  nom: string;
  /** Ligne d'explication affichée sous le nom. */
  detail: string;
  /** Ressemble à une imprimante de tickets (nom connu) : mise en tête de liste. */
  recommandee: boolean;
  parDefaut: boolean;
  /** Windows la voit éteinte ou déconnectée (information : cet état est parfois faux pour le Bluetooth). */
  horsLigne: boolean;
  bluetooth: boolean;
}

const PRINTER_STATUS_OFFLINE = 0x80;

/** Marques et mots courants des imprimantes de tickets thermiques (58 / 80 mm). */
const IMPRIMANTE_TICKET = /(pos|thermal|thermique|receipt|ticket|re[cç]u|\b58\b|\b80\b|xprinter|x-printer|xp-?\d{2}|epson\s*tm|tm-t|star\s*(tsp|sp)|rongta|gprinter|goojprt|bixolon|citizen|zjiang|zj-|sunmi|munbyn|hoin|netum|rpp|mpt|pt-?210|bt-?printer)/i;

/** Imprimantes virtuelles : elles ne reçoivent pas d'octets d'imprimante de tickets. */
const IMPRIMANTE_VIRTUELLE = /(pdf|xps|onenote|fax|microsoft print|document writer|send to|anydesk|snagit|cutepdf|bullzip|webex|teams)/i;

export function proposerImprimantes(systeme: InfoImprimanteSysteme[], ports: PortSerie[]): ImprimanteProposee[] {
  const windows: ImprimanteProposee[] = systeme
    .filter((i) => i.name && !IMPRIMANTE_VIRTUELLE.test(i.name))
    .map((i) => {
      const recommandee = IMPRIMANTE_TICKET.test(`${i.name} ${i.displayName ?? ""} ${i.description ?? ""}`);
      const horsLigne = ((i.status ?? 0) & PRINTER_STATUS_OFFLINE) !== 0;
      return {
        interface: `windows:${i.name}`,
        type: "windows" as const,
        nom: i.displayName?.trim() || i.name,
        detail: "Imprimante installée dans Windows (USB, réseau ou Bluetooth)",
        recommandee,
        parDefaut: i.isDefault === true,
        horsLigne,
        bluetooth: /bluetooth/i.test(`${i.name} ${i.description ?? ""}`),
      };
    });

  const serie: ImprimanteProposee[] = ports.map((p) => {
    const bluetooth = /bluetooth/i.test(p.nom);
    return {
      interface: `\\\\.\\${p.port}`,
      type: "serie" as const,
      nom: `${bluetooth ? "Imprimante Bluetooth" : "Port série"} (${p.port})`,
      detail: p.nom,
      recommandee: bluetooth,
      parDefaut: false,
      horsLigne: false,
      bluetooth,
    };
  });

  // Les imprimantes de tickets d'abord, puis celle par défaut de Windows, puis l'ordre alphabétique.
  const rang = (i: ImprimanteProposee) => (i.recommandee ? 0 : 2) + (i.type === "serie" ? 1 : 0) + (i.parDefaut ? -0.5 : 0);
  return [...windows, ...serie].sort((a, b) => rang(a) - rang(b) || a.nom.localeCompare(b.nom, "fr"));
}

/** Extrait les ports série d'une liste de noms de périphériques Windows (une ligne par périphérique). */
export function extrairePortsSerie(lignes: string[]): PortSerie[] {
  const vus = new Set<string>();
  const ports: PortSerie[] = [];
  for (const ligne of lignes) {
    const m = /\((COM\d{1,3})\)/i.exec(ligne);
    if (!m) continue;
    const port = m[1].toUpperCase();
    if (vus.has(port)) continue;
    vus.add(port);
    ports.push({ port, nom: ligne.trim() });
  }
  return ports.sort((a, b) => Number(a.port.slice(3)) - Number(b.port.slice(3)));
}

/** Traduit un code d'erreur Windows (spouleur d'impression) en phrase compréhensible par l'utilisateur. */
export function libelleErreurSpouleur(codeWin32: number | null, etape?: string): string {
  switch (codeWin32) {
    case 1801:
    case 1802:
      return "Windows ne reconnaît plus cette imprimante (elle a peut-être été renommée ou supprimée). Choisissez-la de nouveau dans la liste.";
    case 5:
      return "Windows refuse l'accès à cette imprimante. Vérifiez qu'elle n'est pas utilisée par un autre programme, puis réessayez.";
    case 1722:
    case 1723:
      return "L'imprimante réseau ne répond pas. Vérifiez qu'elle est allumée et branchée sur le même réseau.";
    case 1167:
    case 21:
      return "L'imprimante est déconnectée ou éteinte. Allumez-la, vérifiez le câble ou le Bluetooth, puis réessayez.";
    case 1804:
      return "Ce pilote d'imprimante n'accepte pas l'impression directe. Dans Windows, choisissez le pilote « Generic / Text Only » pour cette imprimante.";
    default:
      return `Windows n'a pas pu envoyer le ticket à l'imprimante${etape ? ` (étape ${etape}` : ""}${codeWin32 ? `${etape ? ", " : " ("}code ${codeWin32})` : etape ? ")" : ""}. Vérifiez qu'elle est allumée et prête.`;
  }
}
