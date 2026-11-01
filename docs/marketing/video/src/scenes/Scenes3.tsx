import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { C, POLICE } from '../theme';
import { useFormat } from '../format';
import { cue, FPS, LINES, sceneStart } from '../timeline';
import { useRessort } from '../components/anim';
import { BulleWhatsApp, Icone } from '../components/Icone';
import { Telephone } from '../components/Appareils';
import { Marque, Pastille } from '../components/Textes';
import { useTailles } from './Scenes2';

/** Jauge or « 14 jours d'essai gratuit » : l'anneau se remplit, le chiffre compte jusqu'à 14. */
const Jauge: React.FC<{ a: number; d: number }> = ({ a, d }) => {
  const f = useCurrentFrame();
  const r = useRessort();
  const s = r(a, { damping: 12, stiffness: 130 });
  const p = interpolate(f, [a + 4, a + 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const R = d / 2 - d * 0.06;
  const L = 2 * Math.PI * R;
  return (
    <div style={{ position: 'relative', width: d, height: d, flex: 'none', transform: `scale(${0.5 + 0.5 * s})`, opacity: Math.min(1, s * 2) }}>
      <svg width={d} height={d} style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
        <circle cx={d / 2} cy={d / 2} r={R} stroke="rgba(255,255,255,.14)" strokeWidth={d * 0.08} fill="rgba(6,18,36,.85)" />
        <circle cx={d / 2} cy={d / 2} r={R} stroke={C.or} strokeWidth={d * 0.08} fill="none" strokeLinecap="round" strokeDasharray={`${L * p} ${L}`} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: POLICE, color: C.blanc }}>
        <b style={{ fontSize: d * 0.38, fontWeight: 800, lineHeight: 1, letterSpacing: '-.04em', color: C.or }}>{Math.round(14 * p)}</b>
        <small style={{ fontSize: d * 0.12, fontWeight: 700, marginTop: d * 0.02 }}>jours</small>
      </div>
    </div>
  );
};

