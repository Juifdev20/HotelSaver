/** Adresse du site web HotelSaver (apps/web), ouvert dans le navigateur pour
 * créer un compte. Se règle à la compilation avec `VITE_URL_SITE_WEB`
 * (ex. https://hotelsaver.com) ; par défaut, le serveur de développement local. */
export const URL_SITE_WEB: string =
  ((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_URL_SITE_WEB ?? "http://localhost:5175").replace(/\/$/, "");
