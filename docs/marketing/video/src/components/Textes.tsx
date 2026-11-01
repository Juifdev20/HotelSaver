import React from 'react';
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { C, POLICE } from '../theme';
import { useFormat } from '../format';
import { useRessort } from './anim';
import { Icone } from './Icone';
import { Son } from './Sons';

/** Logo + « Hotel » blanc / « Saver » or, comme sur l'affiche. */
export const Marque: React.FC<{ taille: number; style?: React.CSSProperties; slogan?: string }> = ({ taille, style, slogan }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: taille * 0.24, fontFamily: POLICE, ...style }}>
    <Img src={staticFile('captures/logo.png')} style={{ width: taille, height: taille, borderRadius: taille * 0.26, boxShadow: '0 12px 28px rgba(0,0,0,.35)' }} />
    <div>
      <div style={{ fontSize: taille * 0.58, fontWeight: 800, letterSpacing: '-0.035em', color: C.blanc, lineHeight: 1 }}>
        Hotel<span style={{ color: C.or }}>Saver</span>
      </div>
      {slogan && <div style={{ marginTop: taille * 0.1, fontSize: taille * 0.24, fontWeight: 600, color: C.blanc82, letterSpacing: '.01em' }}>{slogan}</div>}
    </div>
  </div>
);

/** Étiquette or (« COMING SOON » de l'affiche) : le nom du module. */
export const Tag: React.FC<{ texte: string; a?: number; taille: number; style?: React.CSSProperties }> = ({ texte, a = 0, taille, style }) => {
  const r = useRessort();
  const s = r(a, { damping: 14 });
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: taille * 0.55,
        height: taille * 2.35,
        padding: `0 ${taille * 1.15}px 0 ${taille * 0.9}px`,
        borderRadius: taille * 1.2,
        background: C.or,
        color: C.texteOr,
        fontFamily: POLICE,
        fontWeight: 800,
        fontSize: taille,
        letterSpacing: '.22em',
        transform: `translateX(${(1 - s) * -40}px) scale(${0.8 + 0.2 * s})`,
        transformOrigin: 'left center',
        opacity: Math.min(1, s * 1.5),
        boxShadow: '0 10px 30px rgba(245,180,0,.35)',
        ...style,
      }}
    >
      <i style={{ width: taille * 0.6, height: taille * 0.6, borderRadius: taille, background: C.texteOr, boxShadow: '0 0 0 6px rgba(255,255,255,.4)' }} />
      {texte}
    </div>
  );
};

