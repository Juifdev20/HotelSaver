import { useVideoConfig } from 'remotion';

export type Mode = 'land' | 'port' | 'sq';

/** Le format de la composition : paysage (YouTube), portrait (Shorts, TikTok, statut WhatsApp) ou carré. */
export function useFormat() {
  const { width: W, height: H, fps } = useVideoConfig();
  const mode: Mode = W > H ? 'land' : W === H ? 'sq' : 'port';
  const u = mode === 'land' ? H / 1080 : W / 1080;
  const pick = <T,>(land: T, port: T, sq?: T): T => (mode === 'land' ? land : mode === 'port' ? port : sq ?? port);
  return { W, H, fps, mode, u, pick };
}