const Telecharger: React.FC<{ a: number; e: number }> = ({ a, e }) => {
  const r = useRessort();
  return (
    <div style={{ display: 'flex', gap: 16 * e }}>
      {[
        { i: 'telephone', t: 'Android' },
        { i: 'ordinateur', t: 'Windows' },
      ].map((b, k) => {
        const s = r(a + k * 5, { damping: 13, stiffness: 150 });
        return (
          <div key={b.t} style={{ display: 'flex', alignItems: 'center', gap: 14 * e, padding: `${12 * e}px ${22 * e}px ${12 * e}px ${12 * e}px`, borderRadius: 22 * e, background: C.blanc, color: C.a, fontFamily: POLICE, boxShadow: '0 14px 30px rgba(0,0,0,.3)', opacity: Math.min(1, s * 2), transform: `translateY(${(1 - s) * 24}px) scale(${0.7 + 0.3 * s})` }}>
            <span style={{ width: 50 * e, height: 50 * e, borderRadius: 14 * e, background: C.c, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icone nom="telecharger" taille={28 * e} couleur={C.blanc} epaisseur={2.6} />
            </span>
            <div style={{ lineHeight: 1.1 }}>
              <small style={{ display: 'block', fontSize: 15 * e, fontWeight: 600, color: '#5B6B82' }}>Télécharger pour</small>
              <b style={{ display: 'flex', alignItems: 'center', gap: 6 * e, fontSize: 26 * e, fontWeight: 800 }}>
                {b.t}
              </b>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const CarteWhatsApp: React.FC<{ a: number; e: number; style: React.CSSProperties; centre?: boolean }> = ({ a, e, style, centre }) => {
  const f = useCurrentFrame();
  const r = useRessort();
  const s = r(a, { damping: 11, stiffness: 140 });
  const pulse = 1 + Math.max(0, Math.sin((f - a) / 9)) * 0.06;
  return (
    <div style={{ position: 'absolute', zIndex: 12, ...style, opacity: Math.min(1, s * 2), transform: `translateY(${(1 - s) * 50}px) scale(${0.6 + 0.4 * s})` }}>
      <div style={{ display: 'flex', width: 'fit-content', margin: centre ? '0 auto' : undefined, alignItems: 'center', gap: 20 * e, padding: `${18 * e}px ${32 * e}px ${18 * e}px ${18 * e}px`, borderRadius: 30 * e, background: 'rgba(6,18,36,.94)', border: `2px solid ${C.or}`, boxShadow: '0 26px 50px rgba(0,0,0,.45), 0 0 60px rgba(245,180,0,.25)', fontFamily: POLICE }}>
        <div style={{ transform: `scale(${pulse})` }}>
          <BulleWhatsApp taille={78 * e} />
        </div>
        <div>
          <small style={{ display: 'block', fontSize: 21 * e, fontWeight: 700, color: C.blanc82 }}>Écrivez-nous sur WhatsApp</small>
          <b style={{ display: 'block', fontSize: 46 * e, fontWeight: 800, color: C.or, letterSpacing: '.01em', whiteSpace: 'nowrap', lineHeight: 1.1 }}>+243 828 497 218</b>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ 8. Appel à l'action */
export const S8Final: React.FC = () => {
  const { pick, u, mode, W } = useFormat();
  const r = useRessort();
  const T = useTailles();
  const cE = cue(8, 'essayez', 0);
  const cJ = cue(8, 'quatorze');
  const cC = cue(8, 'carte');
  const cW = cue(8, 'whatsapp', 8);
  const finVoix = Math.round((LINES[8].end + 0.35) * FPS) - sceneStart(8);
  const fin = r(finVoix + 4, { damping: 18 });
  const e = pick(u, 1, 0.74);
  const tel = pick({ w: 320 * u, x: 1480 * u, y: 470 * u }, { w: 270, x: W / 2, y: 1000 }, { w: 215, x: 830, y: 640 });
  const marque = r(0, { damping: 14 });
  const carte = r(cC, { damping: 14 });
  const colonne: React.CSSProperties =
    mode === 'land'
      ? { position: 'absolute', left: 110 * u, top: 120 * u, width: 820 * u, display: 'flex', flexDirection: 'column', gap: 34 * u }
      : mode === 'port'
        ? { position: 'absolute', left: 60, right: 60, top: 130, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 30 }
        : { position: 'absolute', left: 50, top: 50, width: 640, display: 'flex', flexDirection: 'column', gap: 18 };
  return (
    <>
      <div style={colonne}>
        <div style={{ opacity: Math.min(1, marque * 2), transform: `translateY(${(1 - marque) * -30}px)` }}>
          <Marque taille={pick(96 * u, 96, 62)} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 26 * e }}>
          <Jauge a={cE} d={pick(200 * u, 180, 128)} />
          <div style={{ fontFamily: POLICE, color: C.blanc }}>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: pick(66 * u, 58, 44), fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1.05, transform: `translateY(${(1 - r(cE + 4, { damping: 18 })) * 110}%)` }}>
                Essai gratuit
              </div>
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: pick(66 * u, 58, 44), fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1.05, color: C.or, transform: `translateY(${(1 - r(cJ, { damping: 18 })) * 110}%)` }}>de 14 jours</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 * e, marginTop: 14 * e, fontSize: pick(26 * u, 28, 21), fontWeight: 700, color: C.blanc82, opacity: Math.min(1, carte * 2), transform: `translateX(${(1 - carte) * -20}px)` }}>
              <span style={{ width: 34 * e, height: 34 * e, borderRadius: 17 * e, background: C.succes, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icone nom="check" taille={20 * e} couleur={C.blanc} epaisseur={3.2} />
              </span>
              Sans carte bancaire
            </div>
          </div>
        </div>
        <Telecharger a={cE + 20} e={e} />
      </div>
      <Telephone w={tel.w} x={tel.x} y={tel.y} rot={5} depuis="droite" entree={4} z={3} ecrans={[{ src: 't-tableau' }, { src: 't-reception', a: cJ + 20 }, { src: 't-cafeteria', a: cC + 26 }]} />
      {mode !== 'sq' && <Pastille icone="hors" titre="Sans internet" texte="Tout continue de marcher" a={cE + 30} fin={cW - 10} echelle={T.pastille} style={pick({ left: 1000 * u, top: 560 * u }, { left: 60, top: 1130 }, { left: 0, top: 0 })} />}
      <CarteWhatsApp a={cW} e={pick(u, 1.15, 0.8)} centre={mode === 'port'} style={pick<React.CSSProperties>({ left: 110 * u, top: 690 * u }, { left: 0, right: 0, top: 1110 }, { left: 50, top: 560 })} />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          ...pick<React.CSSProperties>({ bottom: 70 * u }, { top: 1350 }, { bottom: 60 }),
          textAlign: 'center',
          fontFamily: POLICE,
          fontWeight: 800,
          fontSize: pick(54 * u, 60, 46),
          letterSpacing: '-.02em',
          color: C.blanc,
          opacity: Math.min(1, fin * 1.5),
          transform: `translateY(${(1 - fin) * 30}px)`,
          zIndex: 20,
        }}
      >
        Gérez votre hôtel, <span style={{ color: C.or }}>simplement.</span>
      </div>
    </>
  );
};
