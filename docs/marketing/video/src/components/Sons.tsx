import React, { createContext, useContext } from 'react';
import { Audio, Sequence, staticFile } from 'remotion';

/**
 * Bruitages (générés avec ElevenLabs, nettoyés et normalisés dans public/sons/) : chaque animation qui fait apparaître
 * quelque chose déclenche son petit son. Les volumes restent sous la voix off, qui reste la vedette.
 */
export type NomSon =
  | 'whoosh' // un appareil qui entre
  | 'whoosh2' // l'ordinateur, plus ample
  | 'swish' // changement d'écran
  | 'pop' // une pastille qui apparaît
  | 'tap' // un doigt sur l'écran
  | 'texte' // un titre qui monte
  | 'etincelle' // éclat doré
  | 'impact' // apparition du logo
  | 'coupure' // le réseau coupe
  | 'succes' // synchronisation terminée
  | 'caisse' // encaissement
  | 'scan' // bip du lecteur
  | 'notif' // notification (cuisine, WhatsApp)
  | 'transition' // passage d'une scène à l'autre
  | 'coche'; // case cochée

/** Durée utile de chaque son, en images (à 30 i/s). */
const DUREES: Record<NomSon, number> = {
  whoosh: 24,
  whoosh2: 40,
  swish: 16,
  pop: 10,
  tap: 4,
  texte: 28,
  etincelle: 30,
  impact: 30,
  coupure: 30,
  succes: 30,
  caisse: 36,
  scan: 8,
  notif: 24,
  transition: 20,
  coche: 6,
};

const SonsActifs = createContext(1);
/** Volume général des bruitages (0 pour les couper, par exemple pour exporter la vidéo sans bruitages). */
export const VolumeSons = SonsActifs.Provider;

export const Son: React.FC<{ nom: NomSon; a: number; volume?: number }> = ({ nom, a, volume = 0.3 }) => {
  const general = useContext(SonsActifs);
  if (general <= 0 || !Number.isFinite(a)) return null;
  return (
    <Sequence from={Math.max(0, Math.round(a))} durationInFrames={DUREES[nom] + 2} layout="none" name={`son ${nom}`}>
      <Audio src={staticFile(`sons/${nom}.wav`)} volume={volume * general} />
    </Sequence>
  );
};
