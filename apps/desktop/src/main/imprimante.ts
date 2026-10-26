import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WebContents } from "electron";
import { printer as ThermalPrinter, types as PrinterTypes, characterSet as CharacterSet } from "node-thermal-printer";
import { interfaceImprimanteValide, lireConfiguration } from "./config-store";
import {
  COLONNES_PAR_LARGEUR,
  commandesCodeBarre,
  extrairePortsBluetooth,
  libelleErreurPortSerie,
  libelleErreurSpouleur,
  nettoyerTexteImpression,
  proposerImprimantes,
  type ImprimanteProposee,
  type LigneRecu,
} from "@hotel-chicago/receipts";

/**
 * Traduit `LigneRecu[]` vers l'API haut niveau de `node-thermal-printer` —
 * pas besoin du générateur ESC/POS manuel ici, contrairement au mobile (voir
 * le plan). `interfaceImprimante` accepte :
 * - `tcp://ip:port` (imprimante réseau — port 9100 quasi standard pour les
 *   imprimantes ESC/POS bon marché) ;
 * - un chemin de périphérique brut (`\\.\COM5` sous Windows, `/dev/usb/lp0`
 *   sous Linux — port série/USB, y compris un appareil Bluetooth appairé
 *   exposé comme port série par Windows).
 * - `windows:<nom>` : une imprimante INSTALLÉE dans Windows (USB, réseau, Bluetooth,
 *   quel que soit le port). Les octets ESC/POS sont envoyés en mode « RAW » à la
 *   file d'impression par l'API Windows (winspool), appelée depuis PowerShell :
 *   aucun paquet natif à compiler. C'est le mode conseillé (26/10/2026) : le
 *   patron choisit son imprimante dans une liste, sans saisir d'adresse.
 */
function construireImprimante(interfaceImprimante: string) {
  return new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: interfaceImprimante,
    characterSet: CharacterSet.PC850_MULTILINGUAL,
    // Les lignes de tirets et les montants alignés suivent la largeur du papier (58 ou 80 mm) choisie par l'utilisateur.
    width: COLONNES_PAR_LARGEUR[lireConfiguration().imprimanteLargeur === 80 ? 80 : 58],
  });
}

/** Aucun octet de commande ne doit passer dans un texte : voir `nettoyerTexteImpression`. */
function assainir(ligne: LigneRecu): LigneRecu {
  const nettoyer = (texte: unknown) => (typeof texte === "string" ? nettoyerTexteImpression(texte) : texte);
  return Object.fromEntries(Object.entries(ligne).map(([cle, valeur]) => [cle, cle === "type" ? valeur : nettoyer(valeur)])) as unknown as LigneRecu;
}

function ecrireLignes(imprimante: ReturnType<typeof construireImprimante>, lignes: LigneRecu[]): void {
  for (const brute of lignes) {
    const ligne = assainir(brute);
    switch (ligne.type) {
      case "titre":
        imprimante.alignCenter();
        imprimante.bold(true);
        imprimante.println(ligne.texte);
        imprimante.bold(false);
        break;
      case "soustitre":
        imprimante.alignCenter();
        imprimante.println(ligne.texte);
        break;
      case "separateur":
        imprimante.alignLeft();
        imprimante.drawLine();
        break;
      case "champ":
        imprimante.alignLeft();
        imprimante.println(`${ligne.label} : ${ligne.valeur}`);
        break;
      case "montant":
        imprimante.alignLeft();
        imprimante.leftRight(ligne.libelle, ligne.valeur);
        break;
      case "codebarre":
        // Mêmes octets ESC/POS (GS k) que le mobile : un seul encodeur de
        // code-barres pour les deux plateformes.
        imprimante.append(Buffer.from(commandesCodeBarre(ligne.valeur)));
        break;
    }
  }
  imprimante.cut();
}

const PREFIXE_WINDOWS = "windows:";

/** Script PowerShell d'impression RAW (winspool.drv) : écrit tel quel dans la file de l'imprimante, sans passer par le pilote graphique. */
const SCRIPT_IMPRESSION_RAW = `param([Parameter(Mandatory=$true)][string]$Printer,[Parameter(Mandatory=$true)][string]$Path)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class HotelSaverRaw {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }
  [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = true)]
  static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);
  [DllImport("winspool.drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true)]
  static extern bool ClosePrinter(IntPtr handle);
  [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = true)]
  static extern bool StartDocPrinter(IntPtr handle, int level, ref DOCINFO info);
  [DllImport("winspool.drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true)]
  static extern bool EndDocPrinter(IntPtr handle);
  [DllImport("winspool.drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true)]
  static extern bool StartPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true)]
  static extern bool EndPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true)]
  static extern bool WritePrinter(IntPtr handle, byte[] data, int count, out int written);

  public static void Send(string printer, byte[] data) {
    IntPtr handle;
    if (!OpenPrinter(printer, out handle, IntPtr.Zero)) throw new Exception("WIN32|OPEN|" + Marshal.GetLastWin32Error());
    try {
      DOCINFO info = new DOCINFO();
      info.pDocName = "HotelSaver";
      info.pOutputFile = null;
      info.pDataType = "RAW";
      if (!StartDocPrinter(handle, 1, ref info)) throw new Exception("WIN32|STARTDOC|" + Marshal.GetLastWin32Error());
      try {
        if (!StartPagePrinter(handle)) throw new Exception("WIN32|STARTPAGE|" + Marshal.GetLastWin32Error());
        int written;
        if (!WritePrinter(handle, data, data.Length, out written) || written != data.Length) throw new Exception("WIN32|WRITE|" + Marshal.GetLastWin32Error());
        EndPagePrinter(handle);
      } finally { EndDocPrinter(handle); }
    } finally { ClosePrinter(handle); }
  }
}
"@
try {
  [HotelSaverRaw]::Send($Printer, [System.IO.File]::ReadAllBytes($Path))
  exit 0
} catch {
  $m = $_.Exception.Message
  if ($_.Exception.InnerException) { $m = $_.Exception.InnerException.Message }
  [Console]::Error.WriteLine($m)
  exit 2
}
`;

