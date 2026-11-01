import React from 'react';
import { useCurrentFrame } from 'remotion';
import { C, POLICE } from '../theme';
import { useFormat } from '../format';
import { cue, sceneLength } from '../timeline';
import { useRessort } from '../components/anim';
import { Icone } from '../components/Icone';
import { Ordinateur, Telephone } from '../components/Appareils';
import { Pastille, Scene, Tag, Titre, ZoneTexte } from '../components/Textes';

type XY = [number, number];
/** Position d'une pastille selon le format (paysage en unités 1080p, portrait et carré en pixels). */
export function usePlace() {
  const { pick, u, mode } = useFormat();
  return (l: XY, p: XY, s?: XY): React.CSSProperties => {
    const v = pick(l, p, s);
    const k = mode === 'land' ? u : 1;
    return { left: v[0] * k, top: v[1] * k };
  };
}

export function useTailles() {
  const { pick, u } = useFormat();
  return { titre: pick(88 * u, 92, 62), tag: pick(21 * u, 23, 17), pastille: pick(1.12 * u, 1.18, 0.86) };
}

/** Pastilles qui se relaient au même endroit : chacune s'efface quand la suivante arrive. */
const Relais: React.FC<{ items: { icone: string; titre: string; texte?: string; a: number }[]; style: React.CSSProperties; echelle: number; garderDernier?: boolean }> = ({ items, style, echelle, garderDernier = true }) => (
  <>
    {items.map((it, i) => (
      <Pastille key={it.titre} {...it} fin={i < items.length - 1 ? items[i + 1].a - 12 : garderDernier ? undefined : it.a + 60} echelle={echelle} style={style} />
    ))}
  </>
);

/* ------------------------------------------------------------------ 3. Réception */
export const S3Reception: React.FC = () => {
  const { pick, u } = useFormat();
  const T = useTailles();
  const at = usePlace();
  const cA = cue(3, 'arrivées');
  const cF = cue(3, 'facturez');
  const lap = pick({ w: 780 * u, x: 1330 * u, y: 400 * u }, { w: 900, x: 540, y: 820 }, { w: 640, x: 470, y: 600 });
  const tel = pick({ w: 235 * u, x: 1720 * u, y: 590 * u }, { w: 250, x: 860, y: 1040 }, { w: 175, x: 900, y: 690 });
  return (
    <Scene duree={sceneLength(3)}>
      <ZoneTexte>
        <Tag texte="RÉCEPTION" a={2} taille={T.tag} />
        <Titre l1="Vos chambres," l2="en un coup d'œil." a={6} taille={T.titre} aligner={pick('left', 'center')} />
      </ZoneTexte>
      <Ordinateur w={lap.w} x={lap.x} y={lap.y} depuis="droite" entree={0} ecrans={[{ src: 'pc-chambres' }, { src: 'pc-arrivees', a: cA }, { src: 'pc-facturation', a: cF }]} zoom={[{ f: 0, s: 1, x: 0.5, y: 0.2 }, { f: cA - 4, s: 1.1, x: 0.3, y: 0.2 }, { f: cA + 4, s: 1, x: 0.5, y: 0.2 }, { f: 300, s: 1.08, x: 0.7, y: 0.4 }]} />
      <Telephone w={tel.w} x={tel.x} y={tel.y} rot={7} depuis="bas" entree={10} z={3} ecrans={[{ src: 't-planning' }, { src: 't-checkin', a: cA + 8 }, { src: 't-facturer', a: cF + 6 }]} touches={[{ x: 0.5, y: 0.88, f: cF + 30 }]} />
      <Pastille icone="lit" titre="Chambres" texte="Libres, occupées, à nettoyer" a={cue(3, 'chambres')} echelle={T.pastille} style={at([905, 110], [40, 520], [40, 300])} />
      <Pastille icone="agenda" titre="Arrivées et départs" texte="Enregistrés en quelques gestes" a={cA} echelle={T.pastille} style={at([905, 640], [40, 1130], [40, 820])} />
      <Pastille icone="dollar" titre="Dollars et francs" texte="Facture en USD ou en CDF" a={cF} echelle={T.pastille} style={at([1420, 790], [480, 520], [560, 300])} />
    </Scene>
  );
};

