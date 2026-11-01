import React from 'react';
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { C, POLICE } from '../theme';
import { useFormat } from '../format';
import { useRessort } from './anim';
import { Icone } from './Icone';

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
  return (
    <div style={{ fontFamily: POLICE, fontSize: taille, fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.04, textAlign: aligner, ...style }}>
      {ligne(l1, C.blanc, 0)}
      {ligne(l2, C.or, 6)}
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
      <span style={{ width: 56 * e, height: 56 * e, borderRadius: 18 * e, background: C.or, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
        <Icone nom={icone} taille={30 * e} couleur={C.texteOr} />
      </span>
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