/**
 * Envoie des octets à un port série Windows (COM), dont le port « sortant » d'une imprimante Bluetooth appairée. On passe par .NET
 * (System.IO.Ports.SerialPort), qui ouvre le port avec des délais d'attente clairs, plutôt que d'écrire dans le fichier `\\\\.\\COMn` :
 * ce dernier se fige ou échoue sans explication quand l'imprimante est éteinte ou occupée par un autre appareil.
 */
const SCRIPT_IMPRESSION_SERIE = `
param([string]$Port, [string]$Path)
$ErrorActionPreference = 'Stop'
try {
  $donnees = [System.IO.File]::ReadAllBytes($Path)
  $sp = New-Object System.IO.Ports.SerialPort $Port, 9600, ([System.IO.Ports.Parity]::None), 8, ([System.IO.Ports.StopBits]::One)
  $sp.WriteTimeout = 10000
  $sp.Handshake = [System.IO.Ports.Handshake]::None
  try {
    $sp.Open()
    for ($i = 0; $i -lt $donnees.Length; $i += 512) {
      $n = [Math]::Min(512, $donnees.Length - $i)
      $sp.Write($donnees, $i, $n)
      Start-Sleep -Milliseconds 80
    }
    # Les octets sont partis du PC, pas encore imprimés : on laisse à l'imprimante le temps de finir avant de couper la liaison.
    Start-Sleep -Milliseconds ([Math]::Max(1000, [int]($donnees.Length / 8)))
  } finally {
    if ($sp.IsOpen) { $sp.Close() }
  }
  exit 0
} catch {
  $e = $_.Exception
  if ($e.InnerException) { $e = $e.InnerException }
  [Console]::Error.WriteLine("SERIAL|" + $e.GetType().FullName + "|" + $e.Message)
  exit 2
}
`;

function executer(commande: string, args: string[], delaiMs: number): Promise<{ code: number; sortie: string; erreur: string }> {
  return new Promise((resolve) => {
    execFile(commande, args, { windowsHide: true, timeout: delaiMs, encoding: "utf8", maxBuffer: 1024 * 1024 }, (err, sortie, erreur) => {
      // Une erreur d'exécution porte soit le code de sortie du programme (nombre), soit un texte (ENOENT, ETIMEDOUT…).
      const brut = err ? (err as { code?: unknown }).code : 0;
      const code = typeof brut === "number" ? brut : err ? 1 : 0;
      resolve({ code, sortie: String(sortie ?? ""), erreur: `${String(erreur ?? "")} ${err && typeof brut !== "number" ? String(brut ?? err.message) : ""}`.trim() });
    });
  });
}

