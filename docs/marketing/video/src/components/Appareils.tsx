import React from 'react';
import { Img, interpolate, useCurrentFrame } from 'remotion';
import { C } from '../theme';
import { img } from '../assets';
import { useFormat } from '../format';
import { useRessort } from './anim';
import { Son } from './Sons';

/** Un écran affiché à partir de l'image `a` de la scène (le premier dès le début). */
export type Ecran = { src: string; a?: number };
export type Depuis = 'bas' | 'haut' | 'gauche' | 'droite' | 'zoom';
type Toucher = { x: number; y: number; f: number };

/** Passage d'un écran à l'autre comme dans l'application : le nouvel écran glisse depuis la droite. */
function useEcrans(ecrans: Ecran[]) {
  const f = useCurrentFrame();
  const r = useRessort();
  let actuel = 0;
  ecrans.forEach((e, i) => {
    if (i > 0 && f >= (e.a ?? 0)) actuel = i;
  });
  const p = actuel === 0 ? 1 : r(ecrans[actuel].a ?? 0, { damping: 22, stiffness: 140 });
  return { actuel, p };
}

const PileEcrans: React.FC<{ ecrans: Ecran[]; rayon: number }> = ({ ecrans, rayon }) => {
  const { actuel, p } = useEcrans(ecrans);
  const precedent = Math.max(0, actuel - 1);
  return (
    <div style={{ position: 'absolute', inset: 0, borderRadius: rayon, overflow: 'hidden', background: C.fondEcran }}>
      {actuel > 0 && p < 1 && (
        <Img
          src={img(ecrans[precedent].src)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', transform: `translateX(${-30 * p}%)`, filter: `brightness(${1 - 0.25 * p})` }}
        />
      )}
      <Img
        src={img(ecrans[actuel].src)}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', transform: `translateX(${(1 - p) * 100}%)`, boxShadow: p < 1 ? '-20px 0 40px rgba(0,0,0,.25)' : undefined }}
      />
    </div>
  );
};

/** Un doigt qui touche l'écran : un point qui s'enfonce et une onde. */
const Touches: React.FC<{ touches: Toucher[] }> = ({ touches }) => {
  const f = useCurrentFrame();
  return (
    <>
      {touches.map((t, i) => {
        const k = f - t.f;
        if (k < -6 || k > 26) return null;
        const appui = interpolate(k, [-6, 0, 8, 16], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const onde = interpolate(k, [0, 24], [0.4, 2.2], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const ondeO = interpolate(k, [0, 24], [0.7, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        return (
          <div key={i} style={{ position: 'absolute', left: `${t.x * 100}%`, top: `${t.y * 100}%`, width: 0, height: 0, zIndex: 6 }}>
            <div style={{ position: 'absolute', left: -28, top: -28, width: 56, height: 56, borderRadius: 28, border: '3px solid rgba(23,105,224,.9)', transform: `scale(${onde})`, opacity: ondeO }} />
            <div style={{ position: 'absolute', left: -20, top: -20, width: 40, height: 40, borderRadius: 20, background: 'rgba(5,52,131,.35)', boxShadow: '0 0 0 3px rgba(255,255,255,.85)', transform: `scale(${0.6 + appui * 0.4})`, opacity: appui }} />
          </div>
        );
      })}
    </>
  );
};

/** Reflet de lumière qui balaie l'écran en diagonale (à l'arrivée de l'appareil et à chaque nouvel écran). */
const Reflet: React.FC<{ a: number[]; rayon: number }> = ({ a, rayon }) => {
  const f = useCurrentFrame();
  const k = a.filter((x) => f >= x && f < x + 22).pop();
  if (k === undefined) return null;
  const p = interpolate(f - k, [0, 22], [-60, 160], { extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'absolute', inset: 0, borderRadius: rayon, overflow: 'hidden', zIndex: 7, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', top: '-20%', bottom: '-20%', left: `${p}%`, width: '28%', transform: 'skewX(-20deg)', background: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.55), rgba(255,255,255,0))' }} />
    </div>
  );
};

/** Onde dorée qui part de l'appareil quand il se pose. */
const Onde: React.FC<{ a: number; w: number; h: number; rayon: number }> = ({ a, w, h, rayon }) => {
  const f = useCurrentFrame();
  const k = f - a;
  if (k < 0 || k > 26) return null;
  const s = interpolate(k, [0, 26], [1, 1.35]);
  const o = interpolate(k, [0, 4, 26], [0, 0.7, 0]);
  return <div style={{ position: 'absolute', left: 0, top: 0, width: w, height: h, borderRadius: rayon, border: `3px solid ${C.or}`, transform: `scale(${s})`, opacity: o, zIndex: -1, boxShadow: `0 0 30px ${C.or}` }} />;
};

function useEntree(entree: number, depuis: Depuis) {
  const r = useRessort();
  const { W, H } = useFormat();
  const s = r(entree, { damping: 17, stiffness: 95, mass: 1 });
  const dx = depuis === 'gauche' ? -W * 0.55 : depuis === 'droite' ? W * 0.55 : 0;
  const dy = depuis === 'bas' ? H * 0.75 : depuis === 'haut' ? -H * 0.75 : 0;
  return {
    s,
    tx: dx * (1 - s),
    ty: dy * (1 - s),
    sc: depuis === 'zoom' ? 0.6 + 0.4 * s : 1,
    rotEnPlus: (1 - s) * (depuis === 'gauche' ? -14 : depuis === 'droite' ? 14 : 10),
    op: Math.min(1, s * 1.6),
  };
}

/**
 * Le téléphone de l'affiche : cadre graphite, écran aux coins arrondis, îlot, reflet, halo bleu. Entre en glissant, flotte
 * doucement, change d'écran comme l'application, montre les touches du doigt. `x`, `y` = centre ; `w` = largeur du cadre.
 */
export const Telephone: React.FC<{
  w: number;
  x: number;
  y: number;
  rot?: number;
  ecrans: Ecran[];
  entree?: number;
  depuis?: Depuis;
  flotte?: number;
  touches?: Toucher[];
  z?: number;
  sortieA?: number;
}> = ({ w, x, y, rot = 0, ecrans, entree = 0, depuis = 'bas', flotte = 1, touches = [], z = 2, sortieA }) => {
  const f = useCurrentFrame();
  const e = useEntree(entree, depuis);
  const r = useRessort();
  const pad = w * 0.035;
  const ecranL = w - 2 * pad;
  const ecranH = ecranL * (1688 / 780);
  const h = ecranH + 2 * pad;
  const rayon = w * 0.17;
  const bob = Math.sin((f + x) / 38) * 7 * flotte;
  const bascule = Math.sin((f + y) / 55) * 0.8 * flotte;
  const so = sortieA !== undefined ? r(sortieA, { damping: 20 }) : 0;
  return (
    <div
      style={{
        position: 'absolute',
        left: x - w / 2,
        top: y - h / 2,
        width: w,
        height: h,
        zIndex: z,
        opacity: e.op * (1 - so),
        transform: `translate(${e.tx}px, ${e.ty + bob + so * 80}px) rotate(${rot + e.rotEnPlus + bascule}deg) scale(${e.sc * (1 - so * 0.08)})`,
        borderRadius: rayon,
        padding: pad,
        background: 'linear-gradient(150deg,#4A566C,#0B1220 45%,#2B3548)',
        boxShadow: `0 ${w * 0.15}px ${w * 0.22}px rgba(0,0,0,.5), 0 0 0 2px rgba(255,255,255,.16), 0 0 ${w * 0.3}px ${C.c}`,
      }}
    >
      <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: rayon - pad }}>
        <PileEcrans ecrans={ecrans} rayon={rayon - pad} />
        <Touches touches={touches} />
        <Reflet a={[entree + 12, ...ecrans.slice(1).map((ec) => (ec.a ?? 0) + 6)]} rayon={rayon - pad} />
        <div style={{ position: 'absolute', left: '50%', top: ecranL * 0.022, width: ecranL * 0.28, height: ecranL * 0.075, marginLeft: -ecranL * 0.14, borderRadius: ecranL, background: '#05080F', zIndex: 5 }} />
        <div style={{ position: 'absolute', inset: 0, borderRadius: rayon - pad, background: 'linear-gradient(115deg,rgba(255,255,255,.28),rgba(255,255,255,0) 32%,rgba(255,255,255,0) 70%,rgba(255,255,255,.07))', zIndex: 4, pointerEvents: 'none' }} />
      </div>
      <Onde a={entree + 12} w={w - 0} h={h} rayon={rayon} />
      <Son nom="whoosh" a={entree} volume={0.3} />
      {ecrans.slice(1).map((ec, i) => (
        <Son key={i} nom="swish" a={(ec.a ?? 0) - 1} volume={0.2} />
      ))}
      {touches.map((t, i) => (
        <Son key={`t${i}`} nom="tap" a={t.f} volume={0.55} />
      ))}
      <div style={{ position: 'absolute', right: -w * 0.012, top: h * 0.2, width: w * 0.014, height: h * 0.1, borderRadius: 4, background: '#2B3548' }} />
      <div style={{ position: 'absolute', left: -w * 0.012, top: h * 0.17, width: w * 0.014, height: h * 0.06, borderRadius: 4, background: '#2B3548' }} />
      <div style={{ position: 'absolute', left: -w * 0.012, top: h * 0.25, width: w * 0.014, height: h * 0.1, borderRadius: 4, background: '#2B3548' }} />
    </div>
  );
};

/** Hauteur du cadre d'un téléphone de largeur w (pour placer les éléments autour). */
export const hauteurTelephone = (w: number) => w * 0.93 * (1688 / 780) + w * 0.07;

type Zoom = { f: number; s: number; x: number; y: number };

/**
 * L'ordinateur portable : écran 16:10 au cadre graphite (même matière que le téléphone), socle argenté. Peut zoomer sur une
 * zone de l'écran (mouvement de caméra) et afficher une barre de navigateur (site de l'hôtel). `x`, `y` = centre de l'écran.
 */
export const Ordinateur: React.FC<{
  w: number;
  x: number;
  y: number;
  ecrans: Ecran[];
  entree?: number;
  depuis?: Depuis;
  zoom?: Zoom[];
  navigateur?: string;
  z?: number;
  flotte?: number;
  sortieA?: number;
}> = ({ w, x, y, ecrans, entree = 0, depuis = 'droite', zoom, navigateur, z = 1, flotte = 1, sortieA }) => {
  const f = useCurrentFrame();
  const e = useEntree(entree, depuis);
  const r = useRessort();
  const b = w * 0.022;
  const ecranL = w - 2 * b;
  const barre = navigateur ? ecranL * 0.04 : 0;
  const ecranH = ecranL / 1.6 + barre;
  const h = ecranH + b + b * 1.3;
  const k = (key: 's' | 'x' | 'y', def: number) =>
    zoom && zoom.length > 1 ? interpolate(f, zoom.map((z) => z.f), zoom.map((z) => z[key]), { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : zoom?.[0]?.[key] ?? def;
  const s = k('s', 1);
  const ox = k('x', 0.5);
  const oy = k('y', 0.5);
  const bob = Math.sin((f + x) / 46) * 5 * flotte;
  const so = sortieA !== undefined ? r(sortieA, { damping: 20 }) : 0;
  const { actuel, p } = (() => {
    let a = 0;
    ecrans.forEach((ec, i) => {
      if (i > 0 && f >= (ec.a ?? 0)) a = i;
    });
    return { actuel: a, p: a === 0 ? 1 : r(ecrans[a].a ?? 0, { damping: 24, stiffness: 120 }) };
  })();
  return (
    <div
      style={{
        position: 'absolute',
        left: x - w / 2,
        top: y - h / 2,
        width: w,
        zIndex: z,
        opacity: e.op * (1 - so),
        transform: `translate(${e.tx}px, ${e.ty + bob + so * 60}px) scale(${e.sc * (1 - so * 0.06)}) perspective(${w * 3}px) rotateY(${e.rotEnPlus * 0.6}deg)`,
      }}
    >
      <div
        style={{
          position: 'relative',
          width: w,
          height: h,
          borderRadius: w * 0.025,
          padding: `${b * 1.3}px ${b}px ${b}px`,
          background: 'linear-gradient(150deg,#4A566C,#0B1220 45%,#2B3548)',
          boxShadow: `0 ${w * 0.06}px ${w * 0.1}px rgba(0,0,0,.45), 0 0 0 2px rgba(255,255,255,.14), 0 0 ${w * 0.12}px rgba(23,105,224,.6)`,
        }}
      >
        <Son nom="whoosh2" a={entree} volume={0.3} />
        {ecrans.slice(1).map((ec, i) => (
          <Son key={i} nom="swish" a={(ec.a ?? 0) - 1} volume={0.16} />
        ))}
        <div style={{ position: 'absolute', left: '50%', top: b * 0.45, width: b * 0.4, height: b * 0.4, marginLeft: -b * 0.2, borderRadius: b, background: '#1C2433' }} />
        <div style={{ position: 'relative', width: ecranL, height: ecranH, borderRadius: w * 0.006, overflow: 'hidden', background: '#fff' }}>
          {navigateur && (
            <div style={{ height: barre, background: '#EEF2F8', display: 'flex', alignItems: 'center', gap: barre * 0.25, padding: `0 ${barre * 0.5}px`, borderBottom: '1px solid #DDE4EE' }}>
              {['#FF5F57', '#FEBC2E', '#28C840'].map((c) => (
                <span key={c} style={{ width: barre * 0.32, height: barre * 0.32, borderRadius: barre, background: c }} />
              ))}
              <div style={{ marginLeft: barre * 0.6, flex: 1, maxWidth: ecranL * 0.45, height: barre * 0.62, borderRadius: barre, background: '#fff', border: '1px solid #DDE4EE', display: 'flex', alignItems: 'center', gap: barre * 0.2, padding: `0 ${barre * 0.35}px`, fontSize: barre * 0.36, color: '#5B6B82', fontWeight: 600 }}>
                <svg viewBox="0 0 24 24" width={barre * 0.36} height={barre * 0.36} fill="none" stroke="#12B76A" strokeWidth={2.4}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
                {navigateur}
              </div>
            </div>
          )}
          <div style={{ position: 'absolute', left: 0, right: 0, top: barre, bottom: 0, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, transform: `scale(${s})`, transformOrigin: `${ox * 100}% ${oy * 100}%` }}>
              {actuel > 0 && p < 1 && <Img src={img(ecrans[actuel - 1].src)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />}
              <Img src={img(ecrans[actuel].src)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', opacity: p, transform: `scale(${1.03 - 0.03 * p})` }} />
            </div>
          </div>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(120deg,rgba(255,255,255,.16),rgba(255,255,255,0) 30%)', pointerEvents: 'none' }} />
          <Reflet a={[entree + 14, ...ecrans.slice(1).map((ec) => (ec.a ?? 0) + 4)]} rayon={0} />
        </div>
      </div>
      <div style={{ position: 'relative', width: w * 1.16, left: -w * 0.08, height: w * 0.034, borderRadius: `${w * 0.004}px ${w * 0.004}px ${w * 0.03}px ${w * 0.03}px`, background: 'linear-gradient(180deg,#C9D2DF,#8E99AB 60%,#5E687A)', boxShadow: `0 ${w * 0.03}px ${w * 0.05}px rgba(0,0,0,.4)` }}>
        <div style={{ position: 'absolute', left: '50%', top: 0, width: w * 0.16, height: w * 0.011, marginLeft: -w * 0.08, borderRadius: `0 0 ${w * 0.01}px ${w * 0.01}px`, background: '#7A8597' }} />
      </div>
    </div>
  );
};

/** Hauteur totale (écran + socle) d'un ordinateur de largeur w. */
export const hauteurOrdinateur = (w: number) => (w - 0.044 * w) / 1.6 + 0.022 * w * 2.3 + w * 0.034;
