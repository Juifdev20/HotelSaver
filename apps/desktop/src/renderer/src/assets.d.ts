// Vite renvoie l'URL finale du fichier (copié et hashé au build).
declare module "*.png" {
  const url: string;
  export default url;
}
declare module "*.jpg" {
  const url: string;
  export default url;
}
// Imports d'effet de bord (`import "./x.css"`) — Vite injecte la feuille de style.
declare module "*.css";
