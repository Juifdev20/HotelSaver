import React from 'react';
import { Composition } from 'remotion';
import { Video } from './Video';
import { FPS, TOTAL_FRAMES } from './timeline';

const FORMATS = [
  { id: 'HotelSaver-9x16', width: 1080, height: 1920 },
  { id: 'HotelSaver-16x9', width: 1920, height: 1080 },
  { id: 'HotelSaver-1x1', width: 1080, height: 1080 },
];

export const Root: React.FC = () => (
  <>
    {FORMATS.map((f) => (
      <Composition key={f.id} id={f.id} component={Video} durationInFrames={TOTAL_FRAMES} fps={FPS} width={f.width} height={f.height} defaultProps={{ avecVoix: true, avecSousTitres: true, avecSons: true }} />
    ))}
  </>
);
