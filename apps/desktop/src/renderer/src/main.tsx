import React from "react";
import ReactDOM from "react-dom/client";
// Police embarquée dans l'app (pas Google Fonts) : l'app doit fonctionner
// hors ligne (section 2) — sans internet, un chargement distant retombait sur
// Times New Roman / Arial. Une seule famille dans toute l'app (Inter, voir
// DECISIONS.md — refonte du 24/09/2026), uniquement les graisses utilisées.
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@hotel-chicago/ui/dist/tokens.css";
import "@hotel-chicago/ui/dist/typography.css";
import "./styles.css";
import { installerFilSecoursNavigateur } from "./navigateur-secours";
import { App } from "./App";

installerFilSecoursNavigateur();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