/* ------------------------------------------------------------------ 4. Cafétaria : trois téléphones en éventail */
export const S4Cafeteria: React.FC = () => {
  const { pick, u } = useFormat();
  const T = useTailles();
  const at = usePlace();
  const cC = cue(4, 'compte');
  const cS = cue(4, 'scannez');
  const cK = cue(4, 'cuisine');
  const cT = cue(4, 'stock');
  const w = pick(250 * u, 250, 175);
  const y = pick(480 * u, 1000, 640);
  const xs = pick([1130 * u, 1410 * u, 1690 * u], [255, 540, 825], [300, 560, 820]);
  const slot = at([110, 660], [540 - 190, 560], [370, 300]);
  return (
    <Scene duree={sceneLength(4)}>
      <ZoneTexte>
        <Tag texte="CAFÉTARIA" a={2} taille={T.tag} />
        <Titre l1="Chaque table," l2="chaque article." a={6} taille={T.titre} aligner={pick('left', 'center')} />
      </ZoneTexte>
      <Telephone w={w} x={xs[0]} y={y + 30} rot={-9} depuis="gauche" entree={Math.max(0, cC - 14)} z={2} ecrans={[{ src: 't-caf-compte' }]} touches={[{ x: 0.5, y: 0.45, f: cC + 10 }]} />
      <Telephone w={w * 1.08} x={xs[1]} y={y} rot={0} depuis="bas" entree={Math.max(0, cS - 14)} z={4} ecrans={[{ src: 't-caf-scan' }, { src: 't-caf-stock', a: cT }]} />
      <Telephone w={w} x={xs[2]} y={y + 30} rot={9} depuis="droite" entree={Math.max(0, cK - 14)} z={3} ecrans={[{ src: 't-caf-cuisine' }]} />
      <Relais
        echelle={T.pastille}
        style={slot}
        items={[
          { icone: 'caisse', titre: 'Un compte par table', texte: 'Ouvert, suivi, encaissé', a: cC },
          { icone: 'scan', titre: 'Scan des articles', texte: 'Code-barres ou recherche', a: cS },
          { icone: 'flamme', titre: 'Envoi en cuisine', texte: 'La commande part tout de suite', a: cK },
          { icone: 'boite', titre: 'Stock toujours à jour', texte: 'Chaque vente le décompte', a: cT },
        ]}
      />
    </Scene>
  );
};

/* ------------------------------------------------------------------ 5. Patron */
export const S5Patron: React.FC = () => {
  const { pick, u } = useFormat();
  const T = useTailles();
  const at = usePlace();
  const cT = cue(5, 'tableau');
  const cD = cue(5, 'dépenses');
  const cR = cue(5, 'rapports');
  const cA = cue(5, 'accès');
  const lap = pick({ w: 800 * u, x: 1340 * u, y: 410 * u }, { w: 900, x: 540, y: 820 }, { w: 640, x: 470, y: 600 });
  const tel = pick({ w: 235 * u, x: 1730 * u, y: 600 * u }, { w: 250, x: 860, y: 1040 }, { w: 175, x: 900, y: 690 });
  return (
    <Scene duree={sceneLength(5)}>
      <ZoneTexte>
        <Tag texte="PATRON" a={2} taille={T.tag} />
        <Titre l1="Votre hôtel," l2="sous contrôle." a={6} taille={T.titre} aligner={pick('left', 'center')} />
      </ZoneTexte>
      <Ordinateur
        w={lap.w}
        x={lap.x}
        y={lap.y}
        depuis="zoom"
        entree={0}
        ecrans={[{ src: 'pc-tableau-de-bord' }, { src: 'pc-depenses', a: cD }, { src: 'pc-rapports', a: cR }]}
        zoom={[{ f: 0, s: 1, x: 0.5, y: 0.3 }, { f: cT, s: 1.05, x: 0.5, y: 0.3 }, { f: cD - 2, s: 1.25, x: 0.25, y: 0.25 }, { f: cD + 2, s: 1, x: 0.5, y: 0.3 }, { f: cR + 60, s: 1.12, x: 0.6, y: 0.35 }]}
      />
      <Telephone w={tel.w} x={tel.x} y={tel.y} rot={-6} depuis="droite" entree={8} z={3} ecrans={[{ src: 't-tableau' }, { src: 't-rapports', a: cR + 6 }, { src: 't-users', a: cA }]} touches={[{ x: 0.7, y: 0.3, f: cA + 24 }]} />
      <Relais
        echelle={T.pastille}
        style={at([110, 660], [40, 520], [40, 300])}
        items={[
          { icone: 'graphe', titre: 'Tableau de bord', texte: 'Recettes et occupation du jour', a: cT },
          { icone: 'recu', titre: 'Dépenses', texte: 'Chaque sortie d’argent notée', a: cD },
          { icone: 'agenda', titre: 'Rapports mensuels', texte: 'Prêts à imprimer', a: cR },
          { icone: 'bouclier', titre: 'Accès par employé', texte: 'Chacun voit ce qui le concerne', a: cA },
        ]}
      />
    </Scene>
  );
};