/** Titre en deux lignes (blanche puis or), chaque ligne monte derrière un masque. */
export const Titre: React.FC<{ l1: string; l2: string; a?: number; taille: number; aligner?: 'left' | 'center'; style?: React.CSSProperties }> = ({ l1, l2, a = 0, taille, aligner = 'left', style }) => {
  const r = useRessort();
  const ligne = (texte: string, couleur: string, d: number) => {
    const s = r(a + d, { damping: 18, stiffness: 110 });
    return (
      <div style={{ overflow: 'hidden', paddingBottom: taille * 0.08 }}>
        <div style={{ color: couleur, transform: `translateY(${(1 - s) * 110}%)`, opacity: Math.min(1, s * 1.4) }}>{texte}</div>
      </div>
    );
  };
  const f = useCurrentFrame();
  const trait = interpolate(f, [a + 14, a + 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const brille = interpolate(f, [a + 26, a + 50], [-30, 130], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'relative', fontFamily: POLICE, fontSize: taille, fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.04, textAlign: aligner, ...style }}>
      {ligne(l1, C.blanc, 0)}
      <div style={{ position: 'relative', display: 'inline-block' }}>
        {ligne(l2, C.or, 6)}
        {/* reflet qui traverse la ligne dorée */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', mixBlendMode: 'overlay' }}>
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${brille}%`, width: '22%', transform: 'skewX(-20deg)', background: 'linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.9),rgba(255,255,255,0))' }} />
        </div>
        <div style={{ position: 'absolute', left: aligner === 'center' ? '50%' : 0, bottom: -taille * 0.04, height: Math.max(4, taille * 0.065), width: `${trait * 62}%`, transform: aligner === 'center' ? 'translateX(-50%)' : undefined, borderRadius: taille, background: `linear-gradient(90deg, ${C.or}, ${C.orClair})`, boxShadow: '0 0 18px rgba(245,180,0,.6)' }} />
      </div>
      <Son nom="texte" a={a} volume={0.18} />
    </div>
  );
};

/** Éclat : des étincelles dorées qui jaillissent d'un point (une pastille qui apparaît, un chiffre qui se pose). */
export const Eclat: React.FC<{ a: number; taille: number; n?: number; couleur?: string; style?: React.CSSProperties }> = ({ a, taille, n = 8, couleur = C.or, style }) => {
  const f = useCurrentFrame();
  const k = f - a;
  if (k < 0 || k > 24) return null;
  const p = interpolate(k, [0, 24], [0, 1], { extrapolateRight: 'clamp' });
  const ease = 1 - Math.pow(1 - p, 3);
  return (
    <div style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none', zIndex: 20, ...style }}>
      <div style={{ position: 'absolute', left: -taille / 2, top: -taille / 2, width: taille, height: taille, borderRadius: '50%', border: `2px solid ${couleur}`, transform: `scale(${0.3 + ease})`, opacity: (1 - p) * 0.8 }} />
      {Array.from({ length: n }, (_, i) => {
        const ang = (i / n) * Math.PI * 2 + 0.3;
        const d = taille * 0.25 + ease * taille * 0.75;
        const t = (i % 2 ? 7 : 11) * (1 - p * 0.6);
        return (
          <svg key={i} width={t * 2} height={t * 2} viewBox="0 0 24 24" style={{ position: 'absolute', left: Math.cos(ang) * d - t, top: Math.sin(ang) * d - t, opacity: 1 - p, transform: `rotate(${k * 8}deg)` }}>
            <path d="M12 0 L14.2 9.8 L24 12 L14.2 14.2 L12 24 L9.8 14.2 L0 12 L9.8 9.8Z" fill={i % 3 === 0 ? '#fff' : couleur} />
          </svg>
        );
      })}
    </div>
  );
};

/** Pastille en verre sombre de l'affiche : icône sur carré or, titre, texte. Arrive en « pop ». */
export const Pastille: React.FC<{ icone: string; titre: string; texte?: string; a?: number; fin?: number; echelle: number; style?: React.CSSProperties; z?: number }> = ({ icone, titre, texte, a = 0, fin, echelle: e, style, z = 8 }) => {
  const r = useRessort();
  const f = useCurrentFrame();
  const s = r(a, { damping: 13, stiffness: 150 });
  const so = fin !== undefined ? r(fin, { damping: 20 }) : 0;
  const flotte = Math.sin((f + a * 3) / 30) * 4 * e;
  return (
    <div
      style={{
        position: 'absolute',
        zIndex: z,
        display: 'flex',
        alignItems: 'center',
        gap: 16 * e,
        padding: `${16 * e}px ${26 * e}px ${16 * e}px ${16 * e}px`,
        borderRadius: 26 * e,
        background: 'rgba(6,18,36,.9)',
        border: '1.5px solid rgba(255,255,255,.28)',
        boxShadow: '0 22px 40px rgba(0,0,0,.35)',
        backdropFilter: 'blur(10px)',
        fontFamily: POLICE,
        color: C.blanc,
        opacity: Math.min(1, s * 1.6) * (1 - so),
        transform: `translateY(${(1 - s) * 30 * e + flotte - so * 20 * e}px) scale(${(0.55 + 0.45 * s) * (1 - so * 0.15)})`,
        ...style,
      }}
    >
      <span style={{ position: 'relative', width: 56 * e, height: 56 * e, borderRadius: 18 * e, background: C.or, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', boxShadow: `0 0 ${18 * e * Math.max(0, 1 - Math.abs(f - a - 6) / 14)}px ${C.or}` }}>
        <Icone nom={icone} taille={30 * e} couleur={C.texteOr} />
        <Eclat a={a + 2} taille={110 * e} style={{ left: 28 * e, top: 28 * e }} />
      </span>
      <Son nom="pop" a={a} volume={0.32} />
      <div>
        <b style={{ display: 'block', fontSize: 25 * e, fontWeight: 800, letterSpacing: '-.01em', whiteSpace: 'nowrap' }}>{titre}</b>
        {texte && <small style={{ display: 'block', marginTop: 3 * e, fontSize: 17.5 * e, fontWeight: 500, color: C.blanc82, whiteSpace: 'nowrap' }}>{texte}</small>}
      </div>
    </div>
  );
};

/** Scène : entre en fondu (léger zoom arrière), sort en fondu (léger zoom avant) — le fond, lui, continue. */
export const Scene: React.FC<{ duree: number; children: React.ReactNode; fondu?: number }> = ({ duree, children, fondu = 10 }) => {
  const f = useCurrentFrame();
  const entree = interpolate(f, [0, fondu], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const sortieV = interpolate(f, [duree - fondu, duree], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ opacity: entree * (1 - sortieV), transform: `scale(${1.03 - 0.03 * entree + 0.04 * sortieV})`, filter: sortieV > 0 ? `blur(${sortieV * 6}px)` : undefined }}>
      {children}
    </AbsoluteFill>
  );
};

/** Colonne de texte de gauche (paysage) ou bandeau du haut (portrait / carré). */
export const ZoneTexte: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { mode, u, W } = useFormat();
  const style: React.CSSProperties =
    mode === 'land'
      ? { position: 'absolute', left: 110 * u, top: 0, bottom: 230 * u, width: 780 * u, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start', gap: 34 * u }
      : mode === 'port'
        ? { position: 'absolute', left: 70, right: 70, top: 150, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28, textAlign: 'center' }
        : { position: 'absolute', left: 60, right: 60, top: 54, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, textAlign: 'center', width: W - 120 };
  return <div style={style}>{children}</div>;
};
