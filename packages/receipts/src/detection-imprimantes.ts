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
  /** Port créé par un appareil Bluetooth appairé (identifiant Windows BTHENUM), quelle que soit la langue de Windows. */
  bluetooth?: boolean;
  /** Port Bluetooth : nom de l'appareil appairé et son adresse (« 5A:4A:13:4E:3F:47 »), quand Windows les donne. */
  appareil?: string;
  adresse?: string;
  /** Port Bluetooth « entrant » : Windows l'ouvre pour qu'un autre appareil se connecte AU PC ; on ne peut pas imprimer dessus. */
  entrant?: boolean;
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
const IMPRIMANTE_TICKET = /(pos|thermal|thermique|receipt|ticket|re[cç]u|\b58\b|\b80\b|xprinter|x-printer|xp-?\d{2}|epson\s*tm|tm-t|star\s*(tsp|sp)|rongta|gprinter|goojprt|bixolon|citizen|zjiang|zj-|sunmi|munbyn|hoin|netum|rpp|mpt|pt-?210|bt-?printer|printer|imprimante)/i;

/** Vrai si le nom évoque une imprimante de tickets : sert UNIQUEMENT à classer la liste (toutes les marques restent proposées). */
export function ressembleAImprimante(nom: string): boolean {
  return IMPRIMANTE_TICKET.test(nom);
}

/** Largeur du papier des imprimantes de tickets : 58 mm (≈ 32 caractères) ou 80 mm (≈ 48 caractères). */
export type LargeurPapier = 58 | 80;
export const COLONNES_PAR_LARGEUR: Record<LargeurPapier, number> = { 58: 32, 80: 48 };

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

  const serie: ImprimanteProposee[] = ports
    // Un port « entrant » sert à un autre appareil qui appelle le PC : il ne mène à aucune imprimante, on ne le propose pas.
    .filter((p) => !p.entrant)
    .map((p) => {
      const bluetooth = p.bluetooth ?? /bluetooth/i.test(p.nom);
      const nomAppareil = p.appareil?.trim();
      return {
        interface: `\\\\.\\${p.port}`,
        type: "serie" as const,
        nom: `${nomAppareil || (bluetooth ? "Appareil Bluetooth" : "Port série")} (${p.port})`,
        detail: bluetooth
          ? `Appareil Bluetooth appairé${p.adresse ? ` · ${p.adresse}` : ""} · port ${p.port}`
          : p.nom,
        // Reconnu comme imprimante d'après son nom ; un appareil dont le nom est inconnu reste proposé, mais sans recommandation.
        recommandee: nomAppareil ? IMPRIMANTE_TICKET.test(nomAppareil) : false,
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

/**
 * Lit la sortie du script PowerShell de détection : une ligne `PORT|<nom du port>|<identifiant Windows>` par port série et une ligne
 * `BT|<identifiant Windows>|<nom de l'appareil>` par appareil Bluetooth appairé. Windows crée DEUX ports par appareil Bluetooth :
 * le port « sortant » (identifiant terminé par `_C00000000`, adresse de l'appareil incluse), seul utile pour imprimer, et un port
 * « entrant » (`LOCALMFG`). Le nom de l'appareil (« BlueTooth Printer ») est retrouvé par son adresse.
 */
export function extrairePortsBluetooth(lignes: string[]): PortSerie[] {
  const appareils = new Map<string, string>();
  for (const ligne of lignes) {
    const [type, identifiant, ...reste] = ligne.split("|");
    if (type?.trim() !== "BT") continue;
    const adresse = /DEV_([0-9A-F]{12})/i.exec(identifiant ?? "")?.[1];
    const nom = reste.join("|").trim();
    if (adresse && nom) appareils.set(adresse.toUpperCase(), nom);
  }
  const ports: PortSerie[] = [];
  const vus = new Set<string>();
  for (const ligne of lignes) {
    const [type, nom, ...reste] = ligne.split("|");
    if (type?.trim() !== "PORT") continue;
    const m = /\((COM\d{1,3})\)/i.exec(nom ?? "");
    if (!m) continue;
    const port = m[1].toUpperCase();
    if (vus.has(port)) continue;
    vus.add(port);
    const identifiant = reste.join("|");
    if (!/^BTHENUM/i.test(identifiant)) {
      ports.push({ port, nom: nom.trim() });
      continue;
    }
    const entrant = /LOCALMFG/i.test(identifiant);
    const hex = /([0-9A-F]{12})_C0*$/i.exec(identifiant)?.[1]?.toUpperCase();
    ports.push({
      port,
      nom: nom.trim(),
      bluetooth: true,
      entrant,
      appareil: hex ? appareils.get(hex) : undefined,
      adresse: hex ? (hex.match(/.{2}/g) ?? []).join(":") : undefined,
    });
  }
  return ports.sort((a, b) => Number(a.port.slice(3)) - Number(b.port.slice(3)));
}

/** Traduit une erreur de l'écriture sur un port série (COM, dont le Bluetooth) en phrase compréhensible. */
export function libelleErreurPortSerie(typeErreur: string, port: string): string {
  if (/UnauthorizedAccess/i.test(typeErreur)) {
    return `Le port ${port} est déjà utilisé : fermez le programme qui s'en sert, ou déconnectez l'imprimante de l'autre appareil, puis réessayez.`;
  }
  if (/FileNotFound|ArgumentException|DirectoryNotFound/i.test(typeErreur)) {
    return `Le port ${port} n'existe plus. Appuyez sur « Actualiser » et choisissez l'imprimante dans la liste.`;
  }
  return (
    `L'imprimante ne répond pas sur ${port}. Allumez-la, rapprochez-la de l'ordinateur et déconnectez-la du téléphone ` +
    "(une imprimante Bluetooth ne parle qu'à un seul appareil à la fois). Si elle a été réinitialisée, appairez-la de nouveau dans les réglages Bluetooth de Windows."
  );
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