/* ------------------------------------------------------------------ 6. Site de réservation offert à chaque hôtel */
const Operateurs: React.FC<{ a: number; taille: number; centre?: boolean; style?: React.CSSProperties }> = ({ a, taille, centre, style }) => {
  const r = useRessort();
  const noms = ['M-Pesa', 'Airtel Money', 'Orange Money', 'Africell', 'Visa', 'Mastercard'];
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: taille * 0.45, justifyContent: centre ? 'center' : 'flex-start', ...style }}>
      {noms.map((n, i) => {
        const s = r(a + i * 3, { damping: 14, stiffness: 160 });
        return (
          <span key={n} style={{ padding: `${taille * 0.35}px ${taille * 0.75}px`, borderRadius: taille, background: 'rgba(255,255,255,.1)', border: '1.5px solid rgba(255,255,255,.26)', fontFamily: POLICE, fontWeight: 700, fontSize: taille, color: C.blanc, opacity: Math.min(1, s * 2), transform: `translateY(${(1 - s) * 16}px) scale(${0.7 + 0.3 * s})`, whiteSpace: 'nowrap' }}>
            {n}
          </span>
        );
      })}
    </div>
  );
};

export const S6Site: React.FC = () => {
  const { pick, u, mode } = useFormat();
  const T = useTailles();
  const at = usePlace();
  const cI = cue(6, 'inscription');
  const cC = cue(6, 'couleurs');
  const cR = cue(6, 'réservent');
  const cA = cue(6, 'acompte');
  const lap = pick({ w: 800 * u, x: 1340 * u, y: 400 * u }, { w: 900, x: 540, y: 820 }, { w: 640, x: 470, y: 600 });
  const tel = pick({ w: 235 * u, x: 1735 * u, y: 600 * u }, { w: 250, x: 860, y: 1040 }, { w: 175, x: 900, y: 690 });
  return (
    <Scene duree={sceneLength(6)}>
      <ZoneTexte>
        <Tag texte="SITE DE RÉSERVATION" a={2} taille={T.tag} />
        <Titre l1="Votre site," l2="à vos couleurs." a={6} taille={T.titre} aligner={pick('left', 'center')} />
        {mode === 'land' && <Operateurs a={cA} taille={24 * u} style={{ maxWidth: 700 * u }} />}
      </ZoneTexte>
      <Ordinateur w={lap.w} x={lap.x} y={lap.y} depuis="droite" entree={0} navigateur="Le site de votre hôtel" ecrans={[{ src: 'site-hotel-pc-1' }, { src: 'site-hotel-pc-2', a: cC }]} zoom={[{ f: 0, s: 1, x: 0.5, y: 0.2 }, { f: cC - 2, s: 1.08, x: 0.5, y: 0.2 }, { f: cC + 2, s: 1, x: 0.5, y: 0.3 }, { f: 260, s: 1.1, x: 0.5, y: 0.5 }]} />
      <Telephone w={tel.w} x={tel.x} y={tel.y} rot={6} depuis="bas" entree={12} z={3} ecrans={[{ src: 'site-hotel-tel-1' }, { src: 'site-hotel-tel-2', a: cR }, { src: 't-paye-ligne', a: cA + 4 }]} touches={[{ x: 0.5, y: 0.86, f: cA - 8 }]} />
      <Pastille icone="cadeau" titre="Inclus dès l’inscription" texte="Sans frais en plus" a={cI} fin={mode === 'land' ? undefined : cA - 10} echelle={T.pastille} style={at([905, 110], [40, 520], [40, 300])} />
      <Pastille icone="globe" titre="Réservation en ligne" texte="Vos clients réservent seuls" a={cR} fin={cA - 2} echelle={T.pastille} style={at([905, 680], [40, 1150], [40, 830])} />
      <Pastille icone="carte" titre="Acompte en ligne" texte="Mobile Money ou carte" a={cA} echelle={T.pastille} style={at([905, 680], [40, 1150], [40, 830])} />
      {mode !== 'land' && <Operateurs a={cA} taille={mode === 'port' ? 22 : 16} centre style={{ position: 'absolute', left: 30, right: 30, flexWrap: 'nowrap', top: mode === 'port' ? 540 : 315, zIndex: 9 }} />}
    </Scene>
  );
};

