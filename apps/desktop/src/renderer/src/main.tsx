import React from "react";
import ReactDOM from "react-dom/client";
// Polices embarquées dans l'app (pas Google Fonts) : l'app doit fonctionner
// hors ligne (section 2) — sans internet, un chargement distant retombait sur
// Times New Roman / Arial. Uniquement les graisses utilisées (section 12.3).
import "@fontsource/fraunces/500.css";
import "@fontsource/fraunces/600.css";
import "@fontsource/public-sans/400.css";
import "@fontsource/public-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@hotel-chicago/ui/dist/tokens.css";
import "@hotel-chicago/ui/dist/typography.css";
import "./styles.css";
import { App } from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
