import { staticFile } from 'remotion';
import manifest from './assets.json';

type Nom = keyof typeof manifest;
export const img = (nom: string) => staticFile(`captures/${(manifest as Record<string, { file: string }>)[nom]?.file ?? nom}`);
export const ratio = (nom: string) => {
  const a = (manifest as Record<string, { w: number; h: number }>)[nom];
  return a ? a.h / a.w : 1;
};
export type { Nom };