/* ------------------------------------------------------------------ 7. Démarrage en trois étapes */
export const S7Demarrage: React.FC = () => {
  const { pick, u } = useFormat();
  const T = useTailles();
  const r = useRessort();
  const etapes = [
    { n: 1, src: 't-inscription', t: 'Créez votre hôtel', a: cue(7, 'créez') },
    { n: 2, src: 't-chambres', t: 'Ajoutez vos chambres', a: cue(7, 'configurez') },
    { n: 3, src: 't-users', t: 'Invitez votre équipe', a: cue(7, 'ouvrez') },
  ];
  const w = pick(235 * u, 250, 160);
  const y = pick(460 * u, 960, 600);
  const xs = pick([1090 * u, 1380 * u, 1670 * u], [200, 540, 880], [250, 540, 830]);
  const hT = w * 2.08;
  const tl = pick(25 * u, 27, 19);
  return (
    <Scene duree={sceneLength(7)}>
      <ZoneTexte>
        <Tag texte="DÉMARRAGE" a={2} taille={T.tag} />
        <Titre l1="Prêt en" l2="trois étapes." a={6} taille={T.titre} aligner={pick('left', 'center')} />
      </ZoneTexte>
      {etapes.map((e, i) => {
        const s = r(e.a, { damping: 12, stiffness: 160 });
        return (
          <React.Fragment key={e.n}>
            <Telephone w={w} x={xs[i]} y={y} rot={[-4, 0, 4][i]} depuis="bas" entree={Math.max(0, e.a - 12)} z={2 + i} ecrans={[{ src: e.src }]} />
            <div style={{ position: 'absolute', left: xs[i], top: y - hT / 2 - w * 0.2, transform: `translate(-50%,-50%) scale(${s})`, zIndex: 9, width: w * 0.34, height: w * 0.34, borderRadius: '50%', background: C.or, color: C.texteOr, fontFamily: POLICE, fontWeight: 800, fontSize: w * 0.19, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 6px rgba(245,180,0,.25), 0 10px 24px rgba(0,0,0,.35)' }}>{e.n}</div>
            <div style={{ position: 'absolute', left: xs[i], top: y + hT / 2 + w * 0.12, transform: `translateX(-50%) translateY(${(1 - s) * 20}px)`, opacity: Math.min(1, s * 2), zIndex: 9, fontFamily: POLICE, fontWeight: 800, fontSize: tl, color: C.blanc, whiteSpace: 'nowrap', textAlign: 'center', textShadow: '0 2px 12px rgba(0,0,0,.4)' }}>{e.t}</div>
          </React.Fragment>
        );
      })}
    </Scene>
  );
};
