# Cahier de tests HotelSaver

Cahier de tests de manipulation à remettre aux testeurs (format Word, à remplir) : présentation de l'application, prérequis, puis un
module par partie (installation, inscription, connexion, patron, réception, cafétaria, site de l'hôtel, hors ligne, droits, guide,
Windows, super-admin), chaque cas de test avec ses étapes « Action / Résultat attendu / Observation », un verdict, un bilan et l'avis du testeur.

```
node docs/cahier-tests/construire.cjs     # → docs/cahier-tests/sortie/Cahier-de-tests-HotelSaver.docx
```

Le contenu est dans `contenu.cjs` (un module = des cas, un cas = des étapes [action, résultat attendu]) ; la mise en page (logo, couleurs
de la marque, en-tête et pied de page « Copyright © 2026 HotelSaver ») dans `construire.cjs`. À chaque nouvelle version de
l'application : mettre à jour les étapes concernées et `VERSION` dans `construire.cjs`.
