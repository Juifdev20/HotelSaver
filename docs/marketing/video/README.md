# Vidéo HotelSaver (motion design, Remotion)

Vidéo de présentation de 1 min 24 s, en français, sans musique (à ajouter au montage), dans la charte de l'affiche
« construire-unique » (fond bleu nuit, ondes, « Hotel » blanc / « Saver » or, pastilles en verre sombre).

- Formats : `HotelSaver-9x16` (Shorts, TikTok, statut WhatsApp — format de référence), `HotelSaver-16x9` (YouTube), `HotelSaver-1x1`.
- Voix off : ElevenLabs, voix « Perle » (français), une prise par phrase, ralentie à 0,95 et normalisée à -16 LUFS,
  assemblée dans `public/voix/voix_off.mp3`. Le texte et le calage de chaque phrase sont dans `src/timeline.json`.
- Captures : écrans réels de l'application (mobile 780×1688, bureau 1920×1200, site de l'hôtel), dans `public/captures/`.
- Aucun lien ni adresse de site dans la vidéo (le lien officiel n'est pas encore fixé) ; contact WhatsApp +243 828 497 218.

## Commandes

```bash
npm install
npm run studio                               # aperçu interactif
node scripts/rendre.mjs                      # les trois formats → sortie/ (+ sous-titres .srt, voix seule .mp3)
node scripts/rendre.mjs 9x16                 # un seul format
node scripts/apercus.mjs HotelSaver-16x9 /tmp/apercus 120 900   # images de contrôle
```

Le rendu utilise le Chromium « headless shell » de `/opt/pw-browsers` (variable `NAVIGATEUR` pour un autre navigateur).

## Structure

- `src/Video.tsx` : fond continu, scènes calées sur la voix, sous-titres, voix.
- `src/scenes/` : S0 accroche (réseau coupé) · S1 présentation · S2 hors ligne · S3 réception · S4 cafétaria · S5 patron ·
  S6 site de réservation · S7 démarrage · S8 essai 14 jours, téléchargements, WhatsApp.
- `src/components/` : téléphone et ordinateur animés, fond de l'affiche, textes, sous-titres.
- `src/sousTitres.ts` : découpage des sous-titres (aussi exporté en `.srt`).
