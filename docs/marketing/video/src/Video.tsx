import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import { C, POLICE } from './theme';
import { useFormat } from './format';
import { sceneLength, sceneStart, TOTAL_FRAMES } from './timeline';
import { Fond, Focale } from './components/Fond';
import { Scene } from './components/Textes';
import { SousTitres } from './components/SousTitres';
import { Balayage, ObjetsFlottants, Objet } from './components/Objets';
import { Son, VolumeSons } from './components/Sons';
import { S0Accroche, S1Intro, S2HorsLigne } from './scenes/Scenes1';
import { S3Reception, S4Cafeteria, S5Patron, S6Site, S7Demarrage } from './scenes/Scenes2';
import { S8Final } from './scenes/Scenes3';

/** Objets en verre de chaque scène (icônes du module), placés autour des appareils sans toucher aux textes. */
const ICONES: string[][] = [
  [],
  ['lit', 'cafe', 'agenda'],
  ['wifi', 'sync', 'recu'],
  ['lit', 'dollar', 'agenda'],
  ['cafe', 'scan', 'boite'],
  ['graphe', 'bouclier', 'equipe'],
  ['globe', 'carte', 'telephone'],
  ['plus', 'equipe', 'check'],
  ['cadeau', 'telecharger', 'maison'],
];
const objetsDe = (i: number): Objet[] =>
  ICONES[i].map((icone, k) => ({
    icone,
    a: 14 + k * 16,
    l: ([[0.955, 0.13], [0.975, 0.6], [0.66, 0.06]] as [number, number][])[k],
    p: ([[0.91, 0.31], [0.94, 0.63], [0.07, 0.45]] as [number, number][])[k],
    s: ([[0.93, 0.3], [0.95, 0.74], [0.06, 0.62]] as [number, number][])[k],
    t: [1.25, 1.05, 0.9][k],
    flou: k === 2,
  }));

const SCENES = [S0Accroche, S1Intro, S2HorsLigne, S3Reception, S4Cafeteria, S5Patron, S6Site, S7Demarrage, S8Final];

/** La vidéo complète : un fond continu, les scènes calées sur la voix, les sous-titres par-dessus. */
export const Video: React.FC<{ avecVoix?: boolean; avecSousTitres?: boolean; avecSons?: boolean }> = ({ avecVoix = true, avecSousTitres = true, avecSons = true }) => {
  const { mode } = useFormat();
  const xLand = [0.72, 0.5, 0.72, 0.7, 0.72, 0.7, 0.7, 0.72, 0.4];
  const yPort = [0.46, 0.5, 0.52, 0.45, 0.52, 0.45, 0.45, 0.5, 0.52];
  const focales: Focale[] = SCENES.flatMap((_, i) => {
    const x = mode === 'land' ? xLand[i] : 0.5;
    const y = mode === 'land' ? 0.45 : mode === 'port' ? yPort[i] : 0.58;
    const a = sceneStart(i);
    return [
      { f: a, x, y },
      { f: a + sceneLength(i) - 12, x, y },
    ];
  });
  return (
    <VolumeSons value={avecSons ? 1 : 0}>
    <AbsoluteFill style={{ background: C.a, fontFamily: POLICE }}>
      <Fond focales={focales} />
      <AbsoluteFill style={{ transform: `translateY(${mode === 'port' ? 50 : 0}px)` }}>
      {SCENES.map((S, i) => {
        const dernier = i === SCENES.length - 1;
        return (
          <Sequence key={i} from={sceneStart(i)} durationInFrames={sceneLength(i)} name={`Scène ${i}`}>
            <ObjetsFlottants objets={objetsDe(i)} duree={dernier ? TOTAL_FRAMES * 2 : sceneLength(i)} />
            {dernier ? (
              <Scene duree={TOTAL_FRAMES * 2}>
                <S />
              </Scene>
            ) : (
              <S />
            )}
          </Sequence>
        );
      })}
      </AbsoluteFill>
      {SCENES.map((_, i) =>
        i === 0 ? null : (
          <React.Fragment key={`t${i}`}>
            <Balayage a={sceneStart(i)} />
            <Son nom="transition" a={sceneStart(i) - 9} volume={0.22} />
          </React.Fragment>
        ),
      )}
      {avecSousTitres && <SousTitres />}
      {avecVoix && <Audio src={staticFile('voix/voix_off.mp3')} />}
    </AbsoluteFill>
    </VolumeSons>
  );
};
