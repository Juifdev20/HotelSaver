import React from 'react';
import { useCurrentFrame } from 'remotion';
import { C, POLICE } from '../theme';
import { useFormat } from '../format';
import { FPS } from '../timeline';
import { useRessort } from './anim';

import { fenetres } from '../sousTitres';

const FENETRES = fenetres();

export const SousTitres: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const { mode, u, W, H } = useFormat();
  const r = useRessort();
  const w = FENETRES.find((x) => t >= x.de && t < x.a);
  if (!w) return null;
  const debut = Math.round(w.de * FPS);
  const s = r(debut, { damping: 16, stiffness: 180 });
  const taille = mode === 'land' ? 58 * u : mode === 'port' ? 62 : 46;
  const pos: React.CSSProperties =
    mode === 'land'
      ? { left: 0, right: 0, bottom: 64 * u }
      : mode === 'port'
        ? { left: 0, right: 0, top: H * 0.715 }
        : { left: 0, right: 0, bottom: 48 };
  const telephone = /^\+\d/.test(w.texte);
  return (
    <div style={{ position: 'absolute', ...pos, display: 'flex', justifyContent: 'center', zIndex: 50, pointerEvents: 'none' }}>
      <div
        style={{
          maxWidth: mode === 'land' ? 1500 * u : W - 110,
          padding: `${taille * 0.26}px ${taille * 0.55}px`,
          borderRadius: taille * 0.42,
          background: 'rgba(6,18,36,.78)',
          border: '1.5px solid rgba(255,255,255,.2)',
          boxShadow: '0 18px 40px rgba(0,0,0,.35)',
          fontFamily: POLICE,
          fontSize: telephone ? taille * 1.15 : taille,
          fontWeight: 800,
          letterSpacing: telephone ? '.02em' : '-.01em',
          lineHeight: 1.18,
          textAlign: 'center',
          color: C.blanc,
          transform: `translateY(${(1 - s) * 18}px) scale(${0.94 + 0.06 * s})`,
          opacity: Math.min(1, s * 1.8),
          textWrap: 'balance' as never,
        }}
      >
        {w.mots.map((m, j) => {
          const dit = t >= m.de;
          const actif = t >= m.de && t < m.a;
          return (
            <span key={j} style={{ color: actif || (telephone && dit) ? C.or : dit ? C.blanc : 'rgba(255,255,255,.62)', display: 'inline-block', transform: actif ? 'translateY(-2px)' : undefined, marginRight: j < w.mots.length - 1 ? '0.26em' : 0 }}>
              {m.m}
            </span>
          );
        })}
      </div>
    </div>
  );
};

