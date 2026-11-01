import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { C } from '../theme';
import { useFormat } from '../format';
import { useRessort } from './anim';
import { Icone } from './Icone';

/**
 * Objets en verre qui apparaissent autour des appareils (lit, tasse, dollar…) : bulles brillantes à icône or, qui
 * surgissent en rebondissant, flottent, tournent légèrement, puis repartent. Certaines sont floues, comme au loin,
 * pour donner de la profondeur.
 */
export type Objet = { icone: string; l: [number, number]; p: [number, number]; s?: [number, number]; t?: number; a: number; flou?: boolean };

export const ObjetsFlottants: React.FC<{ objets: Objet[]; duree: number }> = ({ objets, duree }) => {
  const f = useCurrentFrame();
  const { W, H, mode, u } = useFormat();
  const r = useRessort();
  return (
    <>
      {objets.map((o, i) => {
        const [fx, fy] = mode === 'land' ? o.l : mode === 'port' ? o.p : o.s ?? o.p;
        const d = (o.t ?? 1) * (mode === 'land' ? 96 * u : mode === 'port' ? 104 : 74);
        const s = r(o.a, { damping: 10, stiffness: 140 });
        const sortieO = interpolate(f, [duree - 16, duree - 4], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const flotte = Math.sin((f + i * 23) / 24) * 10;
        const rot = Math.sin((f + i * 41) / 40) * 10 + (1 - s) * -40;
        const loin = o.flou ? 0.7 : 1;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: fx * W - d / 2,
              top: fy * H - d / 2 + flotte,
              width: d * loin,
              height: d * loin,
              transform: `scale(${s}) rotate(${rot}deg)`,
              opacity: Math.min(1, s * 1.5) * sortieO * (o.flou ? 0.6 : 1),
              filter: o.flou ? 'blur(3px)' : undefined,
              zIndex: o.flou ? 0 : 6,
              borderRadius: '50%',
              background: 'radial-gradient(circle at 32% 28%, rgba(255,255,255,.55), rgba(76,141,240,.35) 38%, rgba(5,52,131,.55) 75%, rgba(6,18,36,.75))',
              border: '1.5px solid rgba(255,255,255,.45)',
              boxShadow: `0 ${d * 0.18}px ${d * 0.3}px rgba(0,0,0,.35), inset 0 0 ${d * 0.2}px rgba(255,255,255,.25), 0 0 ${d * 0.35}px rgba(23,105,224,.6)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <div style={{ width: '56%', height: '56%', borderRadius: '30%', background: `linear-gradient(145deg, ${C.orClair}, ${C.or} 60%, #C88F00)`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 14px rgba(0,0,0,.3)' }}>
              <Icone nom={o.icone} taille={d * loin * 0.32} couleur={C.texteOr} epaisseur={2.4} />
            </div>
          </div>
        );
      })}
    </>
  );
};

/** Balayage lumineux en diagonale sur toute l'image, au passage d'une scène à l'autre. */
export const Balayage: React.FC<{ a: number }> = ({ a }) => {
  const f = useCurrentFrame();
  const { W } = useFormat();
  const k = f - a;
  if (k < -8 || k > 10) return null;
  const x = interpolate(k, [-8, 10], [-0.5, 1.3]) * W;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 40 }}>
      <div style={{ position: 'absolute', top: '-30%', bottom: '-30%', left: x, width: W * 0.22, transform: 'skewX(-18deg)', background: 'linear-gradient(90deg, rgba(245,180,0,0), rgba(255,210,90,.22), rgba(255,255,255,.35), rgba(76,141,240,.18), rgba(76,141,240,0))', filter: 'blur(6px)' }} />
    </div>
  );
};
