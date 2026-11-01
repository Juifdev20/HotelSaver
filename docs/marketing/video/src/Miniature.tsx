import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { C, POLICE } from './theme';
import { useFormat } from './format';
import { Fond } from './components/Fond';
import { Ordinateur, Telephone } from './components/Appareils';
import { Icone } from './components/Icone';
import { Pastille } from './components/Textes';

/**
 * Miniature (YouTube 1280×720) et couverture verticale (Shorts, TikTok, statut 1080×1920), dans la charte de la vidéo :
 * peu de mots, très gros, très contrastés — lisibles même en vignette sur un téléphone.
 */
const AVANT = -120; // tout est déjà posé : les animations sont terminées

const Ombre = '0 6px 0 rgba(0,0,0,.25), 0 14px 40px rgba(0,0,0,.55)';

const Logo: React.FC<{ t: number }> = ({ t }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: t * 0.22 }}>
    <Img src={staticFile('captures/logo.png')} style={{ width: t, height: t, borderRadius: t * 0.24, boxShadow: '0 10px 30px rgba(0,0,0,.45)' }} />
    <div style={{ fontFamily: POLICE, fontWeight: 800, fontSize: t * 0.56, letterSpacing: '-0.03em', color: C.blanc, textShadow: Ombre }}>
      Hotel<span style={{ color: C.or }}>Saver</span>
    </div>
  </div>
);

