import { printer as ThermalPrinter, types as PrinterTypes, characterSet as CharacterSet } from "node-thermal-printer";
import { interfaceImprimanteValide } from "./config-store";
import { commandesCodeBarre, nettoyerTexteImpression, type LigneRecu } from "@hotel-chicago/receipts";

/**
 * Traduit `LigneRecu[]` vers l'API haut niveau de `node-thermal-printer` —
 * pas besoin du générateur ESC/POS manuel ici, contrairement au mobile (voir
 * le plan). `interfaceImprimante` accepte :
 * - `tcp://ip:port` (imprimante réseau — port 9100 quasi standard pour les
 *   imprimantes ESC/POS bon marché) ;
 * - un chemin de périphérique brut (`\\.\COM5` sous Windows, `/dev/usb/lp0`
 *   sous Linux — port série/USB, y compris un appareil Bluetooth appairé
 *   exposé comme port série par Windows).
 * Le format `printer:<nom>` (file d'attente système Windows) n'est PAS
 * supporté ici : il nécessite le paquet natif `printer`, un risque de build
 * supplémentaire évité (même prudence que pour `react-native-bluetooth-classic`
 * côté mobile — voir le plan). Le patron connecte son imprimante en USB/série
 * ou en réseau, pas via la file d'impression Windows.
 */
function construireImprimante(interfaceImprimante: string) {
  return new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: interfaceImprimante,
    characterSet: CharacterSet.PC850_MULTILINGUAL,
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

export async function imprimerLignes(interfaceImprimante: string, lignes: LigneRecu[]): Promise<void> {
  // Une adresse arbitraire (un chemin de fichier, une URL) ferait écrire ou se connecter n'importe où : liste stricte.
  if (!interfaceImprimanteValide(interfaceImprimante)) throw new Error("Adresse d'imprimante invalide.");
  const imprimante = construireImprimante(interfaceImprimante);
  ecrireLignes(imprimante, lignes);
  await imprimante.execute();
}

export async function imprimerTicketDeTest(interfaceImprimante: string): Promise<void> {
  await imprimerLignes(interfaceImprimante, [
    { type: "titre", texte: "HOTEL CHICAGO" },
    { type: "soustitre", texte: "Ticket de test" },
    { type: "separateur" },
    { type: "champ", label: "Imprimante", valeur: "Connexion OK" },
  ]);
}