/** Envoie des octets ESC/POS à une imprimante installée dans Windows, en mode RAW. */
async function imprimerParWindows(nomImprimante: string, octets: Buffer): Promise<void> {
  if (process.platform !== "win32") throw new Error("Les imprimantes Windows ne sont disponibles que sous Windows.");
  const dossier = mkdtempSync(join(tmpdir(), "hotelsaver-impression-"));
  const fichierDonnees = join(dossier, "ticket.bin");
  const fichierScript = join(dossier, "imprimer.ps1");
  try {
    writeFileSync(fichierDonnees, octets);
    // BOM UTF-8 : PowerShell 5 lit sinon le script en ANSI et abîme les caractères non ASCII.
    writeFileSync(fichierScript, `\uFEFF${SCRIPT_IMPRESSION_RAW}`, "utf8");
    const r = await executer(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", fichierScript, "-Printer", nomImprimante, "-Path", fichierDonnees],
      30_000
    );
    if (r.code === 0) return;
    const m = /WIN32\|([A-Z]+)\|(\d+)/.exec(r.erreur);
    // Trace pour le support : le texte brut de PowerShell n'est pas montré à l'utilisateur.
    console.error("[impression windows]", nomImprimante, r.code, r.erreur.slice(0, 500));
    if (m) throw new Error(libelleErreurSpouleur(Number(m[2]), m[1]));
    if (/ENOENT/i.test(r.erreur)) throw new Error("PowerShell est introuvable sur cet ordinateur : impossible d'imprimer par Windows.");
    if (/timed out|ETIMEDOUT/i.test(r.erreur)) throw new Error("Windows met trop de temps à répondre. Vérifiez que l'imprimante est allumée, puis réessayez.");
    throw new Error(libelleErreurSpouleur(null));
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

/** Envoie des octets ESC/POS à un port série Windows (COM3, COM4…). */
async function imprimerParPortSerie(port: string, octets: Buffer): Promise<void> {
  if (process.platform !== "win32") throw new Error("Les ports COM Windows ne sont disponibles que sous Windows.");
  const dossier = mkdtempSync(join(tmpdir(), "hotelsaver-impression-"));
  const fichierDonnees = join(dossier, "ticket.bin");
  const fichierScript = join(dossier, "imprimer-serie.ps1");
  try {
    writeFileSync(fichierDonnees, octets);
    writeFileSync(fichierScript, `\uFEFF${SCRIPT_IMPRESSION_SERIE}`, "utf8");
    const r = await executer(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", fichierScript, "-Port", port, "-Path", fichierDonnees],
      60_000
    );
    if (r.code === 0) return;
    console.error("[impression serie]", port, r.code, r.erreur.slice(0, 500));
    if (/ENOENT/i.test(r.erreur)) throw new Error("PowerShell est introuvable sur cet ordinateur : impossible d'imprimer sur un port COM.");
    const m = /SERIAL\|([^|]*)\|/.exec(r.erreur);
    throw new Error(libelleErreurPortSerie(m?.[1] ?? "IOException", port));
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

export async function imprimerLignes(interfaceImprimante: string, lignes: LigneRecu[]): Promise<void> {
  // Une adresse arbitraire (un chemin de fichier, une URL) ferait écrire ou se connecter n'importe où : liste stricte.
  if (!interfaceImprimanteValide(interfaceImprimante)) throw new Error("Adresse d'imprimante invalide.");
  const interfaceNettoyee = interfaceImprimante.trim();
  if (interfaceNettoyee.startsWith(PREFIXE_WINDOWS)) {
    const nom = interfaceNettoyee.slice(PREFIXE_WINDOWS.length);
    // Le tampon est construit comme pour un autre mode (même jeu de commandes, même cp850), puis remis au spouleur Windows.
    const imprimante = construireImprimante("tcp://127.0.0.1:9100");
    ecrireLignes(imprimante, lignes);
    await imprimerParWindows(nom, imprimante.getBuffer());
    return;
  }
  const port = /^(?:\\\\\.\\)?(COM\d{1,3})$/i.exec(interfaceNettoyee)?.[1];
  if (port && process.platform === "win32") {
    const imprimante = construireImprimante("tcp://127.0.0.1:9100");
    ecrireLignes(imprimante, lignes);
    await imprimerParPortSerie(port.toUpperCase(), imprimante.getBuffer());
    return;
  }
  const imprimante = construireImprimante(interfaceNettoyee);
  ecrireLignes(imprimante, lignes);
  await imprimante.execute();
}

/**
 * Une ligne PORT|nom|identifiant par port série, une ligne BT|identifiant|nom par appareil Bluetooth appairé (voir `extrairePortsBluetooth`).
 * La sortie est forcée en UTF-8 : sinon Windows écrit dans la page de codes de la console et « série » devient « s�rie ».
 */
const SCRIPT_LISTE_PORTS =
  "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; " +
  "Get-CimInstance Win32_PnPEntity | ForEach-Object { " +
  "if ($_.Name -match '\\(COM\\d+\\)') { 'PORT|' + $_.Name + '|' + $_.DeviceID } " +
  "elseif ($_.DeviceID -like 'BTHENUM\\DEV_*') { 'BT|' + $_.DeviceID + '|' + $_.Name } }";

/** Ports série vus par Windows (dont les imprimantes Bluetooth appairées, qui apparaissent comme un port COM). */
async function listerPortsSerie() {
  if (process.platform !== "win32") return [];
  const r = await executer(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", SCRIPT_LISTE_PORTS],
    20_000
  );
  return r.code === 0 ? extrairePortsBluetooth(r.sortie.split(/\r?\n/).filter(Boolean)) : [];
}

/** Toutes les imprimantes que l'on peut proposer à l'utilisateur sur ce poste (Windows : installées + ports série). */
export async function listerImprimantes(webContents: WebContents): Promise<ImprimanteProposee[]> {
  const [systeme, ports] = await Promise.all([
    webContents.getPrintersAsync().catch(() => []),
    listerPortsSerie().catch(() => []),
  ]);
  return proposerImprimantes(
    systeme.map((i) => ({ name: i.name, displayName: i.displayName, description: i.description, status: i.status, isDefault: i.isDefault })),
    ports
  );
}