const Coupure: React.FC<{ d: number; style: React.CSSProperties }> = ({ d, style }) => (
  <div style={{ position: 'absolute', width: d, height: d, borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%, #2A3B5C, #0B1526)', boxShadow: `0 0 0 ${d * 0.035}px ${C.alerte}, 0 0 ${d * 0.5}px rgba(247,144,9,.65), 0 ${d * 0.12}px ${d * 0.25}px rgba(0,0,0,.5)`, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9, ...style }}>
    <Icone nom="hors" taille={d * 0.52} couleur={C.alerte} epaisseur={2.4} />
  </div>
);

const Sticker: React.FC<{ t: number; style: React.CSSProperties }> = ({ t, style }) => (
  <div style={{ position: 'absolute', zIndex: 12, transform: 'rotate(-8deg)', ...style }}>
    <div style={{ padding: `${t * 0.22}px ${t * 0.5}px`, borderRadius: t * 0.5, background: `linear-gradient(145deg, ${C.orClair}, ${C.or} 55%, #D89A00)`, color: C.texteOr, fontFamily: POLICE, fontWeight: 900, fontSize: t, lineHeight: 1, letterSpacing: '-0.02em', textAlign: 'center', boxShadow: '0 12px 30px rgba(0,0,0,.45), inset 0 2px 0 rgba(255,255,255,.5)', whiteSpace: 'nowrap' }}>
      14 JOURS
      <div style={{ fontSize: t * 0.42, fontWeight: 800, letterSpacing: '.12em', marginTop: t * 0.08 }}>GRATUITS</div>
    </div>
  </div>
);

export const Miniature: React.FC = () => {
  const { W, H, mode } = useFormat();
  const port = mode === 'port';
  const focales = [{ f: 0, x: port ? 0.5 : 0.68, y: port ? 0.6 : 0.5 }];
  if (!port) {
    // YouTube 1280×720 : texte à gauche, appareils à droite.
    const k = W / 1280;
    return (
      <AbsoluteFill style={{ background: C.a, overflow: 'hidden' }}>
        <Fond focales={focales} />
        <div style={{ position: 'absolute', left: 54 * k, top: 40 * k }}>
          <Logo t={58 * k} />
        </div>
        <div style={{ position: 'absolute', left: 50 * k, top: 150 * k, width: 640 * k, fontFamily: POLICE, fontWeight: 900, letterSpacing: '-0.045em', lineHeight: 0.95, textShadow: Ombre }}>
          <div style={{ fontSize: 84 * k, color: C.blanc }}>VOTRE HÔTEL</div>
          <div style={{ fontSize: 112 * k, color: C.or }}>SANS</div>
          <div style={{ fontSize: 112 * k, color: C.or }}>INTERNET</div>
        </div>
        <div style={{ position: 'absolute', left: 54 * k, top: 520 * k, display: 'flex', alignItems: 'center', gap: 14 * k, padding: `${14 * k}px ${26 * k}px`, borderRadius: 50 * k, background: 'rgba(6,18,36,.92)', border: `2px solid ${C.succes}`, boxShadow: '0 12px 30px rgba(0,0,0,.4)', fontFamily: POLICE, fontWeight: 800, fontSize: 34 * k, color: C.blanc }}>
          <span style={{ width: 40 * k, height: 40 * k, borderRadius: 20 * k, background: C.succes, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icone nom="check" taille={26 * k} couleur={C.blanc} epaisseur={3.4} />
          </span>
          Tout continue de marcher
        </div>
        <div style={{ position: 'absolute', left: 58 * k, top: 624 * k, fontFamily: POLICE, fontWeight: 700, fontSize: 24 * k, color: C.blanc82, letterSpacing: '.02em' }}>Réception · Cafétaria · Réservations · Rapports</div>
        <Ordinateur w={600 * k} x={985 * k} y={330 * k} ecrans={[{ src: 'pc-tableau-de-bord' }]} entree={AVANT} flotte={0} />
        <Telephone w={205 * k} x={1150 * k} y={455 * k} rot={8} ecrans={[{ src: 't-tableau' }]} entree={AVANT} flotte={0} z={4} />
        <Coupure d={128 * k} style={{ left: 690 * k, top: 70 * k }} />
        <Sticker t={46 * k} style={{ left: 760 * k, top: 545 * k }} />
      </AbsoluteFill>
    );
  }
  // Vertical 1080×1920 : titre en haut, appareils au centre, offre en bas.
  return (
    <AbsoluteFill style={{ background: C.a, overflow: 'hidden' }}>
      <Fond focales={focales} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 120, display: 'flex', justifyContent: 'center' }}>
        <Logo t={92} />
      </div>
      <div style={{ position: 'absolute', left: 40, right: 40, top: 280, textAlign: 'center', fontFamily: POLICE, fontWeight: 900, letterSpacing: '-0.045em', lineHeight: 0.95, textShadow: Ombre }}>
        <div style={{ fontSize: 112, color: C.blanc }}>VOTRE HÔTEL</div>
        <div style={{ fontSize: 150, color: C.or }}>SANS</div>
        <div style={{ fontSize: 150, color: C.or }}>INTERNET</div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 730, display: 'flex', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '18px 34px', borderRadius: 60, background: 'rgba(6,18,36,.92)', border: `3px solid ${C.succes}`, boxShadow: '0 12px 30px rgba(0,0,0,.4)', fontFamily: POLICE, fontWeight: 800, fontSize: 46, color: C.blanc }}>
          <span style={{ width: 54, height: 54, borderRadius: 27, background: C.succes, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icone nom="check" taille={34} couleur={C.blanc} epaisseur={3.4} />
          </span>
          Tout continue de marcher
        </div>
      </div>
      <Ordinateur w={860} x={540} y={1130} ecrans={[{ src: 'pc-tableau-de-bord' }]} entree={AVANT} flotte={0} />
      <Telephone w={290} x={840} y={1290} rot={8} ecrans={[{ src: 't-tableau' }]} entree={AVANT} flotte={0} z={4} />
      <Coupure d={170} style={{ left: 50, top: 850 }} />
      <Pastille icone="lit" titre="Réception" texte="Chambres et séjours" a={AVANT} echelle={1.35} style={{ left: 50, top: 1440 }} />
      <Sticker t={70} style={{ left: 600, top: 1560 }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: 1760, textAlign: 'center', fontFamily: POLICE, fontWeight: 700, fontSize: 36, color: C.blanc82 }}>Réception · Cafétaria · Réservations · Rapports</div>
    </AbsoluteFill>
  );
};
