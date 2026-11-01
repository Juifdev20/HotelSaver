import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import { C, POLICE } from './theme';
import { useFormat } from './format';
import { sceneLength, sceneStart, TOTAL_FRAMES } from './timeline';
import { Fond, Focale } from './components/Fond';
import { Scene } from './components/Textes';
import { SousTitres } from './components/SousTitres';
import { S0Accroche, S1Intro, S2HorsLigne } from './scenes/Scenes1';
import { S3Reception, S4Cafeteria, S5Patron, S6Site, S7Demarrage } from './scenes/Scenes2';
import { S8Final } from './scenes/Scenes3';

const SCENES = [S0Accroche, S1Intro, S2HorsLigne, S3Reception, S4Cafeteria, S5Patron, S6Site, S7Demarrage, S8Final];

/** La vidéo complète : un fond continu, les scènes calées sur la voix, les sous-titres par-dessus. */
export const Video: React.FC<{ avecVoix?: boolean; avecSousTitres?: boolean }> = ({ avecVoix = true, avecSousTitres = true }) => {
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
    <AbsoluteFill style={{ background: C.a, fontFamily: POLICE }}>
      <Fond focales={focales} />
      <AbsoluteFill style={{ transform: `translateY(${mode === 'port' ? 50 : 0}px)` }}>
      {SCENES.map((S, i) => {
        const dernier = i === SCENES.length - 1;
        return (
          <Sequence key={i} from={sceneStart(i)} durationInFrames={sceneLength(i)} name={`Scène ${i}`}>
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
      {avecSousTitres && <SousTitres />}
      {avecVoix && <Audio src={staticFile('voix/voix_off.mp3')} />}
    </AbsoluteFill>
  );
};
