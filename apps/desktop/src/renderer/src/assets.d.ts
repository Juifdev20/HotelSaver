// Vite renvoie l'URL finale du fichier (copié et hashé au build).
declare module "*.png" {
  const url: string;
  export default url;
}
