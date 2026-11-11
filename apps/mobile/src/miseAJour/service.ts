import { Platform } from "react-native";
import * as Application from "expo-application";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { miseAJourAndroid, pourcentage, type MiseAJourDisponible, type ReleaseGithub } from "@hotel-chicago/regles";

/**
 * Mises à jour de l'application Android (11/11/2026). Pas de Play Store : la version la plus récente est la dernière release GitHub du dépôt (là où le site
 * et les utilisateurs téléchargent déjà l'APK). L'application la repère, la télécharge en arrière-plan (avec reprise si la connexion coupe), puis ouvre
 * l'installateur d'Android. Android exige TOUJOURS un dernier « Installer » à l'écran : une application ne peut pas s'installer en silence.
 * L'APK est signé avec la même clé que l'application installée : Android refuse toute mise à jour qui ne vient pas de nous, et les données sont gardées.
 */
const DEPOT = "Juifdev20/HotelSaver";
const URL_DERNIERE_RELEASE = `https://api.github.com/repos/${DEPOT}/releases/latest`;
const CLE_REPRISE = "hotel-chicago:maj-reprise";
const CLE_PRETE = "hotel-chicago:maj-prete";
const CLE_ANNONCEE = "hotel-chicago:maj-annoncee";

export const miseAJourPossible = Platform.OS === "android";

/** Version de l'application installée (celle du manifeste Android), ex. « 1.0.10 ». */
export function versionInstallee(): string {
  return Application.nativeApplicationVersion ?? "0.0.0";
}

/** Demande à GitHub la dernière release ; renvoie la mise à jour proposée, ou null si l'application est à jour. Lève si GitHub est injoignable. */
export async function verifierMiseAJour(): Promise<MiseAJourDisponible | null> {
  const reponse = await fetch(URL_DERNIERE_RELEASE, {
    headers: { Accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (reponse.status === 404) return null; // aucune release publiée
  if (!reponse.ok) throw new Error(`GitHub a répondu ${reponse.status}`);
  return miseAJourAndroid((await reponse.json()) as ReleaseGithub, versionInstallee());
}

function destination(maj: MiseAJourDisponible): string {
  return `${FileSystem.cacheDirectory}mise-a-jour-${maj.version}.apk`;
}

interface Reprise {
  version: string;
  donnees: string;
}

/** Un APK déjà téléchargé en entier et vérifié pour cette version (ou null). */
export async function apkPret(maj: MiseAJourDisponible): Promise<string | null> {
  try {
    const brut = await AsyncStorage.getItem(CLE_PRETE);
    if (!brut) return null;
    const { version, uri } = JSON.parse(brut) as { version: string; uri: string };
    if (version !== maj.version) return null;
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists && (maj.taille <= 0 || info.size === maj.taille) ? uri : null;
  } catch {
    return null;
  }
}

/**
 * Télécharge l'APK dans le cache de l'application, `onProgres` reçoit 0-100. Si un téléchargement de CETTE version a été interrompu (connexion coupée,
 * application fermée), il reprend là où il s'était arrêté. À la fin, la taille du fichier est contrôlée avant de le déclarer prêt.
 */
export async function telechargerApk(maj: MiseAJourDisponible, onProgres: (pourcent: number) => void): Promise<string> {
  const deja = await apkPret(maj);
  if (deja) return deja;
  const uri = destination(maj);
  let donneesReprise: string | undefined;
  try {
    const brut = await AsyncStorage.getItem(CLE_REPRISE);
    const r = brut ? (JSON.parse(brut) as Reprise) : null;
    if (r && r.version === maj.version) donneesReprise = r.donnees;
  } catch {
    donneesReprise = undefined;
  }
  let dernierEnregistre = -1;
  let tache: FileSystem.DownloadResumable;
  const suivre = ({ totalBytesWritten, totalBytesExpectedToWrite }: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => {
    const p = pourcentage(totalBytesWritten, totalBytesExpectedToWrite > 0 ? totalBytesExpectedToWrite : maj.taille);
    onProgres(p);
    // L'état de reprise est gardé tous les 2 % : une coupure ne fait pas recommencer à zéro.
    if (p >= dernierEnregistre + 2) {
      dernierEnregistre = p;
      void AsyncStorage.setItem(CLE_REPRISE, JSON.stringify({ version: maj.version, donnees: JSON.stringify(tache.savable()) } satisfies Reprise)).catch(() => undefined);
    }
  };
  tache = FileSystem.createDownloadResumable(maj.url, uri, {}, suivre, donneesReprise);
  let resultat: FileSystem.FileSystemDownloadResult | undefined;
  try {
    resultat = donneesReprise ? await tache.resumeAsync() : await tache.downloadAsync();
  } catch (e) {
    // Reprise impossible (fichier disparu, lien expiré) : on repart de zéro une seule fois.
    if (!donneesReprise) throw e;
    await FileSystem.deleteAsync(uri, { idempotent: true });
    await AsyncStorage.removeItem(CLE_REPRISE);
    tache = FileSystem.createDownloadResumable(maj.url, uri, {}, suivre);
    resultat = await tache.downloadAsync();
  }
  if (!resultat || resultat.status >= 400) {
    await FileSystem.deleteAsync(uri, { idempotent: true });
    await AsyncStorage.removeItem(CLE_REPRISE);
    throw new Error(`Téléchargement refusé (${resultat?.status ?? "?"})`);
  }
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists || (maj.taille > 0 && info.size !== maj.taille)) {
    await FileSystem.deleteAsync(uri, { idempotent: true });
    await AsyncStorage.removeItem(CLE_REPRISE);
    throw new Error("Le fichier téléchargé est incomplet.");
  }
  await AsyncStorage.removeItem(CLE_REPRISE);
  await AsyncStorage.setItem(CLE_PRETE, JSON.stringify({ version: maj.version, uri }));
  onProgres(100);
  return uri;
}

/** Ouvre l'installateur d'Android sur l'APK téléchargé. Android demande lui-même d'autoriser l'installation depuis HotelSaver la première fois. */
export async function installerApk(uri: string): Promise<void> {
  const contenu = await FileSystem.getContentUriAsync(uri);
  await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
    data: contenu,
    type: "application/vnd.android.package-archive",
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
  });
}

/** Une fois la nouvelle version installée, les fichiers de l'ancienne mise à jour ne servent plus. */
export async function nettoyerAnciennesMisesAJour(): Promise<void> {
  try {
    const brut = await AsyncStorage.getItem(CLE_PRETE);
    if (!brut) return;
    const { uri } = JSON.parse(brut) as { version: string; uri: string };
    await FileSystem.deleteAsync(uri, { idempotent: true });
    await AsyncStorage.multiRemove([CLE_PRETE, CLE_REPRISE]);
  } catch {
    // Sans importance : le cache d'Android se vide tout seul au besoin.
  }
}

/** Version déjà annoncée par notification (une seule notification par version). */
export async function versionDejaAnnoncee(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(CLE_ANNONCEE);
  } catch {
    return null;
  }
}
export async function memoriserAnnonce(version: string): Promise<void> {
  try {
    await AsyncStorage.setItem(CLE_ANNONCEE, version);
  } catch {
    // La prochaine vérification pourra annoncer de nouveau : sans gravité.
  }
}
