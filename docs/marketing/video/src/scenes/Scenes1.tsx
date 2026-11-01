import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { C, POLICE } from '../theme';
import { useFormat } from '../format';
import { cue, sceneLength } from '../timeline';
import { useRessort } from '../components/anim';
import { Icone } from '../components/Icone';
import { Ordinateur, Telephone } from '../components/Appareils';
import { Eclat, Marque, Pastille, Scene, Tag, Titre, ZoneTexte } from '../components/Textes';
import { Son } from '../components/Sons';

const tailles = (pick: <T>(l: T, p: T, s?: T) => T, u: number) => ({
  titre: pick(88 * u, 92, 62),
  tag: pick(21 * u, 23, 17),
  pastille: pick(1.12 * u, 1.18, 0.86),
});

/* ------------------------------------------------------------------ 0. Accroche : le réseau tombe */
export const S0Accroche: React.FC = () => {
  const f = useCurrentFrame();
  const { pick, u, W } = useFormat();
  const r = useRessort();
  const T = tailles(pick, u);
  const coupe = cue(0, 'réseau', 0) + 6;
  const d = pick(320 * u, 360, 250);
  const cx = pick(1390 * u, W / 2, 540);
  const cy = pick(470 * u, 880, 640);
  const s = r(4, { damping: 12, stiffness: 110 });
  const apres = f >= coupe;
  const choc = r(coupe, { damping: 9, stiffness: 220 });
  const secousse = apres ? Math.sin((f - coupe) * 1.9) * 18 * Math.max(0, 1 - (f - coupe) / 18) : 0;
  const pulsations = [0, 1, 2].map((k) => {
    const cycle = 36;
    const t = ((f + k * 12) % cycle) / cycle;
    return { t, visible: !apres || f - coupe < 8 };
  });
  return (
    <Scene duree={sceneLength(0)}>
      <ZoneTexte>
        <Tag texte="HOTELSAVER" a={2} taille={T.tag} />
        <Titre l1="Et si votre hôtel" l2="ne s'arrêtait jamais ?" a={10} taille={T.titre * pick(0.86, 0.9, 0.95)} aligner={pick('left', 'center')} />
      </ZoneTexte>
      <div style={{ position: 'absolute', left: cx - d / 2, top: cy - d / 2, width: d, height: d, transform: `translateX(${secousse}px) scale(${0.4 + 0.6 * s})`, opacity: Math.min(1, s * 2) }}>
        {pulsations.map((p, k) =>
          p.visible ? (
            <div key={k} style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `3px solid ${C.or}`, transform: `scale(${1 + p.t * 0.9})`, opacity: (1 - p.t) * 0.6 }} />
          ) : null,
        )}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: apres ? 'radial-gradient(circle at 35% 30%, #22324F, #0B1526)' : `radial-gradient(circle at 35% 30%, ${C.orClair}, ${C.or} 55%, #B97F00)`,
            boxShadow: apres ? `0 0 0 4px ${C.alerte}, 0 30px 60px rgba(0,0,0,.45)` : `0 0 80px rgba(245,180,0,.55), 0 30px 60px rgba(0,0,0,.35)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: `scale(${apres ? 1 + 0.08 * (1 - choc) : 1})`,
          }}
        >
          <Icone nom={apres ? 'hors' : 'wifi'} taille={d * 0.5} couleur={apres ? C.alerte : C.texteOr} epaisseur={2.2} />
        </div>
      </div>
      <Son nom="etincelle" a={4} volume={0.2} />
      <Son nom="coupure" a={coupe - 2} volume={0.32} />
      <Son nom="pop" a={coupe + 2} volume={0.25} />
      <Eclat a={4} taille={d * 1.3} n={10} style={{ left: cx, top: cy }} />
      {apres && (
        <div style={{ position: 'absolute', left: cx, top: cy + d / 2 + 40 * u, transform: `translateX(-50%) scale(${0.6 + 0.4 * choc})`, opacity: Math.min(1, choc * 2) }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: `${14 * u}px ${28 * u}px`, borderRadius: 40, background: 'rgba(6,18,36,.9)', border: '1.5px solid rgba(255,255,255,.28)', fontFamily: POLICE, fontWeight: 800, fontSize: pick(30 * u, 34, 26), color: C.blanc, whiteSpace: 'nowrap' }}>
            <span style={{ width: 16, height: 16, borderRadius: 8, background: C.alerte, boxShadow: '0 0 0 6px rgba(247,144,9,.25)' }} />
            Réseau coupé
          </div>
        </div>
      )}
    </Scene>
  );
};

/* ------------------------------------------------------------------ 1. Présentation : logo, puis téléphone et ordinateur */
export const S1Intro: React.FC = () => {
  const f = useCurrentFrame();
  const { pick, u, W, H, mode } = useFormat();
  const r = useRessort();
  const T = tailles(pick, u);
  const bascule = 74;
  const m = r(bascule, { damping: 20, stiffness: 90 });
  const logo0 = pick(150 * u, 150, 120);
  const logo1 = pick(70 * u, 72, 54);
  const taille = logo0 + (logo1 - logo0) * m;
  const largeur = taille * 4.45;
  const x0 = W / 2 - largeur / 2;
  const y0 = H / 2 - taille / 2 - pick(20 * u, 60, 30);
  const x1 = pick(110 * u, W / 2 - (logo1 * 4.45) / 2, W / 2 - (logo1 * 4.45) / 2);
  const y1 = pick(70 * u, 70, 40);
  const s = r(4, { damping: 11, stiffness: 120 });
  const eclat = interpolate(f, [4, 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const slogan = interpolate(f, [22, 34, bascule - 6, bascule + 4], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const pos = pick(
    { lap: { w: 760 * u, x: 1400 * u, y: 420 * u }, tel: { w: 250 * u, x: 1015 * u, y: 560 * u }, p: [{ x: 905, y: 135 }, { x: 1470, y: 610 }, { x: 1125, y: 770 }] },
    { lap: { w: 880, x: 540, y: 930 }, tel: { w: 290, x: 850, y: 1050 }, p: [{ x: 50, y: 560 }, { x: 560, y: 1205 }, { x: 50, y: 1205 }] },
    { lap: { w: 620, x: 470, y: 610 }, tel: { w: 185, x: 880, y: 690 }, p: [{ x: 40, y: 315 }, { x: 640, y: 760 }, { x: 40, y: 760 }] },
  );
  const k = mode === 'land' ? u : 1;
  return (
    <Scene duree={sceneLength(1)}>
      <div style={{ position: 'absolute', left: x0 + (x1 - x0) * m, top: y0 + (y1 - y0) * m, transform: `scale(${0.3 + 0.7 * s})`, transformOrigin: 'left center', opacity: Math.min(1, s * 2), zIndex: 20 }}>
        <div style={{ position: 'absolute', left: taille / 2, top: taille / 2, width: 0, height: 0 }}>
          <div style={{ position: 'absolute', left: -taille, top: -taille, width: taille * 2, height: taille * 2, borderRadius: '50%', border: `4px solid ${C.or}`, transform: `scale(${0.4 + eclat * 2.2})`, opacity: (1 - eclat) * 0.8 }} />
        </div>
        <Marque taille={taille} />
        <div style={{ position: 'absolute', left: 0, right: -400, top: taille + 18, opacity: slogan, fontFamily: POLICE, fontWeight: 600, fontSize: logo0 * 0.24, color: C.blanc82, whiteSpace: 'nowrap', textAlign: mode === 'land' ? 'left' : 'left' }}>
          Gérez votre hôtel, simplement.
        </div>
      </div>
      <Son nom="impact" a={4} volume={0.45} />
      <Son nom="etincelle" a={10} volume={0.22} />
      <Son nom="swish" a={bascule - 2} volume={0.2} />
      {f > bascule - 2 && (
        <>
          <Son nom="pop" a={cue(1, 'téléphone')} volume={0.25} />
          <Son nom="pop" a={cue(1, 'ordinateur')} volume={0.25} />
          <ZoneTexte>
            <div style={{ height: pick(40 * u, 60, 40) }} />
            <Titre l1="Tout votre hôtel," l2="dans une seule appli." a={bascule + 12} taille={T.titre * pick(0.84, 0.9, 0.95)} aligner={pick('left', 'center')} />
            <div style={{ display: 'flex', gap: 16 * k, justifyContent: mode === 'land' ? 'flex-start' : 'center' }}>
              {[
                { icone: 'telephone', t: 'Android', a: cue(1, 'téléphone') },
                { icone: 'ordinateur', t: 'Windows', a: cue(1, 'ordinateur') },
              ].map((b) => {
                const sb = r(b.a, { damping: 13 });
                return (
                  <div key={b.t} style={{ display: 'flex', alignItems: 'center', gap: 12 * k, padding: `${12 * k}px ${22 * k}px`, borderRadius: 40, background: 'rgba(255,255,255,.1)', border: '1.5px solid rgba(255,255,255,.25)', fontFamily: POLICE, fontWeight: 700, fontSize: pick(28 * u, 30, 22), color: C.blanc, opacity: Math.min(1, sb * 2), transform: `scale(${0.6 + 0.4 * sb})` }}>
                    <Icone nom={b.icone} taille={pick(30 * u, 32, 24)} couleur={C.or} />
                    {b.t}
                  </div>
                );
              })}
            </div>
          </ZoneTexte>
          <Ordinateur w={pos.lap.w} x={pos.lap.x} y={pos.lap.y} ecrans={[{ src: 'pc-tableau-de-bord' }]} entree={bascule + 6} depuis={pick('droite', 'bas')} zoom={[{ f: bascule, s: 1, x: 0.5, y: 0.3 }, { f: bascule + 240, s: 1.12, x: 0.6, y: 0.3 }]} />
          <Telephone w={pos.tel.w} x={pos.tel.x} y={pos.tel.y} rot={pick(-6, 6, 6)} ecrans={[{ src: 't-tableau' }]} entree={bascule + 18} depuis="bas" z={3} />
          <Pastille icone="lit" titre="Réception" texte="Chambres et séjours" a={cue(1, 'réception')} echelle={T.pastille} style={{ left: pos.p[0].x * k, top: pos.p[0].y * k }} />
          <Pastille icone="cafe" titre="Cafétaria" texte="Comptes, cuisine, stock" a={cue(1, 'cafétaria')} echelle={T.pastille} style={{ left: pos.p[1].x * k, top: pos.p[1].y * k }} />
          <Pastille icone="agenda" titre="Réservations" texte="Arrivées et départs" a={cue(1, 'réservations')} echelle={T.pastille} style={{ left: pos.p[2].x * k, top: pos.p[2].y * k }} />
        </>
      )}
    </Scene>
  );
};

/* ------------------------------------------------------------------ 2. Sans Internet : on travaille, puis tout se synchronise */
const BadgeEtat: React.FC<{ actions: number[]; retour: number; aJour: number; style: React.CSSProperties; e: number }> = ({ actions, retour, aJour, style, e }) => {
  const f = useCurrentFrame();
  const r = useRessort();
  const n = actions.filter((a) => f >= a).length;
  const etat = f >= aJour ? 'ok' : f >= retour ? 'sync' : 'hors';
  const pop = r(etat === 'ok' ? aJour : etat === 'sync' ? retour : actions.filter((a) => f >= a).pop() ?? 0, { damping: 10, stiffness: 200 });
  const fond = etat === 'ok' ? C.succes : etat === 'sync' ? C.c : 'rgba(6,18,36,.92)';
  const texte = etat === 'ok' ? 'À jour · tout est synchronisé' : etat === 'sync' ? 'Synchronisation…' : n ? `Hors ligne · ${n} en attente` : 'Hors ligne';
  return (
    <div style={{ position: 'absolute', zIndex: 9, transform: `translateX(-50%) scale(${0.92 + 0.08 * pop})`, ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 * e, padding: `${14 * e}px ${26 * e}px`, borderRadius: 50, background: fond, border: '1.5px solid rgba(255,255,255,.3)', boxShadow: '0 18px 36px rgba(0,0,0,.35)', fontFamily: POLICE, fontWeight: 800, fontSize: 28 * e, color: C.blanc, whiteSpace: 'nowrap' }}>
        {etat === 'hors' && <Icone nom="hors" taille={30 * e} couleur={C.alerte} />}
        {etat === 'sync' && (
          <span style={{ display: 'inline-flex', transform: `rotate(${f * 12}deg)` }}>
            <Icone nom="sync" taille={30 * e} couleur={C.blanc} />
          </span>
        )}
        {etat === 'ok' && <Icone nom="check" taille={30 * e} couleur={C.blanc} epaisseur={3} />}
        {texte}
      </div>
    </div>
  );
};

const Etapes: React.FC<{ items: { icone: string; t: string; a: number }[]; e: number; grille?: boolean; style?: React.CSSProperties }> = ({ items, e, grille, style }) => {
  const f = useCurrentFrame();
  const r = useRessort();
  return (
    <div style={{ display: grille ? 'grid' : 'flex', gridTemplateColumns: grille ? '1fr 1fr' : undefined, flexDirection: 'column', gap: 16 * e, ...style }}>
      {items.map((it) => {
        const on = f >= it.a;
        const s = r(it.a, { damping: 14 });
        return (
          <div key={it.t} style={{ display: 'flex', alignItems: 'center', gap: 16 * e, padding: `${12 * e}px ${18 * e}px`, borderRadius: 20 * e, background: on ? 'rgba(6,18,36,.85)' : 'rgba(255,255,255,.06)', border: `1.5px solid ${on ? 'rgba(245,180,0,.6)' : 'rgba(255,255,255,.14)'}`, fontFamily: POLICE, transform: `translateX(${on ? 0 : -8 * e}px) scale(${0.97 + 0.03 * s})` }}>
            <span style={{ width: 46 * e, height: 46 * e, borderRadius: 14 * e, background: on ? C.or : 'rgba(255,255,255,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
              <Icone nom={on ? 'check' : it.icone} taille={26 * e} couleur={on ? C.texteOr : 'rgba(255,255,255,.6)'} epaisseur={on ? 3 : 2} />
            </span>
            <b style={{ fontSize: 27 * e, fontWeight: 800, color: on ? C.blanc : 'rgba(255,255,255,.55)', whiteSpace: 'nowrap' }}>{it.t}</b>
          </div>
        );
      })}
    </div>
  );
};

export const S2HorsLigne: React.FC = () => {
  const { pick, u, mode, W } = useFormat();
  const T = tailles(pick, u);
  const c1 = cue(2, 'réservez');
  const c2 = cue(2, 'installez');
  const c3 = cue(2, 'encaissez');
  const retour = cue(2, 'retour');
  const aJour = cue(2, 'automatiquement');
  const tel = pick({ w: 300 * u, x: 1400 * u, y: 520 * u }, { w: 300, x: W / 2, y: 1030 }, { w: 215, x: 770, y: 610 });
  const etapes = [
    { icone: 'agenda', t: 'Réservation enregistrée', a: c1 },
    { icone: 'lit', t: 'Client installé', a: c2 },
    { icone: 'recu', t: 'Reçu imprimé', a: c3 },
    { icone: 'sync', t: 'Tout est synchronisé', a: aJour },
  ];
  const e = pick(u, 0.86, 0.72);
  return (
    <Scene duree={sceneLength(2)}>
      <ZoneTexte>
        <Tag texte="SANS INTERNET" a={2} taille={T.tag} />
        <Titre l1="Pas de réseau ?" l2="Tout continue." a={6} taille={T.titre} aligner={pick('left', 'center')} />
        {mode !== 'sq' && <Etapes items={etapes} e={e} grille={mode === 'port'} style={{ marginTop: pick(10 * u, 6, 0), alignSelf: mode === 'port' ? 'center' : undefined }} />}
      </ZoneTexte>
      {mode === 'sq' && <Etapes items={etapes} e={e} style={{ position: 'absolute', left: 50, top: 360 }} />}
      <Telephone
        w={tel.w}
        x={tel.x}
        y={tel.y}
        rot={4}
        depuis="droite"
        entree={0}
        ecrans={[{ src: 't-nouvelle' }, { src: 't-checkin', a: c2 }, { src: 't-recu-prov', a: c3 }, { src: 't-synchro', a: retour + 6 }]}
        touches={[{ x: 0.5, y: 0.9, f: c1 - 2 }, { x: 0.5, y: 0.83, f: c3 - 6 }]}
      />
      {etapes.map((et) => (
        <Son key={et.t} nom="coche" a={et.a} volume={0.4} />
      ))}
      <Son nom="caisse" a={c3 + 4} volume={0.2} />
      <Son nom="swish" a={retour} volume={0.18} />
      <Son nom="succes" a={aJour} volume={0.32} />
      <BadgeEtat actions={[c1, c2, c3]} retour={retour} aJour={aJour} e={pick(u, 1, 0.78)} style={{ left: tel.x, top: tel.y - pick(370 * u, 385, 290) }} />
      {mode === 'land' && (
        <>
          <Pastille icone="hors" titre="Hors ligne" texte="Tout reste sur l'appareil" a={cue(2, 'internet')} fin={retour - 8} echelle={T.pastille} style={{ left: 1440 * u, top: 690 * u }} />
          <Pastille icone="wifi" titre="Réseau revenu" texte="Envoi automatique" a={retour + 4} echelle={T.pastille} style={{ left: 1440 * u, top: 690 * u }} />
        </>
      )}
    </Scene>
  );
};
