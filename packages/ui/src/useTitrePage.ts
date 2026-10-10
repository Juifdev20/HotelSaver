import { useEffect } from "react";

/**
 * Met à jour `document.title` à chaque écran (« Chambres — HotelSaver ») : c'est
 * le premier élément annoncé par un lecteur d'écran et l'intitulé de l'onglet.
 */
export function useTitrePage(titre: string, application = "HotelSaver") {
  useEffect(() => {
    const ancien = document.title;
    document.title = titre ? `${titre} — ${application}` : application;
    return () => {
      document.title = ancien;
    };
  }, [titre, application]);
}
