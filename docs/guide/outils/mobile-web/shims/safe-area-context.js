// Marges de sécurité d'un téléphone Android récent (affichage bord à bord) : barre d'état en haut, barre de gestes en bas.
// Réglables par ?haut=…&bas=… dans l'adresse (voir index.html : window.__HS_INSETS__).
import * as React from "react";
import { View } from "react-native-web";

const marges = () => ({ top: 28, bottom: 16, left: 0, right: 0, ...(globalThis.__HS_INSETS__ ?? {}) });
const cadre = () => ({ x: 0, y: 0, width: globalThis.innerWidth || 390, height: globalThis.innerHeight || 844 });

export const initialWindowMetrics = { insets: marges(), frame: cadre() };
export const SafeAreaInsetsContext = React.createContext(initialWindowMetrics.insets);
export const SafeAreaFrameContext = React.createContext(initialWindowMetrics.frame);
export const SafeAreaContext = SafeAreaInsetsContext;

const h = React.createElement;
export function SafeAreaProvider({ children, style, initialMetrics }) {
  const m = initialMetrics ?? { insets: marges(), frame: cadre() };
  return h(SafeAreaFrameContext.Provider, { value: m.frame }, h(SafeAreaInsetsContext.Provider, { value: m.insets }, h(View, { style: [{ flex: 1 }, style] }, children)));
}
export const useSafeAreaInsets = () => React.useContext(SafeAreaInsetsContext) ?? initialWindowMetrics.insets;
export const useSafeAreaFrame = () => React.useContext(SafeAreaFrameContext) ?? initialWindowMetrics.frame;
export const SafeAreaConsumer = SafeAreaInsetsContext.Consumer;
export const withSafeAreaInsets = (C) => React.forwardRef((p, r) => h(C, { ...p, ref: r, insets: useSafeAreaInsets() }));
export function SafeAreaView({ edges, style, ...reste }) {
  const i = useSafeAreaInsets();
  return h(View, { ...reste, style: [{ paddingTop: i.top, paddingBottom: i.bottom, paddingLeft: i.left, paddingRight: i.right }, style] });
}
export const SafeAreaListener = ({ children }) => children;
