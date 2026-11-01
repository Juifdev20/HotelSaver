import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

/** Ressort « motion design » : arrivée rapide, légère sur-oscillation, arrêt net. */
export function useRessort() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (delai = 0, config: { damping?: number; stiffness?: number; mass?: number } = {}) =>
    spring({ frame: f - delai, fps, config: { damping: 15, stiffness: 120, mass: 0.85, ...config } });
}

export const lisse = (f: number, de: number, a: number, v0 = 0, v1 = 1) =>
  interpolate(f, [de, a], [v0, v1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.65, 0, 0.35, 1) });

export const sortie = (f: number, de: number, a: number, v0 = 0, v1 = 1) =>
  interpolate(f, [de, a], [v0, v1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
