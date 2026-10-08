import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { Button } from "@hotel-chicago/ui";

export interface ScannerWebcamProps {
  /** « continu » (vente) : reste ouvert, chaque code appelle `onCode` ;
   * « unique » (fiche produit) : se ferme au premier code lu. */
  mode: "continu" | "unique";
  /** Renvoie le message à afficher (« Fanta ajouté », « Code inconnu »). */
  onCode: (code: string) => string | void | Promise<string | void>;
  onFermer: () => void;
  titre?: string;
}

/** Un article tenu devant l'objectif est lu des dizaines de fois par seconde :
 * il n'est compté qu'UNE fois. Chaque nouvelle lecture du même code repousse
 * l'échéance, donc il ne redevient lisible qu'après avoir quitté l'image
 * pendant ce délai (bug constaté le 08/10/2026 : ajout en boucle). Pour en
 * vendre deux, on retire l'article puis on le représente (ou bouton +). */
const ABSENCE_AVANT_RELECTURE_MS = 2000;
/** Pause après chaque article accepté : évite qu'un code voisin dans l'image
 * soit pris dans la foulée. */
const PAUSE_APRES_AJOUT_MS = 700;

const FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.ITF,
];

/**
 * Lecture de code-barres à la webcam (@zxing/browser) — `BarcodeDetector`
 * n'existe pas sous Chrome/Electron pour Windows. Electron accorde l'accès
 * caméra par défaut (aucun setPermissionRequestHandler dans main/index.ts).
 */
export function ScannerWebcam({ mode, onCode, onFermer, titre }: ScannerWebcamProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [compteur, setCompteur] = useState(0);
  const rappel = useRef(onCode);
  rappel.current = onCode;

  useEffect(() => {
    let controles: IScannerControls | null = null;
    let arrete = false;
    let dernier: { code: string; le: number } | null = null;
    let dernierAjout = 0;
    let enTraitement = false;
    const indices = new Map<DecodeHintType, unknown>([[DecodeHintType.POSSIBLE_FORMATS, FORMATS]]);
    const lecteur = new BrowserMultiFormatReader(indices);

    lecteur
      .decodeFromVideoDevice(undefined, video.current ?? undefined, async (resultat) => {
        if (!resultat || arrete || enTraitement) return;
        const code = resultat.getText().trim();
        const maintenant = Date.now();
        if (dernier && dernier.code === code && maintenant - dernier.le < ABSENCE_AVANT_RELECTURE_MS) {
          dernier.le = maintenant; // toujours visible : on repousse
          return;
        }
        if (maintenant - dernierAjout < PAUSE_APRES_AJOUT_MS) return;
        dernier = { code, le: maintenant };
        dernierAjout = maintenant;
        if (mode === "unique") arrete = true;
        enTraitement = true;
        const retour = await Promise.resolve(rappel.current(code)).finally(() => {
          enTraitement = false;
        });
        if (mode === "unique") {
          arrete = true;
          controles?.stop();
          onFermer();
          return;
        }
        setCompteur((n) => n + 1);
        if (typeof retour === "string") setMessage(retour);
      })
      .then((c) => {
        controles = c;
        if (arrete) c.stop();
      })
      .catch((e: Error) => setErreur(`Caméra indisponible : ${e.message}`));

    return () => {
      arrete = true;
      controles?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={titre ?? "Scanner un code-barres"}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 39, 66, 0.72)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div className="carte-formulaire" style={{ width: "min(560px, 92vw)", display: "flex", flexDirection: "column", gap: 12 }}>
        <p className="hc-text-body-strong">{titre ?? (mode === "continu" ? "Scanner les articles" : "Scanner le code-barres")}</p>
        <video ref={video} muted playsInline style={{ width: "100%", borderRadius: 8, background: "#000", aspectRatio: "4 / 3" }} />
        {erreur && <p className="hc-text-body texte-erreur">{erreur}</p>}
        {mode === "continu" && (
          <p className="hc-text-body-strong">
            {compteur} article{compteur > 1 ? "s" : ""} scanné{compteur > 1 ? "s" : ""}
          </p>
        )}
        <p className="hc-text-body texte-discret">{message ?? "Présentez le code-barres devant la caméra."}</p>
        <Button type="button" onClick={onFermer}>
          {mode === "continu" ? "Terminer" : "Fermer"}
        </Button>
      </div>
    </div>
  );
}
