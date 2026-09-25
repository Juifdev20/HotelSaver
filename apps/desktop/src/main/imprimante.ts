import { printer as ThermalPrinter, types as PrinterTypes, characterSet as CharacterSet } from "node-thermal-printer";
import type { LigneRecu } from "@hotel-chicago/receipts";

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

function ecrireLignes(imprimante: ReturnType<typeof construireImprimante>, lignes: LigneRecu[]): void {
  for (const ligne of lignes) {
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
    }
  }
  imprimante.cut();
}

export async function imprimerLignes(interfaceImprimante: string, lignes: LigneRecu[]): Promise<void> {
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
