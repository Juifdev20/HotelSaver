import type { DocumentPersiste, OperationMagasin, Persistance } from "./magasin";

/**
 * Chiffre chaque document (AES-256-GCM, WebCrypto) avant qu'il ne soit écrit par la persistance enveloppée, et le déchiffre à la lecture.
 * Les noms de collection et les identifiants restent en clair (ils ne contiennent rien de personnel) ; tout le contenu — noms des clients,
 * pièces d'identité, montants, reçus — est illisible dans le fichier du profil de l'application sans la clé. La clé vient du coffre du
 * système (Electron `safeStorage`), jamais du disque en clair.
 *
 * Un document écrit avant l'activation du chiffrement (copie existante) est relu tel quel puis réécrit chiffré immédiatement.
 */
interface DocumentChiffre {
  __c: string;
}

const estChiffre = (valeur: unknown): valeur is DocumentChiffre =>
  typeof valeur === "object" && valeur !== null && typeof (valeur as DocumentChiffre).__c === "string";

function versBase64(octets: Uint8Array): string {
  let texte = "";
  for (let i = 0; i < octets.length; i += 0x8000) texte += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(texte);
}

function depuisBase64(texte: string): Uint8Array {
  const binaire = atob(texte);
  const octets = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
  return octets;
}

export class PersistanceChiffree implements Persistance {
  private cle: Promise<CryptoKey>;

  constructor(
    private readonly interne: Persistance,
    cleBase64: string,
    private readonly crypto: Crypto = globalThis.crypto
  ) {
    const brute = depuisBase64(cleBase64);
    if (brute.length !== 32) throw new Error("Clé de chiffrement locale invalide.");
    this.cle = this.crypto.subtle.importKey("raw", brute as BufferSource, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  }

  private async chiffrer(collection: string, id: string, valeur: unknown): Promise<DocumentChiffre> {
    const iv = this.crypto.getRandomValues(new Uint8Array(12));
    // Le nom de collection et l'identifiant sont authentifiés (données associées) : un document ne peut pas être copié sous un autre nom.
    const donnees = new TextEncoder().encode(JSON.stringify(valeur ?? null));
    const chiffre = new Uint8Array(
      await this.crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(`${collection}/${id}`) }, await this.cle, donnees)
    );
    const tout = new Uint8Array(iv.length + chiffre.length);
    tout.set(iv, 0);
    tout.set(chiffre, iv.length);
    return { __c: versBase64(tout) };
  }

  private async dechiffrer(collection: string, id: string, valeur: DocumentChiffre): Promise<unknown> {
    const tout = depuisBase64(valeur.__c);
    const clair = await this.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: tout.subarray(0, 12) as BufferSource, additionalData: new TextEncoder().encode(`${collection}/${id}`) },
      await this.cle,
      tout.subarray(12) as BufferSource
    );
    return JSON.parse(new TextDecoder().decode(clair));
  }

  async chargerTout(): Promise<DocumentPersiste[]> {
    const lus = await this.interne.chargerTout();
    const resultat: DocumentPersiste[] = [];
    const aReecrire: OperationMagasin[] = [];
    for (const doc of lus) {
      if (estChiffre(doc.valeur)) {
        resultat.push({ ...doc, valeur: await this.dechiffrer(doc.collection, doc.id, doc.valeur) });
      } else {
        resultat.push(doc);
        aReecrire.push({ type: "ecrire", collection: doc.collection, id: doc.id, valeur: doc.valeur });
      }
    }
    // Copie antérieure au chiffrement : on la chiffre sur place (par lots, atomiques).
    for (let i = 0; i < aReecrire.length; i += 500) await this.appliquer(aReecrire.slice(i, i + 500));
    return resultat;
  }

  async appliquer(operations: OperationMagasin[]): Promise<void> {
    const chiffrees = await Promise.all(
      operations.map(async (op) =>
        op.type === "ecrire" ? { ...op, valeur: await this.chiffrer(op.collection, op.id, op.valeur) } : op
      )
    );
    await this.interne.appliquer(chiffrees);
  }

  effacer(): Promise<void> {
    return this.interne.effacer();
  }

  fermer(): void {
    this.interne.fermer?.();
  }
}
