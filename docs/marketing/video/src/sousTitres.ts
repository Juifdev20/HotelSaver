import data from './timeline.json';
const LINES = data.lines;

/**
 * Sous-titres grands et lisibles (la plupart des gens regardent sans le son) : la phrase de la voix, découpée en morceaux
 * courts, le mot prononcé en or. Le texte écrit peut différer de ce que dit la voix (« 14 », numéro de téléphone en
 * chiffres) : `poids` donne alors la longueur réellement parlée, pour garder le bon tempo.
 */
type Morceau = { texte: string; poids?: number };
export const MORCEAUX: Morceau[][] = [
  [{ texte: 'Et si votre hôtel' }, { texte: 'ne s’arrêtait plus jamais…' }, { texte: 'même quand le réseau tombe ?' }],
  [{ texte: 'Voici HotelSaver.' }, { texte: 'La réception, la cafétaria' }, { texte: 'et les réservations de votre hôtel,' }, { texte: 'réunies dans une seule application,' }, { texte: 'sur téléphone comme sur ordinateur.' }],
  [{ texte: 'Pas d’Internet ? Aucun problème.' }, { texte: 'Réservez, installez vos clients' }, { texte: 'et encaissez :' }, { texte: 'tout fonctionne hors ligne.' }, { texte: 'Au retour du réseau,' }, { texte: 'tout se synchronise automatiquement.' }],
  [{ texte: 'À la réception, suivez vos chambres' }, { texte: 'en un coup d’œil,' }, { texte: 'enregistrez les arrivées et les départs,' }, { texte: 'et facturez en dollars' }, { texte: 'comme en francs congolais.' }],
  [{ texte: 'À la cafétaria,' }, { texte: 'ouvrez un compte par table,' }, { texte: 'scannez les articles,' }, { texte: 'envoyez la commande en cuisine,' }, { texte: 'et gardez un stock toujours à jour.' }],
  [{ texte: 'Le patron garde le contrôle :' }, { texte: 'tableau de bord, dépenses,' }, { texte: 'rapports mensuels,' }, { texte: 'et un accès sécurisé pour chaque employé.' }],
  [{ texte: 'Dès l’inscription, votre hôtel reçoit' }, { texte: 'son propre site de réservation,' }, { texte: 'à ses couleurs,' }, { texte: 'où vos clients réservent' }, { texte: 'et paient leur acompte en ligne.' }],
  [{ texte: 'Démarrer est simple :' }, { texte: 'créez votre hôtel,' }, { texte: 'configurez vos chambres,' }, { texte: 'puis ouvrez l’accès à votre équipe.' }],
  [{ texte: 'Essayez HotelSaver gratuitement' }, { texte: 'pendant 14 jours,', poids: 22 }, { texte: 'sans carte bancaire.' }, { texte: 'Écrivez-nous sur WhatsApp :' }, { texte: '+243 828 497 218', poids: 64 }],
];

export type Fenetre = { texte: string; de: number; a: number; mots: { m: string; de: number; a: number }[] };

/** Les fenêtres d'affichage de chaque morceau (en secondes), avec le temps de chaque mot. */
export function fenetres(): Fenetre[] {
  const out: Fenetre[] = [];
  LINES.forEach((ligne, i) => {
    const morceaux = MORCEAUX[i];
    const poids = morceaux.map((m) => (m.poids ?? m.texte.length) + 6);
    const total = poids.reduce((a, b) => a + b, 0);
    let t = ligne.start;
    morceaux.forEach((m, k) => {
      const d = (ligne.dur * poids[k]) / total;
      const mots = m.texte.split(' ');
      const pm = mots.map((x) => x.length + 1);
      const tm = pm.reduce((a, b) => a + b, 0);
      let tt = t;
      out.push({
        texte: m.texte,
        de: t,
        a: k === morceaux.length - 1 ? ligne.end + 0.35 : t + d,
        mots: mots.map((x, j) => {
          const dd = (d * pm[j]) / tm;
          const r = { m: x, de: tt, a: tt + dd };
          tt += dd;
          return r;
        }),
      });
      t += d;
    });
  });
  return out;
}

/** Les sous-titres au format SRT (pour le montage : CapCut, Premiere…). */
export function versSrt(): string {
  const hms = (s: number) => {
    const ms = Math.round(s * 1000);
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const se = Math.floor((ms % 60000) / 1000);
    const r = ms % 1000;
    const p = (n: number, l = 2) => String(n).padStart(l, '0');
    return `${p(h)}:${p(m)}:${p(se)},${p(r, 3)}`;
  };
  return fenetres().map((w, i) => `${i + 1}\n${hms(w.de)} --> ${hms(w.a)}\n${w.texte}\n`).join('\n');
}
