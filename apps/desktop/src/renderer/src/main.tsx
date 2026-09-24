import React from "react";
import ReactDOM from "react-dom/client";
import "@hotel-chicago/ui/dist/tokens.css";
import "@hotel-chicago/ui/dist/typography.css";
import "./styles.css";
import { App } from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
