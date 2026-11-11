// Module à effet de bord : à importer EN PREMIER (index.ts). Les imports ES sont tous évalués avant le corps du module d'entrée, donc l'installation du
// thème ne peut pas être un simple appel dans index.ts : elle doit vivre dans un module importé avant tous les autres.
import { installerThemeStyles } from "./theme";

installerThemeStyles();
