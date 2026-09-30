import * as React from "react";
import { createRoot } from "react-dom/client";
import "@hotel-chicago/ui/dist/tokens.css";
import "@hotel-chicago/ui/dist/typography.css";
import "./styles.css";
import "./accueil/accueil.css";
import "./auth/auth.css";
import "./hotel/hotel.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
