export const configuration = {
  apiUrl: import.meta.env.VITE_API_URL as string,
};

if (!configuration.apiUrl) {
  throw new Error("VITE_API_URL manquant — copier .env.example en .env.");
}
