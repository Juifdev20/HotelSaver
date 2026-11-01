import data from './timeline.json';

export const FPS = 30;
export const TOTAL_FRAMES = Math.ceil(data.total * FPS);
export const LINES = data.lines;

/** Début (en images) de la scène i : un peu avant sa phrase, pour que l'image annonce ce que la voix va dire. */
export const sceneStart = (i: number) => (i === 0 ? 0 : Math.round((LINES[i].start - 0.45) * FPS));
export const sceneEnd = (i: number) => (i === LINES.length - 1 ? TOTAL_FRAMES : sceneStart(i + 1));
export const sceneLength = (i: number) => sceneEnd(i) - sceneStart(i);

/**
 * Image (comptée dans la scène i) où la voix prononce le mot donné : position du mot dans la phrase, ramenée à la durée de
 * la phrase. Sert à caler une animation sur un mot (une pastille qui apparaît quand la voix dit « cafétaria »).
 */
export function cue(i: number, mot: string, avance = 4) {
  const texte = LINES[i].text;
  const k = texte.toLowerCase().indexOf(mot.toLowerCase());
  const p = k < 0 ? 0 : k / texte.length;
  return Math.max(0, Math.round((LINES[i].start + LINES[i].dur * p) * FPS) - sceneStart(i) - avance);
}
