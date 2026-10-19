; Étapes de l'installateur HotelSaver (19/10/2026) : page de bienvenue avant les conditions d'utilisation.
; Inclus par electron-builder (nsis.include) ; enregistré en UTF-8 avec BOM pour les accents.
!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Bienvenue dans l'installation de HotelSaver"
  !define MUI_WELCOMEPAGE_TEXT "Cet assistant va installer HotelSaver ${VERSION} sur cet ordinateur.$\r$\n$\r$\nHotelSaver gère votre hôtel au quotidien : chambres et réservations, facturation et reçus, cafétaria, stock, dépenses et rapports — même sans connexion internet.$\r$\n$\r$\nFermez les autres applications avant de continuer, puis cliquez sur Suivant."
  !insertmacro MUI_PAGE_WELCOME
!macroend
