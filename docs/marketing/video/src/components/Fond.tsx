import React from 'react';
import { AbsoluteFill, interpolate, random, useCurrentFrame } from 'remotion';
import { C } from '../theme';
import { useFormat } from '../format';

/** Point focal du fond (centre du halo et des ondes), en fractions de l'image, scène par scène. */
export type Focale = { f: number; x: number; y: number };

const lisser = (cles: Focale[], f: number, k: 'x' | 'y') =>
  interpolate(f, cles.map((c) => c.f), cles.map((c) => c[k]), { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

/**
 * Le fond de toute la vidéo, celui de l'affiche : dégradé radial bleu nuit → bleu, ondes concentriques blanches, un anneau
 * pointillé or qui tourne lentement, une trame de points et quelques étoiles or (celles du logo) qui scintillent. Il ne
 * s'arrête jamais entre deux scènes : seul le point focal glisse.
 */
export const Fond: React.FC<{ focales: Focale[] }> = ({ focales }) => {
  const f = useCurrentFrame();
  const { W, H, mode } = useFormat();
  const fx = lisser(focales, f, 'x');
  const fy = lisser(focales, f, 'y');
  const cx = fx * W;
  const cy = fy * H;
  const base = Math.min(W, H);
  const souffle = 1 + Math.sin(f / 70) * 0.015;
  const rayons = [0.25, 0.37, 0.5, 0.64, 0.8].map((r) => r * base * souffle);
  const etoiles = Array.from({ length: 16 }, (_, i) => ({
    x: random(`ex${i}`) * W,
    y: random(`ey${i}`) * H,
    t: 8 + random(`et${i}`) * 14,
    ph: random(`ep${i}`) * Math.PI * 2,
    v: 0.6 + random(`ev${i}`) * 0.9,
  }));
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse ${mode === 'land' ? '62% 70%' : '85% 50%'} at ${fx * 100}% ${fy * 100}%, ${C.c} 0%, ${C.b} 52%, ${C.a} 100%)`,
      }}
    >
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
        <g stroke="#fff" strokeWidth={2} fill="none">
          {rayons.map((r, i) => (
            <circle key={i} cx={cx} cy={cy} r={r} opacity={[0.2, 0.14, 0.1, 0.07, 0.05][i]} />
          ))}
        </g>
        <circle
          cx={cx}
          cy={cy}
          r={rayons[0]}
          fill="none"
          stroke={C.or}
          strokeWidth={4}
          strokeDasharray="3 22"
          strokeLinecap="round"
          opacity={0.7}
          transform={`rotate(${f * 0.12} ${cx} ${cy})`}
        />
        {etoiles.map((e, i) => {
          const o = 0.15 + 0.55 * Math.max(0, Math.sin(f / (18 / e.v) + e.ph));
          const s = e.t * (0.7 + 0.3 * o);
          return (
            <path
              key={i}
              transform={`translate(${e.x} ${e.y}) scale(${s / 24}) translate(-12 -12)`}
              d="M12 0 L14.2 9.8 L24 12 L14.2 14.2 L12 24 L9.8 14.2 L0 12 L9.8 9.8Z"
              fill={C.or}
              opacity={o * 0.8}
            />
          );
        })}
      </svg>
      <AbsoluteFill
        style={{
          backgroundImage: 'radial-gradient(rgba(255,255,255,.16) 1.4px, transparent 1.6px)',
          backgroundSize: '34px 34px',
          opacity: 0.45,
          backgroundPosition: `${(f * 0.25) % 34}px 0px`,
          WebkitMaskImage: mode === 'land' ? 'linear-gradient(100deg,#000 0,transparent 50%)' : 'linear-gradient(180deg,#000 0,transparent 35%)',
        }}
      />
    </AbsoluteFill>
  );
};
